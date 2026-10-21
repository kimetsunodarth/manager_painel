/**
 * Serviços dos agentes para quem usa o painel: lista o que o usuário pode operar e enfileira
 * iniciar/parar/reiniciar. O agente executa em até 30 s e devolve o resultado.
 */
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { userStore } from '../data/store.js';
import { getAgentStore } from '../agent/index.js';
import { canUserAct, listForUser, userCanSeeProject } from '../agent/agentAccess.js';

const router = Router();
router.use(authMiddleware);

const currentUser = (req) => userStore.getById(req.user?.id);

router.get('/', (req, res) => {
  res.json({ servers: listForUser(currentUser(req), getAgentStore()) });
});

router.post('/jobs', (req, res) => {
  const store = getAgentStore();
  const user = currentUser(req);
  const { agentId, serviceName, action } = req.body || {};
  const agent = typeof agentId === 'string' ? store.getAgent(agentId) : null;
  if (!agent) return res.status(404).json({ error: 'not_found' });
  const grants = user?.role === 'admin' ? [] : store.getGrants(user?.id);
  if (!canUserAct(user, agent, store.getReleases(agent.id), grants, serviceName, action)) {
    return res.status(403).json({ error: 'Sem permissão para esta ação neste serviço' });
  }
  if (user.role === 'admin' && !store.listServices(agent.id).some((s) => s.name === serviceName)) return res.status(404).json({ error: 'not_found' });
  const job = store.enqueue({ agentId: agent.id, serviceName, action, requestedBy: user.email || user.id });
  logAction(req, 'agent_service_job', { agentId: agent.id, ecsName: agent.ecsName, serviceName, action });
  res.status(201).json({ job });
});

router.get('/jobs', (req, res) => {
  const store = getAgentStore();
  const user = currentUser(req);
  const agent = typeof req.query.agentId === 'string' ? store.getAgent(req.query.agentId) : null;
  if (!agent || !userCanSeeProject(user, agent.projectKey)) return res.status(404).json({ error: 'not_found' });
  const allowed = user.role === 'admin' ? null : new Set(store.getGrants(user.id).filter((g) => g.agentId === agent.id).map((g) => g.serviceName));
  res.json({ jobs: store.listJobs({ agentId: agent.id, limit: 50 }).filter((j) => !allowed || allowed.has(j.serviceName)) });
});

export default router;
