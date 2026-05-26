/**
 * Lê o .env, criptografa com Fernet e salva em config.enc (mesmo conceito do CBR).
 * Uso: node scripts/encrypt_config.js
 * Requer: .encryption_key (rode gerar_chave.js ou copie do CBR) e .env
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Fernet } from 'fernet-nodejs';

const workDir = process.cwd();
const keyPath = join(workDir, '.encryption_key');
const envPath = join(workDir, '.env');
const configEncPath = join(workDir, 'config.enc');

if (!existsSync(keyPath)) {
  console.error('Erro: .encryption_key não encontrado. Rode: node scripts/gerar_chave.js');
  process.exit(1);
}

if (!existsSync(envPath)) {
  console.error('Erro: .env não encontrado. Crie o .env com os perfis (ex: RAMO_ACCESS_KEY=..., RAMO_SECRET_KEY=..., RAMO_PROJECT_ID=..., RAMO_REGION=...).');
  process.exit(1);
}

const key = readFileSync(keyPath, 'utf8').trim();
const envContent = readFileSync(envPath, 'utf8');

const fernet = new Fernet(key);
const encrypted = fernet.encrypt(envContent);

writeFileSync(configEncPath, encrypted, 'utf8');

console.log('Configuração criptografada e salva em config.enc');
console.log('Formato dos perfis (igual CBR): NOME_ACCESS_KEY, NOME_SECRET_KEY, NOME_PROJECT_ID, NOME_REGION');
console.log('Opcional: MASTER_PROFILE=NOME para definir qual perfil usar na API de listar projetos.\n');
