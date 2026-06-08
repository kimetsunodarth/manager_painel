/**
 * Gera config.enc a partir do .env (credenciais ficam ocultas e criptografadas).
 * Uso: node scripts/encrypt-config.js [--env .env] [--out config.enc]
 * Se CONFIG_KEY (hex 64 chars) não estiver definido, gera chave aleatória e salva key.bin.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ALG = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;
const SALT_LEN = 32;
const KEY_LEN = 32;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--env" && args[i + 1]) { out.env = args[++i]; continue; }
    if (args[i] === "--out" && args[i + 1]) { out.out = args[++i]; continue; }
  }
  return out;
}

function main() {
  const { env: envFile, out: outPath } = parseArgs();
  const baseDir = path.join(__dirname, ".."); // backend/
  const rootDir = path.join(baseDir, "..");   // projeto
  const envPath = envFile ? path.resolve(baseDir, envFile) : path.join(rootDir, ".env");
  const configOut = outPath ? path.resolve(baseDir, outPath) : path.join(rootDir, "config.enc");

  if (!fs.existsSync(envPath)) {
    console.error("Arquivo .env não encontrado:", envPath);
    process.exit(1);
  }

  const text = fs.readFileSync(envPath, "utf8");
  let keyBuf;

  if (process.env.CONFIG_KEY && /^[0-9a-fA-F]{64}$/.test(process.env.CONFIG_KEY)) {
    keyBuf = Buffer.from(process.env.CONFIG_KEY, "hex");
  } else {
    keyBuf = crypto.randomBytes(KEY_LEN);
    const keyPath = path.join(path.dirname(configOut), "key.bin"); // mesma pasta do config.enc
    fs.writeFileSync(keyPath, keyBuf);
    console.log("Chave aleatória salva em", keyPath);
    console.log("Guarde key.bin e coloque na mesma pasta do .exe (ou use CONFIG_KEY em hex no ambiente).");
  }

  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, keyBuf, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const final = Buffer.concat([salt, iv, tag, enc]);

  fs.mkdirSync(path.dirname(configOut), { recursive: true });
  fs.writeFileSync(configOut, final);
  console.log("Config criptografada salva em", configOut);
  console.log("Copie config.enc (e key.bin se gerado) para a pasta do app. Nao deixe .env em texto no servidor.");
}

main();
