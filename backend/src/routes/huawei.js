import { Router } from 'express';
import { listProjectsWithConfig, getDiscoveryAccounts, discoverProjectsForAccount } from '../services/huawei-iam.js';
import { getProfileCredentials } from '../config/configLoader.js';
import { listEcsForProject, startEcs, stopEcs, restartEcs } from '../services/huawei-ecs.js';
import { userStore } from '../data/store.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { getSchedule, setSchedule, getExtraHours, setExtraHoursForServer, addExtraHours, getAllSchedules, getAllSkipNextStop, setSkipNextStop, clearSkipNextStop, getSkipNextStop } from '../config/vmSchedule.js';
import {
  listSchedules,
  addSchedule,
  updateSchedule,
  removeSchedule,
  cancelForDate,
  clearCancelForDate,
  getCancelationsForProject,
  getStopScheduleForDate,
  shouldRunNow as scheduleShouldRunNow,
  getAgendamentosFilePath,
} from '../config/vmScheduleV2.js';
import { createCancelStop, createManualStart, closeOpenSession, getOpenSession, listSessions as listExtensionSessions, getTotalExtraHoursByProject } from '../data/extensionSessions.js';
import { logAction } from '../middleware/auditLog.js';

const router = Router();
router.use(authMiddleware);

function projectKey(projectId, perfil) {
  return perfil ? `${perfil}-${projectId}` : projectId;
}

/** Admin ou usuário que tem o projeto em visibleProjects pode acessar. */
function canAccessProject(req, projectId, perfil) {
  const u = userStore.getById(req.user.id);
  if (!u) return false;
  if (u.role === 'admin' && u.permissions?.includes('huawei:projects')) return true;
  const list = u.visibleProjects || [];
  return list.some((p) => p.id === projectId && (perfil == null || p.perfil === perfil));
}

/** Operador pode acessar agendamentos se tiver o projeto em visibleProjects. Retorna true se pode ver/cancelar. */
function canAccessSchedules(req) {
  if (req.user?.role === 'admin') return true;
  if (req.user?.permissions?.includes('huawei:projects')) return true;
  const u = userStore.getById(req.user?.id);
  return u && Array.isArray(u.visibleProjects) && u.visibleProjects.length > 0;
}

/** Verifica se o usuário tem acesso ao projeto do projectKey (para cancel-for-date). */
function canAccessProjectByKey(req, pk) {
  if (req.user?.role === 'admin' || req.user?.permissions?.includes('huawei:projects')) return true;
  const u = userStore.getById(req.user?.id);
  if (!u || !Array.isArray(u.visibleProjects)) return false;
  return u.visibleProjects.some((p) => projectKey(p.id, p.perfil) === pk);
}

/** Filtra servidores por termo "cliente" (metadata.cliente, metadata.client, centro_custo ou name). */
function filterEcsByCliente(servers, cliente) {
  if (!cliente || typeof cliente !== 'string' || !cliente.trim()) return servers;
  const q = cliente.trim().toLowerCase();
  return servers.filter((s) => {
    const meta = s.metadata || {};
    const metaCliente = (meta.centro_custo || meta.centrodecusto || meta.cost_center || meta.cliente || meta.client || '').toLowerCase();
    const name = (s.name || '').toLowerCase();
    return metaCliente.includes(q) || name.includes(q);
  });
}

