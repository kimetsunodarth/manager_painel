import crypto from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

// Capturado UMA VEZ no carregamento do módulo (mesmo padrão de WORK_DIR em configLoader.js) —
// não em cada chamada. process.cwd() é definido corretamente no boot (bootstrap-config.js faz
// process.chdir(dirname(process.execPath)) antes de qualquer import de negócio); usar
// `appDir = process.cwd()` como valor padrão de parâmetro o reavalia a cada chamada, então se o
// cwd do processo mudar por QUALQUER motivo depois do boot — nunca confirmado o porquê, mas
// getLogCryptoKey() passou a falhar horas depois de o boot ter funcionado — essa função quebra
// mesmo com o processo saudável, enquanto configLoader.js (que cacheia) continua funcionando.
// Cachear aqui também deixa os dois módulos com a mesma garantia.
const BOOT_CWD = process.cwd();

function parseHexKeyFromEnv() {
  const hex = process.env.CONFIG_KEY;
  if (typeof hex === 'string' && /^[0-9a-fA-F]{64}$/.test(hex.trim())) {
    return Buffer.from(hex.trim(), 'hex');
  }
  return null;
}

function resolveKeyFile(appDir) {
  const candidates = ['.encryption_key', 'key.bin'];
  for (const name of candidates) {
    const p = path.join(appDir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function deriveKeyFromBuffer(raw) {
  if (!raw || !raw.length) return null;
  if (raw.length === 32) return raw;
  const text = raw.toString('utf8').trim();
  if (!text) return null;
  return crypto.createHash('sha256').update(text, 'utf8').digest();
}

export function getLogCryptoKey(appDir = BOOT_CWD) {
  const envKey = parseHexKeyFromEnv();
  if (envKey) return envKey;
  const keyFile = resolveKeyFile(appDir);
  if (!keyFile) return null;
  try {
    const raw = readFileSync(keyFile);
    return deriveKeyFromBuffer(raw);
  } catch {
    return null;
  }
}

