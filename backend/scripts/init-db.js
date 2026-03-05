/**
 * Inicializa o banco SQLite (cria tabelas e usuário admin se vazio).
 * Uso: node scripts/init-db.js
 */
import { initDb } from '../src/db/database.js';

initDb();
console.log('Banco inicializado. Arquivo: backend/src/data/ananim.db');
