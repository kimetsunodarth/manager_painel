import { api } from './client';

export type AgentAction = 'start' | 'stop' | 'restart';
export const ACTION_LABEL: Record<AgentAction, string> = { start: 'Iniciar', stop: 'Parar', restart: 'Reiniciar' };

export interface AgentInfo {
  id: string; projectKey: string; projectName: string; ecsId: string; ecsName: string; os: 'windows' | 'linux';
  hostname: string; agentVersion: string; created: number; lastSeen: number | null; revoked: boolean; online: boolean;
  /** Serviços do último catálogo enviado pelo agente. */
  serviceCount?: number;
}
export interface ManualServer { id: string; name: string; status: string }

/** Estados enviados pelos agentes (Windows e Linux) em português. */
const STATUS_LABEL: Record<string, string> = {
  running: 'Em execução', active: 'Em execução', stopped: 'Parado', failed: 'Falhou', exited: 'Concluído', partial: 'Parcial',
  startpending: 'Iniciando', stoppending: 'Parando', paused: 'Pausado', unknown: 'Desconhecido',
};
export const statusLabel = (status?: string | null) => (status ? STATUS_LABEL[status.toLowerCase()] ?? status : 'Desconhecido');
export interface ClientOverview {
  projectKey: string; projectName: string; name: string; manual: boolean;
  servers: { agentId: string; ecsName: string; os: string; online: boolean; agentVersion: string; lastSeen: number | null; serviceCount: number; releasedCount: number }[];
  users: { id: string; name: string; email?: string; grantedCount: number }[];
}
export const isManualProject = (p: { id: string }) => p.id.startsWith('manual-');
export interface DiscoveredService { name: string; displayName: string; status: string; startType: string; discoveredAt: number }
export interface ServiceRelease { serviceName: string; label: string; actions: AgentAction[] }
export interface AgentJob {
  id: string; agentId: string; serviceName: string; action: AgentAction; status: 'pending' | 'claimed' | 'done' | 'failed' | 'expired' | 'cancelled';
  requestedBy: string; requestedAt: number; finishedAt: number | null; resultCode: string | null; resultMessage: string | null;
}
export interface AgentDetail {
  agent: AgentInfo; services: DiscoveredService[]; releases: ServiceRelease[]; grants: { userId: string; serviceName: string }[];
  users: { id: string; name: string; email: string; role: string }[]; jobs: AgentJob[];
}
export interface ServerServices {
  agentId: string; projectKey: string; projectName: string; ecsId: string; ecsName: string; os: string; online: boolean; lastSeen: number | null;
  services: { serviceName: string; label: string; displayName: string; status: string; actions: AgentAction[]; lastJob: AgentJob | null }[];
}

export const JOB_LABEL: Record<AgentJob['status'], string> = {
  pending: 'Aguardando agente', claimed: 'Executando', done: 'Concluída', failed: 'Falhou', expired: 'Expirou', cancelled: 'Cancelada',
};

/** Mesma chave de projeto do backend (routes/huawei.js). */
export const projectKeyOf = (p: { id: string; perfil?: string }) => (p.perfil ? `${p.perfil}-${p.id}` : p.id);

export const agentAdmin = {
  issueCode: (body: { projectKey: string; projectName: string; ecsId: string; ecsName: string }) =>
    api<{ code: string; expiresAt: number }>('/agent-admin/activations', { method: 'POST', body: JSON.stringify(body) }),
  agents: (projectKey?: string) => api<{ agents: AgentInfo[] }>(`/agent-admin/agents${projectKey ? `?projectKey=${encodeURIComponent(projectKey)}` : ''}`),
  detail: (id: string) => api<AgentDetail>(`/agent-admin/agents/${encodeURIComponent(id)}`),
  saveReleases: (id: string, releases: ServiceRelease[]) =>
    api<{ releases: ServiceRelease[] }>(`/agent-admin/agents/${encodeURIComponent(id)}/releases`, { method: 'PUT', body: JSON.stringify({ releases }) }),
  saveGrants: (id: string, userId: string, services: string[]) =>
    api<{ services: string[] }>(`/agent-admin/agents/${encodeURIComponent(id)}/grants`, { method: 'PUT', body: JSON.stringify({ userId, services }) }),
  revoke: (id: string) => api<{ status: string }>(`/agent-admin/agents/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
  clients: () => api<{ clients: ClientOverview[] }>('/agent-admin/clients'),
  createManualProject: (name: string) =>
    api<{ project: { id: string; name: string } }>('/agent-admin/manual-projects', { method: 'POST', body: JSON.stringify({ name }) }),
  manualServers: (projectId: string) => api<{ servers: ManualServer[] }>(`/agent-admin/manual-projects/${encodeURIComponent(projectId)}/servers`),
  addManualServer: (projectId: string, name: string) =>
    api<{ server: ManualServer }>(`/agent-admin/manual-projects/${encodeURIComponent(projectId)}/servers`, { method: 'POST', body: JSON.stringify({ name }) }),
};

export const agentServices = {
  list: () => api<{ servers: ServerServices[] }>('/agent-services'),
  run: (agentId: string, serviceName: string, action: AgentAction) =>
    api<{ job: AgentJob }>('/agent-services/jobs', { method: 'POST', body: JSON.stringify({ agentId, serviceName, action }) }),
};
