/**
 * VM do projeto que corresponde ao servidor onde o agente foi instalado (cadastro pela chave do projeto).
 * Nome igual ao hostname; ou, como o Windows corta o nome em 15 caracteres, o nome da VM cortado — só se for único.
 */
import { listEcsForProject } from '../services/huawei-ecs.js';
import { getManualProjects } from './index.js';
import { userStore } from '../data/store.js';

export function matchServer(servers, hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return null;
  const exatos = servers.filter((s) => String(s.name).toLowerCase() === h);
  const candidatos = exatos.length ? exatos : servers.filter((s) => h.length === 15 && String(s.name).toLowerCase().slice(0, 15) === h);
  return candidatos.length === 1 ? { id: candidatos[0].id, name: candidatos[0].name } : null;
}

/** Projetos onde procurar um servidor do instalador geral: os atribuídos a usuários (clientes) e os manuais, sem repetir. */
export function clientProjects() {
  const vistos = new Map();
  for (const u of userStore.getAll()) {
    for (const p of u.visibleProjects || []) {
      if (!p?.id) continue;
      const chave = p.perfil ? `${p.perfil}-${p.id}` : p.id;
      if (!vistos.has(chave)) vistos.set(chave, { projectKey: chave, projectName: p.name || p.id, projectId: p.id, region: p.region || '', perfil: p.perfil || '' });
    }
  }
  for (const m of getManualProjects().listProjects()) {
    if (!vistos.has(m.id)) vistos.set(m.id, { projectKey: m.id, projectName: m.name, projectId: m.id, region: '', perfil: '' });
  }
  return [...vistos.values()].slice(0, 60);
}

/**
 * Instalador geral (sem projeto): procura a VM de mesmo nome em vários projetos (5 por vez).
 * Só devolve quando exatamente um projeto tem a VM; ambíguo ou nada → null (o admin escolhe).
 */
export async function findServerAnywhere(hostname, projetos, finder = findServerByHostname) {
  const achados = [];
  for (let i = 0; i < projetos.length; i += 5) {
    const lote = await Promise.all(projetos.slice(i, i + 5).map((p) => finder(p, hostname).then((ecs) => (ecs ? { projeto: p, ecs } : null)).catch(() => null)));
    achados.push(...lote.filter(Boolean));
  }
  return achados.length === 1 ? achados[0] : null;
}

export async function findServerByHostname(projeto, hostname) {
  const servers = projeto.projectKey.startsWith('manual-')
    ? getManualProjects().listServers(projeto.projectKey)
    : await listEcsForProject(projeto.projectId, projeto.region || undefined, projeto.perfil || undefined, { maxServers: 2000, includeDisks: false });
  return matchServer(servers || [], hostname);
}
