/** Em build para IIS use relativo '/api'. Para dev com backend em outra origem, defina VITE_API_URL. */
const API_BASE = (import.meta.env.VITE_API_URL as string) || '/api';
const AUTH_TOKEN_KEY = 'auth_token';

/** True quando a API está na mesma origem (instalação IIS ou dev com proxy). */
const isSameOriginApi = !API_BASE.startsWith('http');

/** URL da API para exibir em mensagens de erro (instalacao IIS). */
export function getApiBaseUrl(): string {
  return typeof API_BASE === 'string' && API_BASE.startsWith('http') ? API_BASE : '';
}

export async function api<T>(
  path: string,
  options: RequestInit & { skipGlobalErrorHandler?: boolean } = {}
): Promise<T> {
  const { skipGlobalErrorHandler, ...fetchOptions } = options;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };
  const storedToken = typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  if (storedToken && !(headers as Record<string, string>).Authorization) {
    (headers as Record<string, string>).Authorization = `Bearer ${storedToken}`;
  }

  let res: Response;
  try {
    fetchOptions.credentials = 'include';
    res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro de rede';
    const backendMsg = isSameOriginApi
      ? 'API inacessível (IIS). Verifique: 1) Site está iniciado no IIS 2) config.enc e key.bin (ou .encryption_key) na pasta do programa 3) logs\\api-stdout.log na pasta do programa 4) Reinicie o App Pool no IIS.'
      : 'Backend inacessível. Verifique se está rodando e se a porta do proxy está correta (VITE_API_PORT).';
    throw new Error(msg.includes('Failed') || msg.includes('NetworkError') ? backendMsg : msg);
  }
  if (res.status === 401 && !skipGlobalErrorHandler) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Não autorizado');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && (data.error || data.message)) || '';
    const apiUrl = getApiBaseUrl();
    const hintIis = 'API inacessível (IIS). Verifique: 1) Site iniciado no IIS 2) config.enc e key.bin na pasta do programa 3) logs\\api-stdout.log 4) Reinicie o App Pool.';
    const hintDev = apiUrl
      ? `API inacessível. Verifique se o backend está rodando em ${apiUrl}`
      : 'Backend inacessível. Verifique se a API está rodando (use npm run dev:3002 se o backend estiver na porta 3002).';
    const hint = isSameOriginApi ? hintIis : hintDev;
    if (res.status === 502 || res.status === 503 || res.status === 504)
      throw new Error(msg || hint);
    throw new Error(msg || 'Erro na requisição');
  }
  return data as T;
}

export const auth = {
  login: (email: string, password: string) =>
    api<{ ok: boolean; mfaRequired?: boolean; mfaSetupRequired?: boolean; setupToken?: string; qrDataUrl?: string; manualKey?: string; challengeToken?: string; delivery?: string; expiresIn?: number; token?: string; user?: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  verifyMfaSetup: (setupToken: string, code: string) =>
    api<{ ok: boolean; mfaRequired?: boolean; token?: string; user: User }>('/auth/mfa/setup/verify', {
      method: 'POST',
      body: JSON.stringify({ setupToken, code }),
    }),
  verifyMfa: (challengeToken: string, code: string) =>
    api<{ ok: boolean; mfaRequired?: boolean; token?: string; user: User }>('/auth/login/mfa', {
      method: 'POST',
      body: JSON.stringify({ challengeToken, code }),
    }),
  logout: () =>
    api<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
    }),
};

export const environments = {
  list: (filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters as Record<string, string>).toString();
    return api<Environment[]>(`/environments?${params}`);
  },
};

export const ecs = {
  start: (ecsId: string) => api<{ ok: boolean }>(`/ecs/${ecsId}/start`, { method: 'POST' }),
  stop: (ecsId: string) => api<{ ok: boolean }>(`/ecs/${ecsId}/stop`, { method: 'POST' }),
  restart: (ecsId: string) => api<{ ok: boolean }>(`/ecs/${ecsId}/restart`, { method: 'POST' }),
};

