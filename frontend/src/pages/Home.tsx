import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Calendar, RefreshCw } from 'lucide-react';
import { huawei, users as usersApi, type HuaweiProject, type HuaweiEcsServer, type User, type DiscoveryAccount, type DiscoveredProject, type ScheduleVm } from '../api/client';
import { useUser } from '../hooks/useUser';
import { getErrorMessage } from '../utils/errorMessage';
import { saveHomeProjectSelection } from '../utils/homeProjectSelection';
import AccountProjectBar from '../components/AccountProjectBar';
import PageHeader from '../components/PageHeader';

const HUAWEI_CACHE_KEY = 'huawei_projects_cache';

function projectKey(p: HuaweiProject) {
  return p.perfil ? `${p.perfil}-${p.id}` : p.id;
}

/** Exibe o nome do perfil; quando o backend envia displayPerfil (ex.: ANANIM_ROLAND para operador), use p.displayPerfil na lista. */
function displayPerfil(perfil: string | undefined): string {
  if (!perfil) return '—';
  return perfil;
}

function accountIdFromPerfil(perfil: string | undefined | null): string | null {
  if (!perfil) return null;
  const p = String(perfil).toUpperCase();
  if (p.startsWith('ANANIMCLOUD')) return 'ANANIMCLOUD';
  if (p.startsWith('RAMO_SP') || p.startsWith('RAMO_CH') || p.startsWith('RAMO_SISTEMAS')) return 'RAMO_SISTEMAS';
  if (p.startsWith('MOOVE')) return 'MOOVE_RAMOSISTEMAS';
  if (p.startsWith('RSDONE')) return 'RSDONE';
  return null;
}

function projectDisplayName(p: HuaweiProject): string {
  // MOOVE: o projeto que lista ECS é o tenantId (079fd9...), mas o IAM também retorna um projeto "MOS"
  // que não corresponde a uma região válida para ECS. Padronizar ambos na UI.
  if (p.id === '079fd9f3ab8026fe2fcbc00192167cda' || String(p.name || '').trim().toUpperCase() === 'MOS') return 'Grupo Moove';
  const name = (p.name || '').trim();
  if (!name) return p.id;
  // Alguns projetos vêm no formato "regiao_sufixo". Exibir só o sufixo (cliente).
  let base = name;
  let regionPrefix: string | null = null;
  if (name.includes('_')) {
    const [prefix, ...rest] = name.split('_');
    const suffix = rest.join('_').trim();
    if (suffix) base = suffix;
    if (isRegionLikeProjectName(prefix)) regionPrefix = prefix.trim().toLowerCase();
  }

  // RAMO_SISTEMAS: diferenciar SP/CH quando existem projetos com o mesmo "cliente".
  const accountId = accountIdFromPerfil(p.perfil);
  const region = (p.region || regionPrefix || '').toLowerCase();
  // MOOVE: em algumas contas o projeto vem apenas como "MOS"; padronizar exibição.
  if (accountId === 'MOOVE_RAMOSISTEMAS' && base.toUpperCase() === 'MOS') return 'Grupo Moove';
  if (accountId === 'RAMO_SISTEMAS') {
    if (region === 'sa-brazil-1') return `${base} (SP)`;
    if (region === 'la-south-2') return `${base} (CH)`;
  }
  return base;
}

const REGION_ROOT_NAMES = new Set([
  'sa-brazil-1',
  'la-south-2',
  'af-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'cn-north-1',
  'cn-north-4',
  'cn-east-2',
  'cn-east-3',
  'cn-south-1',
  'na-mexico-1',
  'eu-west-0',
  'eu-west-101',
  'tr-west-1',
  'ae-ad-1',
  'my-kualalumpur-1',
]);

function isRegionLikeProjectName(name: string | undefined | null): boolean {
  const n = (name || '').trim().toLowerCase();
  if (!n) return false;
  if (REGION_ROOT_NAMES.has(n)) return true;
  // Ex.: la-north-2, ap-southeast-1, eu-west-101
  return /^[a-z]{2}-[a-z0-9-]+-\d+$/.test(n);
}

function isMooveMosProject(p: HuaweiProject): boolean {
  return String(p?.name || '').trim().toUpperCase() === 'MOS';
}

function isMooveTenantProject(p: HuaweiProject): boolean {
  return p?.id === '079fd9f3ab8026fe2fcbc00192167cda';
}

/** Nome do cliente a partir dos metadados da ECS (centro de custo, cliente, etc.). */
function findInTags(tags: any): string | null {
  if (!tags) return null;
  // Huawei pode retornar tags como array de strings, array de {key,value} ou objeto.
  if (Array.isArray(tags)) {
    for (const t of tags) {
      if (!t) continue;
      if (typeof t === 'string') {
        const [k, ...rest] = t.split('=');
        const key = (k || '').trim().toLowerCase();
        const value = rest.join('=').trim();
        if (!value) continue;
        if (['centro_custo', 'centrodecusto', 'cost_center', 'cliente', 'client'].includes(key)) return value;
      } else if (typeof t === 'object') {
        const key = String((t.key ?? t.k ?? '')).trim().toLowerCase();
        const value = String((t.value ?? t.v ?? '')).trim();
        if (!value) continue;
        if (['centro_custo', 'centrodecusto', 'cost_center', 'cliente', 'client'].includes(key)) return value;
      }
    }
  }
  if (typeof tags === 'object') {
    const cand =
      (tags.centro_custo || tags.centrodecusto || tags.cost_center || tags.cliente || tags.client || '') as string;
    const t = String(cand || '').trim();
    if (t) return t;
  }
  return null;
}

