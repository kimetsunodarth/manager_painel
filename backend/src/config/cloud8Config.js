/**
 * Credenciais de acesso ao Cloud8 (app.cloud8.com.br) — usuário de serviço dedicado para a
 * automação (Playwright, mesmo padrão do controlCenterService.js) validar/ler as VMs registradas
 * lá. Guardadas cifradas em disco (AES-256-GCM, mesma chave de .encryption_key/key.bin usada nos
 * logs) — nunca em texto puro, nunca devolvidas em resposta de API (só username + passwordSet).
 */

import fs from 'fs';
import path from 'path';
import { getConfigDir } from '../appRoot.js';
import { getLogCryptoKey } from '../utils/logCryptoKey.js';
import { encryptLine, decryptLine } from '../utils/encryptedLineLog.js';

const CREDENTIALS_FILE = path.join(getConfigDir(), 'cloud8-credentials.enc');

function readEncrypted() {
  const key = getLogCryptoKey();
  if (!key) return { available: false, data: null };
  if (!fs.existsSync(CREDENTIALS_FILE)) return { available: true, data: null };
  try {
    const line = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
    return { available: true, data: decryptLine(key, line) };
  } catch (e) {
    console.warn('[cloud8Config] Falha ao ler cloud8-credentials.enc:', e.message);
    return { available: true, data: null };
  }
}

/**
 * Estado seguro para a UI: username + se há senha salva. Nunca inclui a senha.
 */
export function getCloud8ConfigSafe() {
  const { available, data } = readEncrypted();
  return {
    configured: Boolean(data?.username && data?.password),
    username: data?.username || '',
    passwordSet: Boolean(data?.password),
    keyAvailable: available,
  };
}

/**
 * Credenciais reais (username + senha em texto claro), para uso interno do worker de automação.
 * NUNCA expor via rota de API.
 */
export function getCloud8Credentials() {
  const { data } = readEncrypted();
  if (!data?.username || !data?.password) return null;
  return { username: data.username, password: data.password };
}

/**
 * Salva/atualiza usuário e senha do Cloud8. Enviar password vazio mantém a senha já salva
 * (mesmo comportamento do SMTP em extensionBilling.js).
 */
export function saveCloud8Credentials({ username, password }) {
  const key = getLogCryptoKey();
  if (!key) {
    throw new Error(`Chave de criptografia não encontrada (.encryption_key, key.bin ou CONFIG_KEY) em "${process.cwd()}" — não é possível salvar credenciais com segurança.`);
  }
  const { data: existing } = readEncrypted();
  const next = {
    username: typeof username === 'string' && username.trim() ? username.trim() : (existing?.username || ''),
    password: typeof password === 'string' && password ? password : (existing?.password || ''),
  };
  const dir = path.dirname(CREDENTIALS_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const tmpFile = CREDENTIALS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, encryptLine(key, next), 'utf8');
  fs.renameSync(tmpFile, CREDENTIALS_FILE);
  return getCloud8ConfigSafe();
}
