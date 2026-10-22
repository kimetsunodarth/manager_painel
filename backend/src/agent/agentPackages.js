/**
 * Instaladores do Ananim Manager Agent para baixar no painel, com ou sem ativação embutida.
 * Windows: o próprio AnanimManagerAgent.exe; a ativação vai no fim do arquivo (o Windows ignora o que vem depois do PE)
 * e o agente a lê ao abrir. Linux: tar.gz com o agente, install.sh, a unit e, se for o caso, ativacao.conf.
 * Os arquivos ficam em <release>/agents (publicados junto com o painel) ou em ANANIM_AGENTS_DIR.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { getAppRoot } from '../appRoot.js';

const MARK_START = '\n#ANANIM-ATIVACAO#';
const MARK_END = '#FIM-ATIVACAO#';
const LINUX_DIR = 'ananim-manager-agent-linux';
const LINUX_FILES = [['ananim-manager-agent', 0o755], ['install.sh', 0o755], ['ananim-manager-agent.service', 0o644]];

const nomeArquivo = (nome) => String(nome || 'projeto').replace(/^[a-z]{2}-[a-z]+-\d+_/i, '').replace(/[^A-Za-z0-9._-]+/g, '_');

export function agentsDir() {
  return process.env.ANANIM_AGENTS_DIR || path.join(getAppRoot(), '..', 'agents');
}

/** `code`: ativação de um servidor (uso único). `enroll`: chave do projeto (vários servidores, cada um se cadastra sozinho). */
export function embedActivation(exe, { url, code = '', enroll = '', projectName, ecsName = '' }) {
  const json = JSON.stringify({ url, code, enroll, projectName, ecsName });
  return Buffer.concat([exe, Buffer.from(MARK_START + Buffer.from(json, 'utf8').toString('base64') + MARK_END, 'ascii')]);
}

export function readEmbeddedActivation(buf) {
  const tail = buf.subarray(Math.max(0, buf.length - 4096)).toString('latin1');
  const i = tail.lastIndexOf(MARK_START);
  const j = tail.lastIndexOf(MARK_END);
  if (i < 0 || j < i) return null;
  try { return JSON.parse(Buffer.from(tail.slice(i + MARK_START.length, j), 'base64').toString('utf8')); } catch { return null; }
}

function octal(value, length) {
  return Buffer.from(value.toString(8).padStart(length - 1, '0') + '\0', 'ascii');
}

/** tar (ustar) + gzip de poucos arquivos pequenos, sem dependências. */
export function buildTarGz(files, mtime = Math.floor(Date.now() / 1000)) {
  const blocks = [];
  for (const { name, data, mode } of files) {
    const header = Buffer.alloc(512, 0);
    let base = name;
    let prefix = '';
    if (Buffer.byteLength(name) > 100) { const k = name.lastIndexOf('/'); prefix = name.slice(0, k); base = name.slice(k + 1); }
    header.write(base, 0, 100, 'utf8');
    octal(mode, 8).copy(header, 100);
    octal(0, 8).copy(header, 108);
    octal(0, 8).copy(header, 116);
    octal(data.length, 12).copy(header, 124);
    octal(mtime, 12).copy(header, 136);
    header.fill(' ', 148, 156);
    header.write('0', 156, 1, 'ascii');
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    header.write('root', 265, 32, 'ascii');
    header.write('root', 297, 32, 'ascii');
    header.write(prefix, 345, 155, 'utf8');
    let sum = 0;
    for (const b of header) sum += b;
    Buffer.from(sum.toString(8).padStart(6, '0') + '\0 ', 'ascii').copy(header, 148);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512, 0));
  }
  blocks.push(Buffer.alloc(1024, 0));
  return zlib.gzipSync(Buffer.concat(blocks));
}

/** Instalador para baixar: { fileName, contentType, data }. Com `activation`, já sai pronto para ativar sozinho. */
export function agentPackage(os, activation = null) {
  const dir = agentsDir();
  if (os === 'windows') {
    const exe = fs.readFileSync(path.join(dir, 'windows', 'AnanimManagerAgent.exe'));
    return { fileName: activation ? `AnanimManagerAgent-${activation.ecsName || nomeArquivo(activation.projectName)}.exe` : 'AnanimManagerAgent.exe',
      contentType: 'application/vnd.microsoft.portable-executable', data: activation ? embedActivation(exe, activation) : exe };
  }
  if (os === 'linux') {
    const files = LINUX_FILES.map(([name, mode]) => ({ name: `${LINUX_DIR}/${name}`, mode,
      data: Buffer.from(fs.readFileSync(path.join(dir, 'linux', name), 'utf8').replace(/\r\n/g, '\n'), 'utf8') }));
    if (activation) {
      files.push({ name: `${LINUX_DIR}/ativacao.conf`, mode: 0o600,
        data: Buffer.from(activation.enroll
          ? `# Cadastro do Ananim Manager Agent no projeto ${activation.projectName} (vale para vários servidores por 7 dias).\nURL=${activation.url}\nENROLL=${activation.enroll}\n`
          : `# Ativação do Ananim Manager Agent para ${activation.ecsName} (${activation.projectName}); uso único.\nURL=${activation.url}\nCODE=${activation.code}\n`, 'utf8') });
    }
    return { fileName: activation ? `ananim-manager-agent-linux-${activation.ecsName || nomeArquivo(activation.projectName)}.tar.gz` : 'ananim-manager-agent-linux.tar.gz',
      contentType: 'application/gzip', data: buildTarGz(files) };
  }
  throw new Error('invalid_os');
}
