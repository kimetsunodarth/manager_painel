/**
 * Carrega configuração: em produção usa config.enc (criptografado) + key.bin ou CONFIG_KEY;
 * em desenvolvimento pode usar .env (dotenv).
 * Dados sensíveis não ficam em texto na pasta de instalação.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CONFIG_ENC = "config.enc";
const KEY_FILE = "key.bin";
const ALG = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;
const SALT_LEN = 32;
const KEY_LEN = 32;

/**
 * Lê chave: variável CONFIG_KEY (hex 64 chars) ou arquivo key.bin.
 * @param {string} appDir - Diretório do app (onde está config.enc)
 * @returns {Buffer|null} Chave de 32 bytes ou null
 */
function getKey(appDir) {
  const keyHex = process.env.CONFIG_KEY;
  if (keyHex && /^[0-9a-fA-F]{64}$/.test(keyHex)) {
    return Buffer.from(keyHex, "hex");
  }
  const keyPath = path.join(appDir, KEY_FILE);
  if (fs.existsSync(keyPath)) {
    const key = fs.readFileSync(keyPath);
    return key.length === KEY_LEN ? key : null;
  }
  return null;
}

/**
 * Decripta buffer (formato: salt + iv + tag + ciphertext). Retorna Buffer (para binários como logo).
 */
function decryptBinary(enc, key) {
  const iv = enc.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = enc.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const cipher = enc.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cipher), decipher.final()]);
}

/**
 * Decripta config.enc (formato: salt + iv + tag + ciphertext) como texto UTF-8.
 */
function decrypt(enc, key) {
  return decryptBinary(enc, key).toString("utf8");
}

/**
 * Parse texto no formato KEY=VALUE e aplica em process.env.
 */
function applyToEnv(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

/**
 * Carrega config: se existir config.enc e houver chave, decripta e aplica em process.env.
 * @param {string} [appDir] - Diretório onde estão config.enc e opcionalmente key.bin
 * @returns {{ loaded: 'encrypted' | 'none' }}
 */
function loadConfig(appDir) {
  const dir = appDir || path.join(__dirname, "..");
  const configPath = path.join(dir, CONFIG_ENC);

  if (fs.existsSync(configPath)) {
    const key = getKey(dir);
    if (key) {
      const enc = fs.readFileSync(configPath);
      const text = decrypt(enc, key);
      applyToEnv(text);
      return { loaded: "encrypted" };
    }
  }

  return { loaded: "none" };
}

module.exports = { loadConfig, getKey, decrypt, decryptBinary, CONFIG_ENC, KEY_FILE };
