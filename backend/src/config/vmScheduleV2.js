/**
 * Programação oficial por VM (como no exemplo ANANIMCLOUD).
 * Cada VM tem agendamentos individuais de Start e Stop.
 * Cancelamento somente para o dia específico — no outro dia segue a programação oficial.
 *
 * Estrutura agendamentos: [{ id, projectKey, projectId, region, perfil, serverId, serverName,
 *   action: 'start'|'stop', hour, minute, days: [0-6]|null (null=todos), enabled, createdBy }]
 *
 * Estrutura cancelamentos: { [projectKey]: { [serverId]: { [date]: 'stop'|'start' } } }
 *   date = "YYYY-MM-DD". Quando cancelado para um dia, naquele dia não executa; no dia seguinte volta ao normal.
 */

import fs from 'fs';
import path from 'path';
import { getConfigDir } from '../appRoot.js';

const CONFIG_DIR = getConfigDir();
const AGENDAMENTOS_FILE = path.join(CONFIG_DIR, 'agendamentos-vm.json');
const CANCELAMENTOS_FILE = path.join(CONFIG_DIR, 'cancelamentos-dia.json');

function ensureConfigDir() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn('[vmScheduleV2] mkdir', CONFIG_DIR, e.message);
  }
}

function readJson(filePath, defaultVal) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[vmScheduleV2]', filePath, e.message);
  }
  return defaultVal;
}

function writeJson(filePath, data) {
  try {
    ensureConfigDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[vmScheduleV2] write', filePath, e.message);
    throw e;
  }
}

function nextId(list) {
  const ids = list.map((s) => s.id).filter((n) => typeof n === 'number');
  return ids.length ? Math.max(...ids) + 1 : 1;
}

/** Caminho do arquivo de agendamentos (para diagnóstico). */
export function getAgendamentosFilePath() {
  return AGENDAMENTOS_FILE;
}

/** Lista todos os agendamentos (por projeto ou todos). */
export function listSchedules(projectKeyFilter = null) {
  const list = readJson(AGENDAMENTOS_FILE, []);
  if (!projectKeyFilter) return list;
  return list.filter((s) => s.projectKey === projectKeyFilter);
}

/** Adiciona um agendamento. */
export function addSchedule(body) {
  const list = readJson(AGENDAMENTOS_FILE, []);
  const id = nextId(list);
  const schedule = {
    id,
    projectKey: String(body.projectKey || '').trim(),
    projectId: String(body.projectId || '').trim(),
    region: String(body.region || '').trim() || null,
    perfil: body.perfil != null ? String(body.perfil) : null,
    serverId: String(body.serverId || '').trim(),
    serverName: String(body.serverName || '').trim() || '(ECS)',
    action: body.action === 'restart' ? 'restart' : body.action === 'stop' ? 'stop' : 'start',
    hour: Math.max(0, Math.min(23, parseInt(body.hour, 10) || 0)),
    minute: Math.max(0, Math.min(59, parseInt(body.minute, 10) || 0)),
    days: Array.isArray(body.days) ? body.days.filter((d) => d >= 0 && d <= 6) : null,
    enabled: body.enabled !== false,
    isExternal: !!body.isExternal,
    createdBy: body.createdBy != null ? String(body.createdBy) : null,
    lastModifiedBy: null,
  };
  list.push(schedule);
  writeJson(AGENDAMENTOS_FILE, list);
  return schedule;
}

