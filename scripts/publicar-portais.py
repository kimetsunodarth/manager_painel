"""Publica o Ananim Manager Painel na VM portais a partir do commit atual (HEAD), nunca do working tree.

Uso (Windows, na raiz do repo):  python scripts/publicar-portais.py [--ref HEAD]
1. cria um worktree temporário do commit (mudanças não commitadas e arquivos fora do git ficam de fora);
2. build do frontend (tsc + vite) com VITE_APP_VERSION = versão do backend;
3. empacota backend/ (sem node_modules) + public/ (frontend/dist) e recusa o pacote se houver segredo;
4. envia pelo canal SSH do Cofre (tools/cofre_transport.py, chave em ~/.codex/cofre-publish) e roda
   deploy/portais/atualizar-manager.sh na VM (release nova, npm ci, troca do current, reinício e /api/health).
"""
import argparse
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TRANSPORT = Path(r'C:\Projetos\vaultwarden-ananim-branding\tools')
BASE = '/opt/ananim/ananim-manager-painel'
FORBIDDEN = {'.env', 'config.enc', '.encryption_key', 'key.bin'}
FORBIDDEN_SUFFIXES = ('.db', '.db-wal', '.db-shm', '.pem', '.pfx')


def shared_junction(path):
    """True se `path` é a junction/link para frontend/node_modules do repo (e não uma pasta própria do worktree)."""
    try:
        return os.path.realpath(path).lower() == os.path.realpath(REPO / 'frontend' / 'node_modules').lower()
    except OSError:
        return False


def sh(args, cwd, env=None):
    print('>', ' '.join(args), flush=True)
    subprocess.run(args, cwd=cwd, env=env, check=True, shell=(os.name == 'nt'))


def build(tree, ref):
    version = json.loads((tree / 'backend' / 'package.json').read_text(encoding='utf-8'))['version']
    frontend = tree / 'frontend'
    shared_modules = REPO / 'frontend' / 'node_modules'
    if shared_modules.is_dir():
        # Junction para os node_modules do repo: evita npm ci a cada publicação (o lock é o mesmo do HEAD).
        subprocess.run(['cmd', '/c', 'mklink', '/J', str(frontend / 'node_modules'), str(shared_modules)], check=True, capture_output=True)
    else:
        sh(['npm', 'ci', '--no-audit', '--no-fund'], frontend)
    sh(['npm', 'run', 'build'], frontend, env={**os.environ, 'VITE_APP_VERSION': version})
    # Agente Windows compilado do mesmo commit (csc do .NET Framework, só no Windows).
    powershell = os.path.join(os.environ.get('SystemRoot', r'C:\Windows'), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    subprocess.run([powershell, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(tree / 'agent' / 'windows' / 'build.ps1')],
                   check=True, capture_output=True)
    return version


def package(tree, out, version, commit):
    def keep(info):
        parts = Path(info.name).parts
        if 'node_modules' in parts:
            return None
        name = parts[-1]
        if name in FORBIDDEN or name.endswith(FORBIDDEN_SUFFIXES):
            raise SystemExit('Pacote recusado: ' + info.name + ' parece segredo/estado.')
        info.uid = info.gid = 0
        info.uname = info.gname = ''
        return info

    with tarfile.open(out, 'w:gz') as tar:
        tar.add(tree / 'backend', arcname='backend', filter=keep)
        tar.add(tree / 'frontend' / 'dist', arcname='public', filter=keep)
        # Agentes para baixar no painel (Servidores → Baixar / Conectar): o exe compilado deste commit e os arquivos do Linux.
        tar.add(tree / 'agent' / 'windows' / 'dist' / 'AnanimManagerAgent.exe', arcname='agents/windows/AnanimManagerAgent.exe', filter=keep)
        for name in ('ananim-manager-agent', 'install.sh', 'ananim-manager-agent.service'):
            tar.add(tree / 'agent' / 'linux' / name, arcname='agents/linux/' + name, filter=keep)
        # Lido pela unit systemd (EnvironmentFile=-.../current/release.env): versão no /api/health e no rodapé.
        data = ('APP_VERSION=%s+%s\n' % (version, commit)).encode('ascii')
        info = tarfile.TarInfo('release.env')
        info.size = len(data)
        info.mode = 0o644
        tar.addfile(info, io.BytesIO(data))


def publish(pkg, updater, name):
    sys.path.insert(0, str(TRANSPORT))
    import cofre_transport
    client = cofre_transport.connect()
    try:
        _, out, _ = client.exec_command('mkdir -p %s/incoming %s/bin && echo ok' % (BASE, BASE))
        if out.read().strip() != b'ok':
            raise SystemExit('Não foi possível preparar ' + BASE + ' na VM.')
        sftp = client.open_sftp()
        sftp.put(str(pkg), BASE + '/incoming/' + name)
        for script in (updater, updater.with_name('instalar-manager.sh')):
            sftp.putfo(io.BytesIO(script.read_bytes().replace(b'\r\n', b'\n')), BASE + '/bin/' + script.name)
            sftp.chmod(BASE + '/bin/' + script.name, 0o755)
        sftp.close()
        _, out, err = client.exec_command('bash %s/bin/atualizar-manager.sh %s/incoming/%s 2>&1' % (BASE, BASE, name), timeout=900)
        for line in iter(out.readline, ''):
            print('  vm|', line.rstrip(), flush=True)
        return out.channel.recv_exit_status()
    finally:
        client.close()


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    parser = argparse.ArgumentParser()
    parser.add_argument('--ref', default='HEAD')
    args = parser.parse_args()
    commit = subprocess.run(['git', 'rev-parse', '--short', args.ref], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip()
    # realpath expande nomes curtos 8.3 (RODOLF~1.CLO); com eles o vite gera caminhos relativos inválidos.
    work = Path(os.path.realpath(tempfile.mkdtemp(prefix='mgr-publish-')))
    tree = work / 'tree'
    subprocess.run(['git', 'worktree', 'add', '--detach', str(tree), commit], cwd=REPO, check=True, capture_output=True)
    try:
        version = build(tree, commit)
        name = 'manager-%s-%s.tgz' % (version, commit)
        pkg = work / name
        package(tree, pkg, version, commit)
        print('Pacote %s (%.1f MB) do commit %s' % (name, pkg.stat().st_size / 1e6, commit))
        code = publish(pkg, tree / 'deploy' / 'portais' / 'atualizar-manager.sh', name)
        print('Resultado na VM: ' + ('OK' if code == 0 else 'FALHOU (código %d)' % code))
        return code
    finally:
        junction = tree / 'frontend' / 'node_modules'
        if os.path.lexists(junction) and shared_junction(junction):
            os.rmdir(junction)  # remove só a junction, nunca o conteúdo do repo
        if os.path.lexists(junction) and shared_junction(junction):
            print('Junction não removida; limpe à mão (sem apagar o destino): ' + str(junction))
        else:
            subprocess.run(['git', 'worktree', 'remove', '--force', str(tree)], cwd=REPO, capture_output=True)
            shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