export type ServicesHealth = Record<string, 'active' | 'inactive' | 'error' | 'unconfigured'>;

export interface HanaProcess {
  name: string;
  description: string;
  dispstatus: string;
  textstatus: string;
  starttime: string;
  elapsedtime: string;
  pid: string;
  status: 'up' | 'down';
}

/** Servidor disponível quando o usuário tem mais de um (ex.: Águas Pratas SQL + Águas Pratas Web). */
export interface AvailableServer {
  clientKey: string;
  displayName: string;
}

/** Resposta da lista de serviços: array (SAP) ou objeto com mode SQL (cliente SQL) e opcional availableServers. */
export type ServicesListResponse =
  | ServiceItem[]
  | { list: ServiceItem[]; mode: 'sql'; displayName?: string; clientKey?: string; availableServers?: AvailableServer[] };

function withClientKey(path: string, clientKey?: string | null): string {
  if (clientKey && clientKey.trim()) {
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}clientKey=${encodeURIComponent(clientKey.trim())}`;
  }
  return path;
}

export const services = {
  list: (clientKey?: string | null) =>
    api<ServicesListResponse>(withClientKey('/services', clientKey)),
  /** Nome da VM de banco conectada (SSH; clientes SQL: VM Windows; clientes Web: servidor SSH_WEB; clientes HANA: VM SUSE). */
  connectionInfo: (clientKey?: string | null) =>
    api<{ vmHost: string | null; vmDisplayName?: string | null; configured: boolean; mode?: 'sql' | 'hana'; displayName?: string }>(
      withClientKey('/services/connection-info', clientKey)
    ),
  /** Teste de conexão SSH via API. */
  testConnection: (clientKey?: string | null) =>
    api<{ ok: boolean; message?: string; error?: string }>('/services/test-connection', {
      method: 'POST',
      body: JSON.stringify(clientKey && clientKey.trim() ? { clientKey: clientKey.trim() } : {}),
    }),
  /** Status dos serviços na VM SUSE (HANA, Service Layer, SLD, Authentication) ou grupos SQL/Web. */
  health: (clientKey?: string | null) =>
    api<ServicesHealth>(withClientKey('/services/health', clientKey)),
  /** Lista de processos HANA (GetProcessList) — quais subiram e quais não. */
  hanaProcesses: () =>
    api<{ processes: HanaProcess[]; error?: string }>('/services/hana-processes'),
  /** Lista de serviços executáveis (para formulário de usuário — conforme documento SAP). */
  options: () => api<{ id: string; name: string }[]>('/services/options'),
  execute: (serviceId: string, clientKey?: string | null) =>
    api<{ ok: boolean; lastExecution: { at: string; status: string } }>(`/services/${serviceId}/execute`, {
      method: 'POST',
      body: JSON.stringify(clientKey && clientKey.trim() ? { clientKey: clientKey.trim() } : {}),
    }),
};

export interface CbrBackupItem {
  id: string;
  name: string;
  status: string;
  type: string;
  resource_id: string;
  resource_name: string;
  resource_size: number;
  created_at: string;
  protected_at: string;
  vault_id: string;
}

export interface CbrByClientItem {
  profile: string;
  clientName: string;
  projectId: string;
  region: string;
  backups: CbrBackupItem[];
  error?: string;
}

export const backups = {
  list: (params?: { q?: string; page?: number; perPage?: number }) => {
    const search = new URLSearchParams(params as Record<string, string>).toString();
    return api<{ items: BackupItem[]; total: number; page: number; perPage: number }>(`/backups?${search}`);
  },
  /** CBR Huawei: backups por cliente (última semana ou days). Se perfil for passado, retorna só esse projeto (mesma permissão que ECS/restart). */
  listCbr: (days?: number, perfil?: string) => {
    const params = new URLSearchParams();
    if (days != null) params.set('days', String(days));
    if (perfil) params.set('perfil', perfil);
    const q = params.toString() ? `?${params.toString()}` : '';
    return api<{ byClient: CbrByClientItem[]; days: number }>(`/backups/cbr${q}`);
  },
};

export const licenses = {
  summary: (envId?: string) => api<LicenseSummary>(`/licenses/summary${envId ? `?envId=${envId}` : ''}`),
  addons: (envId?: string) => api<AddonItem[]>(`/licenses/addons${envId ? `?envId=${envId}` : ''}`),
  /** Texto da licença de add-ons (todos podem ler). */
  addonsLicense: () => api<{ licencaAddons: string }>('/licenses/addons-license'),
  /** Atualizar texto da licença de add-ons (apenas admin). */
  updateAddonsLicense: (licencaAddons: string) =>
    api<{ licencaAddons: string }>('/licenses/addons-license', {
      method: 'PATCH',
      body: JSON.stringify({ licencaAddons }),
    }),
  /** Atualizar quantidades de licenças SAP (apenas admin). */
  updateSummary: (data: Partial<LicenseSummary>) =>
    api<LicenseSummary>('/licenses/summary', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  /** Atualizar lista de add-ons (apenas admin). */
  updateAddons: (list: AddonItem[]) =>
    api<AddonItem[]>('/licenses/addons', {
      method: 'PATCH',
      body: JSON.stringify(list),
    }),
};

export const documents = {
  list: () => api<DocumentItem[]>('/documents'),
  /** Importar documento (apenas admin). */
  upload: (fileName: string, contentBase64: string) =>
    api<DocumentItem>('/documents', {
      method: 'POST',
      body: JSON.stringify({ fileName, contentBase64 }),
    }),
  /** Limpar todos os documentos (apenas admin). */
  clear: () =>
    api<{ ok: boolean; message: string }>('/documents/clear', { method: 'POST' }),
  /** Editar nome do documento (apenas admin). */
  update: (id: string, arquivo: string) =>
    api<DocumentItem>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ arquivo }),
    }),
  /** Excluir documento (apenas admin). */
  delete: (id: string) =>
    api<{ ok: boolean }>(`/documents/${id}`, { method: 'DELETE' }),
};

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  details: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export const auditLogs = {
  list: (limit?: number) => {
    const q = limit != null ? `?limit=${limit}` : '';
    return api<AuditLogEntry[]>(`/audit-logs${q}`);
  },
};

/** Clientes HANA/Control Center (apenas admin). */
export interface AdminClientsList {
  registry: Array<{ clientKey: string; displayName: string; nameContains?: string; perfilPattern?: string; hasControlCenter?: boolean }>;
  controlCenterKeys: string[];
  hanaKeys: string[];
}

export interface AdminClientCreateBody {
  displayName: string;
  clientKey?: string;
  jumpHost: string;
  jumpUser: string;
  jumpPassword: string;
  jumpPort?: number;
  hanaHost: string;
  hanaUser: string;
  hanaPassword: string;
  hanaPort?: number;
  controlCenterUrl?: string;
  controlCenterUser?: string;
  controlCenterPassword?: string;
  /** IDs dos usuários (operadores) que já devem ver este cliente na aba Serviços. */
  assignToUserIds?: string[];
  /** Serviços HANA (VM destino): uma linha por serviço, formato "id|Nome" (ex.: serviceLayer|Reiniciar Service Layer). Se vazio, usa lista padrão. */
  hanaServices?: string;
  /** Serviços Web (Jump): uma linha por serviço, formato "id|Nome" (ex.: invent-dfe|Invent DFe). Se vazio, usa lista padrão. */
  webServices?: string;
  /** Mapeamento serviços Windows (para Web): uma linha por grupo, formato "id=NomeServ1,NomeServ2" (ex.: invent-dfe=TaxPlusDfeCteNsu,TaxPlusDfeEvento). */
  windowsServiceGroupsText?: string;
  /** Perfil Huawei já existente no config (ex.: MAXMOHR). Quando informado, o cliente usa essa conta em vez de criar novo perfil. */
  huaweiPerfil?: string;
  /** ID do projeto Huawei (quando criado a partir de um perfil/projeto selecionado). Garante que visibleProjects use o projeto correto. */
  huaweiProjectId?: string;
  /** Opcional: ID da ECS específica para atribuir este cliente ao operador. */
  huaweiEcsId?: string;
}

export interface AdminClientCreateResult {
  clientKey: string;
  displayName: string;
  filesCreated: string[];
  envSnippet: string;
  message: string;
  /** Operadores que receberam o cliente no visibleProjects. */
  assignedOperators?: Array<{ userId: string; name: string; alreadyHad?: boolean }>;
  /** true quando rodando no IIS e config.enc foi atualizado com as credenciais do novo cliente. */
  configEncUpdated?: boolean;
  /** Chaves de env (SSH/Jump) que foram gravadas (para você confirmar que o acesso às VMs foi salvo). */
  envKeysWritten?: string[];
}

export interface ClientServiceItem {
  id: string;
  name: string;
  action?: string;
}

export interface ClientServicesData {
  clientKey: string;
  hanaServices: ClientServiceItem[];
  webServices: ClientServiceItem[];
  windowsServiceGroups: Record<string, string[]>;
}

/** Perfil do cliente para preencher formulário de novo cliente (sem credenciais). */
export interface ClientProfile {
  clientKey: string;
  displayName: string;
  hanaServices: ClientServiceItem[];
  webServices: ClientServiceItem[];
  windowsServiceGroups: Record<string, string[]>;
  controlCenterUrl: string;
}

export const adminClients = {
  list: () => api<AdminClientsList>('/admin/clients'),
  create: (data: AdminClientCreateBody) =>
    api<AdminClientCreateResult>('/admin/clients', { method: 'POST', body: JSON.stringify(data) }),
  delete: (clientKey: string) =>
    api<{ ok: boolean; clientKey: string; displayName: string }>(
      `/admin/clients/${encodeURIComponent(clientKey)}`,
      { method: 'DELETE' }
    ),
  getProfile: (clientKey: string) =>
    api<ClientProfile>(`/admin/clients/${encodeURIComponent(clientKey)}/profile`),
  getServices: (clientKey: string) =>
    api<ClientServicesData>(`/admin/clients/${encodeURIComponent(clientKey)}/services`),
  updateServices: (
    clientKey: string,
    data: {
      hanaServices: ClientServiceItem[];
      webServices: ClientServiceItem[];
      windowsServiceGroups: Record<string, string[]>;
    }
  ) =>
    api<{ ok: boolean; clientKey: string }>(`/admin/clients/${encodeURIComponent(clientKey)}/services`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

export const users = {
  list: () => api<User[]>('/users'),
  get: (id: string) => api<User>(`/users/${id}`),
  create: (data: CreateUser) => api<User>('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CreateUser> & { allowedEcsIds?: string[]; allowedHuaweiEcsIds?: AllowedHuaweiEcsIds }) =>
    api<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => api<{ ok: boolean; message: string }>(`/users/${id}`, { method: 'DELETE' }),
  resetPassword: (id: string, newPassword: string) =>
    api<{ ok: boolean; message: string }>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),
};

/** Cache de agendamentos VM: evita recarregar a cada visita à Programação ou ao modal Cancelar programação. */
const SCHEDULES_VM_CACHE_KEY = 'ananim_schedules_vm';
const SCHEDULES_VM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// ScheduleVmCache usa o tipo ScheduleVm definido abaixo no mesmo arquivo
type ScheduleVmCache = { data: ScheduleVm[]; updatedAt: number };

function getSchedulesVmCache(): ScheduleVmCache | null {
  try {
    const raw = sessionStorage.getItem(SCHEDULES_VM_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScheduleVmCache;
    if (!Array.isArray(parsed?.data) || typeof parsed.updatedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function setSchedulesVmCache(data: ScheduleVm[]): void {
  const entry: ScheduleVmCache = { data, updatedAt: Date.now() };
  try {
    sessionStorage.setItem(SCHEDULES_VM_CACHE_KEY, JSON.stringify(entry));
  } catch (_) {}
}

function invalidateSchedulesVmCache(): void {
  try {
    sessionStorage.removeItem(SCHEDULES_VM_CACHE_KEY);
  } catch (_) {}
}

function getSchedulesVmApi(): {
  list: (projectKey?: string, projectId?: string) => Promise<ScheduleVm[]>;
  add: (body: ScheduleVmCreate) => Promise<ScheduleVm>;
  update: (id: number, body: Partial<ScheduleVmCreate>) => Promise<ScheduleVm>;
  remove: (id: number) => Promise<{ ok: boolean }>;
  cancelForDate: (projectKey: string, serverId: string, date: string, action?: 'stop' | 'start' | 'restart') => Promise<{ ok: boolean; message: string }>;
  clearCancelForDate: (projectKey: string, serverId: string, date: string) => Promise<{ ok: boolean }>;
} {
  function filterList(list: ScheduleVm[], projectKey?: string, projectId?: string): ScheduleVm[] {
    if (!projectKey && !projectId) return list;
    return list.filter(
      (s) =>
        (projectKey && s.projectKey === projectKey) ||
        (projectId && s.projectId === projectId)
    );
  }
  return {
    list: async (projectKey?: string, projectId?: string) => {
      const cached = getSchedulesVmCache();
      const now = Date.now();
      if (cached && now - cached.updatedAt < SCHEDULES_VM_CACHE_TTL_MS) {
        const list = cached.data;
        return filterList(list, projectKey, projectId);
      }
      const list = await api<ScheduleVm[]>('/huawei/schedules');
      const arr = Array.isArray(list) ? list : [];
      setSchedulesVmCache(arr);
      return filterList(arr, projectKey, projectId);
    },
    add: async (body: ScheduleVmCreate) => {
      const created = await api<ScheduleVm>('/huawei/schedules', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      invalidateSchedulesVmCache();
      return created;
    },
    update: async (id: number, body: Partial<ScheduleVmCreate>) => {
      const updated = await api<ScheduleVm>(`/huawei/schedules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      invalidateSchedulesVmCache();
      return updated;
    },
    remove: async (id: number) => {
      const result = await api<{ ok: boolean }>(`/huawei/schedules/${id}`, { method: 'DELETE' });
      invalidateSchedulesVmCache();
      return result;
    },
    cancelForDate: async (projectKey: string, serverId: string, date: string, action?: 'stop' | 'start' | 'restart') => {
      const result = await api<{ ok: boolean; message: string }>('/huawei/schedules/cancel-for-date', {
        method: 'POST',
        body: JSON.stringify({ projectKey, serverId, date, action: action || 'stop' }),
      });
      invalidateSchedulesVmCache();
      return result;
    },
    clearCancelForDate: async (projectKey: string, serverId: string, date: string) => {
      const result = await api<{ ok: boolean }>(
        `/huawei/schedules/cancel-for-date?projectKey=${encodeURIComponent(projectKey)}&serverId=${encodeURIComponent(serverId)}&date=${encodeURIComponent(date)}`,
        { method: 'DELETE' }
      );
      invalidateSchedulesVmCache();
      return result;
    },
  };
}

