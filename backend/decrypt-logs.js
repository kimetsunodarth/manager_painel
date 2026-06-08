#!/usr/bin/env node
/**
 * Descriptografa arquivos de log gerados pelo painel (app.log.enc, startup-error.log.enc).
 * Uso: node decrypt-logs.js [--key key.bin] [--dir pasta] arquivo.log.enc [saida.txt]
 *      Ou execute Descriptografar-Logs.exe (mesmos argumentos).
 * A chave é a mesma do config.enc (key.bin). Coloque key.bin na mesma pasta do exe ou use --key.
 *
 * NOVO: também suporta logs "texto" com criptografia por linha (base64(iv+tag+ciphertext), AES-256-GCM)
 * no padrão ADDS Password Reset. Ex.: logs/requests.log e logs/action-log.log.
 */
const fs = require("fs");
const path = require("path");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { key: null, dir: null, input: null, output: null, format: "auto", json: false, pretty: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--key" && args[i + 1]) { out.key = path.resolve(args[++i]); continue; }
    if (args[i] === "--dir" && args[i + 1]) { out.dir = path.resolve(args[++i]); continue; }
    if (args[i] === "--file" && args[i + 1]) { out.input = path.resolve(args[++i]); continue; }
    if (args[i] === "--format" && args[i + 1]) { out.format = String(args[++i] || "auto").toLowerCase(); continue; }
    if (args[i] === "--json") { out.json = true; continue; }
    if (args[i] === "--pretty") { out.pretty = true; continue; }
    if (args[i].startsWith("-")) continue;
    if (out.input === null) out.input = path.resolve(args[i]);
    else if (out.output === null) out.output = path.resolve(args[i]);
  }
  return out;
}

function getKey(keyPath, dirPath) {
  const KEY_LEN = 32;
  if (keyPath && fs.existsSync(keyPath)) {
    const k = fs.readFileSync(keyPath);
    return k.length === KEY_LEN ? k : null;
  }
  const hex = process.env.CONFIG_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, "hex");
  const dir = dirPath || process.cwd();
  const keyFile = path.join(dir, "key.bin");
  if (fs.existsSync(keyFile)) {
    const k = fs.readFileSync(keyFile);
    return k.length === KEY_LEN ? k : null;
  }
  return null;
}

// Lógica de descriptografia (igual a log-encrypt.js para não depender do módulo no exe)
const ALG = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;

function decryptStream(keyBuf, data) {
  const crypto = require("crypto");
  let pos = 0;
  const out = [];
  while (pos + 4 <= data.length) {
    const blockLen = data.readUInt32LE(pos);
    pos += 4;
    if (blockLen < IV_LEN + TAG_LEN || pos + blockLen > data.length) break;
    const iv = data.subarray(pos, pos + IV_LEN);
    const tag = data.subarray(pos + IV_LEN, pos + IV_LEN + TAG_LEN);
    const cipher = data.subarray(pos + IV_LEN + TAG_LEN, pos + blockLen);
    const dec = crypto.createDecipheriv(ALG, keyBuf, iv);
    dec.setAuthTag(tag);
    out.push(Buffer.concat([dec.update(cipher), dec.final()]).toString("utf8"));
    pos += blockLen;
  }
  return out.join("");
}

function decryptLine(keyBuf, line) {
  const crypto = require("crypto");
  try {
    const trimmed = String(line || "").trim();
    if (!trimmed) return null;
    const buf = Buffer.from(trimmed, "base64");
    if (buf.length < IV_LEN + TAG_LEN) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const cipher = buf.subarray(IV_LEN + TAG_LEN);
    const dec = crypto.createDecipheriv(ALG, keyBuf, iv);
    dec.setAuthTag(tag);
    const plain = Buffer.concat([dec.update(cipher), dec.final()]).toString("utf8");
    return JSON.parse(plain);
  } catch (_) {
    return null;
  }
}

