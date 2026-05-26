/**
 * Teste de conexão SSH com o servidor SUSE.
 * Carrega .env do backend e executa um comando simples.
 * Uso: npm run test-ssh   ou   node scripts/test-ssh.js
 */

import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
const loaded = dotenv.config({ path: envPath });

console.log('Arquivo .env:', envPath);
if (loaded.error) {
  console.error('Aviso: não foi possível carregar .env:', loaded.error.message);
} else {
  const vars = ['SSH_HOST', 'SSH_USER', 'SSH_PORT', 'SSH_PRIVATE_KEY_PATH', 'SSH_PASSWORD', 'SUSE_HOST', 'SUSE_USER', 'SUSE_PORT', 'SUSE_PRIVATE_KEY_PATH', 'SUSE_PASSWORD'];
  const found = vars.filter((v) => process.env[v] && String(process.env[v]).trim());
  console.log('Variáveis SSH no .env:', found.length ? found.join(', ') : 'nenhuma encontrada');
  const anySsh = Object.keys(process.env).filter((k) => k.toUpperCase().includes('SSH') || k.toUpperCase().includes('SUSE'));
  if (anySsh.length) console.log('Chaves no ambiente com SSH/SUSE:', anySsh.join(', '));
}

const { sshExec, isSshConfigured } = await import('../src/services/sshService.js');

async function main() {
  console.log('\nTeste de conexão SSH (servidor SUSE)...\n');

  if (!isSshConfigured()) {
    console.error('SSH não configurado. No .env defina:');
    console.error('  SSH_HOST, SSH_USER e SSH_PRIVATE_KEY_PATH (ou SSH_PASSWORD)');
    console.error('  Ou use o prefixo SUSE_*: SUSE_HOST, SUSE_USER, SUSE_PRIVATE_KEY_PATH ou SUSE_PASSWORD');
    console.error('\nCertifique-se de que as linhas não estão comentadas (#) e não têm espaço antes do nome.');
    process.exit(1);
  }

  const host = process.env.SSH_HOST || process.env.SUSE_HOST;
  const user = process.env.SSH_USER || process.env.SUSE_USER;
  const port = process.env.SSH_PORT || process.env.SUSE_PORT || '22';
  const keyPath = process.env.SSH_PRIVATE_KEY_PATH || process.env.SUSE_PRIVATE_KEY_PATH;
  const usePassword = !!(process.env.SSH_PASSWORD || process.env.SUSE_PASSWORD);

  console.log('Configuração lida do .env:');
  console.log('  Host:', host);
  console.log('  Porta:', port);
  console.log('  Usuário:', user);
  console.log('  Autenticação:', keyPath ? `chave em ${keyPath}` : (usePassword ? 'senha' : 'não definida'));

  if (keyPath) {
    try {
      fs.accessSync(keyPath, fs.constants.R_OK);
    } catch (e) {
      console.error('\nErro: arquivo da chave privada não encontrado ou sem permissão de leitura.');
      console.error('  Caminho:', keyPath);
      console.error('  Dica: use caminho absoluto, ex: C:\\Users\\seu_usuario\\.ssh\\id_rsa');
      process.exit(1);
    }
  }

  console.log('\nConectando...\n');

  try {
    const result = await sshExec('echo OK');
    if (result.code === 0 && result.stdout.trim() === 'OK') {
      console.log('Conexão SSH estabelecida com sucesso.');
      process.exit(0);
    }
    console.error('Comando retornou código', result.code);
    if (result.stderr) console.error('stderr:', result.stderr);
    process.exit(1);
  } catch (err) {
    console.error('Falha na conexão:');
    console.error('  Mensagem:', err.message);
    if (err.code) console.error('  Código:', err.code);
    if (err.level) console.error('  Level:', err.level);
    console.error('\nCausas comuns:');
    console.error('  - Host ou porta incorretos; firewall bloqueando a porta 22');
    console.error('  - Chave privada não corresponde à chave pública no servidor (authorized_keys)');
    console.error('  - Usuário ou senha incorretos');
    console.error('  - Servidor SSH não está rodando na VM SUSE');
    process.exit(1);
  }
}

main();
