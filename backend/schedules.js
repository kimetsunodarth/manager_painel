/**
 * Agendamentos de Start/Stop ECS — réplica do Cloud8.
 * Persistência em JSON (criptografado quando SESSION_SECRET está definido); execução via cron (a cada minuto).
 */
const path = require("path");
const { getCredentials, getAccountName } = require("./config");
const { startServer, stopServer, restartServer } = require("./ecsClient");
const actionLog = require("./actionLog");
const secureStore = require("./utils/secureStore");

const dataDir = process.env.APP_DATA_DIR || __dirname;
const FILE = path.join(dataDir, "agendamentos.json");

function loadSchedules() {
  try {
    return secureStore.readJson(FILE);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

function saveSchedules(list) {
  secureStore.writeJson(FILE, list);
}

function nextId(list) {
  const ids = list.map((s) => s.id).filter((n) => typeof n === "number");
  return ids.length ? Math.max(...ids) + 1 : 1;
}

/**
 * Lista todos os agendamentos.
 */
function list() {
  return loadSchedules();
}

/**
 * Adiciona um agendamento.
 * Body: { accountId, region, projectId, projectName, serverId, serverName, action, hour, minute, days }
 * projectName: nome do projeto para exibir como "pasta" na listagem
 */
function add(body) {
  const list = loadSchedules();
  const id = nextId(list);
  const schedule = {
    id,
    accountId: String(body.accountId || "").trim(),
    region: String(body.region || "").trim(),
    projectId: String(body.projectId || "").trim(),
    projectName: String(body.projectName || "").trim() || null,
    serverId: String(body.serverId || "").trim(),
    serverName: String(body.serverName || "").trim() || "(ECS)",
    action: body.action === "stop" ? "stop" : body.action === "restart" ? "restart" : "start",
    hour: Math.max(0, Math.min(23, parseInt(body.hour, 10) || 0)),
    minute: Math.max(0, Math.min(59, parseInt(body.minute, 10) || 0)),
    days: Array.isArray(body.days) ? body.days.filter((d) => d >= 0 && d <= 6) : null,
    enabled: body.enabled !== false,
    createdBy: body.createdBy != null ? String(body.createdBy) : null,
    lastModifiedBy: null,
  };
  list.push(schedule);
  saveSchedules(list);
  return schedule;
}

/**
 * Atualiza um agendamento por id.
 */
function update(id, body) {
  const list = loadSchedules();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const s = list[idx];
  if (body.accountId !== undefined) s.accountId = String(body.accountId).trim();
  if (body.region !== undefined) s.region = String(body.region).trim();
  if (body.projectId !== undefined) s.projectId = String(body.projectId).trim();
  if (body.projectName !== undefined) s.projectName = String(body.projectName || "").trim() || null;
  if (body.serverId !== undefined) s.serverId = String(body.serverId).trim();
  if (body.serverName !== undefined) s.serverName = String(body.serverName).trim();
  if (body.action !== undefined) s.action = body.action === "stop" ? "stop" : body.action === "restart" ? "restart" : "start";
  if (body.hour !== undefined) s.hour = Math.max(0, Math.min(23, parseInt(body.hour, 10) || 0));
  if (body.minute !== undefined) s.minute = Math.max(0, Math.min(59, parseInt(body.minute, 10) || 0));
  if (body.days !== undefined) s.days = Array.isArray(body.days) ? body.days.filter((d) => d >= 0 && d <= 6) : null;
  if (body.enabled !== undefined) s.enabled = !!body.enabled;
  if (body.modifiedBy !== undefined) s.lastModifiedBy = body.modifiedBy != null ? String(body.modifiedBy) : null;
  saveSchedules(list);
  return s;
}

/**
 * Remove um agendamento por id.
 * Retorna o agendamento removido ou null se não existir.
 */
function remove(id) {
  const list = loadSchedules();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const removed = list[idx];
  list.splice(idx, 1);
  saveSchedules(list);
  return removed;
}

/**
 * Retorna true se o agendamento deve rodar agora (data/hora local).
 */
function shouldRunNow(schedule) {
  if (!schedule.enabled) return false;
  const now = new Date();
  if (schedule.hour !== now.getHours()) return false;
  if (schedule.minute !== now.getMinutes()) return false;
  const day = now.getDay(); // 0-6
  if (schedule.days !== null && schedule.days.length && !schedule.days.includes(day)) return false;
  return true;
}

/**
 * Executa um agendamento (chama start, stop ou restart no ECS).
 * Registra no log de ações: sucesso (success: true) ou falha (success: false, error: mensagem).
 * @returns {{ ok: boolean, error?: string }}
 */
async function runOne(schedule) {
  const detail = {
    scheduleId: schedule.id,
    action: schedule.action,
    serverId: schedule.serverId,
    serverName: schedule.serverName,
    accountId: schedule.accountId,
    accountName: getAccountName(schedule.accountId),
    region: schedule.region,
    projectId: schedule.projectId,
    hour: schedule.hour,
    minute: schedule.minute,
    createdBy: schedule.createdBy || null,
    modifiedBy: schedule.lastModifiedBy || null,
  };
  const creds = getCredentials(schedule.accountId);
  if (!creds) {
    const msg = "Conta não encontrada: " + (schedule.accountId || "(vazio)");
    console.warn("[Agendamento]", msg, "scheduleId:", schedule.id);
    actionLog.append("sistema", "schedule_run", { ...detail, success: false, error: msg });
    return { ok: false, error: msg };
  }
  try {
    if (schedule.action === "stop") {
      await stopServer(creds.ak, creds.sk, schedule.region, schedule.projectId, schedule.serverId);
      console.log("[Agendamento] STOP OK:", schedule.serverName, schedule.serverId);
      actionLog.append("sistema", "schedule_run", { ...detail, success: true });
      return { ok: true };
    }
    if (schedule.action === "restart") {
      await restartServer(creds.ak, creds.sk, schedule.region, schedule.projectId, schedule.serverId);
      console.log("[Agendamento] RESTART OK:", schedule.serverName, schedule.serverId);
      actionLog.append("sistema", "schedule_run", { ...detail, success: true });
      return { ok: true };
    }
    await startServer(creds.ak, creds.sk, schedule.region, schedule.projectId, schedule.serverId);
    console.log("[Agendamento] START OK:", schedule.serverName, schedule.serverId);
    actionLog.append("sistema", "schedule_run", { ...detail, success: true });
    return { ok: true };
  } catch (e) {
    let msg = e.message || String(e);
    const isNotFound = /could not be found|Ecs\.0114|itemNotFound/i.test(msg);
    if (isNotFound) {
      msg += " — Dica: use os mesmos conta, região e projeto da VM (edite o agendamento e confira).";
    }
    console.error("[Agendamento] Erro scheduleId=" + schedule.id + ":", msg);
    actionLog.append("sistema", "schedule_run", { ...detail, success: false, error: msg });
    return { ok: false, error: msg };
  }
}

/**
 * Verifica todos os agendamentos e executa os que devem rodar agora.
 * Chamado a cada minuto pelo cron (não depende do navegador nem de usuário logado).
 * Registra no log:
 * - schedule_heartbeat a cada 5 min (trail contínuo; evita "salto na data" e comprova que o processo estava ativo).
 * - schedule_cron_check 1x por hora quando zero devidos (diagnóstico).
 * - schedule_cron_run quando há execuções.
 */
const HEARTBEAT_INTERVAL_MINUTES = 5;

async function runDue() {
  const list = loadSchedules();
  const due = list.filter((s) => shouldRunNow(s));
  const now = new Date();
  const totalSchedules = list.length;
  const enabledCount = list.filter((s) => s.enabled).length;
  const serverTime = now.toISOString();
  const serverTimeLocal = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  if (due.length === 0) {
    const min = now.getMinutes();
    if (min % HEARTBEAT_INTERVAL_MINUTES === 0) {
      actionLog.append("sistema", "schedule_heartbeat", {
        serverTime,
        serverTimeLocal,
        totalSchedules,
        enabledCount,
        dueCount: 0,
        message: "Cron ativo; nenhum agendamento devido neste minuto.",
      });
    }
    if (min === 0) {
      actionLog.append("sistema", "schedule_cron_check", {
        dueCount: 0,
        serverTime,
        serverTimeLocal,
        totalSchedules,
        enabledCount,
      });
    }
    return;
  }
  const results = [];
  for (const s of due) {
    const r = await runOne(s);
    results.push({ scheduleId: s.id, serverName: s.serverName, ok: r.ok, error: r.error });
  }
  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  actionLog.append("sistema", "schedule_cron_run", {
    dueCount: due.length,
    successCount: okCount,
    failedCount: failCount,
    serverTime: new Date().toISOString(),
    serverTimeLocal: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    scheduleIds: due.map((s) => s.id),
    results: results.map((r) => ({ scheduleId: r.scheduleId, serverName: r.serverName, ok: r.ok, error: r.error || null })),
  });
}

module.exports = {
  list,
  add,
  update,
  remove,
  runDue,
  loadSchedules,
};
