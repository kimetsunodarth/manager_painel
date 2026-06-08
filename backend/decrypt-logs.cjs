#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALG = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { file: null, output: null, format: 'auto', key: null, json: false, pretty: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--file' && args[i + 1]) { out.file = path.resolve(args[++i]); continue; }
    if (a === '--output' && args[i + 1]) { out.output = path.resolve(args[++i]); continue; }
    if (a === '--format' && args[i + 1]) { out.format = String(args[++i]).toLowerCase(); continue; }
    if (a === '--key' && args[i + 1]) { out.key = path.resolve(args[++i]); continue; }
    if (a === '--json') { out.json = true; continue; }
    if (a === '--pretty') { out.pretty = true; continue; }
    if (!a.startsWith('-') && !out.file) { out.file = path.resolve(a); continue; }
    if (!a.startsWith('-') && !out.output) { out.output = path.resolve(a); continue; }
  }
  return out;
}

function readKeyFromFile(keyPath) {
  if (!keyPath || !fs.existsSync(keyPath)) return null;
  const raw = fs.readFileSync(keyPath);
  if (raw.length === 32) return raw;
  const text = raw.toString('utf8').trim();
  if (!text) return null;
  return crypto.createHash('sha256').update(text, 'utf8').digest();
}

function getKey(inputFile, explicitKeyPath) {
  const envHex = process.env.CONFIG_KEY;
  if (envHex && /^[0-9a-fA-F]{64}$/.test(envHex.trim())) return Buffer.from(envHex.trim(), 'hex');
  if (explicitKeyPath) return readKeyFromFile(explicitKeyPath);
  const candidates = [];
  if (inputFile) {
    const dir = path.dirname(inputFile);
    const root = path.dirname(dir);
    candidates.push(path.join(dir, '.encryption_key'));
    candidates.push(path.join(dir, 'key.bin'));
    candidates.push(path.join(root, '.encryption_key'));
    candidates.push(path.join(root, 'key.bin'));
    candidates.push(path.join(process.cwd(), '.encryption_key'));
    candidates.push(path.join(process.cwd(), 'key.bin'));
  }
  for (const c of candidates) {
    const k = readKeyFromFile(c);
    if (k) return k;
  }
  return null;
}

function decryptLine(key, line) {
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

function decryptBinaryStream(key, data) {
  let pos = 0;
  const out = [];
  while (pos + 4 <= data.length) {
    const blockLen = data.readUInt32LE(pos);
    pos += 4;
    if (blockLen < IV_LEN + TAG_LEN || pos + blockLen > data.length) break;
    const iv = data.subarray(pos, pos + IV_LEN);
    const tag = data.subarray(pos + IV_LEN, pos + IV_LEN + TAG_LEN);
    const cipher = data.subarray(pos + IV_LEN + TAG_LEN, pos + blockLen);
    const decipher = crypto.createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    out.push(Buffer.concat([decipher.update(cipher), decipher.final()]).toString('utf8'));
    pos += blockLen;
  }
  return out.join('');
}

function looksBinary(data) {
  if (!Buffer.isBuffer(data) || data.length < 4) return false;
  try {
    const blockLen = data.readUInt32LE(0);
    return blockLen > IV_LEN + TAG_LEN && blockLen <= data.length - 4;
  } catch {
    return false;
  }
}

function renderObjects(objs, opts) {
  if (opts.pretty) {
    return objs.map((o) => {
      const t = o.t || o.at || o.createdAt || '-';
      const level = String(o.level || 'INFO').toUpperCase();
      const msg = o.msg || o.action || '';
      const user = o.userEmail || o.user || o.email || '';
      return `${t} [${level}] ${msg}${user ? ' user=' + user : ''}`;
    }).join('\n') + (objs.length ? '\n' : '');
  }
  if (opts.json) {
    return objs.map((o) => JSON.stringify(o)).join('\n') + (objs.length ? '\n' : '');
  }
  return JSON.stringify(objs, null, 2) + '\n';
}

function printHelp() {
  console.log('Descriptografar logs - Ananim Manager Painel');
  console.log('');
  console.log('Uso:');
  console.log('  Descriptografar-Logs.exe --file logs\\requests.log --format line --pretty');
  console.log('  Descriptografar-Logs.exe --file logs\\action-log.log --format line --json');
  console.log('  Descriptografar-Logs.exe --file logs\\app.log.enc --format binary --output app.txt');
  console.log('');
  console.log('Opções:');
  console.log('  --file <caminho>     Arquivo de log');
  console.log('  --output <caminho>   Salvar saída em arquivo');
  console.log('  --format <auto|line|binary>');
  console.log('  --key <caminho>      Chave (.encryption_key ou key.bin)');
  console.log('  --json               Saída JSONL para logs de linha');
  console.log('  --pretty             Saída resumida legível');
}

function main() {
  const args = parseArgs();
  if (!args.file) {
    printHelp();
    process.exit(1);
  }
  if (!fs.existsSync(args.file)) {
    console.error('Arquivo não encontrado:', args.file);
    process.exit(1);
  }
  const key = getKey(args.file, args.key);
  if (!key) {
    console.error('Chave não encontrada. Use --key ou coloque .encryption_key/key.bin na pasta do app.');
    process.exit(1);
  }

  const data = fs.readFileSync(args.file);
  const mode = (args.format === 'line' || args.format === 'binary')
    ? args.format
    : (looksBinary(data) ? 'binary' : 'line');

  let outputText = '';
  if (mode === 'binary') {
    outputText = decryptBinaryStream(key, data);
  } else {
    const lines = data.toString('utf8').split(/\r?\n/);
    const objs = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj = decryptLine(key, line);
      if (!obj) {
        try { obj = JSON.parse(line); } catch { obj = null; }
      }
      if (obj) objs.push(obj);
    }
    outputText = renderObjects(objs, args);
  }

  if (args.output) {
    fs.writeFileSync(args.output, outputText, 'utf8');
    console.log('Descriptografado e salvo em:', args.output);
    return;
  }
  process.stdout.write(outputText);
}

main();