/** Nome do cliente a partir dos metadados da ECS (centro de custo, cliente, etc.). */
function getClientNameFromMetadata(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const raw = meta.centro_custo || meta.centrodecusto || meta.cost_center || meta.cliente || meta.client || '';
  const t = String(raw).trim();
  if (!t) return null;
  return t.replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Prefixo comum dos nomes das ECS (ex.: ROLANDBI, ROLANDWEB → ROLAND). */
function commonPrefix(names) {
  if (!names.length) return '';
  let prefix = String(names[0] || '').trim();
  for (let i = 1; i < names.length && prefix; i++) {
    const n = String(names[i] || '').trim();
    let j = 0;
    while (j < prefix.length && j < n.length && prefix[j].toUpperCase() === n[j].toUpperCase()) j++;
    prefix = prefix.slice(0, j);
  }
  return prefix;
}

/** Deriva nome do cliente a partir da lista de ECS (metadados ou prefixo comum). Retorna ex.: "Roland". */
function getClientNameFromEcs(servers) {
  if (!servers?.length) return null;
  for (const s of servers) {
    const name = getClientNameFromMetadata(s.metadata);
    if (name) return name;
  }
  const names = servers.map((s) => s.name || s.id).filter(Boolean);
  const prefix = commonPrefix(names);
  if (prefix.length >= 2) return prefix.replace(/\b\w/g, (c) => c.toUpperCase());
  return null;
}

/**
 * Retorna visibleProjects do usuário enriquecidos com displayPerfil (ANANIM_ROLAND etc.)
 * para uso em Serviços/Backups quando o usuário tem ECS restritas por projeto.
 */
export async function getEnrichedVisibleProjects(user) {
  if (!user) return [];
  const visible = user.visibleProjects || [];
  if (user.role === 'admin') return visible;
  const allowedByProject = user.allowedHuaweiEcsIds || {};
  const enriched = await Promise.all(
    visible.map(async (p) => {
      const allowedIds = allowedByProject[projectKey(p.id, p.perfil)];
      const isAnanim = p.perfil && String(p.perfil).startsWith('ANANIMCLOUD_');
      const hasRestrictedEcs = Array.isArray(allowedIds) && allowedIds.length > 0;
      if (!isAnanim || !hasRestrictedEcs) return { ...p, enabled: p.enabled !== false, displayPerfil: p.displayPerfil || null };
      try {
        let servers = await listEcsForProject(p.id, p.region || undefined, p.perfil);
        const idSet = new Set(allowedIds);
        servers = servers.filter((s) => idSet.has(s.id));
        const clientName = getClientNameFromEcs(servers);
        if (clientName) return { ...p, enabled: p.enabled !== false, displayPerfil: `ANANIM_${clientName.toUpperCase().replace(/\s+/g, '_')}` };
      } catch (err) {
        console.warn('[getEnrichedVisibleProjects]', p.id, err.message);
      }
      return { ...p, enabled: p.enabled !== false, displayPerfil: p.displayPerfil || null };
    })
  );
  return enriched;
}

/**
 * GET /api/huawei/projects
 * Admin: lista projetos reais da Huawei (API).
 * Não-admin: retorna os projetos que o usuário tem permissão de ver (visibleProjects).
 * Query (só admin): scope=all|region, source=all_perfis|master.
 */
router.get('/projects', async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Usuário não autenticado' });
    const u = userStore.getById(req.user.id);
    if (!u) return res.status(401).json({ error: 'Usuário não encontrado' });

    if (u.role === 'admin') {
      if (!u.permissions?.includes('huawei:projects')) {
        return res.status(403).json({ error: 'Sem permissão para listar projetos Huawei' });
      }
      const scope = req.query.scope === 'all' ? 'all' : 'region';
      const source = req.query.source === 'all_perfis' ? 'all_perfis' : 'master';
      const apiProjects = await listProjectsWithConfig({ scope, source });
      const visible = u.visibleProjects || [];
      const pk = (p) => (p.perfil ? `${p.perfil}-${p.id}` : p.id);
      const keys = new Set(apiProjects.map(pk));
      for (const p of visible) {
        const key = pk(p);
        if (!keys.has(key)) {
          apiProjects.push(p);
          keys.add(key);
        }
      }
      const deduped = [];
      const seen = new Set();
      for (const p of apiProjects) {
        const key = pk(p);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(p);
      }
      return res.json(deduped);
    }

    // Operador: retorna visibleProjects enriquecidos com displayPerfil
    const enriched = await getEnrichedVisibleProjects(u);
    return res.json(enriched);
  } catch (e) {
    const status = e.message?.includes('Configure') ? 503 : 502;
    res.status(status).json({ error: e.message });
  }
});

