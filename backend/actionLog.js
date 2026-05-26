/**
 * Log de ações (auditoria) do painel.
 *
 * NOVO FORMATO (estilo ADDS Password Reset):
 * - Persistência em logs/action-log.log
 * - Cada linha é base64(iv+tag+ciphertext) de um JSON (AES-256-GCM) usando key.bin/CONFIG_KEY (mesma chave do config.enc)
 * - Permite append eficiente e leitura via ferramenta de descriptografia.
 *
 * MIGRAÇÃO:
 * - Se existir actionLog.json (legado), migra automaticamente para action-log.log e renomeia o arquivo antigo.
 */
const fs = require("fs");
const path = require("path");
const secureStore = require("./utils/secureStore");
const { appendLine, decryptLine, getKeyForLogs } = require("./utils/encrypted-line-log");

const dataDir = process.env.APP_DATA_DIR || __dirname;
const logsDir = path.join(dataDir, "logs");
const FILE = path.join(logsDir, "action-log.log");
const LEGACY_FILE = path.join(dataDir, "actionLog.json");
const LEGACY_BACKUP = path.join(dataDir, "actionLog.json.migrated.bak");

const MAX_ENTRIES = 5000;
const RETENTION_DAYS = 90;

function retentionCutoffIso() {
  const d = new Date();
  d.setDate(d.getDate() - RETENTION_DAYS);
  return d.toISOString();
}

function tryReadLegacy() {
  if (!fs.existsSync(LEGACY_FILE)) return null;
  try {
    const data = secureStore.readJson(LEGACY_FILE);
    return Array.isArray(data) ? data : null;
  } catch (_) {
    try {
      const raw = fs.readFileSync(LEGACY_FILE, "utf8");
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : null;
    } catch (_) {
      return null;
    }
  }
}

function migrateLegacyIfNeeded(requireKeyForWrite) {
  if (!fs.existsSync(LEGACY_FILE)) return;
  if (fs.existsSync(LEGACY_BACKUP)) return;
  const legacy = tryReadLegacy();
  if (!legacy || legacy.length === 0) {
    try {
      fs.renameSync(LEGACY_FILE, LEGACY_BACKUP);
    } catch (_) {}
    return;
  }
  // Regravar no novo formato (linhas criptografadas) e então renomear o legado para backup.
  for (const e of legacy) {
    if (!e || typeof e !== "object") continue;
    const entry = {
      at: e.at || new Date().toISOString(),
      user: e.user || "—",
      action: e.action || "unknown",
      details: e.details && typeof e.details === "object" ? e.details : {},
    };
    appendLine(FILE, entry, { appDir: dataDir, requireKey: requireKeyForWrite });
  }
  try {
    fs.renameSync(LEGACY_FILE, LEGACY_BACKUP);
  } catch (_) {}
}

function readAllDecrypted() {
  if (!fs.existsSync(FILE)) return [];
  const key = getKeyForLogs(dataDir);
  const content = fs.readFileSync(FILE, "utf8");
  const lines = content.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    let obj = key ? decryptLine(key, trimmed) : null;
    if (!obj) {
      // dev fallback: se o arquivo foi gravado em JSON puro (sem key), tentar parsear
      try { obj = JSON.parse(trimmed); } catch (_) { obj = null; }
    }
    if (obj) out.push(obj);
  }
  return out;
}

/**
 * Registra uma ação.
 * @param {string} userEmail - E-mail do usuário (ou "sistema" para cron)
 * @param {string} action - Tipo: login, login_failed, logout, ecs_start, ecs_stop, schedule_*, user_*
 * @param {object} details - Objeto com dados relevantes (accountId, serverId, etc.)
 * @param {object} [meta] - Metadados: requestId, ip, userAgent, success, error
 */
function append(userEmail, action, details, meta) {
  const entry = {
    at: new Date().toISOString(),
    user: userEmail || "—",
    action: action || "unknown",
    details: details && typeof details === "object" ? details : {},
  };
  if (meta && typeof meta === "object") {
    if (meta.requestId) entry.requestId = String(meta.requestId);
    if (meta.ip) entry.ip = String(meta.ip);
    if (meta.userAgent) entry.userAgent = String(meta.userAgent);
    if (meta.success !== undefined) entry.success = !!meta.success;
    if (meta.error) entry.error = String(meta.error);
  }

  const requireKeyForWrite = process.env.NODE_ENV === "production";
  migrateLegacyIfNeeded(requireKeyForWrite);
  appendLine(FILE, entry, { appDir: dataDir, requireKey: requireKeyForWrite });
}

function getRecent(limit) {
  const n = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
  const requireKeyForRead = process.env.NODE_ENV === "production";
  migrateLegacyIfNeeded(requireKeyForRead);

  const cutoff = retentionCutoffIso();
  const entries = readAllDecrypted()
    .filter((e) => e && e.at && e.at >= cutoff)
    .slice(-MAX_ENTRIES);
  return entries.slice(-n).reverse();
}

module.exports = { append, getRecent };
