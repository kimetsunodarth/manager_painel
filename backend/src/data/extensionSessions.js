/**
 * Sessões de extensão de horário: quando o usuário cancela a programação do dia
 * (VM fica ligada após o horário padrão) ou liga a VM manualmente após o horário.
 * O "cronômetro" começa no horário programado (cancel_stop) ou na hora do start (manual_start).
 * Ao desligar a VM, a sessão é encerrada e as horas são registradas.
 */

import { getDb } from '../db/database.js';

function rowToSession(row) {
  if (!row) return null;
  const startedAt = row.startedAt ? new Date(row.startedAt).getTime() : 0;
  const endedAt = row.endedAt ? new Date(row.endedAt).getTime() : null;
  let hours = null;
  if (endedAt != null) {
    hours = Math.round((endedAt - startedAt) / (1000 * 60 * 60) * 100) / 100;
  }
  return {
    id: String(row.id),
    projectKey: row.projectKey,
    serverId: row.serverId,
    serverName: row.serverName || null,
    type: row.type,
    scheduledStopAt: row.scheduledStopAt || null,
    startedAt: row.startedAt,
    endedAt: row.endedAt || null,
    hours,
    userId: row.userId || null,
    userName: row.userName || null,
    userEmail: row.userEmail || null,
    userIp: row.userIp || null,
    countryCode: row.countryCode || null,
    countryName: row.countryName || null,
    regionName: row.regionName || null,
    cityName: row.cityName || null,
    endedByUserId: row.endedByUserId || null,
    endedByUserName: row.endedByUserName || null,
    endedByUserEmail: row.endedByUserEmail || null,
    endedByUserIp: row.endedByUserIp || null,
    endedByCountryCode: row.endedByCountryCode || null,
    endedByCountryName: row.endedByCountryName || null,
    endedByRegionName: row.endedByRegionName || null,
    endedByCityName: row.endedByCityName || null,
    createdAt: row.createdAt,
  };
}

/**
 * Cria sessão do tipo "cancel_stop": usuário cancelou a programação do dia.
 * O cronômetro considera a partir de scheduledStopAt (horário em que a VM desligaria).
 */
export function createCancelStop(projectKey, serverId, serverName, scheduledStopAt, userId, userName, userEmail, securityContext = null) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO extension_sessions (projectKey, serverId, serverName, type, scheduledStopAt, startedAt, userId, userName, userEmail, userIp, countryCode, countryName, regionName, cityName)
     VALUES (?, ?, ?, 'cancel_stop', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const startedAt = scheduledStopAt || new Date().toISOString();
  stmt.run(
    projectKey,
    serverId,
    serverName || null,
    scheduledStopAt,
    startedAt,
    userId || null,
    userName || null,
    userEmail || null,
    securityContext?.ip || null,
    securityContext?.geo?.countryCode || null,
    securityContext?.geo?.countryName || null,
    securityContext?.geo?.regionName || null,
    securityContext?.geo?.cityName || null
  );
  const row = db.prepare('SELECT * FROM extension_sessions WHERE id = last_insert_rowid()').get();
  return rowToSession(row);
}

/**
 * Cria sessão do tipo "manual_start": usuário ligou a VM após o horário (fora da programação).
 */
export function createManualStart(projectKey, serverId, serverName, userId, userName, userEmail, securityContext = null) {
  const db = getDb();
  const startedAt = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO extension_sessions (projectKey, serverId, serverName, type, startedAt, userId, userName, userEmail, userIp, countryCode, countryName, regionName, cityName)
     VALUES (?, ?, ?, 'manual_start', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    projectKey,
    serverId,
    serverName || null,
    startedAt,
    userId || null,
    userName || null,
    userEmail || null,
    securityContext?.ip || null,
    securityContext?.geo?.countryCode || null,
    securityContext?.geo?.countryName || null,
    securityContext?.geo?.regionName || null,
    securityContext?.geo?.cityName || null
  );
  const row = db.prepare('SELECT * FROM extension_sessions WHERE id = last_insert_rowid()').get();
  return rowToSession(row);
}