function getClientNameFromMetadata(meta: Record<string, string> | undefined, tags?: any): string | null {
  const rawTag = findInTags(tags);
  const rawMeta =
    meta?.centro_custo ||
    meta?.centrodecusto ||
    meta?.cost_center ||
    meta?.cliente ||
    meta?.client ||
    '';
  const raw = (rawTag || rawMeta || '').toString();
  const t = raw.trim();
  if (!t) return null;
  return t.replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Prefixo comum dos nomes das ECS (ex.: ROLANDBI, ROLANDWEB → ROLAND). */
function commonPrefix(names: string[]): string {
  if (names.length === 0) return '';
  let prefix = (names[0] || '').trim();
  for (let i = 1; i < names.length && prefix; i++) {
    const n = (names[i] || '').trim();
    let j = 0;
    while (j < prefix.length && j < n.length && prefix[j].toUpperCase() === n[j].toUpperCase()) j++;
    prefix = prefix.slice(0, j);
  }
  return prefix;
}

/** A partir da lista de ECS, retorna o primeiro nome de cliente (centro de custo / cliente) ou prefixo comum dos nomes. */
function getClientNameFromEcsList(ecsList: HuaweiEcsServer[] | null): string | null {
  if (!ecsList?.length) return null;
  for (const s of ecsList) {
    const name = getClientNameFromMetadata(s.metadata, (s as any).tags);
    if (name) return name;
  }
  const names = ecsList.map((s) => s.name || s.id).filter(Boolean);
  const prefix = commonPrefix(names);
  if (prefix.length >= 2) {
    return prefix.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return null;
}

/** Título do projeto na seção ECS: "Ananim_<NomeCliente>" quando for perfil Ananim e houver nome nas ECS. */
function ecsProjectTitle(
  project: HuaweiProject | null,
  ecsList: HuaweiEcsServer[] | null
): string {
  if (!project) return '—';
  const name = projectDisplayName(project);
  const perfil = project.perfil;
  if (!perfil || !perfil.startsWith('ANANIMCLOUD_')) {
    return project.perfil ? `${displayPerfil(perfil)} — ${name}` : name;
  }
  const clientName = getClientNameFromEcsList(ecsList);
  const label = clientName ? `Ananim_${clientName}` : displayPerfil(perfil);
  return `${label} — ${name}`;
}

/** Formato curto do flavor: vCPUs x GB (ex.: 4x16). RAM da API Huawei vem em MB. */
function formatFlavor(flavor: HuaweiEcsServer['flavor']): string {
  if (!flavor?.vcpus) return '—';
  const vcpus = Number(flavor.vcpus) || 0;
  const ramMB = Number(flavor.ram) || 0;
  const ramGB = ramMB >= 1024 ? Math.round(ramMB / 1024) : ramMB;
  return ramGB ? `${vcpus}x${ramGB}` : String(vcpus);
}

/** Exibe tamanho dos discos: total em GB ou detalhe (ex.: 40 + 100 GB). */
function formatDiskSize(s: HuaweiEcsServer): string {
  if (s.totalDiskGb != null && s.totalDiskGb > 0) {
    const parts = s.volumeAttachments?.filter((v) => v.size > 0).map((v) => `${v.size} GB`);
    if (parts && parts.length > 1) return parts.join(' + ');
    return `${s.totalDiskGb} GB`;
  }
  return '—';
}

function formatMinutes(minutes: number | undefined): string {
  if (minutes === undefined || minutes <= 0) return '—';
  const mins = Math.round(minutes);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function EcsStatusBadge({ status }: { status: string }) {
  const s = (status || '').toUpperCase();
  const cfg =
    s === 'ACTIVE'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
      : s === 'SHUTOFF' || s === 'STOPPED'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
        : s === 'REBOOT' || s === 'HARD_REBOOT'
          ? 'bg-blue-500/15 text-blue-300 border-blue-500/25'
          : s === 'ERROR'
            ? 'bg-red-500/15 text-red-400 border-red-500/25'
            : 'bg-white/[0.06] text-gray-400 border-white/10';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cfg}`}>
      {status}
    </span>
  );
}

export default function Home() {
  const user = useUser();
  const canHuaweiAdmin = user?.role === 'admin' || (Array.isArray(user?.permissions) && user?.permissions.includes('huawei:projects'));
  const isAdmin = canHuaweiAdmin;
  const shouldAutoLoadBoundProject =
    user?.role === 'client' || (user?.role !== 'admin' && (user?.visibleProjects?.length ?? 0) === 1);
  const hideAutoLoadedProjectFilter = !isAdmin && shouldAutoLoadBoundProject;

  const [huaweiProjects, setHuaweiProjects] = useState<HuaweiProject[] | null>(() => {
    try {
      const raw = sessionStorage.getItem(HUAWEI_CACHE_KEY);
      if (raw) {
        const { data } = JSON.parse(raw);
        return Array.isArray(data) ? data : null;
      }
    } catch (_) {}
    return null;
  });
  const [huaweiLoading, setHuaweiLoading] = useState(false);
  const [huaweiError, setHuaweiError] = useState<string | null>(null);
  const [huaweiScope] = useState<'region' | 'all'>('region');
  const [huaweiSource] = useState<'master' | 'all_perfis'>('all_perfis');
  const [selectedProjects, setSelectedProjects] = useState<HuaweiProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<HuaweiProject | null>(null);
  const [huaweiEcs, setHuaweiEcs] = useState<HuaweiEcsServer[] | null>(null);
  const [huaweiEcsLoading, setHuaweiEcsLoading] = useState(false);
  const [huaweiEcsError, setHuaweiEcsError] = useState<string | null>(null);
  const [huaweiEcsActionLoading, setHuaweiEcsActionLoading] = useState<string | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [addUserTargetId, setAddUserTargetId] = useState<string | null>(null);
  const [addUserLoading, setAddUserLoading] = useState(false);
  // Busca/listagem removidas da Home (mantemos apenas Conta/Projeto).
  // Barra "Conta / Projeto" (modelo do portal antigo)
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>('');
  const [autoProjectApplied, setAutoProjectApplied] = useState(false);
  const [ecsClienteFilter, setEcsClienteFilter] = useState('');
  const [selectedEcsIds, setSelectedEcsIds] = useState<string[]>([]);
  const [showAssignEcsModal, setShowAssignEcsModal] = useState(false);
  const [assignEcsTargetId, setAssignEcsTargetId] = useState<string | null>(null);
  const [assignEcsLoading, setAssignEcsLoading] = useState(false);
  // Descobrir Projetos (fluxo CBR/tags)
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [discoveryAccounts, setDiscoveryAccounts] = useState<DiscoveryAccount[]>([]);
  const [discoverStep, setDiscoverStep] = useState<'account' | 'projects'>('account');
  const [discoverSelectedAccount, setDiscoverSelectedAccount] = useState<string | null>(null);
  const [discoveredProjects, setDiscoveredProjects] = useState<DiscoveredProject[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discoverSelectedIds, setDiscoverSelectedIds] = useState<Set<string>>(new Set());
  const [discoverApplyLoading, setDiscoverApplyLoading] = useState(false);
  // const [clearVisibleLoading, setClearVisibleLoading] = useState(false);
  // Programação (horário em que as VMs ficam ligadas) — admin
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<'project' | 'vm'>('project');
  const [skipNextStop, setSkipNextStop] = useState(false);
  const [cancelStopLoading, setCancelStopLoading] = useState(false);
  // Cancelar programação para um dia (modal na Home)
  const [showCancelScheduleModal, setShowCancelScheduleModal] = useState(false);
  const [cancelScheduleDate, setCancelScheduleDate] = useState('');
  const [cancelScheduleList, setCancelScheduleList] = useState<ScheduleVm[]>([]);
  const [cancelScheduleLoading, setCancelScheduleLoading] = useState(false);
  const [cancelScheduleSaving, setCancelScheduleSaving] = useState<string | null>(null);
  const [schedulesVmForProject, setSchedulesVmForProject] = useState<ScheduleVm[]>([]);

  useEffect(() => {
    if (isAdmin) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      setHuaweiProjects((prev) => (prev === null ? [] : prev));
    }, 20000);
    huawei
      .projects()
      .then((data) => {
        if (cancelled) return;
        setHuaweiProjects(data);
        const keySet = new Set(data.map((d) => projectKey(d)));
        setSelectedProjects((prev) => prev.filter((p) => keySet.has(projectKey(p))));
        sessionStorage.setItem(HUAWEI_CACHE_KEY, JSON.stringify({ data, scope: 'region', source: 'all_perfis' }));
      })
      .catch(() => { if (!cancelled) setHuaweiProjects([]); })
      .finally(() => { window.clearTimeout(timeout); });
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [isAdmin]);

  const loadHuaweiProjects = async () => {
    setHuaweiLoading(true);
    setHuaweiError(null);
    setSelectedProject(null);
    setHuaweiEcs(null);
    try {
      const data = await huawei.projects(huaweiScope, huaweiSource);
      setHuaweiProjects(data);
      const keySet = new Set(data.map((d) => projectKey(d)));
      setSelectedProjects((prev) => prev.filter((p) => keySet.has(projectKey(p))));
      sessionStorage.setItem(HUAWEI_CACHE_KEY, JSON.stringify({ data, scope: huaweiScope, source: huaweiSource }));
    } catch (e: unknown) {
      setHuaweiError(getErrorMessage(e));
      setHuaweiProjects(null);
    } finally {
      setHuaweiLoading(false);
    }
  };

  // No admin, carregar automaticamente a lista de projetos (mesmo comportamento "pronto para uso" da Programação).
  useEffect(() => {
    if (!isAdmin) return;
    if (huaweiLoading) return;
    if (huaweiProjects !== null) return;
    loadHuaweiProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, huaweiProjects, huaweiLoading]);

  // Removidos: seleção por checkbox/listagem na Home.

  const accountOptionsRaw = Array.from(
    new Set((huaweiProjects || []).map((p) => accountIdFromPerfil(p.perfil)).filter(Boolean) as string[])
  )
    .map((id) => ({ id, name: id }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Se o backend não enviar "perfil" (ex.: visibleProjects antigos), ainda precisamos permitir selecionar o projeto.
  const accountOptions = accountOptionsRaw.length > 0 ? accountOptionsRaw : [{ id: '__single__', name: 'minha conta' }];
  const effectiveAccount = accountOptionsRaw.length > 0 ? (selectedAccount || accountOptions[0].id) : '__single__';

  const projectOptions = (huaweiProjects || [])
    .filter((p) => {
      if (effectiveAccount === '__single__') return true;
      return accountIdFromPerfil(p.perfil) === effectiveAccount;
    })
    // Esconde "projetos raiz" de região (ex.: sa-brazil-1, ap-southeast-1). Exceção: MOOVE usa o tenantId cujo name vem como sa-brazil-1.
    .filter((p) => {
      const isMooveTenant = accountIdFromPerfil(p.perfil) === 'MOOVE_RAMOSISTEMAS' && isMooveTenantProject(p);
      if (isMooveTenant) return true;
      return !isRegionLikeProjectName(p.name) && !isRegionLikeProjectName(p.id);
    })
    // MOOVE: o IAM retorna um projeto "MOS" que NÃO deve ser selecionável (não é uma região ECS válida).
    // O projeto correto para listar ECS é o tenantId (079fd9...).
    .filter((p) => !(accountIdFromPerfil(p.perfil) === 'MOOVE_RAMOSISTEMAS' && isMooveMosProject(p)))
    .map((p) => ({ id: projectKey(p), name: projectDisplayName(p) }));

  const selectedProjectFromBar =
    selectedProjectKey ? (huaweiProjects || []).find((p) => projectKey(p) === selectedProjectKey) || null : null;

  // Proteção extra: se por algum motivo o projeto "MOS" entrar via cache/visibleProjects antigo,
  // redireciona automaticamente para o tenantId correto da MOOVE (079fd9...).
  const effectiveSelectedProject =
    selectedProjectFromBar && accountIdFromPerfil(selectedProjectFromBar.perfil) === 'MOOVE_RAMOSISTEMAS' && isMooveMosProject(selectedProjectFromBar)
      ? (huaweiProjects || []).find((p) => isMooveTenantProject(p)) || selectedProjectFromBar
      : selectedProjectFromBar;

  const loadableProjects = (huaweiProjects || [])
    .filter((p) => {
      const isMooveTenant = accountIdFromPerfil(p.perfil) === 'MOOVE_RAMOSISTEMAS' && isMooveTenantProject(p);
      if (isMooveTenant) return true;
      return !isRegionLikeProjectName(p.name) && !isRegionLikeProjectName(p.id);
    })
    .filter((p) => !(accountIdFromPerfil(p.perfil) === 'MOOVE_RAMOSISTEMAS' && isMooveMosProject(p)));

  useEffect(() => {
    if (!shouldAutoLoadBoundProject || autoProjectApplied || isAdmin) return;
    if (!huaweiProjects || huaweiProjects.length === 0) return;

    const preferredKeys = new Set((user?.visibleProjects || []).map((p) => projectKey(p as HuaweiProject)));
    const defaultProject =
      loadableProjects.find((p) => preferredKeys.has(projectKey(p))) ||
      loadableProjects[0] ||
      huaweiProjects.find((p) => preferredKeys.has(projectKey(p))) ||
      huaweiProjects[0] ||
      null;

    if (!defaultProject) return;

    const accountId = accountOptionsRaw.length > 0
      ? (accountIdFromPerfil(defaultProject.perfil) || accountOptionsRaw[0]?.id || '')
      : '';

    setSelectedAccount(accountId);
    setSelectedProjectKey(projectKey(defaultProject));
    setAutoProjectApplied(true);
    loadEcsForProject(defaultProject);
  }, [
    accountOptionsRaw,
    autoProjectApplied,
    huaweiProjects,
    isAdmin,
    loadableProjects,
    shouldAutoLoadBoundProject,
    user?.visibleProjects,
  ]);

  useEffect(() => {
    saveHomeProjectSelection({
      accountId: effectiveAccount === '__single__' ? null : effectiveAccount,
      project: effectiveSelectedProject
        ? {
            id: effectiveSelectedProject.id,
            name: effectiveSelectedProject.name,
            perfil: effectiveSelectedProject.perfil || null,
            region: effectiveSelectedProject.region || null,
            displayPerfil: effectiveSelectedProject.displayPerfil || null,
          }
        : null,
    });
  }, [effectiveAccount, effectiveSelectedProject]);

  const openAddUserModal = async () => {
    setShowAddUserModal(true);
    setAddUserTargetId(null);
    try {
      const list = await usersApi.list();
      setUsersList(list);
    } catch {
      setUsersList([]);
    }
  };

  const confirmAddUserVisibility = async () => {
    if (!addUserTargetId || selectedProjects.length === 0) return;
    setAddUserLoading(true);
    setHuaweiError(null);
    try {
      const target = await usersApi.get(addUserTargetId);
      const existing = (target.visibleProjects || []) as HuaweiProject[];
      const keys = new Set(existing.map(projectKey));
      const toAdd = selectedProjects.filter((p) => !keys.has(projectKey(p)));
      const merged = [...existing, ...toAdd];
      await usersApi.update(addUserTargetId, { visibleProjects: merged });
      setShowAddUserModal(false);
      setAddUserTargetId(null);
      setSelectedProjects([]);
    } catch (e: unknown) {
      setHuaweiEcsError(e instanceof Error ? e.message : 'Erro ao adicionar visão ao usuário.');
    } finally {
      setAddUserLoading(false);
    }
  };

  const loadEcsForProject = async (project: HuaweiProject, clienteFilter?: string) => {
    setSelectedProject(project);
    setSelectedEcsIds([]);
    setHuaweiEcsLoading(true);
    setHuaweiEcsError(null);
    const cliente = clienteFilter !== undefined ? clienteFilter : ecsClienteFilter;
    try {
      const pk = projectKey(project);
      const [data, schedData, vmSchedules] = await Promise.all([
        huawei.ecs(project.id, project.region || undefined, project.perfil, cliente.trim() || undefined),
        huawei.ecsSchedule(project.id, project.perfil).catch(() => ({ schedule: null, skipNextStop: false })),
        huawei.schedulesVm.list(pk, project.id),
      ]);
      setHuaweiEcs(data);
      setSkipNextStop(!!schedData?.skipNextStop);
      setSchedulesVmForProject(vmSchedules);
    } catch (e: unknown) {
      setHuaweiEcsError(e instanceof Error ? e.message : 'Erro ao carregar ECS do projeto.');
      setHuaweiEcs(null);
      setSchedulesVmForProject([]);
    } finally {
      setHuaweiEcsLoading(false);
    }
  };

  const onCancelStop = async () => {
    if (!selectedProject) return;
    setCancelStopLoading(true);
    setHuaweiEcsError(null);
    try {
      await huawei.cancelStop(selectedProject.id, selectedProject.perfil);
      setSkipNextStop(true);
    } catch (e: unknown) {
      setHuaweiEcsError(e instanceof Error ? e.message : 'Erro ao cancelar stop.');
    } finally {
      setCancelStopLoading(false);
    }
  };

  const toggleEcsSelection = (serverId: string) => {
    setSelectedEcsIds((prev) =>
      prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId]
    );
  };

  const isEcsSelected = (serverId: string) => selectedEcsIds.includes(serverId);

  const openAssignEcsModal = async () => {
    setShowAssignEcsModal(true);
    setAssignEcsTargetId(null);
    try {
      const list = await usersApi.list();
      setUsersList(list);
    } catch {
      setUsersList([]);
    }
  };

  const confirmAssignEcsToUser = async () => {
    if (!selectedProject || !assignEcsTargetId || selectedEcsIds.length === 0) return;
    setAssignEcsLoading(true);
    setHuaweiEcsError(null);
    try {
      const target = await usersApi.get(assignEcsTargetId);
      const key = projectKey(selectedProject);
      const mergedEcs = { ...(target.allowedHuaweiEcsIds || {}), [key]: selectedEcsIds };
      const existingProjects = (target.visibleProjects || []) as HuaweiProject[];
      const projectAlreadyVisible = existingProjects.some((p) => projectKey(p) === key);
      const visibleProjects = projectAlreadyVisible ? existingProjects : [...existingProjects, selectedProject];
      const payload: { allowedHuaweiEcsIds: typeof mergedEcs; visibleProjects?: HuaweiProject[] } = {
        allowedHuaweiEcsIds: mergedEcs,
      };
      if (!projectAlreadyVisible) payload.visibleProjects = visibleProjects;
      await usersApi.update(assignEcsTargetId, payload);
      setShowAssignEcsModal(false);
      setAssignEcsTargetId(null);
      setSelectedEcsIds([]);
    } catch (e: unknown) {
      setHuaweiEcsError(e instanceof Error ? e.message : 'Erro ao atribuir ECS ao usuário.');
    } finally {
      setAssignEcsLoading(false);
    }
  };

  const openScheduleModal = async () => {
    if (!selectedProject) return;
    const mode = selectedEcsIds.length > 0 ? 'vm' : 'project';
    setScheduleMode(mode);
    setShowScheduleModal(true);
    setScheduleError(null);
    try {
      const data = await huawei.ecsSchedule(selectedProject.id, selectedProject.perfil);
      setScheduleStart(data.schedule?.start || '08:00');
      setScheduleEnd(data.schedule?.end || '18:00');
      setSkipNextStop(!!data.skipNextStop);
    } catch {
      setScheduleStart('08:00');
      setScheduleEnd('18:00');
      setSkipNextStop(false);
    }
  };

  const openCancelScheduleModal = async () => {
    if (!selectedProject) return;
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    setCancelScheduleDate(`${y}-${m}-${d}`);
    setCancelScheduleList([]);
    setShowCancelScheduleModal(true);
    setCancelScheduleLoading(true);
    try {
      const pk = projectKey(selectedProject);
      const list = await huawei.schedulesVm.list(pk, selectedProject.id);
      setCancelScheduleList(list);
    } catch {
      setCancelScheduleList([]);
    } finally {
      setCancelScheduleLoading(false);
    }
  };

  const doCancelForDate = async (schedule: ScheduleVm) => {
    if (!selectedProject || !cancelScheduleDate) return;
    const key = `${schedule.id}-${schedule.action}`;
    setCancelScheduleSaving(key);
    try {
      await huawei.schedulesVm.cancelForDate(projectKey(selectedProject), schedule.serverId, cancelScheduleDate, schedule.action);
      setCancelScheduleList((prev) => prev.filter((s) => s.id !== schedule.id || s.action !== schedule.action));
    } catch {
      // manter na lista em caso de erro
    } finally {
      setCancelScheduleSaving(null);
    }
  };

  const saveSchedule = async () => {
    if (!selectedProject) return;
    setScheduleSaving(true);
    setScheduleError(null);
    try {
      if (scheduleMode === 'vm' && selectedEcsIds.length > 0) {
        const parseTime = (t: string) => {
          const [h, m] = t.split(':').map(Number);
          return { hour: h || 0, minute: m || 0 };
        };
        const pk = projectKey(selectedProject);
        const adds: Promise<unknown>[] = [];
        for (const serverId of selectedEcsIds) {
          const server = (huaweiEcs || []).find((e) => e.id === serverId);
          const serverName = server?.name || serverId;
          if (scheduleStart) {
            const { hour, minute } = parseTime(scheduleStart);
            adds.push(huawei.schedulesVm.add({
              projectKey: pk,
              projectId: selectedProject.id,
              region: selectedProject.region || null,
              perfil: selectedProject.perfil || null,
              serverId,
              serverName,
              action: 'start',
              hour,
              minute,
              days: null,
            }));
          }
          if (scheduleEnd) {
            const { hour, minute } = parseTime(scheduleEnd);
            adds.push(huawei.schedulesVm.add({
              projectKey: pk,
              projectId: selectedProject.id,
              region: selectedProject.region || null,
              perfil: selectedProject.perfil || null,
              serverId,
              serverName,
              action: 'stop',
              hour,
              minute,
              days: null,
            }));
          }
        }
        await Promise.all(adds);
        setShowScheduleModal(false);
      } else {
        await huawei.setEcsSchedule(
          selectedProject.id,
          { start: scheduleStart || undefined, end: scheduleEnd || undefined },
          selectedProject.perfil
        );
        setShowScheduleModal(false);
        await loadEcsForProject(selectedProject);
      }
    } catch (e: unknown) {
      setScheduleError(e instanceof Error ? e.message : 'Erro ao salvar programação.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const clearSchedule = async () => {
    if (!selectedProject) return;
    setScheduleSaving(true);
    setScheduleError(null);
    try {
      await huawei.setEcsSchedule(selectedProject.id, { start: '', end: '' }, selectedProject.perfil);
      setScheduleStart('');
      setScheduleEnd('');
      setShowScheduleModal(false);
      await loadEcsForProject(selectedProject);
    } catch (e: unknown) {
      setScheduleError(e instanceof Error ? e.message : 'Erro ao limpar programação.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const onHuaweiEcsAction = async (serverId: string, action: 'start' | 'stop' | 'restart', serverName?: string) => {
    if (!selectedProject) return;
    const key = `${serverId}-${action}`;
    setHuaweiEcsActionLoading(key);
    setHuaweiEcsError(null);
    try {
      await huawei.ecsAction(selectedProject.id, serverId, action, {
        region: selectedProject.region || undefined,
        perfil: selectedProject.perfil,
        serverName: serverName || undefined,
      });
      await loadEcsForProject(selectedProject);
    } catch (e: unknown) {
      setHuaweiEcsError(e instanceof Error ? e.message : `Erro ao executar ${action} no ECS.`);
    } finally {
      setHuaweiEcsActionLoading(null);
    }
  };

  const openDiscoverModal = async () => {
    setShowDiscoverModal(true);
    setDiscoverStep('account');
    setDiscoverError(null);
    setDiscoveredProjects([]);
    setDiscoverSelectedIds(new Set());
    try {
      const accounts = await huawei.discoveryAccounts();
      setDiscoveryAccounts(accounts);
      setDiscoverSelectedAccount(accounts.length ? accounts[0].id : null);
    } catch {
      setDiscoveryAccounts([]);
      setDiscoverError('Falha ao carregar contas.');
    }
  };

  const runDiscoverProjects = async () => {
    if (!discoverSelectedAccount) return;
    setDiscoverLoading(true);
    setDiscoverError(null);
    try {
      const { projects } = await huawei.discoverProjects(discoverSelectedAccount);
      setDiscoveredProjects(projects);
      setDiscoverStep('projects');
      setDiscoverSelectedIds(new Set(projects.filter((p) => p.status === 'novo').map((p) => p.id)));
    } catch (e: unknown) {
      setDiscoverError(e instanceof Error ? e.message : 'Falha ao descobrir projetos.');
    } finally {
      setDiscoverLoading(false);
    }
  };

  const toggleDiscoverSelect = (id: string) => {
    setDiscoverSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllDiscover = () => setDiscoverSelectedIds(new Set(discoveredProjects.map((p) => p.id)));
  const deselectAllDiscover = () => setDiscoverSelectedIds(new Set());

  const applyDiscoverProjects = async () => {
    const toAdd = discoveredProjects.filter((p) => discoverSelectedIds.has(p.id)).map((p) => ({ id: p.id, name: p.name, region: p.region, perfil: p.perfil }));
    if (toAdd.length === 0) {
      setDiscoverError('Selecione ao menos um projeto.');
      return;
    }
    setDiscoverApplyLoading(true);
    setDiscoverError(null);
    try {
      await huawei.applyVisibleProjects(toAdd);
      setShowDiscoverModal(false);
      setDiscoverStep('account');
      loadHuaweiProjects();
    } catch (e: unknown) {
      setDiscoverError(e instanceof Error ? e.message : 'Falha ao aplicar.');
    } finally {
      setDiscoverApplyLoading(false);
    }
  };

  // Removido: limpar/listar projetos (mantemos apenas Descobrir + seletor Conta/Projeto).

  return (
    <div className="ananim-page">
      <PageHeader
        badge="Home"
        title="Página inicial"
        description="Acompanhe projetos Huawei, ECS e programação com uma visão mais limpa, legível e pronta para operação."
      />

      {(isAdmin || huaweiProjects !== null) && (
        <div className="ananim-card p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <h3 className="ananim-section-title">
                {isAdmin ? 'Projetos Huawei (API real) — apenas administradores' : 'Meus projetos Huawei'}
              </h3>
              <p className="ananim-section-subtitle">
                Selecione conta e projeto para carregar ECS, status e ações operacionais com melhor contraste e leitura.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:min-w-[280px]">
              <div className="ananim-metric">
                <p className="ananim-metric-label">Contas</p>
                <p className="ananim-metric-value">{accountOptionsRaw.length || 1}</p>
              </div>
              <div className="ananim-metric">
                <p className="ananim-metric-label">Projetos</p>
                <p className="ananim-metric-value">{huaweiProjects?.length || 0}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {isAdmin && (
              <button
                type="button"
                onClick={openDiscoverModal}
                className="ananim-btn border border-purple-500/30 bg-purple-500/15 px-4 text-purple-100 hover:bg-purple-500/20"
              >
                Descobrir Projetos Automaticamente
              </button>
            )}
          </div>
          {huaweiError && (
            <div className="mt-4 ananim-alert-danger">{huaweiError}</div>
          )}
           {huaweiProjects && (
             <>
               {!hideAutoLoadedProjectFilter && (
                 <div className="mt-5 flex flex-wrap items-center gap-3">
                   <div className="flex items-center gap-3 flex-wrap">
                     <div className="rounded-3xl border border-white/10 bg-black/15 p-4 shadow-panel-sm">
                         <AccountProjectBar
                           accounts={accountOptions}
                           projects={projectOptions}
                           selectedAccount={effectiveAccount}
                           selectedProject={selectedProjectKey}
                           onChangeAccount={(id) => {
                           setSelectedAccount(id === '__single__' ? '' : id);
                            setSelectedProjectKey('');
                          }}
                           onChangeProject={(id) => setSelectedProjectKey(id)}
                           onLoad={() => {
                             if (effectiveSelectedProject) loadEcsForProject(effectiveSelectedProject);
                           }}
                           loading={huaweiEcsLoading || huaweiLoading}
                           requireProject
                         />
                     </div>
                   </div>
                 </div>
               )}
              {isAdmin && (
                <p className="mt-3 text-sm text-ananim-muted">Marque o checkbox para enviar o projeto para a tabela abaixo. Clique na linha para ver as ECS.</p>
              )}

              {isAdmin && selectedProjects.length > 0 && (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={openAddUserModal}
                    className="ananim-btn bg-amber-500/10 text-amber-200 border border-amber-500/30 hover:bg-amber-500/15 px-4 py-2"
                  >
                    Adicionar usuário à visão
                  </button>
                  <span className="text-xs text-ananim-muted">
                    {selectedProjects.length} projeto(s) selecionado(s) — escolha o usuário que poderá ver estes projetos ao logar.
                  </span>
                </div>
              )}

              {isAdmin && selectedProjects.length > 0 && (
                <div className="mt-6 border-t border-white/10 pt-5">
                  <h4 className="ananim-section-title">Projetos selecionados</h4>
                  <div className="ananim-table-wrap mt-3">
                    <table className="ananim-table">
                      <thead>
                        <tr>
                          <th>Perfil</th>
                          <th>Projeto</th>
                          <th>Região</th>
                          <th>Status do ambiente</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProjects.map((p) => (
                          <tr key={projectKey(p)}>
                            <td className="font-medium text-ananim-text">{p.displayPerfil ?? displayPerfil(p.perfil)}</td>
                            <td>{p.name || '(sem nome)'}</td>
                            <td>{p.region || '—'}</td>
                            <td className="capitalize">{p.enabled !== false ? 'Ativo' : 'Desativado'}</td>
                            <td>
                              <span className="inline-flex gap-1 items-center">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); loadEcsForProject(p); }}
                                  className="p-1.5 rounded hover:bg-white/[0.06] border border-transparent hover:border-white/10 text-ananim-muted hover:text-white transition-colors"
                                  title="Ver ECS"
                                >
                                  <ClipboardList className="w-4 h-4" aria-hidden="true" />
                                </button>
                                <Link
                                  to="/programacao"
                                  className="p-1.5 rounded hover:bg-white/[0.06] border border-transparent hover:border-white/10 text-ananim-muted hover:text-white transition-colors inline-flex"
                                  title="Programação"
                                >
                                  <Calendar className="w-4 h-4" aria-hidden="true" />
                                </Link>
                                <button
                                  type="button"
                                  className="p-1.5 rounded hover:bg-white/[0.06] border border-transparent hover:border-white/10 text-ananim-muted hover:text-white transition-colors"
                                  title="Atualizar"
                                  onClick={(e) => { e.stopPropagation(); loadEcsForProject(p); }}
                                >
                                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                                </button>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedProject && (
                <div className="mt-6 border-t border-white/10 pt-5">
                  <h4 className="ananim-section-title">
                    ECS do projeto: {ecsProjectTitle(selectedProject, huaweiEcs)}
                    {huaweiEcs?.[0]?.schedule?.start != null && huaweiEcs[0].schedule?.end != null && (
                      <span className="ml-2 text-sm font-normal text-ananim-muted">
                        (Horário geral: {huaweiEcs[0].schedule.start}–{huaweiEcs[0].schedule.end})
                      </span>
                    )}
                  </h4>
                  {schedulesVmForProject.length > 0 && (
                    <p className="mb-3 text-sm text-ananim-textSoft">
                      Agendamentos por VM (igual à página Programação):{' '}
                      {schedulesVmForProject
                        .map(
                          (s) =>
                            `${s.serverName} ${s.action === 'stop' ? 'Stop' : 'Start'} ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
                        )
                        .join('; ')}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <label className="ananim-label mb-0">Filtrar por cliente (como CBR)</label>
                    <input
                      type="search"
                      value={ecsClienteFilter}
                      onChange={(e) => setEcsClienteFilter(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadEcsForProject(selectedProject)}
                      placeholder="centro_custo, metadata.cliente ou nome da ECS"
                      className="ananim-input min-w-[220px] max-w-sm flex-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => loadEcsForProject(selectedProject)}
                      disabled={huaweiEcsLoading}
                      className="ananim-btn-primary px-3 py-2"
                    >
                      Buscar ECS
                    </button>
                    <button
                      type="button"
                      onClick={openCancelScheduleModal}
                      className="ananim-btn border border-amber-500/30 bg-amber-500/10 px-3 text-amber-100 hover:bg-amber-500/15"
                      title="Cancelar programação (start ou stop) para um dia específico"
                    >
                      Cancelar programação
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={openScheduleModal}
                          className="ananim-btn-ghost px-3 py-2"
                          title="Horário em que as VMs deste projeto ficam ligadas (marcador de horas a mais)"
                        >
                          Definir programação
                        </button>
                    {huaweiEcs?.[0]?.schedule?.start && huaweiEcs[0].schedule?.end && (
                          skipNextStop ? (
                            <span className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100" title="O próximo stop programado foi cancelado">
                              Stop cancelado (prorrogação)
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={onCancelStop}
                              disabled={cancelStopLoading}
                              className="ananim-btn border border-emerald-500/30 bg-emerald-500/10 px-3 text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-50"
                              title="Cancela o próximo stop programado (extensão de horário)"
                            >
                              {cancelStopLoading ? '...' : 'Cancelar stop'}
                            </button>
                          )
                        )}
                        {selectedEcsIds.length > 0 && (
                          <>
                            <span className="text-xs text-ananim-muted">{selectedEcsIds.length} ECS selecionada(s)</span>
                            <button
                              type="button"
                              onClick={openAssignEcsModal}
                              className="ananim-btn bg-amber-500/10 text-amber-200 border border-amber-500/30 hover:bg-amber-500/15 px-3 py-2"
                            >
                              Atribuir ECS ao usuário
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  {huaweiEcsLoading && <p className="text-sm text-ananim-muted">Carregando ECS...</p>}
                  {huaweiEcsError && <div className="ananim-alert-danger mt-3">{huaweiEcsError}</div>}
                  {huaweiEcs && !huaweiEcsLoading && (
                    <div className="ananim-table-wrap mt-4">
                      <table className="ananim-table">
                        <thead>
                          <tr>
                            {isAdmin && <th className="w-10 text-center"> </th>}
                            <th>Nome</th>
                            {isAdmin && <th>ID</th>}
                            <th>Cliente (metadata)</th>
                            <th>Status</th>
                            <th>Flavor</th>
                            <th>Disco(s)</th>
                            <th>IPs</th>
                            <th title="Tempo fora do horário programado: ex.: cancelou a programação do dia ou ligou a VM após o horário de início">Horas a mais</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {huaweiEcs.length === 0 ? (
                            <tr><td colSpan={isAdmin ? 10 : 8} className="py-5 text-center text-ananim-muted">Nenhuma ECS neste projeto.{ecsClienteFilter.trim() ? ' Tente outro filtro de cliente.' : ''}</td></tr>
                          ) : (
                            huaweiEcs.map((s) => {
                              const ips = s.addresses
                                ? Object.values(s.addresses).flat().map((a) => a.addr).filter(Boolean).join(', ')
                                : '—';
                              const metaCliente = s.metadata?.centro_custo || s.metadata?.centrodecusto || s.metadata?.cost_center || s.metadata?.cliente || s.metadata?.client || '—';
                              const loading = huaweiEcsActionLoading !== null;
                              return (
                                <tr key={s.id}>
                                  {isAdmin && (
                                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        checked={isEcsSelected(s.id)}
                                        onChange={() => toggleEcsSelection(s.id)}
                                        className="rounded border-white/20 bg-transparent"
                                        title="Selecionar para atribuir a um usuário"
                                      />
                                    </td>
                                  )}
                                  <td className="font-medium text-ananim-text">{s.name || s.id}</td>
                                  {isAdmin && <td className="font-mono text-xs">{s.id}</td>}
                                  <td>{metaCliente}</td>
                                  <td><EcsStatusBadge status={s.status} /></td>
                                  <td>{formatFlavor(s.flavor)}</td>
                                  <td>{formatDiskSize(s)}</td>
                                  <td>{ips || '—'}</td>
                                  <td className="font-medium text-ananim-text" title={(s.extraHours ?? 0) > 0 ? `Extensão de horário: ${Math.round(Number(s.extraHours) * 60)} min (cancelou o dia ou ligou a VM após o horário). Cobrança por hora cheia.` : 'Nenhuma extensão de horário'}>
                                    {formatMinutes(s.extraHours ? Math.round(Number(s.extraHours) * 60) : undefined)}
                                  </td>
                                  <td>
                                    <span className="inline-flex flex-wrap gap-1">
                                      <button
                                        type="button"
                                        onClick={() => onHuaweiEcsAction(s.id, 'start', s.name)}
                                        disabled={loading}
                                        className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-200 border border-emerald-500/20 text-xs font-medium hover:bg-emerald-500/15 disabled:opacity-50"
                                        title="Ligar ECS"
                                      >
                                        Ligar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onHuaweiEcsAction(s.id, 'stop', s.name)}
                                        disabled={loading}
                                        className="px-2 py-1 rounded bg-amber-500/10 text-amber-200 border border-amber-500/20 text-xs font-medium hover:bg-amber-500/15 disabled:opacity-50"
                                        title="Parar ECS"
                                      >
                                        Stop
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onHuaweiEcsAction(s.id, 'restart', s.name)}
                                        disabled={loading}
                                        className="px-2 py-1 rounded bg-ananim-accent/10 text-ananim-accent border border-ananim-accent/20 text-xs font-medium hover:bg-ananim-accent/15 disabled:opacity-50"
                                        title="Reiniciar ECS"
                                      >
                                        Restart
                                      </button>
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {showScheduleModal && selectedProject && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !scheduleSaving && setShowScheduleModal(false)}>
              <div className="ananim-card p-6 max-w-md w-full shadow-lg shadow-black/30" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-medium text-white mb-2">
                  {scheduleMode === 'vm'
                    ? `Programação — ${selectedEcsIds.length} VM(s) selecionada(s)`
                    : 'Programação geral do projeto'}
                </h3>
                <p className="text-sm text-ananim-textSoft mb-3">
                  {scheduleMode === 'vm'
                    ? `Cria agendamentos de Start e Stop para as ${selectedEcsIds.length} VM(s) selecionadas. Aparecem na página Programação.`
                    : 'Horário em que as VMs deste projeto ficam ligadas. Fora desse intervalo, o marcador "Horas a mais" acumula.'}
                </p>
                {scheduleError && <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg text-sm">{scheduleError}</div>}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="ananim-label">Início (HH:mm)</label>
                    <input
                      type="time"
                      value={scheduleStart}
                      onChange={(e) => setScheduleStart(e.target.value)}
                      className="ananim-input"
                    />
                  </div>
                  <div>
                    <label className="ananim-label">Fim (HH:mm)</label>
                    <input
                      type="time"
                      value={scheduleEnd}
                      onChange={(e) => setScheduleEnd(e.target.value)}
                      className="ananim-input"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => !scheduleSaving && setShowScheduleModal(false)}
                    className="ananim-btn-ghost"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={clearSchedule}
                    disabled={scheduleSaving}
                    className="ananim-btn bg-amber-500/10 text-amber-200 border border-amber-500/30 hover:bg-amber-500/15 disabled:opacity-50"
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    onClick={saveSchedule}
                    disabled={scheduleSaving}
                    className="ananim-btn-primary disabled:opacity-60"
                  >
                    {scheduleSaving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showCancelScheduleModal && selectedProject && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCancelScheduleModal(false)}>
              <div className="ananim-card p-6 max-w-lg w-full max-h-[90vh] flex flex-col shadow-lg shadow-black/30" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-medium text-white mb-2">Cancelar programação para um dia</h3>
                <p className="text-sm text-ananim-textSoft mb-3">
                  No dia escolhido o agendamento não será executado. No dia seguinte a programação oficial volta a valer.
                </p>
                <div className="mb-3">
                  <label className="ananim-label">Data</label>
                  <input
                    type="date"
                    value={cancelScheduleDate}
                    onChange={(e) => setCancelScheduleDate(e.target.value)}
                    className="ananim-input"
                  />
                </div>
                {cancelScheduleLoading && <p className="text-sm text-ananim-muted mb-2">Carregando agendamentos...</p>}
                {!cancelScheduleLoading && cancelScheduleList.length === 0 && (
                  <p className="text-sm text-ananim-muted mb-3">Nenhum agendamento por VM neste projeto. Crie em Programação.</p>
                )}
                {!cancelScheduleLoading && cancelScheduleList.length > 0 && (
                  <div className="flex-1 overflow-y-auto border border-white/10 rounded-lg mb-4 bg-white/[0.02]">
                    <ul className="divide-y divide-white/10">
                      {cancelScheduleList.map((s) => {
                        const timeStr = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
                        const key = `${s.id}-${s.action}`;
                        return (
                          <li key={key} className="flex items-center justify-between gap-2 px-3 py-2">
                            <span className="text-sm">
                              {s.serverName} — {s.action === 'stop' ? 'Stop' : 'Start'} às {timeStr}
                            </span>
                            <button
                              type="button"
                              onClick={() => doCancelForDate(s)}
                              disabled={cancelScheduleSaving === key}
                              className="text-sm px-2 py-1 rounded bg-amber-500/10 text-amber-200 border border-amber-500/30 hover:bg-amber-500/15 disabled:opacity-50"
                            >
                              {cancelScheduleSaving === key ? '...' : 'Cancelar para este dia'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCancelScheduleModal(false)}
                    className="ananim-btn-ghost"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}

          {showAddUserModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="ananim-card p-6 max-w-md w-full shadow-lg shadow-black/30">
                <h3 className="text-lg font-medium text-white mb-2">Adicionar usuário à visão</h3>
                <p className="text-sm text-ananim-textSoft mb-3">
                  O usuário selecionado poderá ver estes {selectedProjects.length} projeto(s) sempre que logar.
                </p>
                {huaweiEcsError && <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg text-sm">{huaweiEcsError}</div>}
                <div className="mb-4 max-h-48 overflow-y-auto border border-white/10 rounded-lg bg-white/[0.02]">
                  {usersList.length === 0 ? (
                    <p className="p-3 text-sm text-ananim-muted">Nenhum usuário encontrado.</p>
                  ) : (
                    <ul className="divide-y divide-white/10">
                      {usersList.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => setAddUserTargetId(addUserTargetId === u.id ? null : u.id)}
                            className={`w-full text-left px-3 py-2 text-sm ${addUserTargetId === u.id ? 'bg-ananim-accent/10 font-medium' : 'hover:bg-white/[0.03]'}`}
                          >
                            {u.name} — {u.email}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setShowAddUserModal(false); setAddUserTargetId(null); setHuaweiEcsError(null); }}
                    className="ananim-btn-ghost"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmAddUserVisibility}
                    disabled={!addUserTargetId || addUserLoading}
                    className="ananim-btn bg-amber-500/10 text-amber-200 border border-amber-500/30 hover:bg-amber-500/15 disabled:opacity-50"
                  >
                    {addUserLoading ? 'Salvando...' : 'Conceder visão'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showAssignEcsModal && selectedProject && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="ananim-card p-6 max-w-md w-full shadow-lg shadow-black/30">
                <h3 className="text-lg font-medium text-white mb-2">Atribuir ECS ao usuário</h3>
                <p className="text-sm text-ananim-textSoft mb-3">
                  O usuário selecionado verá apenas estas {selectedEcsIds.length} ECS neste projeto ({ecsProjectTitle(selectedProject, huaweiEcs)}) e poderá fazer start/stop/restart nelas.
                </p>
                {huaweiEcsError && <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg text-sm">{huaweiEcsError}</div>}
                <div className="mb-4 max-h-48 overflow-y-auto border border-white/10 rounded-lg bg-white/[0.02]">
                  {usersList.length === 0 ? (
                    <p className="p-3 text-sm text-ananim-muted">Nenhum usuário encontrado.</p>
                  ) : (
                    <ul className="divide-y divide-white/10">
                      {usersList.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => setAssignEcsTargetId(assignEcsTargetId === u.id ? null : u.id)}
                            className={`w-full text-left px-3 py-2 text-sm ${assignEcsTargetId === u.id ? 'bg-ananim-accent/10 font-medium' : 'hover:bg-white/[0.03]'}`}
                          >
                            {u.name} — {u.email}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setShowAssignEcsModal(false); setAssignEcsTargetId(null); setHuaweiEcsError(null); }}
                    className="ananim-btn-ghost"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmAssignEcsToUser}
                    disabled={!assignEcsTargetId || assignEcsLoading}
                    className="ananim-btn bg-amber-500/10 text-amber-200 border border-amber-500/30 hover:bg-amber-500/15 disabled:opacity-50"
                  >
                    {assignEcsLoading ? 'Salvando...' : 'Atribuir ECS'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showDiscoverModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="ananim-card p-6 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-lg shadow-black/30">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-white">
                    {discoverStep === 'account' ? 'Selecionar Conta para Descoberta' : `Projetos Descobertos para: ${discoverSelectedAccount?.toLowerCase() || ''}`}
                  </h3>
                  <button type="button" onClick={() => { setShowDiscoverModal(false); setDiscoverStep('account'); }} className="text-ananim-muted hover:text-white text-xl leading-none">&times;</button>
                </div>
                {discoverError && <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg text-sm">{discoverError}</div>}
                {discoverStep === 'account' && (
                  <>
                    <p className="text-sm text-ananim-textSoft mb-3">Selecione a conta para descobrir projetos:</p>
                    <div className="flex flex-col gap-2 mb-4 max-h-48 overflow-y-auto">
                      {discoveryAccounts.map((acc) => (
                        <label key={acc.id} className={`flex items-center gap-2 p-2 rounded-lg border border-white/10 bg-white/[0.02] cursor-pointer ${!acc.available ? 'opacity-60' : ''}`}>
                          <input
                            type="radio"
                            name="discoverAccount"
                            checked={discoverSelectedAccount === acc.id}
                            onChange={() => setDiscoverSelectedAccount(acc.id)}
                            disabled={!acc.available}
                          />
                          <span className="text-sm">{acc.label}</span>
                          {acc.projectId && <span className="text-xs text-ananim-muted">(Região: {acc.region}, Project ID: {acc.projectId.slice(0, 8)}…)</span>}
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => { setShowDiscoverModal(false); }} className="ananim-btn-ghost">Cancelar</button>
                      <button type="button" onClick={runDiscoverProjects} disabled={!discoverSelectedAccount || discoverLoading} className="ananim-btn bg-purple-500/20 text-purple-200 border border-purple-500/30 hover:bg-purple-500/25 disabled:opacity-50 px-4 py-2">{discoverLoading ? 'Descobrindo...' : 'Descobrir'}</button>
                    </div>
                  </>
                )}
                {discoverStep === 'projects' && (
                  <>
                    <div className="ananim-table-wrap flex-1 overflow-auto mb-4">
                      <table className="ananim-table min-w-[720px]">
                        <thead className="sticky top-0">
                          <tr>
                            <th className="w-10">Adicionar</th>
                            <th>Nome do Perfil</th>
                            <th>Project ID</th>
                            <th>Região</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {discoveredProjects.map((p) => (
                            <tr key={p.id} className={p.status === 'novo' ? 'bg-emerald-500/10' : ''}>
                              <td className="py-1 px-2">
                                <input type="checkbox" checked={discoverSelectedIds.has(p.id)} onChange={() => toggleDiscoverSelect(p.id)} />
                              </td>
                              <td className="py-1 px-3">{displayPerfil(p.perfil)}</td>
                              <td className="py-1 px-3 font-mono text-xs">{p.id.slice(0, 8)}…</td>
                              <td className="py-1 px-3">{p.region}</td>
                              <td className="py-1 px-3">{p.status === 'novo' ? 'Novo' : 'Já existe'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button type="button" onClick={selectAllDiscover} className="ananim-btn bg-ananim-accent/10 text-ananim-accent border border-ananim-accent/30 hover:bg-ananim-accent/15 px-3 py-1.5 text-sm">Selecionar Todos</button>
                      <button type="button" onClick={deselectAllDiscover} className="ananim-btn bg-red-500/10 text-red-200 border border-red-500/30 hover:bg-red-500/15 px-3 py-1.5 text-sm">Desmarcar Todos</button>
                      <button type="button" onClick={() => { setDiscoverStep('account'); }} className="ananim-btn-ghost px-3 py-1.5 text-sm">Cancelar</button>
                      <button type="button" onClick={applyDiscoverProjects} disabled={discoverApplyLoading} className="ananim-btn bg-emerald-500/10 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-500/15 disabled:opacity-50 px-3 py-1.5 text-sm">{discoverApplyLoading ? 'Aplicando...' : 'Aplicar Mudanças'}</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
