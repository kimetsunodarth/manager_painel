/**
 * Quem vê e quem executa serviços dos agentes. Cliente: projeto em visibleProjects + acesso (grant) ao serviço
 * + ação liberada pelo admin. Admin: qualquer serviço descoberto, nunca os bloqueados.
 */
import { isBlocked } from './agentCrypto.js';

export const ONLINE_MS = 2 * 60 * 1000;

/** Mesma chave de projeto de routes/huawei.js: "<perfil>-<id>" (ou só o id). */
export function projectKeyOf(project) {
  return project?.perfil ? `${project.perfil}-${project.id}` : String(project?.id ?? '');
}

export function userCanSeeProject(user, projectKey) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return (user.visibleProjects || []).some((p) => projectKeyOf(p) === projectKey);
}

export function canUserAct(user, agent, releases, grants, serviceName, action) {
  if (!user || !agent || agent.revoked || isBlocked(serviceName)) return false;
  if (!userCanSeeProject(user, agent.projectKey)) return false;
  if (user.role === 'admin') return true;
  const release = releases.find((r) => r.serviceName === serviceName);
  if (!release || !release.actions.includes(action)) return false;
  return grants.some((g) => g.agentId === agent.id && g.serviceName === serviceName);
}

/** Servidores e serviços que o usuário pode operar; só serviços presentes no último catálogo do agente. */
export function listForUser(user, store, now = Date.now()) {
  const grants = user?.role === 'admin' ? null : store.getGrants(user?.id);
  return store.listAgents()
    .filter((a) => !a.revoked && userCanSeeProject(user, a.projectKey))
    .map((a) => {
      const present = new Map(store.listServices(a.id).map((s) => [s.name, s]));
      const jobs = store.listJobs({ agentId: a.id, limit: 100 });
      const services = store.getReleases(a.id)
        .filter((r) => present.has(r.serviceName) && (!grants || grants.some((g) => g.agentId === a.id && g.serviceName === r.serviceName)))
        .map((r) => ({ serviceName: r.serviceName, label: r.label, actions: r.actions, status: present.get(r.serviceName).status,
          displayName: present.get(r.serviceName).displayName, lastJob: jobs.find((j) => j.serviceName === r.serviceName) || null }));
      return { agentId: a.id, projectKey: a.projectKey, projectName: a.projectName, ecsId: a.ecsId, ecsName: a.ecsName, os: a.os,
        online: !!a.lastSeen && now - a.lastSeen < ONLINE_MS, lastSeen: a.lastSeen, services };
    })
    .filter((a) => user?.role === 'admin' || a.services.length > 0);
}
