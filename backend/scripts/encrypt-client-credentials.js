/**
 * Criptografa o .env de um cliente em credentials.enc (Fernet).
 * Uso: node scripts/encrypt-client-credentials.js <clientKey>
 * Ex: node scripts/encrypt-client-credentials.js aguas-pratas
 * Requer: .encryption_key na raiz do backend e clients/<clientKey>/.env
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Fernet } from 'fernet-nodejs';

const workDir = process.cwd();
const clientKey = process.argv[2];
if (!clientKey) {
  console.error('Uso: node scripts/encrypt-client-credentials.js <clientKey>');
  console.error('Ex:  node scripts/encrypt-client-credentials.js aguas-pratas');
  process.exit(1);
}

const keyPath = join(workDir, '.encryption_key');
const clientDir = join(workDir, 'src', 'config', 'clients', clientKey);
const envPath = join(clientDir, '.env');
const envTxtPath = join(clientDir, 'env.txt');
const credEncPath = join(clientDir, 'credentials.enc');

if (!existsSync(keyPath)) {
  console.error('Erro: .encryption_key não encontrado na raiz do backend. Rode: node scripts/gerar_chave.js');
  process.exit(1);
}

if (!existsSync(clientDir)) {
  console.error('Erro: pasta do cliente não encontrada:', clientDir);
  process.exit(1);
}

const sourcePath = existsSync(envPath) ? envPath : existsSync(envTxtPath) ? envTxtPath : null;
if (!sourcePath) {
  console.error('Erro: crie', join(clientDir, '.env'), 'ou env.txt com as variáveis SSH (veja .env.example)');
  process.exit(1);
}

const key = readFileSync(keyPath, 'utf8').trim();
const envContent = readFileSync(sourcePath, 'utf8');
const fernet = new Fernet(key);
const encrypted = fernet.encrypt(envContent);
writeFileSync(credEncPath, encrypted, 'utf8');

console.log('Credenciais criptografadas e salvas em', credEncPath);
console.log('Remova ou não faça commit do .env do cliente (use apenas credentials.enc).');
