/**
 * Log de auditoria persistido em SQLite (banco interno).
 * Formato: { id, userId, userName, userEmail, action, details, createdAt }
 */

import { getDb } from '../db/database.js';
import path from 'path';
import { appendEncryptedLine } from '../utils/encryptedLineLog.js';

export function appendLog(entry) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO audit_logs (userId, userName, userEmail, action, details, ipAddress, userAgent, countryCode, countryName, regionName, cityName, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    entry.userId ?? null,
    entry.userName ?? '',
    entry.userEmail ?? '',
    entry.action ?? '',
    entry.details != null ? JSON.stringify(entry.details) : null,
    entry.ipAddress ?? null,
    entry.userAgent ?? null,
    entry.countryCode ?? null,
    entry.countryName ?? null,
    entry.regionName ?? null,
    entry.cityName ?? null,
    entry.createdAt ?? new Date().toISOString()
  );
  const row = db.prepare('SELECT * FROM audit_logs WHERE id = last_insert_rowid()').get();
  const out = {
    id: String(row.id),
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    action: row.action,
    details: row.details ? JSON.parse(row.details) : null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    countryCode: row.countryCode || null,
    countryName: row.countryName || null,
    regionName: row.regionName || null,
    cityName: row.cityName || null,
    createdAt: row.createdAt,
  };
  try {
    const filePath = path.join(process.cwd(), 'logs', 'action-log.log');
    appendEncryptedLine(filePath, {
      id: out.id,
      userId: out.userId,
      userName: out.userName,
      userEmail: out.userEmail,
      action: out.action,
      details: out.details,
      ipAddress: out.ipAddress,
      userAgent: out.userAgent,
      countryCode: out.countryCode,
      countryName: out.countryName,
      regionName: out.regionName,
      cityName: out.cityName,
      createdAt: out.createdAt,
    }, { appDir: process.cwd(), requireKey: process.env.NODE_ENV === 'production' });
  } catch (e) {
    // Não bloqueia o fluxo principal de auditoria em SQLite.
    console.error('[audit-log] Falha ao gravar action-log.log:', e?.message || e);
  }
  return out;
}

export function getLogs(limit = 500) {
  const rows = getDb()
    .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?')
    .all(Math.min(limit, 2000));
  return rows.map((row) => ({
    id: String(row.id),
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    action: row.action,
    details: row.details ? JSON.parse(row.details) : null,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    countryCode: row.countryCode || null,
    countryName: row.countryName || null,
    regionName: row.regionName || null,
    cityName: row.cityName || null,
    createdAt: row.createdAt,
  }));
}
