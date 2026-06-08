import crypto from 'crypto';
import util from 'util';
import { getLogCryptoKey } from './logCryptoKey.js';

const ALG = 'aes-256-gcm';
const IV_LEN = 16;

function encryptToBase64(key, payload) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function formatArgs(args) {
  if (!args || args.length === 0) return '';
  return util.format(...args);
}

let installed = false;

export function installEncryptedStdoutLogger({ appDir = process.cwd(), requireKey = false } = {}) {
  if (installed) return;
  const key = getLogCryptoKey(appDir);
  if (!key && requireKey) {
    throw new Error('Chave de log obrigatória em produção (.encryption_key, key.bin ou CONFIG_KEY)');
  }

  const writer = (level, stream, args) => {
    const msg = formatArgs(args);
    if (key) {
      const payload = { t: new Date().toISOString(), level, msg };
      stream.write(encryptToBase64(key, payload) + '\n');
      return;
    }
    stream.write(`[${new Date().toISOString()}] [${level}] ${msg}\n`);
  };

  console.log = (...args) => writer('log', process.stdout, args);
  console.info = (...args) => writer('info', process.stdout, args);
  console.warn = (...args) => writer('warn', process.stderr, args);
  console.error = (...args) => writer('error', process.stderr, args);

  installed = true;
}

