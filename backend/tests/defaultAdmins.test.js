import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgr-seed-'));
process.env.DB_PATH = path.join(dir, 'ananim.db');
const { initDb, getDb, closeDb } = await import('../src/db/database.js');

test('banco novo cria joao e ananim, admins com as mesmas permissões e senha inicial', () => {
  initDb();
  const rows = getDb().prepare("SELECT email, role, permissions, passwordHash FROM users WHERE email IN ('joao@example.com', 'ananim@ananim.com.br') ORDER BY email").all();
  assert.equal(rows.length, 2);
  const [ananim, joao] = rows;
  assert.equal(ananim.role, 'admin');
  assert.equal(ananim.permissions, joao.permissions);
  assert.equal(ananim.passwordHash, joao.passwordHash);
});

test('ananim é criado uma vez só: se for excluído, não volta ao reiniciar', () => {
  getDb().prepare("DELETE FROM users WHERE email = 'ananim@ananim.com.br'").run();
  initDb();
  assert.equal(getDb().prepare("SELECT count(*) n FROM users WHERE email = 'ananim@ananim.com.br'").get().n, 0);
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
