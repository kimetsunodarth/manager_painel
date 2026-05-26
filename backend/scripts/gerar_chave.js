/**
 * Gera chave Fernet e salva em .encryption_key (mesmo conceito do CBR).
 * Uso: node scripts/gerar_chave.js
 * Ou copie .encryption_key do projeto CBR para reutilizar o mesmo config.enc.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { Fernet } from 'fernet-nodejs';

const workDir = process.cwd();
const keyPath = join(workDir, '.encryption_key');

const key = Fernet.generateKey();
writeFileSync(keyPath, key, 'utf8');

console.log('\nChave de criptografia gerada e salva em .encryption_key');
console.log('Use scripts/encrypt_config.js para criptografar o .env em config.enc');
console.log('(Ou copie .encryption_key e config.enc do projeto CBR para usar os mesmos perfis.)\n');
