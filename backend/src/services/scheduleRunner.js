/**
 * Executor de agendamentos VM (cron a cada minuto).
 * Usa vmScheduleV2 e huawei-ecs para Start/Stop.
 */

import { listSchedules, shouldRunNow, isStopCanceledForDate, isStartCanceledForDate, isRestartCanceledForDate } from '../config/vmScheduleV2.js';
import { startEcs, stopEcs, restartEcs } from './huawei-ecs.js';
import { appendLog } from '../data/auditLog.js';
import { closeOpenSession } from '../data/extensionSessions.js';

function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function runOne(schedule) {
  if (!schedule.projectId || !schedule.serverId) {
    console.warn('[Schedule] Agendamento ignorado (falta projectId ou serverId):', schedule.id);
    return { ok: false, error: 'projectId ou serverId ausente' };
  }
  const now = new Date();
  const today = dateStr(now);

  // Cancelamento é somente para a data específica (today). Amanhã "today" será outra data e a programação volta ao normal.
  if (schedule.action === 'stop') {
    if (isStopCanceledForDate(schedule.projectKey, schedule.serverId, today)) {
      console.log('[Schedule] Stop cancelado para hoje:', schedule.serverName, schedule.serverId);
      return { ok: true, skipped: true, reason: 'cancelado_para_dia' };
    }
  } else if (schedule.action === 'restart') {
    if (isRestartCanceledForDate(schedule.projectKey, schedule.serverId, today)) {
      console.log('[Schedule] Restart cancelado para hoje:', schedule.serverName, schedule.serverId);
      return { ok: true, skipped: true, reason: 'cancelado_para_dia' };
    }
  } else {
    if (isStartCanceledForDate(schedule.projectKey, schedule.serverId, today)) {
      console.log('[Schedule] Start cancelado para hoje:', schedule.serverName, schedule.serverId);
      return { ok: true, skipped: true, reason: 'cancelado_para_dia' };
    }
  }

  try {
    if (schedule.action === 'stop') {
      await stopEcs(schedule.projectId, schedule.region, schedule.serverId, schedule.perfil);
      closeOpenSession(schedule.projectKey, schedule.serverId);
      console.log('[Schedule] STOP OK:', schedule.serverName, schedule.serverId);
    } else if (schedule.action === 'restart') {
      await restartEcs(schedule.projectId, schedule.region, schedule.serverId, schedule.perfil);
      console.log('[Schedule] RESTART OK:', schedule.serverName, schedule.serverId);
    } else {
      await startEcs(schedule.projectId, schedule.region, schedule.serverId, schedule.perfil);
      console.log('[Schedule] START OK:', schedule.serverName, schedule.serverId);
    }
    const actionKey = schedule.action === 'stop' ? 'schedule_stop' : schedule.action === 'restart' ? 'schedule_restart' : 'schedule_start';
    appendLog({
      userId: null,
      userName: 'Sistema',
      userEmail: '',
      action: actionKey,
      details: {
        scheduleId: schedule.id,
        serverId: schedule.serverId,
        serverName: schedule.serverName,
        projectKey: schedule.projectKey,
        projectId: schedule.projectId,
        hour: schedule.hour,
        minute: schedule.minute,
        scheduleCreatedBy: schedule.createdBy || null,
      },
      createdAt: now.toISOString(),
    });
    return { ok: true };
  } catch (e) {
    console.error('[Schedule] Erro scheduleId=' + schedule.id + ':', e.message);
    appendLog({
      userId: null,
      userName: 'sistema',
      userEmail: '',
      action: 'schedule_error',
      details: {
        scheduleId: schedule.id,
        serverId: schedule.serverId,
        serverName: schedule.serverName,
        projectKey: schedule.projectKey,
        projectId: schedule.projectId,
        region: schedule.region,
        action: schedule.action,
        error: e.message,
      },
      createdAt: new Date().toISOString(),
    });
    return { ok: false, error: e.message };
  }
}

export async function runDue() {
  const list = listSchedules();
  const now = new Date();
  const due = list.filter((s) => shouldRunNow(s, now));

  if (list.length === 0) {
    console.log('[Schedule] Nenhum agendamento cadastrado (arquivo agendamentos-vm.json vazio ou inexistente). Adicione em Programação.');
    return;
  }

  if (due.length === 0) return;

  console.log('[Schedule] Executando', due.length, 'agendamento(s) devido(s) às', now.toLocaleTimeString('pt-BR'));
  for (const s of due) {
    await runOne(s);
  }
}