/**
 * Retorna sessão aberta (sem endedAt) para este projectKey + serverId, se existir.
 */
export function getOpenSession(projectKey, serverId) {
  const db = getDb();
  const row = db.prepare(
    `SELECT * FROM extension_sessions WHERE projectKey = ? AND serverId = ? AND endedAt IS NULL ORDER BY id DESC LIMIT 1`
  ).get(projectKey, serverId);
  return rowToSession(row);
}

/**
 * Encerra a sessão aberta para este projectKey + serverId. Retorna a sessão atualizada ou null.
 */
export function closeOpenSession(projectKey, serverId, endedBy = null, securityContext = null) {
  const open = getOpenSession(projectKey, serverId);
  if (!open) return null;
  const db = getDb();
  const endedAt = new Date().toISOString();
  db.prepare(
    `UPDATE extension_sessions
     SET endedAt = ?,
         endedByUserId = ?,
         endedByUserName = ?,
         endedByUserEmail = ?,
         endedByUserIp = ?,
         endedByCountryCode = ?,
         endedByCountryName = ?,
         endedByRegionName = ?,
         endedByCityName = ?
     WHERE id = ?`
  ).run(
    endedAt,
    endedBy?.userId || null,
    endedBy?.userName || null,
    endedBy?.userEmail || null,
    securityContext?.ip || null,
    securityContext?.geo?.countryCode || null,
    securityContext?.geo?.countryName || null,
    securityContext?.geo?.regionName || null,
    securityContext?.geo?.cityName || null,
    open.id
  );
  const row = db.prepare('SELECT * FROM extension_sessions WHERE id = ?').get(open.id);
  return rowToSession(row);
}

/**
 * Retorna o total de horas a mais por serverId para um projectKey.
 * Inclui: sessões encerradas (endedAt preenchido) + sessões abertas (horas até agora).
 * Usado na Home para exibir a coluna "Horas a mais" na listagem de ECS.
 * Retorno: { [serverId]: number }
 */
export function getTotalExtraHoursByProject(projectKey) {
  const db = getDb();
  const rows = db.prepare(
    `SELECT serverId,
       SUM(CASE
         WHEN endedAt IS NOT NULL THEN (julianday(endedAt) - julianday(startedAt)) * 24
         ELSE (julianday('now') - julianday(startedAt)) * 24
       END) AS total
     FROM extension_sessions
     WHERE projectKey = ?
     GROUP BY serverId`
  ).all(projectKey);
  const out = {};
  for (const r of rows) {
    const val = Number(r.total);
    if (Number.isFinite(val) && val >= 0) out[r.serverId] = Math.round(val * 100) / 100;
  }
  return out;
}

/**
 * Lista sessões com filtros. projectKeys: array de projectKey que o usuário pode ver (null = todos para admin).
 */
export function listSessions(projectKeys, filters = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM extension_sessions WHERE 1=1';
  const params = [];

  if (Array.isArray(projectKeys) && projectKeys.length > 0) {
    sql += ` AND projectKey IN (${projectKeys.map(() => '?').join(',')})`;
    params.push(...projectKeys);
  }
  if (filters.projectKey) {
    sql += ' AND projectKey = ?';
    params.push(filters.projectKey);
  }
  if (filters.serverId) {
    sql += ' AND serverId = ?';
    params.push(filters.serverId);
  }
  if (filters.from) {
    sql += ' AND startedAt >= ?';
    const fromVal = String(filters.from).length === 10 ? filters.from + 'T00:00:00.000Z' : filters.from;
    params.push(fromVal);
  }
  if (filters.to) {
    sql += ' AND startedAt <= ?';
    const toVal = String(filters.to).length === 10 ? filters.to + 'T23:59:59.999Z' : filters.to;
    params.push(toVal);
  }
  if (filters.userId) {
    sql += ' AND userId = ?';
    params.push(filters.userId);
  }
  if (filters.type) {
    sql += ' AND type = ?';
    params.push(filters.type);
  }

  sql += ' ORDER BY startedAt DESC LIMIT 500';
  const rows = db.prepare(sql).all(...params);
  return rows.map(rowToSession);
}
