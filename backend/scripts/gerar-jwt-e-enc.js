/**
 * Gera JWT_SECRET (32+ caracteres), opcionalmente adiciona ao .env do projeto,
 * e gera config.enc + .encryption_key (e key.bin) para uso em produção (igual Huawei Cloud Panel).
 *
 * Uso:
 *   cd backend
 *   node scripts/gerar-jwt-e-enc.js
 *
 * Ou: npm run gerar-jwt-e-enc
 *
 * 1) Gera um JWT_SECRET aleatório e mostra no console (adicione ao .env do projeto se quiser).
 * 2) Se não existir .encryption_key, gera e salva em .encryption_key e key.bin.
 * 3) Lê o .env atual, criptografa e salva em config.enc.
 *
 * Em produção: copie config.enc e key.bin (ou .encryption_key) para a pasta do programa; não use .env.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { Fernet } from 'fernet-nodejs';

const workDir = process.cwd();
const keyPath = join(workDir, '.encryption_key');
const keyBinPath = join(workDir, 'key.bin');
const envPath = join(workDir, '.env');
const configEncPath = join(workDir, 'config.enc');

// JWT_SECRET: 32+ caracteres (base64 = 44 chars)
const JWT_SECRET = randomBytes(32).toString('base64');

console.log('\n=== JWT_SECRET (adicione ao .env do projeto para desenvolvimento) ===');
console.log('JWT_SECRET=' + JWT_SECRET);
console.log('(mínimo 32 caracteres; use este valor no .env e no conteúdo que será criptografado em config.enc)\n');

// Garantir que .env tenha JWT_SECRET (para depois criptografar em config.enc)
let envContent = '';
if (existsSync(envPath)) {
  envContent = readFileSync(envPath, 'utf8');
  if (!/^\s*JWT_SECRET\s*=/m.test(envContent)) {
    envContent = envContent.trimEnd() + '\n# JWT (gerado por gerar-jwt-e-enc.js)\nJWT_SECRET=' + JWT_SECRET + '\n';
    writeFileSync(envPath, envContent, 'utf8');
    console.log('JWT_SECRET adicionado ao .env.');
  } else {
    console.log('.env já contém JWT_SECRET; mantido como está. Para usar o novo valor acima, edite .env e rode: npm run encrypt-config');
  }
} else {
  envContent = '# Configuração – criptografada em config.enc para produção\nNODE_ENV=production\nJWT_SECRET=' + JWT_SECRET + '\n';
  writeFileSync(envPath, envContent, 'utf8');
  console.log('.env criado com JWT_SECRET. Adicione outros valores (perfis Huawei, etc.) e rode este script de novo para atualizar config.enc.');
}

// Chave Fernet: gerar se não existir
let key;
if (existsSync(keyPath)) {
  key = readFileSync(keyPath, 'utf8').trim();
  console.log('Chave existente em .encryption_key usada.');
} else {
  key = Fernet.generateKey();
  writeFileSync(keyPath, key, 'utf8');
  writeFileSync(keyBinPath, key, 'utf8');
  console.log('.encryption_key e key.bin gerados.');
}

// Criptografar .env em config.enc
const fernet = new Fernet(key);
const encrypted = fernet.encrypt(envContent);
writeFileSync(configEncPath, encrypted, 'utf8');

console.log('config.enc gerado (conteúdo do .env criptografado).');
console.log('\nPara produção: copie para a pasta do programa apenas config.enc e key.bin (ou .encryption_key). Não use .env.\n');
