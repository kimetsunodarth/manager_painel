import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import {
  createScheduledTask,
  updateScheduledTask,
  listScheduledTasks,
  enableScheduledTask,
  disableScheduledTask,
  deleteScheduledTask,
  invalidateCoverageCache,
  BUILTIN_JOBS,
} from '../services/cocService.js';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/coc/jobs
 * Nomes dos runbooks COMMUNAL pré-definidos (Start_ECS/Stop_ECS/Restart_ECS) para montar o formulário.
 */
router.get('/jobs', requirePermission('huawei:projects'), (req, res) => {
  res.json({ jobs: BUILTIN_JOBS });
});

/**
 * GET /api/coc/schedules?perfil=...
 * Lista as tarefas de Scheduled O&M já cadastradas no Huawei COC para a conta.
 */
router.get('/schedules', requirePermission('huawei:projects'), async (req, res) => {
  const perfil = (req.query.perfil || '').trim();
  if (!perfil) {
    return res.status(400).json({ error: 'perfil é obrigatório' });
  }
  try {
    const tasks = await listScheduledTasks(perfil);
    res.json({ tasks });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

/**
 * POST /api/coc/schedules
 * Cria uma tarefa de Scheduled O&M no Huawei COC. Ela nasce ATIVADA na Huawei — este endpoint já
 * a desativa antes de responder (mesmo comportamento do processo validado em produção); chame
 * POST /:taskId/enable quando quiser realmente ligar o agendamento.
 * Body: { perfil, taskName, jobName, triggerTime, targetServers, riskLevel? }
 */
router.post('/schedules', requirePermission('huawei:projects'), async (req, res) => {
  const body = req.body || {};
  const perfil = String(body.perfil || '').trim();
  const taskName = String(body.taskName || '').trim();

  if (!perfil || !taskName || !body.triggerTime || !Array.isArray(body.targetServers) || !body.targetServers.length || !body.jobName) {
    return res.status(400).json({ error: 'perfil, taskName, triggerTime, targetServers (array não vazio) e jobName são obrigatórios' });
  }
  if (taskName.length > 128) {
    return res.status(400).json({ error: 'taskName deve ter no máximo 128 caracteres' });
  }

  try {
    const data = await createScheduledTask(perfil, {
      taskName,
      triggerTime: body.triggerTime,
      targetServers: body.targetServers,
      jobName: body.jobName,
      riskLevel: body.riskLevel,
    });
    logAction(req, 'coc_schedule_create', { perfil, taskName, jobName: body.jobName, success: true, taskId: data.taskId });
    res.status(201).json({ ok: true, data });
  } catch (e) {
    logAction(req, 'coc_schedule_create', { perfil, taskName, success: false, error: e.message || String(e) });
    res.status(502).json({ error: e.message || String(e) });
  }
});

/**
 * PUT /api/coc/schedules/:taskId?perfil=...
 * Altera uma tarefa existente — a Huawei exige o payload COMPLETO (mesmo formato do create), não
 * um PATCH parcial (confirmado: a API não tem verbo PATCH nesse endpoint).
 * Body: igual ao POST /schedules (taskName, jobName, triggerTime, targetServers, riskLevel?)
 */
router.put('/schedules/:taskId', requirePermission('huawei:projects'), async (req, res) => {
  const body = req.body || {};
  const perfil = String(body.perfil || '').trim();
  const { taskId } = req.params;
  const taskName = String(body.taskName || '').trim();

  if (!perfil || !taskName || !body.triggerTime || !Array.isArray(body.targetServers) || !body.targetServers.length || !body.jobName) {
    return res.status(400).json({ error: 'perfil, taskName, triggerTime, targetServers (array não vazio) e jobName são obrigatórios' });
  }

  try {
    const data = await updateScheduledTask(perfil, taskId, {
      taskName,
      triggerTime: body.triggerTime,
      targetServers: body.targetServers,
      jobName: body.jobName,
      riskLevel: body.riskLevel,
    });
    logAction(req, 'coc_schedule_update', { perfil, taskId, taskName, success: true });
    res.json({ ok: true, data });
  } catch (e) {
    logAction(req, 'coc_schedule_update', { perfil, taskId, success: false, error: e.message || String(e) });
    res.status(502).json({ error: e.message || String(e) });
  }
});

/**
 * POST /api/coc/schedules/:taskId/enable?perfil=...
 * Permissão granular própria (`coc:schedule:toggle`), independente de `huawei:projects` — nenhum
 * frontend chamava essa rota antes de existir a tela `/automacoes` com botões de ação, então não
 * há usuário legado que dependa de `huawei:projects` sozinho pra isso. Admin sempre passa.
 */
router.post('/schedules/:taskId/enable', requirePermission('coc:schedule:toggle'), async (req, res) => {
  const perfil = (req.query.perfil || '').trim();
  const { taskId } = req.params;
  if (!perfil) return res.status(400).json({ error: 'perfil é obrigatório' });
  try {
    const data = await enableScheduledTask(perfil, taskId);
    invalidateCoverageCache(perfil);
    logAction(req, 'coc_schedule_enable', { perfil, taskId, success: true });
    res.json({ ok: true, data });
  } catch (e) {
    logAction(req, 'coc_schedule_enable', { perfil, taskId, success: false, error: e.message || String(e) });
    res.status(502).json({ error: e.message || String(e) });
  }
});

/**
 * POST /api/coc/schedules/:taskId/disable?perfil=...
 * Permissão granular própria (`coc:schedule:toggle`) — ver comentário do /enable acima.
 */
router.post('/schedules/:taskId/disable', requirePermission('coc:schedule:toggle'), async (req, res) => {
  const perfil = (req.query.perfil || '').trim();
  const { taskId } = req.params;
  if (!perfil) return res.status(400).json({ error: 'perfil é obrigatório' });
  try {
    const data = await disableScheduledTask(perfil, taskId);
    invalidateCoverageCache(perfil);
    logAction(req, 'coc_schedule_disable', { perfil, taskId, success: true });
    res.json({ ok: true, data });
  } catch (e) {
    logAction(req, 'coc_schedule_disable', { perfil, taskId, success: false, error: e.message || String(e) });
    res.status(502).json({ error: e.message || String(e) });
  }
});

/**
 * DELETE /api/coc/schedules/:taskId?perfil=...
 * A Huawei só permite deletar tarefas já desativadas (chamar disable antes, se necessário).
 * Permissão granular própria (`coc:schedule:delete`), independente de `huawei:projects`.
 */
router.delete('/schedules/:taskId', requirePermission('coc:schedule:delete'), async (req, res) => {
  const perfil = (req.query.perfil || '').trim();
  const { taskId } = req.params;
  if (!perfil) return res.status(400).json({ error: 'perfil é obrigatório' });
  try {
    const data = await deleteScheduledTask(perfil, taskId);
    invalidateCoverageCache(perfil);
    logAction(req, 'coc_schedule_delete', { perfil, taskId, success: true });
    res.json({ ok: true, data });
  } catch (e) {
    logAction(req, 'coc_schedule_delete', { perfil, taskId, success: false, error: e.message || String(e) });
    res.status(502).json({ error: e.message || String(e) });
  }
});

export default router;