function isProbablyBinaryLog(data) {
  if (!Buffer.isBuffer(data) || data.length < 4) return false;
  try {
    const blockLen = data.readUInt32LE(0);
    if (blockLen < IV_LEN + TAG_LEN + 1) return false;
    if (blockLen > data.length - 4) return false;
    return 4 + blockLen <= data.length;
  } catch (_) {
    return false;
  }
}

function waitForKey(message, exitCode) {
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(message || "Pressione Enter para sair...", () => {
    rl.close();
    process.exit(exitCode);
  });
  // Se stdin estiver fechado (ex.: pipe), sair após 1s
  if (!process.stdin.isTTY) setTimeout(() => process.exit(exitCode), 1000);
}

function main() {
  const { key: keyPath, dir: dirPath, input, output, format, json, pretty } = parseArgs();
  if (!input) {
    console.log("Descriptografar-Logs - Leitura de logs criptografados do Huawei Cloud Panel");
    console.log("");
    console.log("USO (execute pelo Prompt de Comando na pasta do painel):");
    console.log("  Descriptografar-Logs.exe arquivo.log.enc [saida.txt]");
    console.log("  Descriptografar-Logs.exe logs\\requests.log");
    console.log("  Descriptografar-Logs.exe --file logs\\action-log.log --format line --pretty");
    console.log("  Descriptografar-Logs.exe --dir \"pasta do app\" logs\\app.log.enc saida.txt");
    console.log("");
    console.log("Exemplo (painel em Program Files):");
    console.log("  cd \"C:\\Program Files\\Huawei Cloud Panel\"");
    console.log("  Descriptografar-Logs.exe logs\\startup-error.log.enc erro.txt");
    console.log("  Descriptografar-Logs.exe logs\\app.log.enc app.txt");
    console.log("");
    console.log("Coloque key.bin na mesma pasta do painel (ou use --key caminho\\key.bin).");
    waitForKey("\nPressione Enter para fechar...", 1);
    return;
  }
  const key = getKey(keyPath, dirPath || (input ? path.dirname(path.dirname(input)) : null));
  if (!key) {
    console.error("Chave nao encontrada. Use --key key.bin ou coloque key.bin na pasta do app (ou --dir).");
    waitForKey("\nPressione Enter para fechar...", 1);
    return;
  }
  if (!fs.existsSync(input)) {
    console.error("Arquivo nao encontrado:", input);
    waitForKey("\nPressione Enter para fechar...", 1);
    return;
  }

  const data = fs.readFileSync(input);
  const mode = (format === "binary" || format === "line") ? format : (isProbablyBinaryLog(data) ? "binary" : "line");

  if (mode === "binary") {
    const text = decryptStream(key, data);
    if (output) {
      fs.writeFileSync(output, text, "utf8");
      console.log("Descriptografado e salvo em:", output);
      waitForKey("\nPressione Enter para fechar...", 0);
      return;
    }
    process.stdout.write(text);
    return;
  }

  // Texto (por linha): base64(iv+tag+ciphertext) -> JSON
  const content = data.toString("utf8");
  const lines = content.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (!String(line || "").trim()) continue;
    let obj = decryptLine(key, line);
    if (!obj) {
      // fallback (dev): linha pode estar em JSON puro
      try { obj = JSON.parse(line); } catch (_) { obj = null; }
    }
    if (obj) out.push(obj);
  }

  let text = "";
  if (json && !pretty) {
    text = out.map((o) => JSON.stringify(o)).join("\n") + (out.length ? "\n" : "");
  } else if (pretty) {
    text = out.map((o) => {
      const t = o.t || o.at || "-";
      const level = (o.level || "info").toUpperCase();
      const msg = o.msg || o.action || "";
      const user = o.user || o.by || o.performedBy || o.email || "";
      return `${t} [${level}] ${msg}${user ? " user=" + user : ""}`;
    }).join("\n") + (out.length ? "\n" : "");
  } else {
    text = JSON.stringify(out, null, 2) + "\n";
  }

  if (output) {
    fs.writeFileSync(output, text, "utf8");
    console.log("Descriptografado e salvo em:", output);
    waitForKey("\nPressione Enter para fechar...", 0);
    return;
  }
  process.stdout.write(text);
}

main();
