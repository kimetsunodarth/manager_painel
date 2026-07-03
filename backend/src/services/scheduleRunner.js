/**
 * Executor de agendamentos VM (cron a cada minuto).
 * Usa vmScheduleV2 e huawei-ecs para Start/Stop.
 */

import { listSchedules, shouldRunNow, isStopCanceledForDate, isStartCanceledForDate, isRestartCanceledForDate, isInsideScheduleWindow } from '../config/vmScheduleV2.js';
import { startEcs, stopEcs, restartEcs, listEcsForProject } from './huawei-ecs.js';
import { appendLog } from '../data/auditLog.js';
import { closeOpenSession, getOpenSession, createManualStart } from '../data/extensionSessions.js';
import { computeSessionBilling } from '../config/extensionBilling.js';
import { notifyOvertimeStart, notifyOvertimeClose } from './emailNotifier.js';

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
      const closedSession = closeOpenSession(schedule.projectKey, schedule.serverId, {
        userId: null,
        userName: 'Sistema (Cron)',
        userEmail: 'auto-schedule@ananim.com.br',
      }, {
        ip: '127.0.0.1',
        geo: {
          countryCode: null,
          countryName: 'Rede interna',
          regionName: null,
          cityName: null,
        },
      });
      if (closedSession) notifyOvertimeClose(computeSessionBilling(closedSession));
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
      ipAddress: '127.0.0.1',
      userAgent: 'Cron/Automated Schedule',
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
      ipAddress: '127.0.0.1',
      userAgent: 'Cron/Automated Schedule',
      createdAt: new Date().toISOString(),
    });
    return { ok: false, error: e.message };
  }
}

/**
 * Monitoramento automático de status (v1.2.14).
 * Percorre as VMs agendadas, verifica se estão ligadas fora do horário e gerencia sessões de extra hours.
 */
export async function monitorStatus() {
  const list = listSchedules().filter((s) => s.enabled);
  if (list.length === 0) return;

  const now = new Date();
  
  // Agrupar por projeto para otimizar chamadas de listagem
  const byProject = new Map();
  for (const s of list) {
    const key = `${s.projectId}|${s.region}|${s.perfil}`;
    if (!byProject.has(key)) byProject.set(key, { projectId: s.projectId, region: s.region, perfil: s.perfil, schedules: [] });
    byProject.get(key).schedules.push(s);
  }

  for (const [key, info] of byProject.entries()) {
    try {
      // Listar status reais das VMs no projeto
      // Para monitorar agendamentos precisamos enxergar todas as VMs do projeto (pode ser grande).
      // Desliga cálculo de discos para evitar overhead.
      const servers = await listEcsForProject(info.projectId, info.region || undefined, info.perfil, {
        maxServers: 20000,
        includeDisks: false,
      });
      const serverStatusMap = new Map(servers.map((s) => [s.id, s.status]));

      // Analisar cada agendamento
      for (const s of info.schedules) {
        const currentStatus = serverStatusMap.get(s.serverId);
        if (!currentStatus) continue;

        const isRunning = currentStatus.toUpperCase() === 'ACTIVE' || currentStatus.toUpperCase() === 'RUNNING';
        const shouldBeRunning = isInsideScheduleWindow(s.projectKey, s.serverId, now);
        const openSession = getOpenSession(s.projectKey, s.serverId);

        if (isRunning && !shouldBeRunning) {
          // VM ligada fora do horário -> Abre sessão se não houver
          if (!openSession) {
            console.log(`[Monitor] VM ${s.serverName} ativa fora do horário. Abrindo sessão de extra hours.`);
            const newSession = createManualStart(s.projectKey, s.serverId, s.serverName, null, 'Sistema (Monitor)', 'auto-monitor@ananim.com.br');
            notifyOvertimeStart(newSession);
          }
        } else if (isRunning && shouldBeRunning && openSession) {
          // VM ligada e dentro do horário -> Fecha sessão se houver uma aberta de antes (madrugada/extensão)
          console.log(`[Monitor] VM ${s.serverName} dentro do horário programado. Encerrando sessão de extra hours.`);
          const closedSession = closeOpenSession(s.projectKey, s.serverId, {
            userId: null,
            userName: 'Sistema (Monitor)',
            userEmail: 'auto-monitor@ananim.com.br',
          }, {
            ip: '127.0.0.1',
            geo: {
              countryCode: null,
              countryName: 'Rede interna',
              regionName: null,
              cityName: null,
            },
          });
          if (closedSession) notifyOvertimeClose(computeSessionBilling(closedSession));
        } else if (!isRunning && openSession) {
          // VM desligada mas com sessão aberta -> Fecha sessão
          console.log(`[Monitor] VM ${s.serverName} desligada. Fechando sessão de extra hours.`);
          const closedSession = closeOpenSession(s.projectKey, s.serverId, {
            userId: null,
            userName: 'Sistema (Monitor)',
            userEmail: 'auto-monitor@ananim.com.br',
          }, {
            ip: '127.0.0.1',
            geo: {
              countryCode: null,
              countryName: 'Rede interna',
              regionName: null,
              cityName: null,
            },
          });
          if (closedSession) notifyOvertimeClose(computeSessionBilling(closedSession));
        }
      }
    } catch (err) {
      console.warn(`[Monitor] Erro ao processar projeto ${info.projectId}:`, err.message);
    }
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