/**
 * GET /api/huawei/projects/:projectId/ecs?region=sa-brazil-1&cliente=ACME
 * Lista ECS do projeto. Query cliente filtra por metadata.cliente, metadata.client ou nome (como CBR).
 * Não-admin com allowedHuaweiEcsIds[projectKey]: vê apenas esses ECS.
 */
router.get('/projects/:projectId/ecs', async (req, res) => {
  try {
    const { projectId } = req.params;
    const perfil = req.query.perfil || undefined;
    const cliente = req.query.cliente || undefined;
    if (!canAccessProject(req, projectId, perfil)) {
      return res.status(403).json({ error: 'Sem permissão para este projeto' });
    }
    const region = req.query.region || undefined;
    let servers = await listEcsForProject(projectId, region, perfil);
    servers = filterEcsByCliente(servers, cliente);

    const u = userStore.getById(req.user.id);
    const allowedByProject = u?.allowedHuaweiEcsIds || {};
    const key = projectKey(projectId, perfil);
    const allowedIds = allowedByProject[key];
    if (u?.role !== 'admin' && Array.isArray(allowedIds) && allowedIds.length > 0) {
      const idSet = new Set(allowedIds);
      servers = servers.filter((s) => idSet.has(s.id));
    }
    const pk = projectKey(projectId, perfil);
    const schedule = getSchedule(pk);
    const extraByServer = getExtraHours(pk);
    const extraBySession = getTotalExtraHoursByProject(pk);
    const enriched = servers.map((s) => {
      const fromSessions = typeof extraBySession[s.id] === 'number' ? extraBySession[s.id] : 0;
      const fromLegacy = typeof extraByServer[s.id] === 'number' ? extraByServer[s.id] : 0;
      const extraHours = Math.round((fromSessions + fromLegacy) * 100) / 100;
      return {
        ...s,
        schedule: schedule || undefined,
        extraHours: extraHours > 0 ? extraHours : 0,
      };
    });
    res.json(enriched);
  } catch (e) {
    const status = e.message.includes('Configure') || e.message.includes('Perfil') ? 400 : 502;
    res.status(status).json({ error: e.message });
  }
});

/**
 * POST /api/huawei/projects/:projectId/ecs/:serverId/action
 * Body: { action: 'start' | 'stop' | 'restart' }
 * Query: region, perfil
 */
router.post('/projects/:projectId/ecs/:serverId/action', async (req, res) => {
  try {
    const { projectId, serverId } = req.params;
    const { action, serverName: bodyServerName } = req.body || {};
    const perfil = req.query.perfil || req.body?.perfil || undefined;
    if (!canAccessProject(req, projectId, perfil)) {
      return res.status(403).json({ error: 'Sem permissão para este projeto' });
    }
    const u = userStore.getById(req.user.id);
    const allowedByProject = u?.allowedHuaweiEcsIds || {};
    const key = projectKey(projectId, perfil);
    const allowedIds = allowedByProject[key];
    if (u?.role !== 'admin' && Array.isArray(allowedIds) && allowedIds.length > 0) {
      if (!allowedIds.includes(serverId)) {
        return res.status(403).json({ error: 'Sem permissão para este ECS neste projeto' });
      }
    }
    const region = req.query.region || req.body?.region || undefined;

    if (!['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'action deve ser start, stop ou restart' });
    }
    // Operadores com ECS permitido (allowedHuaweiEcsIds) podem Ligar, Stop e Restart

    if (action === 'start') {
      await startEcs(projectId, region, serverId, perfil);
      if (!getOpenSession(key, serverId)) {
        const today = new Date();
        const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        const stopSchedule = getStopScheduleForDate(key, serverId, dateStr);
        if (stopSchedule) {
          const stopAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), stopSchedule.hour || 18, stopSchedule.minute || 0, 0).getTime();
          if (today.getTime() > stopAt) {
            createManualStart(key, serverId, stopSchedule.serverName || null, u?.id, u?.name, u?.email);
          }
        }
      }
    } else if (action === 'stop') {
      await stopEcs(projectId, region, serverId, perfil);
      closeOpenSession(key, serverId);
    } else {
      await restartEcs(projectId, region, serverId, perfil);
    }

    const serverName = typeof bodyServerName === 'string' ? bodyServerName.trim() || serverId : serverId;
    logAction(req, action === 'start' ? 'ecs_start' : action === 'stop' ? 'ecs_stop' : 'ecs_restart', {
      projectId,
      projectKey: key,
      serverId,
      serverName,
      region: region || null,
      perfil: perfil || null,
    });

    res.json({ ok: true, message: `Comando ${action} enviado para o ECS`, serverId });
  } catch (e) {
    const status = e.message.includes('Configure') || e.message.includes('Perfil') ? 400 : 502;
    res.status(status).json({ error: e.message });
  }
});

