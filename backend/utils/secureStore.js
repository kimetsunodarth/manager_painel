/**
 * Armazenamento criptografado para JSON com dados sensíveis (usuários, agendamentos).
 * Usa SESSION_SECRET para derivar a chave (SHA-256); formato: SENC + iv + tag + ciphertext.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ALG = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;
const KEY_LEN = 32;
const MAGIC = Buffer.from("SENC", "ascii"); // 4 bytes

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || typeof secret !== "string") return null;
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, enc]);
}

function decrypt(buf, key) {
  if (buf.length < 4 + IV_LEN + TAG_LEN) throw new Error("Dados criptografados inválidos");
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error("Formato de arquivo não reconhecido");
  const iv = buf.subarray(4, 4 + IV_LEN);
  const tag = buf.subarray(4 + IV_LEN, 4 + IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(4 + IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Lê JSON do arquivo: se estiver criptografado (magic SENC), decripta; senão lê como UTF-8 (legado).
 */
function readJson(filePath) {
  const key = getKey();
  const data = fs.readFileSync(filePath);
  if (data.length >= 4 && data.subarray(0, 4).equals(MAGIC)) {
    if (!key) throw new Error("Arquivo criptografado mas SESSION_SECRET não definido");
    const text = decrypt(data, key);
    return JSON.parse(text);
  }
  return JSON.parse(data.toString("utf8"));
}

/**
 * Grava JSON no arquivo: se SESSION_SECRET estiver definido, grava criptografado; senão grava em texto (legado).
 */
function writeJson(filePath, obj) {
  const key = getKey();
  const text = JSON.stringify(obj, null, 2);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (key) {
    const enc = encrypt(text, key);
    fs.writeFileSync(filePath, enc);
  } else {
    fs.writeFileSync(filePath, text, "utf8");
  }
}

module.exports = {
  readJson,
  writeJson,
  getKey,
};
