import crypto from 'crypto';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

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

export function getLogCryptoKey(appDir = process.cwd()) {
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

