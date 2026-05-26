/**
 * Gera logo.enc a partir de logo.png (mesma chave que config.enc/key.bin).
 * Uso: node scripts/encrypt-logo.js [--logo ../frontend/logo.png] [--out ../logo.enc]
 * Execute após encrypt-config.js para que key.bin exista na raiz do projeto.
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
    if (args[i] === "--logo" && args[i + 1]) { out.logo = args[++i]; continue; }
    if (args[i] === "--out" && args[i + 1]) { out.out = args[++i]; continue; }
  }
  return out;
}

function getKey(dir) {
  const keyHex = process.env.CONFIG_KEY;
  if (keyHex && /^[0-9a-fA-F]{64}$/.test(keyHex)) {
    return Buffer.from(keyHex, "hex");
  }
  const keyPath = path.join(dir, "key.bin");
  if (fs.existsSync(keyPath)) {
    const key = fs.readFileSync(keyPath);
    return key.length === KEY_LEN ? key : null;
  }
  return null;
}

function main() {
  const { logo: logoArg, out: outArg } = parseArgs();
  const baseDir = path.join(__dirname, ".."); // backend/
  const rootDir = path.join(baseDir, "..");  // projeto
  const logoPath = logoArg ? path.resolve(baseDir, logoArg) : path.join(rootDir, "frontend", "logo.png");
  const outPath = outArg ? path.resolve(baseDir, outArg) : path.join(rootDir, "logo.enc");

  if (!fs.existsSync(logoPath)) {
    console.error("Arquivo do logo não encontrado:", logoPath);
    process.exit(1);
  }

  const key = getKey(rootDir);
  if (!key) {
    console.error("Chave não encontrada. Execute antes: node scripts/encrypt-config.js (gera key.bin na raiz).");
    process.exit(1);
  }

  const raw = fs.readFileSync(logoPath);
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(raw), cipher.final()]);
  const tag = cipher.getAuthTag();
  const final = Buffer.concat([salt, iv, tag, enc]);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, final);
  console.log("Logo criptografado salvo em", outPath);
  console.log("Coloque logo.enc na mesma pasta do .exe (ou da pasta public) para o painel exibir o logo.");
}

main();