/** Atualiza um agendamento por id. Não sobrescreve projectKey/projectId com vazio (evita que edição quebre o cron). */
export function updateSchedule(id, body) {
  const list = readJson(AGENDAMENTOS_FILE, []);
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const s = list[idx];
  const nonEmpty = (v) => v != null && String(v).trim() !== '';
  if (body.projectKey !== undefined && nonEmpty(body.projectKey)) s.projectKey = String(body.projectKey).trim();
  if (body.projectId !== undefined && nonEmpty(body.projectId)) s.projectId = String(body.projectId).trim();
  if (body.region !== undefined) s.region = body.region != null ? String(body.region).trim() || null : null;
  if (body.perfil !== undefined) s.perfil = body.perfil != null ? String(body.perfil) : null;
  if (body.serverId !== undefined) s.serverId = String(body.serverId || '').trim();
  if (body.serverName !== undefined) s.serverName = String(body.serverName || '').trim();
  if (body.action !== undefined) s.action = body.action === 'restart' ? 'restart' : body.action === 'stop' ? 'stop' : 'start';
  if (body.hour !== undefined) s.hour = Math.max(0, Math.min(23, parseInt(body.hour, 10) || 0));
  if (body.minute !== undefined) s.minute = Math.max(0, Math.min(59, parseInt(body.minute, 10) || 0));
  if (body.days !== undefined) s.days = Array.isArray(body.days) ? body.days.filter((d) => d >= 0 && d <= 6) : null;
  if (body.enabled !== undefined) s.enabled = !!body.enabled;
  if (body.isExternal !== undefined) s.isExternal = !!body.isExternal;
  if (body.modifiedBy !== undefined) s.lastModifiedBy = body.modifiedBy != null ? String(body.modifiedBy) : null;
  writeJson(AGENDAMENTOS_FILE, list);
  return s;
}

/** Remove um agendamento por id. */
export function removeSchedule(id) {
  const list = readJson(AGENDAMENTOS_FILE, []);
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const removed = list[idx];
  list.splice(idx, 1);
  writeJson(AGENDAMENTOS_FILE, list);
  return removed;
}

/** Retorna true se o agendamento deve rodar agora (data/hora local). */
export function shouldRunNow(schedule, now = new Date()) {
  if (!schedule.enabled) return false;
  if (schedule.isExternal) return false; // Externo nunca roda o Start/Stop da nossa API
  if (schedule.hour !== now.getHours()) return false;
  if (schedule.minute !== now.getMinutes()) return false;
  const day = now.getDay();
  if (schedule.days != null && schedule.days.length > 0 && !schedule.days.includes(day)) return false;
  return true;
}

/**
 * Retorna true se o horário 'now' está dentro da janela de funcionamento programada.
 * Se houver um Start às 08:00 e Stop às 18:00, retorna true entre esses horários.
 * Tratamos apenas o par Start/Stop mais próximo.
 */
export function isInsideScheduleWindow(projectKey, serverId, now = new Date()) {
  const list = listSchedules(projectKey).filter((s) => s.serverId === serverId && s.enabled);
  if (list.length === 0) return false;

  const day = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Filtra agendamentos válidos para hoje
  const todaySchedules = list.filter((s) => !s.days || s.days.length === 0 || s.days.includes(day));
  if (todaySchedules.length === 0) return false;

  const starts = todaySchedules.filter((s) => s.action === 'start').sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
  const stops = todaySchedules.filter((s) => s.action === 'stop').sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));

  // Lógica de Janelas: Se a hora atual estiver entre QUALQUER Start e o subsequente Stop do dia.
  for (const start of starts) {
    const startMin = start.hour * 60 + start.minute;
    // Procura o primeiro Stop que ocorre APÓS este Start
    const matchingStop = stops.find((s) => (s.hour * 60 + s.minute) > startMin);
    
    if (matchingStop) {
      const stopMin = matchingStop.hour * 60 + matchingStop.minute;
      if (currentMinutes >= startMin && currentMinutes < stopMin) return true;
    } else {
      // Se tem um Start mas nenhum Stop depois dele HOJE, 
      // verificamos se há um Stop amanhã cedo (virada de dia) ou se o Stop de hoje foi antes (erro de config).
      // Para o Monitor ser seguro: se houve Start e não houve Stop ainda, assumimos que deve estar ligado.
      if (currentMinutes >= startMin) return true;
    }
  }

  // Caso especial: VM ligada ontem à noite que deveria desligar hoje de madrugada
  // Se o primeiro evento do dia for um STOP e já estamos antes dele:
  const firstStop = stops[0];
  if (firstStop && (starts.length === 0 || (starts[0].hour * 60 + starts[0].minute) > (firstStop.hour * 60 + firstStop.minute))) {
    if (currentMinutes < (firstStop.hour * 60 + firstStop.minute)) return true;
  }

  return false;
}

