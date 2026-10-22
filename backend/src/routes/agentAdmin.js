/**
 * Administração dos agentes (só admin): gerar código de ativação para uma ECS, ver serviços descobertos,
 * liberar serviços/ações e dar acesso aos usuários do projeto.
 */
import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { userStore } from '../data/store.js';
import { getAgentStore, getManualProjects } from '../agent/index.js';
import { ONLINE_MS, userCanSeeProject } from '../agent/agentAccess.js';
import { clientsOverview } from '../agent/clientsOverview.js';

const router = Router();
router.use(authMiddleware, requireAdmin);

const publicAgent = (a) => a && ({ id: a.id, projectKey: a.projectKey, projectName: a.projectName, ecsId: a.ecsId, ecsName: a.ecsName, os: a.os,
  hostname: a.hostname, agentVersion: a.agentVersion, created: a.created, lastSeen: a.lastSeen, revoked: a.revoked,
  online: !!a.lastSeen && Date.now() - a.lastSeen < ONLINE_MS });
const fail = (res, e) => res.status(400).json({ error: e?.message || 'invalid_request' });

router.post('/activations', (req, res) => {
  const { projectKey, projectName, ecsId, ecsName } = req.body || {};
  if (![projectKey, projectName, ecsId, ecsName].every((v) => typeof v === 'string' && v.trim())) return res.status(400).json({ error: 'invalid_request' });
  const result = getAgentStore().issueCode({ projectKey, projectName, ecsId, ecsName, createdBy: req.user.email || req.user.id });
  logAction(req, 'agent_activation_code', { projectKey, ecsName });
  res.status(201).json(result);
});

router.get('/agents', (req, res) => {
  const store = getAgentStore();
  const projectKey = typeof req.query.projectKey === 'string' && req.query.projectKey ? req.query.projectKey : undefined;
  res.json({ agents: store.listAgents(projectKey).map((a) => ({ ...publicAgent(a), serviceCount: store.listServices(a.id).length })) });
});

// Menu Clientes: por cliente, servidores do conector, serviços liberados e usuários com acesso.
router.get('/clients', (req, res) => {
  res.json({ clients: clientsOverview({ store: getAgentStore(), manual: getManualProjects(), users: userStore.getAll() }) });
});

// Projetos fora da Huawei (on-premise, outras nuvens): servidores informados à mão, só serviços pelo agente.
router.get('/manual-projects', (req, res) => {
  res.json({ projects: getManualProjects().listProjects() });
});

router.post('/manual-projects', (req, res) => {
  try {
    const project = getManualProjects().createProject({ name: req.body?.name, createdBy: req.user.email || req.user.id });
    logAction(req, 'manual_project_create', { projectId: project.id, name: project.name });
    res.status(201).json({ project });
  } catch (e) { fail(res, e); }
});

router.get('/manual-projects/:id/servers', (req, res) => {
  const manual = getManualProjects();
  if (!manual.getProject(req.params.id)) return res.status(404).json({ error: 'not_found' });
  res.json({ servers: manual.listServers(req.params.id) });
});

router.post('/manual-projects/:id/servers', (req, res) => {
  try {
    const server = getManualProjects().addServer(req.params.id, req.body?.name);
    logAction(req, 'manual_server_create', { projectId: req.params.id, name: server.name });
    res.status(201).json({ server });
  } catch (e) {
    if (e.message === 'not_found') return res.status(404).json({ error: 'not_found' });
    fail(res, e);
  }
});

router.get('/agents/:id', (req, res) => {
  const store = getAgentStore();
  const agent = store.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'not_found' });
  // Usuários que podem receber acesso: clientes que já veem o projeto (visibleProjects).
  const users = userStore.getAll().filter((u) => u.role !== 'admin' && userCanSeeProject(u, agent.projectKey))
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
  res.json({ agent: publicAgent(agent), services: store.listServices(agent.id), releases: store.getReleases(agent.id),
    grants: store.getGrantsForAgent(agent.id), users, jobs: store.listJobs({ agentId: agent.id, limit: 30 }) });
});

router.put('/agents/:id/releases', (req, res) => {
  const store = getAgentStore();
  if (!store.getAgent(req.params.id)) return res.status(404).json({ error: 'not_found' });
  try {
    const releases = store.setReleases(req.params.id, req.body?.releases);
    logAction(req, 'agent_releases', { agentId: req.params.id, services: releases.map((r) => `${r.serviceName}:${r.actions.join('+')}`).join(', ') });
    res.json({ releases });
  } catch (e) { fail(res, e); }
});

router.put('/agents/:id/grants', (req, res) => {
  const store = getAgentStore();
  const agent = store.getAgent(req.params.id);
  const user = req.body?.userId ? userStore.getById(String(req.body.userId)) : null;
  if (!agent || !user) return res.status(404).json({ error: 'not_found' });
  if (!userCanSeeProject(user, agent.projectKey)) return res.status(400).json({ error: 'user_without_project' });
  try {
    const services = store.setGrants(user.id, agent.id, req.body?.services);
    logAction(req, 'agent_grants', { agentId: agent.id, user: user.email, services: services.join(', ') });
    res.json({ services });
  } catch (e) { fail(res, e); }
});

router.post('/agents/:id/revoke', (req, res) => {
  const store = getAgentStore();
  if (!store.getAgent(req.params.id)) return res.status(404).json({ error: 'not_found' });
  store.revoke(req.params.id);
  logAction(req, 'agent_revoked', { agentId: req.params.id });
  res.json({ status: 'revoked' });
});

export default router;
