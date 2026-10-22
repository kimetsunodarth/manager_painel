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
import { agentPackage } from '../agent/agentPackages.js';
import { PACKAGE_CODE_TTL_MS } from '../agent/agentStore.js';

const router = Router();
router.use(authMiddleware, requireAdmin);

const publicAgent = (a) => a && ({ id: a.id, projectKey: a.projectKey, projectName: a.projectName, ecsId: a.ecsId, ecsName: a.ecsName, os: a.os,
  hostname: a.hostname, agentVersion: a.agentVersion, created: a.created, lastSeen: a.lastSeen, revoked: a.revoked,
  online: !!a.lastSeen && Date.now() - a.lastSeen < ONLINE_MS, pending: !!a.pending });
const fail = (res, e) => res.status(400).json({ error: e?.message || 'invalid_request' });

router.post('/activations', (req, res) => {
  const { projectKey, projectName, ecsId, ecsName } = req.body || {};
  if (![projectKey, projectName, ecsId, ecsName].every((v) => typeof v === 'string' && v.trim())) return res.status(400).json({ error: 'invalid_request' });
  const result = getAgentStore().issueCode({ projectKey, projectName, ecsId, ecsName, createdBy: req.user.email || req.user.id });
  logAction(req, 'agent_activation_code', { projectKey, ecsName });
  res.status(201).json(result);
});

/** Endereço público do painel que vai embutido no instalador (o mesmo que o navegador usa). */
function publicUrl(req) {
  const origin = String(process.env.FRONTEND_ORIGIN || '').split(',').map((o) => o.trim()).find((o) => /^https:\/\//.test(o));
  return origin || `${req.protocol}://${req.get('host')}`;
}

function sendPackage(res, pkg) {
  res.set('Content-Type', pkg.contentType);
  res.set('Content-Disposition', `attachment; filename="${pkg.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
  res.set('Cache-Control', 'no-store');
  res.send(pkg.data);
}

// Instalador geral: também não pede código. O servidor se cadastra sozinho e fica em "Aguardando vínculo" até o admin
// escolher projeto e VM (chave geral, 7 dias, até 100 servidores).
router.get('/downloads/:os', (req, res) => {
  if (!['windows', 'linux'].includes(req.params.os)) return res.status(400).json({ error: 'Sistema inválido (windows ou linux)' });
  try {
    agentPackage(req.params.os);
    const { token } = getAgentStore().issueEnrollment({ projectKey: '', projectName: '', createdBy: req.user.email || req.user.id });
    logAction(req, 'agent_enrollment_package', { projectKey: '(geral)', os: req.params.os });
    sendPackage(res, agentPackage(req.params.os, { url: publicUrl(req), enroll: token, projectName: 'Ananim' }));
  } catch {
    return res.status(404).json({ error: 'Instalador do agente não encontrado no servidor. Publique de novo o painel.' });
  }
});

// Cadastrados pelo instalador geral, esperando projeto e servidor.
router.get('/agents/unassigned', (req, res) => {
  res.json({ agents: getAgentStore().listUnassigned().map(publicAgent) });
});

// Instalador já ativado para um servidor: o código (uso único, 24 h) vai dentro do arquivo; ninguém precisa digitá-lo.
router.post('/activations/package', (req, res) => {
  const { projectKey, projectName, ecsId, ecsName, os } = req.body || {};
  if (![projectKey, projectName, ecsId, ecsName].every((v) => typeof v === 'string' && v.trim()) || !['windows', 'linux'].includes(os)) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  let pkg;
  try {
    agentPackage(os); // confere que o arquivo existe antes de gastar um código
    const { code, expiresAt } = getAgentStore().issueCode({ projectKey, projectName, ecsId, ecsName, createdBy: req.user.email || req.user.id, ttlMs: PACKAGE_CODE_TTL_MS });
    pkg = agentPackage(os, { url: publicUrl(req), code, projectName, ecsName });
    res.set('X-Activation-Expires', String(expiresAt));
  } catch (e) {
    return res.status(404).json({ error: 'Instalador do agente não encontrado no servidor. Publique de novo o painel.' });
  }
  logAction(req, 'agent_activation_package', { projectKey, ecsName, os });
  sendPackage(res, pkg);
});

// Instalador do projeto: serve para todos os servidores do projeto por 7 dias; cada um se cadastra e é ligado pelo nome da VM.
router.post('/enrollments/package', (req, res) => {
  const { projectKey, projectName, projectId, region, perfil, os } = req.body || {};
  if (![projectKey, projectName].every((v) => typeof v === 'string' && v.trim()) || !['windows', 'linux'].includes(os)) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  let pkg;
  try {
    agentPackage(os);
    const { token, expiresAt } = getAgentStore().issueEnrollment({ projectKey, projectName, projectId: projectId || projectKey, region: region || '',
      perfil: perfil || '', createdBy: req.user.email || req.user.id });
    pkg = agentPackage(os, { url: publicUrl(req), enroll: token, projectName });
    res.set('X-Activation-Expires', String(expiresAt));
  } catch {
    return res.status(404).json({ error: 'Instalador do agente não encontrado no servidor. Publique de novo o painel.' });
  }
  logAction(req, 'agent_enrollment_package', { projectKey, os });
  sendPackage(res, pkg);
});

// Invalida os instaladores do projeto já baixados (ex.: arquivo foi parar em lugar errado).
router.post('/enrollments/revoke', (req, res) => {
  const projectKey = String(req.body?.projectKey || '');
  if (!projectKey) return res.status(400).json({ error: 'invalid_request' });
  getAgentStore().revokeEnrollments(projectKey);
  logAction(req, 'agent_enrollment_revoke', { projectKey });
  res.json({ status: 'revoked' });
});

// Agente cadastrado pelo instalador do projeto sem VM correspondente: o admin escolhe o servidor.
router.put('/agents/:id/assign', (req, res) => {
  const { ecsId, ecsName, projectKey, projectName } = req.body || {};
  if (![ecsId, ecsName].every((v) => typeof v === 'string' && v.trim())) return res.status(400).json({ error: 'invalid_request' });
  try {
    const agent = getAgentStore().assignServer(req.params.id, { ecsId, ecsName, projectKey, projectName });
    logAction(req, 'agent_assign_server', { agentId: agent.id, ecsName });
    res.json({ agent: publicAgent(agent) });
  } catch (e) {
    if (e.message === 'server_taken') return res.status(409).json({ error: 'Este servidor já tem um conector ativo. Desconecte o outro antes.' });
    if (e.message === 'not_found') return res.status(404).json({ error: 'not_found' });
    fail(res, e);
  }
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
