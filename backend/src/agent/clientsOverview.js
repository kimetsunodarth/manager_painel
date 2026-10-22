/**
 * Menu Clientes (modelo do conector): por cliente/projeto, os servidores com o Ananim Manager Agent,
 * quantos serviços cada um encontrou e quantos estão liberados, e os usuários do cliente com acesso.
 * Entram os projetos com conector e os projetos manuais (mesmo ainda sem servidor).
 */
import { ONLINE_MS, userCanSeeProject } from './agentAccess.js';
import { projectDisplayName } from '../utils/scopedProject.js';

export function clientsOverview({ store, manual, users, now = Date.now() }) {
  const clients = new Map();
  const client = (projectKey, projectName, isManual) => {
    if (!clients.has(projectKey)) {
      clients.set(projectKey, { projectKey, projectName, name: projectDisplayName({ name: projectName }), manual: isManual, servers: [], users: [] });
    }
    return clients.get(projectKey);
  };

  for (const p of manual.listProjects()) client(p.id, p.name, true);
  const grantsByProject = new Map();
  for (const a of store.listAgents().filter((x) => !x.revoked)) {
    const c = client(a.projectKey, a.projectName, a.projectKey.startsWith('manual-'));
    c.servers.push({ agentId: a.id, ecsName: a.ecsName, os: a.os, online: !!a.lastSeen && now - a.lastSeen < ONLINE_MS, agentVersion: a.agentVersion,
      lastSeen: a.lastSeen, serviceCount: store.listServices(a.id).length, releasedCount: store.getReleases(a.id).length });
    const grants = grantsByProject.get(a.projectKey) || [];
    grantsByProject.set(a.projectKey, grants.concat(store.getGrantsForAgent(a.id)));
  }

  for (const c of clients.values()) {
    const grants = grantsByProject.get(c.projectKey) || [];
    c.users = users.filter((u) => u.role !== 'admin' && userCanSeeProject(u, c.projectKey))
      .map((u) => ({ id: u.id, name: u.name, email: u.email, grantedCount: grants.filter((g) => String(g.userId) === String(u.id)).length }));
    c.servers.sort((x, y) => x.ecsName.localeCompare(y.ecsName));
  }
  return [...clients.values()].sort((x, y) => x.name.localeCompare(y.name));
}
