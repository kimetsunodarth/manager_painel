import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getLogCryptoKey } from './logCryptoKey.js';

const ALG = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function encryptLine(key, payload) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const plain = JSON.stringify(payload);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptLine(key, line) {
  try {
    const trimmed = String(line || '').trim();
    if (!trimmed) return null;
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length < IV_LEN + TAG_LEN) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const cipher = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(cipher), decipher.final()]).toString('utf8');
    return JSON.parse(plain);
  } catch {
    return null;
  }
}

export function appendEncryptedLine(filePath, payload, opts = {}) {
  const appDir = opts.appDir || process.cwd();
  const requireKey = !!opts.requireKey;
  const key = getLogCryptoKey(appDir);
  if (!key) {
    if (requireKey) throw new Error('Chave de log não encontrada (use .encryption_key, key.bin ou CONFIG_KEY)');
    ensureDir(filePath);
    fs.appendFileSync(filePath, JSON.stringify(payload) + '\n', 'utf8');
    return { encrypted: false };
  }
  ensureDir(filePath);
  fs.appendFileSync(filePath, encryptLine(key, payload) + '\n', 'utf8');
  return { encrypted: true };
}

