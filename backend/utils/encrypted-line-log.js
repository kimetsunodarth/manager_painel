/**
 * Log em texto com criptografia por linha (estilo ADDS Password Reset).
 * Cada linha é base64(iv + tag + ciphertext) com AES-256-GCM do JSON do payload.
 * Chave: key.bin ou CONFIG_KEY (mesma de config.enc) via utils/config-loader#getKey.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getKey } = require("./config-loader");

const ALG = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;

function ensureDir(dirPath) {
  if (!dirPath) return;
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function resolveKey(appDir) {
  const dir = appDir || process.cwd();
  let key = getKey(dir);
  if (!key && typeof process.pkg !== "undefined") {
    const parentDir = path.dirname(dir);
    if (parentDir && parentDir !== dir) key = getKey(parentDir);
  }
  return key;
}

function encryptLine(keyBuf, obj) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, keyBuf, iv);
  const plain = JSON.stringify(obj);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptLine(keyBuf, line) {
  try {
    const trimmed = String(line || "").trim();
    if (!trimmed) return null;
    const buf = Buffer.from(trimmed, "base64");
    if (buf.length < IV_LEN + TAG_LEN) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const cipher = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALG, keyBuf, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(cipher), decipher.final()]).toString("utf8");
    return JSON.parse(plain);
  } catch (_) {
    return null;
  }
}

/**
 * Append de uma linha criptografada em um arquivo.
 * @param {string} filePath - Caminho completo do arquivo de log
 * @param {object} payload - Objeto serializável (JSON)
 * @param {{ appDir?: string, requireKey?: boolean }} [opts]
 */
function appendLine(filePath, payload, opts) {
  const o = opts || {};
  const key = resolveKey(o.appDir);
  if (!key) {
    if (o.requireKey) throw new Error("Chave (key.bin/CONFIG_KEY) não encontrada para criptografar logs");
    // Sem chave: grava JSON em texto (dev). Em produção, use requireKey=true para bloquear.
    try {
      process.stderr.write("[encrypted-line-log] key.bin/CONFIG_KEY não encontrado; gravando log em texto: " + filePath + "\n");
    } catch (_) {}
    const line = JSON.stringify(payload) + "\n";
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, line, "utf8");
    return { encrypted: false };
  }
  const line = encryptLine(key, payload) + "\n";
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, line, "utf8");
  return { encrypted: true };
}

function getKeyForLogs(appDir) {
  return resolveKey(appDir);
}

module.exports = {
  encryptLine,
  decryptLine,
  appendLine,
  getKeyForLogs,
};
