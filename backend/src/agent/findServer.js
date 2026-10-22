/**
 * VM do projeto que corresponde ao servidor onde o agente foi instalado (cadastro pela chave do projeto).
 * Nome igual ao hostname; ou, como o Windows corta o nome em 15 caracteres, o nome da VM cortado — só se for único.
 */
import { listEcsForProject } from '../services/huawei-ecs.js';
import { getManualProjects } from './index.js';

export function matchServer(servers, hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return null;
  const exatos = servers.filter((s) => String(s.name).toLowerCase() === h);
  const candidatos = exatos.length ? exatos : servers.filter((s) => h.length === 15 && String(s.name).toLowerCase().slice(0, 15) === h);
  return candidatos.length === 1 ? { id: candidatos[0].id, name: candidatos[0].name } : null;
}

export async function findServerByHostname(projeto, hostname) {
  const servers = projeto.projectKey.startsWith('manual-')
    ? getManualProjects().listServers(projeto.projectKey)
    : await listEcsForProject(projeto.projectId, projeto.region || undefined, projeto.perfil || undefined, { maxServers: 2000, includeDisks: false });
  return matchServer(servers || [], hostname);
}
