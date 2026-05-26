/**
 * Define o cliente preferido na aba Serviços como "Roland" para o usuário Edmar.
 * Uso: na pasta backend: node scripts/set-edmar-preferred-roland.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
const dbPath = path.join(backendRoot, 'src', 'data', 'ananim.db');

const PREFERRED_KEY = 'roland';
const USER_NAME_MATCH = 'edmar';

function main() {
  const db = new Database(dbPath, { readonly: false });
  try {
    try {
      db.exec('ALTER TABLE users ADD COLUMN preferredServiceClientKey TEXT');
    } catch (e) {
      if (!e.message?.includes('duplicate column')) throw e;
    }
    const rows = db.prepare('SELECT id, name FROM users').all();
    const edmar = rows.find((r) => (r.name || '').toLowerCase().includes(USER_NAME_MATCH));
    if (!edmar) {
      console.log('Nenhum usuário com nome contendo "Edmar" encontrado.');
      return;
    }
    db.prepare('UPDATE users SET preferredServiceClientKey = ? WHERE id = ?').run(PREFERRED_KEY, edmar.id);
    console.log(`Usuário "${edmar.name}" (id ${edmar.id}): cliente preferido na aba Serviços definido como "${PREFERRED_KEY}".`);
  } finally {
    db.close();
  }
}

main();