export const huawei = {
  projects: (scope?: 'region' | 'all', source?: 'master' | 'all_perfis') => {
    const params = new URLSearchParams();
    if (scope === 'all') params.set('scope', 'all');
    if (source === 'all_perfis') params.set('source', 'all_perfis');
    const q = params.toString() ? `?${params.toString()}` : '';
    return api<HuaweiProject[]>(`/huawei/projects${q}`);
  },
  ecs: (projectId: string, region?: string, perfil?: string, cliente?: string) => {
    const params = new URLSearchParams();
    if (region) params.set('region', region);
    if (perfil) params.set('perfil', perfil);
    if (cliente) params.set('cliente', cliente);
    const q = params.toString() ? `?${params.toString()}` : '';
    return api<HuaweiEcsServer[]>(`/huawei/projects/${encodeURIComponent(projectId)}/ecs${q}`);
  },
  /** Programação (horário em que as VMs ficam ligadas) do projeto. */
  ecsSchedule: (projectId: string, perfil?: string) => {
    const q = perfil ? `?perfil=${encodeURIComponent(perfil)}` : '';
    return api<{ projectKey: string; schedule: { start?: string | null; end?: string | null } | null; skipNextStop?: boolean }>(
      `/huawei/projects/${encodeURIComponent(projectId)}/schedule${q}`
    );
  },
  /** Define programação do projeto (admin). start/end em HH:mm. */
  setEcsSchedule: (projectId: string, schedule: { start?: string; end?: string }, perfil?: string) =>
    api<{ projectKey: string; schedule: unknown }>(`/huawei/projects/${encodeURIComponent(projectId)}/schedule`, {
      method: 'PATCH',
      body: JSON.stringify({ perfil, ...schedule }),
    }),
  /** Define ou soma horas a mais (marcador) de um ECS (admin). */
  setEcsExtraHours: (
    projectId: string,
    serverId: string,
    payload: { hours?: number; add?: number },
    perfil?: string
  ) => {
    const q = perfil ? `?perfil=${encodeURIComponent(perfil)}` : '';
    return api<{ projectKey: string; serverId: string; extraHours: number }>(
      `/huawei/projects/${encodeURIComponent(projectId)}/ecs/${encodeURIComponent(serverId)}/extra-hours${q}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
  },
  /** Start, stop ou restart de um ECS do projeto Huawei (API v2.1). */
  ecsAction: (
    projectId: string,
    serverId: string,
    action: 'start' | 'stop' | 'restart',
    options?: { region?: string; perfil?: string; serverName?: string }
  ) => {
    const params = new URLSearchParams();
    if (options?.region) params.set('region', options.region);
    if (options?.perfil) params.set('perfil', options.perfil);
    const q = params.toString() ? `?${params.toString()}` : '';
    return api<{ ok: boolean; message: string; serverId: string }>(
      `/huawei/projects/${encodeURIComponent(projectId)}/ecs/${encodeURIComponent(serverId)}/action${q}`,
      { method: 'POST', body: JSON.stringify({ action, serverName: options?.serverName, ...options }) }
    );
  },
  /** Contas para Descobrir Projetos (fluxo CBR/tags). */
  discoveryAccounts: () =>
    api<DiscoveryAccount[]>('/huawei/discovery-accounts'),
  /** Descobre todos os projetos de uma conta; retorna lista com status novo/ja_existe. */
  discoverProjects: (account: string) =>
    api<{ account: string; projects: DiscoveredProject[] }>('/huawei/discover-projects', {
      method: 'POST',
      body: JSON.stringify({ account }),
    }),
  /** Adiciona projetos à lista fixa visível do usuário (visibleProjects). */
  applyVisibleProjects: (projects: { id: string; name: string; region?: string | null; perfil?: string | null }[]) =>
    api<{ ok: boolean; visibleProjects: HuaweiProject[] }>('/huawei/apply-visible-projects', {
      method: 'POST',
      body: JSON.stringify({ projects }),
    }),
  /** Limpa a lista fixa visível do usuário para buscar novamente (nova implementação). */
  clearVisibleProjects: () =>
    api<{ ok: boolean; visibleProjects: HuaweiProject[] }>('/huawei/clear-visible-projects', { method: 'POST' }),
  /** Sessões de extensão de horário (cancelou programação ou ligou VM após horário). */
  extensionSessions: (params?: { from?: string; to?: string; projectKey?: string; serverId?: string; userId?: string; type?: string }) => {
    const search = new URLSearchParams();
    if (params?.from) search.set('from', params.from);
    if (params?.to) search.set('to', params.to);
    if (params?.projectKey) search.set('projectKey', params.projectKey);
    if (params?.serverId) search.set('serverId', params.serverId);
    if (params?.userId) search.set('userId', params.userId);
    if (params?.type) search.set('type', params.type);
    const q = search.toString() ? `?${search.toString()}` : '';
    return api<ExtensionSession[]>(`/huawei/extension-sessions${q}`);
  },
  /** Todas as programações e flags de cancelar stop (admin). */
  programacao: () =>
    api<{
      schedules: Record<string, { start?: string | null; end?: string | null }>;
      skipNextStop: Record<string, unknown>;
      schedulesVm: ScheduleVm[];
    }>('/huawei/programacao'),
  /** Agendamentos por VM (modelo ANANIMCLOUD). Com cache em memória + sessionStorage para não recarregar a cada visita. */
  schedulesVm: getSchedulesVmApi(),
  /** Diagnóstico de programações (admin): hora do servidor, agendamentos e quantos estão "devidos" agora. */
  schedulesDiagnostic: () =>
    api<{
      serverTime: string;
      serverTimeLocal: string;
      serverHour: number;
      serverMinute: number;
      serverDayOfWeek: number;
      agendamentosFilePath?: string;
      totalSchedules: number;
      enabledCount: number;
      invalidForCronCount?: number;
      dueNowCount: number;
      dueNow: { id: number; serverName: string; action: string; hour: number; minute: number; perfil: string | null }[];
      schedules: { id: number; serverName: string; action: string; hour: number; minute: number; days: number[] | null; enabled: boolean; perfil: string | null; wouldRunNow: boolean; invalidForCron?: boolean }[];
      hint?: string | null;
    }>('/huawei/schedules/diagnostic'),
  /** Cancela o próximo stop programado (extensão de horário). */
  cancelStop: (projectId: string, perfil?: string) =>
    api<{ ok: boolean; projectKey: string; message: string }>(
      `/huawei/projects/${encodeURIComponent(projectId)}/cancel-stop`,
      { method: 'POST', body: JSON.stringify({ perfil }) }
    ),
  /** Remove o cancelamento de stop. */
  clearCancelStop: (projectId: string, perfil?: string) =>
    api<{ ok: boolean; projectKey: string }>(
      `/huawei/projects/${encodeURIComponent(projectId)}/cancel-stop${perfil ? `?perfil=${encodeURIComponent(perfil)}` : ''}`,
      { method: 'DELETE' }
    ),
};

export interface DiscoveryAccount {
  id: string;
  label: string;
  profile: string;
  region: string;
  projectId: string | null;
  available: boolean;
}

export interface DiscoveredProject {
  id: string;
  name: string;
  region: string;
  perfil: string;
  status: 'novo' | 'ja_existe';
}

export interface HuaweiProject {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
  domain_id?: string;
  parent_id?: string;
  region?: string | null;
  /** Nome da conta/perfil no config (ex.: MOOVE_SP_PRINCIPAL, ANANIMCLOUD_4ERP) quando source=all_perfis */
  perfil?: string;
  /** Para operador com ECS restritas: exibição como ANANIM_NOMEDOCLIENTE (ex.: ANANIM_ROLAND). Só na Home do operador. */
  displayPerfil?: string | null;
}

export interface HuaweiEcsServer {
  id: string;
  name: string;
  status: string;
  description?: string;
  created?: string;
  updated?: string;
  flavor?: { id: string; name: string; vcpus: string; ram: string } | null;
  addresses?: Record<string, Array<{ addr?: string; 'OS-EXT-IPS:type'?: string }>>;
  metadata?: Record<string, string>;
  /** Tamanho total dos discos em GB (soma dos anexos). */
  totalDiskGb?: number | null;
  /** Discos anexados (tamanho por dispositivo). */
  volumeAttachments?: { size: number; device: string }[];
  /** Programação do projeto (horário em que as VMs ficam ligadas). */
  schedule?: { start?: string | null; end?: string | null } | null;
  /** Marcador: total de horas a mais (fora do horário programado). */
  extraHours?: number;
}

/** Sessão de extensão de horário (cancelou programação do dia ou ligou VM após horário). */
export interface ExtensionSession {
  id: string;
  projectKey: string;
  serverId: string;
  serverName: string | null;
  type: 'cancel_stop' | 'manual_start';
  scheduledStopAt: string | null;
  startedAt: string;
  endedAt: string | null;
  hours: number | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  createdAt: string;
}

/** Agendamento por VM (modelo ANANIMCLOUD). */
export interface ScheduleVm {
  id: number;
  projectKey: string;
  projectId: string;
  region: string | null;
  perfil: string | null;
  serverId: string;
  serverName: string;
  action: 'start' | 'stop' | 'restart';
  hour: number;
  minute: number;
  days: number[] | null;
  enabled: boolean;
  isExternal?: boolean;
  createdBy: string | null;
  lastModifiedBy: string | null;
}

export interface ScheduleVmCreate {
  projectKey?: string;
  projectId: string;
  region?: string | null;
  perfil?: string | null;
  serverId: string;
  serverName?: string;
  action: 'start' | 'stop' | 'restart';
  hour: number;
  minute: number;
  days?: number[] | null;
  enabled?: boolean;
  isExternal?: boolean;
}

/** Mapa projectKey -> array de serverId que o usuário pode ver e operar (ex.: RAMOONE). */
export type AllowedHuaweiEcsIds = Record<string, string[]>;

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  allowedEcsIds?: string[];
  /** Projetos Huawei que o usuário pode ver ao logar (preenchido pelo admin). */
  visibleProjects?: HuaweiProject[];
  /** Por projeto Huawei: ECS que o usuário pode ver e fazer start/stop/restart (ex.: RAMOONE por cliente). */
  allowedHuaweiEcsIds?: AllowedHuaweiEcsIds;
  /** IDs dos serviços SAP/HANA que o operador pode executar (restart). */
  allowedServiceIds?: string[];
  /** Cliente preferido na aba Serviços quando o usuário tem vários (ex.: roland, cloudhdb). Vazio = usar ordem dos projetos. */
  preferredServiceClientKey?: string | null;
  mfaEnabled?: boolean;
  mfaEmail?: string | null;
}

export interface CreateUser {
  name: string;
  email: string;
  password: string;
  role?: string;
  permissions?: string[];
  allowedEcsIds?: string[];
  visibleProjects?: HuaweiProject[];
  allowedHuaweiEcsIds?: AllowedHuaweiEcsIds;
  allowedServiceIds?: string[];
  preferredServiceClientKey?: string | null;
  mfaEnabled?: boolean;
  mfaEmail?: string | null;
}

/** Opções de cliente para preferência na aba Serviços (HANA/SQL). */
export const PREFERRED_SERVICE_CLIENT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Automático (ordem dos projetos)' },
  { value: 'roland', label: 'Roland' },
  { value: 'roland-web', label: 'Roland Web' },
  { value: 'cloudhdb', label: 'CLOUDHDB' },
  { value: 'ananimcloud', label: 'Ananim Cloud' },
  { value: 'controlla', label: 'Controlla' },
  { value: 'controlla-web', label: 'Controlla Web' },
  { value: 'alfa-citrus', label: 'Alfa Citrus' },
];

export interface Environment {
  id: string;
  ip: string;
  sincronizadoEm: string;
  pais: string;
  vlan: string;
  tipoAmbiente: string;
  cliente: string;
  parceiro: string;
  erp: string;
  basesAtuais: number;
  addons: number;
  usersLicenciados: number;
  status: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  action: string;
  lastExecution?: { at: string; status: string } | null;
}

export interface BackupItem {
  ipAmbiente: string;
  cliente: string;
  parceiro: string;
  nomeBackup: string;
  tamanho: number;
}

export interface LicenseSummary {
  crm: number;
  financials: number;
  logistics: number;
  professional: number;
  licencasIndiretas: number;
  totalUsuariosLicenciados: number;
  totalLicencas: number;
}

export interface AddonItem {
  name: string;
  count: number;
  color: string;
}

export interface DocumentItem {
  id: string;
  arquivo: string;
  dataUpload: string;
}