/**
 * Verifica se o stop está cancelado para o dia específico.
 * Retorna true se NÃO deve executar (cancelado).
 */
export function isStopCanceledForDate(projectKey, serverId, dateStr) {
  const data = readJson(CANCELAMENTOS_FILE, {});
  const byProject = data[projectKey];
  if (!byProject) return false;
  const byServer = byProject[serverId];
  if (!byServer) return false;
  return byServer[dateStr] === 'stop' || byServer[dateStr] === 'both';
}

/**
 * Verifica se o start está cancelado para o dia específico.
 */
export function isStartCanceledForDate(projectKey, serverId, dateStr) {
  const data = readJson(CANCELAMENTOS_FILE, {});
  const byProject = data[projectKey];
  if (!byProject) return false;
  const byServer = byProject[serverId];
  if (!byServer) return false;
  return byServer[dateStr] === 'start' || byServer[dateStr] === 'both';
}

/**
 * Verifica se o restart está cancelado para o dia específico.
 */
export function isRestartCanceledForDate(projectKey, serverId, dateStr) {
  const data = readJson(CANCELAMENTOS_FILE, {});
  const byProject = data[projectKey];
  if (!byProject) return false;
  const byServer = byProject[serverId];
  if (!byServer) return false;
  return byServer[dateStr] === 'restart';
}

/**
 * Cancela o stop (ou start) para um dia específico.
 * No dia seguinte: segue a programação oficial.
 */
export function cancelForDate(projectKey, serverId, dateStr, action = 'stop') {
  const data = readJson(CANCELAMENTOS_FILE, {});
  if (!data[projectKey]) data[projectKey] = {};
  if (!data[projectKey][serverId]) data[projectKey][serverId] = {};
  const existing = data[projectKey][serverId][dateStr];
  if (existing === 'both') return;
  if (action === 'restart') {
    data[projectKey][serverId][dateStr] = 'restart';
  } else if (action === 'start') {
    data[projectKey][serverId][dateStr] = existing === 'stop' ? 'both' : 'start';
  } else {
    data[projectKey][serverId][dateStr] = existing === 'start' ? 'both' : 'stop';
  }
  writeJson(CANCELAMENTOS_FILE, data);
}

/** Remove o cancelamento para um dia específico. */
export function clearCancelForDate(projectKey, serverId, dateStr) {
  const data = readJson(CANCELAMENTOS_FILE, {});
  const byProject = data[projectKey];
  if (!byProject) return;
  const byServer = byProject[serverId];
  if (!byServer) return;
  delete byServer[dateStr];
  if (Object.keys(byServer).length === 0) delete byProject[serverId];
  if (Object.keys(byProject).length === 0) delete data[projectKey];
  writeJson(CANCELAMENTOS_FILE, data);
}

/** Lista cancelamentos por projeto (para exibição). */
export function getCancelationsForProject(projectKey) {
  const data = readJson(CANCELAMENTOS_FILE, {});
  return data[projectKey] || {};
}

/**
 * Retorna o agendamento de STOP para projectKey + serverId na data (YYYY-MM-DD).
 * Usado para saber a partir de qual horário contar extensão (cancel_stop).
 */
export function getStopScheduleForDate(projectKey, serverId, dateStr) {
  const list = listSchedules(projectKey);
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(y, (m || 1) - 1, d || 1).getDay();
  const stop = list.find(
    (s) =>
      s.serverId === serverId &&
      s.action === 'stop' &&
      s.enabled &&
      (s.days == null || s.days.length === 0 || s.days.includes(day))
  );
  return stop || null;
}
