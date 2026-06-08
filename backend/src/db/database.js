/**
 * Banco interno SQLite para usuários e log de auditoria.
 * Quando rodando como .exe (pkg), usa process.cwd()/data/ananim.db.
 * No exe pkg, better-sqlite3.node está em lib/node_modules/better-sqlite3/build/Release/
 * e precisa ser referenciado via nativeBinding (pkg não consegue carregar do snapshot).
 */

import Database from 'better-sqlite3';
import path from 'path';
import { mkdirSync, existsSync } from 'fs';
import { getAppRoot, getDataDir } from '../appRoot.js';

const isExe = typeof process.pkg !== 'undefined';
const DB_PATH = process.env.DB_PATH || (isExe
  ? path.join(getDataDir(), 'ananim.db')
  : path.join(getAppRoot(), 'src', 'data', 'ananim.db'));
if (isExe) {
  const dataDir = path.dirname(DB_PATH);
  if (!existsSync(dataDir)) {
    try { mkdirSync(dataDir, { recursive: true }); } catch (e) {
      console.warn('[Ananim] Nao foi possivel criar pasta data (EPERM). Certifique-se que', dataDir, 'existe e o App Pool IIS tem permissao Modify:', e.message);
    }
  }
}

let db = null;

export function getDb() {
  if (!db) {
    const opts = {};
    if (isExe) {
      opts.nativeBinding = path.join(process.cwd(), 'lib', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
    }
    db = new Database(DB_PATH, opts);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDb() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      permissions TEXT NOT NULL DEFAULT '[]',
      allowedEcsIds TEXT NOT NULL DEFAULT '[]',
      visibleProjects TEXT NOT NULL DEFAULT '[]',
      allowedHuaweiEcsIds TEXT NOT NULL DEFAULT '{}',
      allowedServiceIds TEXT NOT NULL DEFAULT '[]',
      mfaEnabled INTEGER NOT NULL DEFAULT 1,
      mfaEmail TEXT,
      mfaSecret TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      userName TEXT,
      userEmail TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ipAddress TEXT,
      userAgent TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS extension_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectKey TEXT NOT NULL,
      serverId TEXT NOT NULL,
      serverName TEXT,
      type TEXT NOT NULL,
      scheduledStopAt TEXT,
      startedAt TEXT NOT NULL,
      endedAt TEXT,
      userId TEXT,
      userName TEXT,
      userEmail TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_extension_sessions_project_server ON extension_sessions(projectKey, serverId);
    CREATE INDEX IF NOT EXISTS idx_extension_sessions_started ON extension_sessions(startedAt DESC);
  `);

  try {
    database.exec(`ALTER TABLE users ADD COLUMN allowedHuaweiEcsIds TEXT NOT NULL DEFAULT '{}'`);
  } catch (e) {
    if (!e.message?.includes('duplicate column')) throw e;
  }
  try {
    database.exec(`ALTER TABLE users ADD COLUMN allowedServiceIds TEXT NOT NULL DEFAULT '[]'`);
  } catch (e) {
    if (!e.message?.includes('duplicate column')) throw e;
  }
  try {
    database.exec(`ALTER TABLE users ADD COLUMN preferredServiceClientKey TEXT`);
  } catch (e) {
    if (!e.message?.includes('duplicate column')) throw e;
  }
  try {
    database.exec(`ALTER TABLE users ADD COLUMN mfaEnabled INTEGER NOT NULL DEFAULT 1`);
  } catch (e) {
    if (!e.message?.includes('duplicate column')) throw e;
  }
  try {
    database.exec(`ALTER TABLE users ADD COLUMN mfaEmail TEXT`);
  } catch (e) {
    if (!e.message?.includes('duplicate column')) throw e;
  }
  try {
    database.exec(`ALTER TABLE users ADD COLUMN mfaSecret TEXT`);
  } catch (e) {
    if (!e.message?.includes('duplicate column')) throw e;
  }
  try {
    database.exec(`UPDATE users SET mfaEnabled = 1 WHERE mfaEnabled IS NULL`);
  } catch (_) {}

  try {
    database.exec(`ALTER TABLE audit_logs ADD COLUMN ipAddress TEXT`);
  } catch (e) {
    if (!e.message?.includes('duplicate column')) throw e;
  }
  
  try {
    database.exec(`ALTER TABLE audit_logs ADD COLUMN userAgent TEXT`);
  } catch (e) {
    if (!e.message?.includes('duplicate column')) throw e;
  }

  const adminExists = database.prepare('SELECT 1 FROM users WHERE role = ? LIMIT 1').get('admin');
  if (!adminExists) {
    const defaultAdminHash = '$2a$10$/Aw/YX/97gKKBaBKU0j4iuCk/FkSGx.QX1NFD1AZ8uif0qorKgC0K';
    database
      .prepare(
        `INSERT INTO users (id, name, email, passwordHash, role, permissions, allowedEcsIds, visibleProjects, mfaEnabled, mfaEmail, mfaSecret)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        '1',
        'João Melo',
        'joao@example.com',
        defaultAdminHash,
        'admin',
        JSON.stringify(['ecs:*', 'services:*', 'backups:list', 'licenses:*', 'users:*', 'huawei:projects']),
        JSON.stringify([]),
        JSON.stringify([]),
        1,
        'joao@example.com',
        null
      );
    console.log('Banco interno: usuário admin padrão criado (joao@example.com). Redefina a senha no primeiro acesso.');
  }

  return database;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