/**
 * GET /api/huawei/projects/:projectId/schedule?perfil=...
 * Retorna a programação (horário em que as VMs ficam ligadas) do projeto/cliente.
 */
router.get('/projects/:projectId/schedule', async (req, res) => {
  try {
    const { projectId } = req.params;
    const perfil = req.query.perfil || undefined;
    if (!canAccessProject(req, projectId, perfil)) {
      return res.status(403).json({ error: 'Sem permissão para este projeto' });
    }
    const pk = projectKey(projectId, perfil);
    const schedule = getSchedule(pk);
    const skipNextStop = getSkipNextStop(pk);
    res.json({ projectKey: pk, schedule, skipNextStop: !!skipNextStop });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PATCH /api/huawei/projects/:projectId/schedule
 * Body: { perfil?, start: "08:00", end: "18:00" }. Define horário em que as VMs ficam ligadas.
 * Apenas admin.
 */
router.patch('/projects/:projectId/schedule', requirePermission('huawei:projects'), (req, res) => {
  try {
    const { projectId } = req.params;
    const { perfil, start, end } = req.body || {};
    const pk = projectKey(projectId, perfil);
    setSchedule(pk, { start: start || null, end: end || null });
    logAction(req, 'schedule_update', { projectKey: pk, projectId, perfil: perfil || null, start: start || null, end: end || null });
    res.json({ projectKey: pk, schedule: getSchedule(pk) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/huawei/programacao
 * Admin: retorna programações (antiga por projeto + nova por VM) e cancelamentos.
 */
router.get('/programacao', requirePermission('huawei:projects'), (req, res) => {
  try {
    const schedules = getAllSchedules();
    const skipNextStop = getAllSkipNextStop();
    const schedulesVm = listSchedules();
    res.json({ schedules, skipNextStop, schedulesVm });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/huawei/projects/:projectId/cancel-stop
 * Body: { perfil? }. Cancela o próximo stop programado (extensão de horário).
 * Apenas admin.
 */
router.post('/projects/:projectId/cancel-stop', requirePermission('huawei:projects'), (req, res) => {
  try {
    const { projectId } = req.params;
    const perfil = req.query.perfil || req.body?.perfil;
    const pk = projectKey(projectId, perfil);
    setSkipNextStop(pk, { at: new Date().toISOString(), by: req.user?.email || null });
    logAction(req, 'cancel_stop_requested', { projectKey: pk, projectId, perfil: perfil || null });
    res.json({ ok: true, projectKey: pk, message: 'Stop cancelado. O próximo desligamento programado será ignorado.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/huawei/projects/:projectId/cancel-stop
 * Remove o cancelamento de stop (volta a executar o stop no horário).
 */
router.delete('/projects/:projectId/cancel-stop', requirePermission('huawei:projects'), (req, res) => {
  try {
    const { projectId } = req.params;
    const perfil = req.query.perfil || req.body?.perfil;
    const pk = projectKey(projectId, perfil);
    clearSkipNextStop(pk);
    logAction(req, 'cancel_stop_cleared', { projectKey: pk, projectId, perfil: perfil || null });
    res.json({ ok: true, projectKey: pk });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ——— Agendamentos por VM (modelo ANANIMCLOUD) ———

/**
 * GET /api/huawei/schedules/diagnostic — diagnóstico de programações (só admin).
 * Retorna hora do servidor, total de agendamentos e quais estão "devidos" agora (para validar por que não executam).
 */
router.get('/schedules/diagnostic', requirePermission('huawei:projects'), (req, res) => {
  try {
    const list = listSchedules();
    const now = new Date();
    const due = list.filter((s) => scheduleShouldRunNow(s, now));
    const invalidForCron = list.filter((s) => !s.projectId || !s.serverId);
    res.json({
      serverTime: now.toISOString(),
      serverTimeLocal: now.toLocaleString('pt-BR'),
      serverHour: now.getHours(),
      serverMinute: now.getMinutes(),
      serverDayOfWeek: now.getDay(),
      agendamentosFilePath: getAgendamentosFilePath(),
      totalSchedules: list.length,
      enabledCount: list.filter((s) => s.enabled).length,
      invalidForCronCount: invalidForCron.length,
      dueNowCount: due.length,
      dueNow: due.map((s) => ({ id: s.id, serverName: s.serverName, action: s.action, hour: s.hour, minute: s.minute, perfil: s.perfil })),
      schedules: list.map((s) => ({
        id: s.id,
        serverName: s.serverName,
        action: s.action,
        hour: s.hour,
        minute: s.minute,
        days: s.days,
        enabled: s.enabled,
        perfil: s.perfil,
        wouldRunNow: scheduleShouldRunNow(s, now),
        invalidForCron: !s.projectId || !s.serverId,
      })),
      hint: invalidForCron.length > 0
        ? `${invalidForCron.length} agendamento(s) sem projectId ou serverId não executam. Edite e salve o projeto/região.`
        : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/huawei/schedules?projectKey=...
 * Lista agendamentos (por projeto ou todos). Admin/huawei:projects vê tudo; operador só vê dos projetos em visibleProjects.
 */
router.get('/schedules', (req, res, next) => {
  if (!canAccessSchedules(req)) return res.status(403).json({ error: 'Sem permissão para esta ação' });
  next();
}, (req, res) => {
  try {
    const pk = req.query.projectKey || null;
    let list = listSchedules(pk);
    if (req.user?.role !== 'admin' && !req.user?.permissions?.includes('huawei:projects')) {
      list = list.filter((s) => canAccessProject(req, s.projectId, s.perfil));
    }
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/huawei/schedules
 * Body: { projectKey, projectId, region?, perfil?, serverId, serverName?, action: 'start'|'stop', hour, minute, days?, createdBy? }
 */
router.post('/schedules', requirePermission('huawei:projects'), (req, res) => {
  try {
    const body = req.body || {};
    const pk = body.projectKey || projectKey(body.projectId, body.perfil);
    if (!pk || !body.serverId || !body.action) {
      return res.status(400).json({ error: 'projectKey (ou projectId+perfil), serverId e action são obrigatórios' });
    }
    const schedule = addSchedule({
      ...body,
      projectKey: pk,
      createdBy: req.user?.email || body.createdBy,
    });
    logAction(req, 'schedule_add', { scheduleId: schedule.id, serverName: schedule.serverName, action: schedule.action });
    res.status(201).json(schedule);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PATCH /api/huawei/schedules/:id
 */
router.patch('/schedules/:id', requirePermission('huawei:projects'), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const updated = updateSchedule(id, {
      ...req.body,
      modifiedBy: req.user?.email,
    });
    if (!updated) return res.status(404).json({ error: 'Agendamento não encontrado' });
    logAction(req, 'schedule_update', { scheduleId: id });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/huawei/schedules/:id
 */
router.delete('/schedules/:id', requirePermission('huawei:projects'), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const removed = removeSchedule(id);
    if (!removed) return res.status(404).json({ error: 'Agendamento não encontrado' });
    logAction(req, 'schedule_delete', { scheduleId: id, serverName: removed.serverName });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/huawei/schedules/cancel-for-date
 * Body: { projectKey, serverId, date: "YYYY-MM-DD", action: 'stop'|'start' }
 * Admin/huawei:projects ou operador com o projeto em visibleProjects pode cancelar.
 */
router.post('/schedules/cancel-for-date', (req, res, next) => {
  const { projectKey } = req.body || {};
  if (!canAccessProjectByKey(req, projectKey)) return res.status(403).json({ error: 'Sem permissão para esta ação' });
  next();
}, (req, res) => {
  try {
    const { projectKey, serverId, date, action } = req.body || {};
    if (!projectKey || !serverId || !date) {
      return res.status(400).json({ error: 'projectKey, serverId e date (YYYY-MM-DD) são obrigatórios' });
    }
    cancelForDate(projectKey, serverId, date, action || 'stop');
    const u = userStore.getById(req.user?.id);
    if (action !== 'start') {
      const stopSchedule = getStopScheduleForDate(projectKey, serverId, date);
      if (stopSchedule) {
        const [y, m, d] = date.split('-').map(Number);
        const scheduledStopAt = new Date(y, (m || 1) - 1, d || 1, stopSchedule.hour || 18, stopSchedule.minute || 0, 0).toISOString();
        createCancelStop(projectKey, serverId, stopSchedule.serverName || null, scheduledStopAt, u?.id, u?.name, u?.email);
      }
    }
    logAction(req, 'schedule_cancel_for_date', { projectKey, serverId, date, action: action || 'stop' });
    res.json({ ok: true, message: `Cancelamento para ${date} registrado. No dia seguinte a programação oficial será seguida.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE /api/huawei/schedules/cancel-for-date
 * Body: { projectKey, serverId, date }
 * Remove o cancelamento para o dia.
 */
router.delete('/schedules/cancel-for-date', requirePermission('huawei:projects'), (req, res) => {
  try {
    const { projectKey, serverId, date } = req.body || req.query || {};
    if (!projectKey || !serverId || !date) {
      return res.status(400).json({ error: 'projectKey, serverId e date são obrigatórios' });
    }
    clearCancelForDate(projectKey, serverId, date);
    logAction(req, 'schedule_clear_cancel_for_date', { projectKey, serverId, date });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/huawei/extension-sessions
 * Lista sessões de extensão de horário (cancelou programação ou ligou VM após horário).
 * Query: from (ISO date), to (ISO date), projectKey, serverId, userId, type (cancel_stop|manual_start).
 */
router.get('/extension-sessions', requirePermission('huawei:projects'), async (req, res) => {
  try {
    const u = userStore.getById(req.user?.id);
    let projectKeys = null;
    if (u?.role !== 'admin') {
      const visible = u?.visibleProjects || [];
      projectKeys = visible.map((p) => projectKey(p.id, p.perfil)).filter(Boolean);
      if (projectKeys.length === 0) return res.json([]);
    }
    const filters = {};
    if (req.query.projectKey) filters.projectKey = req.query.projectKey;
    if (req.query.serverId) filters.serverId = req.query.serverId;
    if (req.query.userId) filters.userId = req.query.userId;
    if (req.query.type) filters.type = req.query.type;
    if (req.query.from) filters.from = req.query.from;
    if (req.query.to) filters.to = req.query.to;
    const list = listExtensionSessions(projectKeys, filters);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/huawei/projects/:projectId/cancelations?perfil=...
 * Lista cancelamentos por dia do projeto (para exibição).
 */
router.get('/projects/:projectId/cancelations', requirePermission('huawei:projects'), (req, res) => {
  try {
    const { projectId } = req.params;
    const perfil = req.query.perfil;
    const pk = projectKey(projectId, perfil);
    const data = getCancelationsForProject(pk);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PATCH /api/huawei/projects/:projectId/ecs/:serverId/extra-hours
 * Body: { hours: number } ou { add: number }. Define ou soma horas a mais (marcador).
 * Apenas admin (ou integração/job que atualize após desligamento programado).
 */
router.patch('/projects/:projectId/ecs/:serverId/extra-hours', requirePermission('huawei:projects'), (req, res) => {
  try {
    const { projectId, serverId } = req.params;
    const perfil = req.query.perfil || req.body?.perfil;
    const pk = projectKey(projectId, perfil);
    const { hours, add } = req.body || {};
    let value;
    if (typeof add === 'number') {
      value = addExtraHours(pk, serverId, add);
    } else {
      const num = Number(hours);
      value = setExtraHoursForServer(pk, serverId, Number.isFinite(num) ? num : 0);
    }
    res.json({ projectKey: pk, serverId, extraHours: value });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/huawei/discovery-accounts
 * Lista contas para "Descobrir Projetos" (fluxo CBR/tags): RAMO_SISTEMAS, MOOVE, RSDONE, ANANIMCLOUD.
 */
router.get('/discovery-accounts', requirePermission('huawei:projects'), (req, res) => {
  try {
    const accounts = getDiscoveryAccounts();
    const list = accounts.map((a) => {
      try {
        const creds = getProfileCredentials(a.profile);
        return {
          id: a.id,
          label: a.label,
          profile: a.profile,
          region: a.region,
          projectId: creds?.project_id || null,
          available: !!(creds?.ak && creds?.sk && creds?.project_id),
        };
      } catch (_) {
        return { ...a, projectId: null, available: false };
      }
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/huawei/discover-projects
 * Body: { account: 'ANANIMCLOUD' }. Lista todos os projetos da conta com status novo/ja_existe.
 */
router.post('/discover-projects', requirePermission('huawei:projects'), async (req, res) => {
  try {
    const accountId = req.body?.account;
    if (!accountId) return res.status(400).json({ error: 'Informe account (ex.: ANANIMCLOUD)' });
    const u = userStore.getById(req.user?.id);
    const visibleIds = new Set((u?.visibleProjects || []).map((p) => p.id));
    const projects = await discoverProjectsForAccount(accountId, visibleIds);
    res.json({ account: accountId, projects });
  } catch (e) {
    const status = e.message?.includes('não encontrada') || e.message?.includes('não configurado') ? 400 : 502;
    res.status(status).json({ error: e.message });
  }
});

/**
 * POST /api/huawei/apply-visible-projects
 * Body: { projects: [{ id, name, region, perfil }] }. Adiciona os projetos à lista fixa visível do usuário (visibleProjects).
 */
router.post('/apply-visible-projects', async (req, res) => {
  try {
    const list = req.body?.projects;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({ error: 'Informe projects (array de { id, name, region, perfil })' });
    }
    const u = userStore.getById(req.user?.id);
    if (!u) return res.status(401).json({ error: 'Usuário não encontrado' });
    const existing = u.visibleProjects || [];
    const byId = new Map(existing.map((p) => [p.id, p]));
    for (const p of list) {
      if (p.id && p.name) byId.set(p.id, { id: p.id, name: p.name, region: p.region || null, perfil: p.perfil || null });
    }
    const merged = Array.from(byId.values());
    userStore.update(u.id, { visibleProjects: merged });
    logAction(req, 'apply-visible-projects', { count: merged.length });
    res.json({ ok: true, visibleProjects: merged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/huawei/clear-visible-projects
 * Limpa a lista fixa visível do usuário (visibleProjects) para buscar novamente com a nova implementação.
 */
router.post('/clear-visible-projects', async (req, res) => {
  try {
    const u = userStore.getById(req.user?.id);
    if (!u) return res.status(401).json({ error: 'Usuário não encontrado' });
    userStore.update(u.id, { visibleProjects: [] });
    logAction(req, 'clear-visible-projects', {});
    res.json({ ok: true, visibleProjects: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
