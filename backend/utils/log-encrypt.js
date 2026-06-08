/**
 * Log em arquivo criptografado (append-only).
 * Usa a mesma chave que config.enc (key.bin ou CONFIG_KEY).
 * Formato por registro: 4 bytes length (LE) + iv(16) + tag(16) + ciphertext.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getKey } = require("./config-loader");

const ALG = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;

function getAppDir() {
  if (process.env.APP_DATA_DIR) return process.env.APP_DATA_DIR;
  const isPkg = typeof process.pkg !== "undefined";
  return isPkg ? path.dirname(process.execPath) : path.join(__dirname, "..", "..");
}

let _key = null;
function key() {
  if (_key) return _key;
  _key = getKey(getAppDir());
  return _key;
}

function encryptBlock(plaintext, keyBuf) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, keyBuf, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

/**
 * Adiciona uma linha ao log criptografado. Se não houver chave, grava em texto (fallback).
 * @param {string} logName - Nome base do arquivo (ex: "app" -> logs/app.log.enc, "startup-error" -> logs/startup-error.log.enc)
 * @param {string} message - Linha de texto a gravar
 */
function append(logName, message) {
  const appDir = getAppDir();
  const logsDir = path.join(appDir, "logs");
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  } catch (_) {
    return;
  }
  const line = "[" + new Date().toISOString() + "] " + message + "\n";
  const filePath = path.join(logsDir, logName + ".log.enc");
  const keyBuf = key();
  if (keyBuf) {
    try {
      const block = encryptBlock(line, keyBuf);
      const lenBuf = Buffer.allocUnsafe(4);
      lenBuf.writeUInt32LE(block.length, 0);
      fs.appendFileSync(filePath, Buffer.concat([lenBuf, block]));
    } catch (_) {}
  } else {
    const fallbackPath = path.join(logsDir, logName + ".log");
    try {
      fs.appendFileSync(fallbackPath, line);
    } catch (_) {}
  }
}

/**
 * Lê e descriptografa um arquivo de log (formato: blocos 4+iv+tag+ciphertext).
 * @param {Buffer} keyBuf - Chave 32 bytes
 * @param {Buffer} data - Conteúdo do arquivo
 * @returns {string} Texto descriptografado
 */
function decryptStream(keyBuf, data) {
  const decipher = require("crypto").createDecipheriv;
  let pos = 0;
  const out = [];
  while (pos + 4 <= data.length) {
    const blockLen = data.readUInt32LE(pos);
    pos += 4;
    if (blockLen < IV_LEN + TAG_LEN || pos + blockLen > data.length) break;
    const iv = data.subarray(pos, pos + IV_LEN);
    const tag = data.subarray(pos + IV_LEN, pos + IV_LEN + TAG_LEN);
    const cipher = data.subarray(pos + IV_LEN + TAG_LEN, pos + blockLen);
    const dec = decipher(ALG, keyBuf, iv);
    dec.setAuthTag(tag);
    out.push(Buffer.concat([dec.update(cipher), dec.final()]).toString("utf8"));
    pos += blockLen;
  }
  return out.join("");
}

module.exports = { append, decryptStream, getAppDir };
