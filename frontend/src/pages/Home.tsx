import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { huawei, users as usersApi, type HuaweiProject, type HuaweiEcsServer, type User, type DiscoveryAccount, type DiscoveredProject, type ScheduleVm } from '../api/client';
import { useUser } from '../hooks/useUser';
import { getErrorMessage } from '../utils/errorMessage';
import AccountProjectBar from '../components/AccountProjectBar';

const HUAWEI_CACHE_KEY = 'huawei_projects_cache';

function projectKey(p: HuaweiProject) {
  return p.perfil ? `${p.perfil}-${p.id}` : p.id;
}

/** Exibe o nome do perfil; quando o backend envia displayPerfil (ex.: ANANIM_ROLAND para operador), use p.displayPerfil na lista. */
function displayPerfil(perfil: string | undefined): string {
  if (!perfil) return '—';
  return perfil;
}

/** Nome do cliente a partir dos metadados da ECS (centro de custo, cliente, etc.). */
function getClientNameFromMetadata(meta: Record<string, string> | undefined): string | null {
  if (!meta) return null;
  const raw =
    meta.centro_custo ||
    meta.centrodecusto ||
    meta.cost_center ||
    meta.cliente ||
    meta.client ||
    '';
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
    const name = getClientNameFromMetadata(s.metadata);
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
  const name = project.name || project.id || '';
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

export default function Home() {
  const user = useUser();
  const canHuaweiAdmin = user?.role === 'admin' || (Array.isArray(user?.permissions) && user?.permissions.includes('huawei:projects'));
  const isAdmin = canHuaweiAdmin;

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
  const [huaweiScope, setHuaweiScope] = useState<'region' | 'all'>(() => {
    try {
      const raw = sessionStorage.getItem(HUAWEI_CACHE_KEY);
      if (raw) {
        const { scope } = JSON.parse(raw);
        return scope === 'all' ? 'all' : 'region';
      }
    } catch (_) {}
    return 'region';
  });
  const [huaweiSource, setHuaweiSource] = useState<'master' | 'all_perfis'>(() => {
    try {
      const raw = sessionStorage.getItem(HUAWEI_CACHE_KEY);
      if (raw) {
        const { source } = JSON.parse(raw);
        return source === 'master' ? 'master' : 'all_perfis';
      }
    } catch (_) {}
    return 'all_perfis';
  });
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
  const [huaweiSearch] = useState('');
  const [showProjectsList, setShowProjectsList] = useState(false);
  // Barra "Conta / Projeto" (modelo do portal antigo)
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>('');
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
  const [clearVisibleLoading, setClearVisibleLoading] = useState(false);
  // Programação (horário em que as VMs ficam ligadas) — admin
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
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

  const toggleProjectSelection = (p: HuaweiProject) => {
    const key = projectKey(p);
    setSelectedProjects((prev) => {
      const exists = prev.some((x) => projectKey(x) === key);
      if (exists) return prev.filter((x) => projectKey(x) !== key);
      return [...prev, p];
    });
  };

  const isProjectSelected = (p: HuaweiProject) => selectedProjects.some((x) => projectKey(x) === projectKey(p));

  const searchLower = huaweiSearch.trim().toLowerCase();
  const baseProjects =
    huaweiProjects && searchLower
      ? huaweiProjects.filter(
          (p) =>
            (p.displayPerfil || '').toLowerCase().includes(searchLower) ||
            (p.perfil || '').toLowerCase().includes(searchLower) ||
            (p.name || '').toLowerCase().includes(searchLower) ||
            (p.id || '').toLowerCase().includes(searchLower) ||
            (p.region || '').toLowerCase().includes(searchLower)
        )
      : huaweiProjects ?? [];

  const filteredProjects = baseProjects;

  const accountOptionsRaw = Array.from(
    new Set((huaweiProjects || []).map((p) => (p.perfil || '')).filter(Boolean))
  )
    .map((perfil) => ({ id: perfil, name: perfil.toLowerCase() }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Para usuários não-admin, pode vir projeto sem "perfil". Ainda assim precisamos permitir seleção por projeto.
  const accountOptions = accountOptionsRaw.length > 0 ? accountOptionsRaw : [{ id: '__single__', name: 'minha conta' }];

  const effectiveAccount = accountOptionsRaw.length > 0 ? selectedAccount : '__single__';

  const projectOptions = (huaweiProjects || [])
    .filter((p) => accountOptionsRaw.length === 0 || !effectiveAccount || effectiveAccount === '__single__' || (p.perfil || '') === effectiveAccount)
    .map((p) => ({ id: projectKey(p), name: p.name || p.id }));

  const selectedProjectFromBar =
    selectedProjectKey ? (huaweiProjects || []).find((p) => projectKey(p) === selectedProjectKey) || null : null;

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
      await huawei.setEcsSchedule(
        selectedProject.id,
        { start: scheduleStart || undefined, end: scheduleEnd || undefined },
        selectedProject.perfil
      );
      setShowScheduleModal(false);
      await loadEcsForProject(selectedProject);
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

  const clearVisibleProjects = async () => {
    if (!window.confirm('Limpar lista de projetos visíveis? Você poderá buscar novamente com a nova implementação.')) return;
    setClearVisibleLoading(true);
    setHuaweiError(null);
    try {
      await huawei.clearVisibleProjects();
      sessionStorage.removeItem(HUAWEI_CACHE_KEY);
      setHuaweiProjects([]);
      setSelectedProjects([]);
      setSelectedProject(null);
      setHuaweiEcs(null);
    } catch (e: unknown) {
      setHuaweiError(getErrorMessage(e));
    } finally {
      setClearVisibleLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <img src="/ananim-mark.png" alt="Ananim" className="h-10 w-10 object-contain" />
        <h2 className="text-xl font-semibold font-display text-white">Página inicial</h2>
      </div>

      {(isAdmin || huaweiProjects !== null) && (
        <div className="ananim-card p-4 mb-6">
          <h3 className="text-lg font-medium text-white mb-2">
            {isAdmin ? 'Projetos Huawei (API real) — apenas administradores' : 'Meus projetos Huawei'}
          </h3>
          {isAdmin && (
            <p className="text-sm text-gray-300 mb-3">
              Use <code className="bg-white/[0.06] px-1 rounded">config.enc</code> + <code className="bg-white/[0.06] px-1 rounded">.encryption_key</code> (CBR) ou <code className="bg-white/[0.06] px-1 rounded">.env</code>. Perfis: NOME_ACCESS_KEY, NOME_SECRET_KEY, NOME_PROJECT_ID, NOME_REGION.
            </p>
          )}
          {isAdmin && (
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <label className="text-sm text-gray-300">Fonte:</label>
            <select
              value={huaweiSource}
              onChange={(e) => setHuaweiSource(e.target.value as 'master' | 'all_perfis')}
              className="ananim-input w-auto px-2 py-1.5 text-sm"
            >
              <option value="all_perfis">Todas as contas (perfis do config)</option>
              <option value="master">Uma conta (master)</option>
            </select>
            <label className="text-sm text-gray-300">Listar:</label>
            <select
              value={huaweiScope}
              onChange={(e) => setHuaweiScope(e.target.value as 'region' | 'all')}
              className="ananim-input w-auto px-2 py-1.5 text-sm"
            >
              <option value="region">Apenas região de cada conta</option>
              <option value="all">Todos os projetos de cada conta</option>
            </select>
            <button
              type="button"
              onClick={loadHuaweiProjects}
              disabled={huaweiLoading}
              className="ananim-btn-primary px-4 py-2 disabled:opacity-60"
            >
              {huaweiLoading ? 'Carregando...' : 'Carregar projetos Huawei'}
            </button>
            <button
              type="button"
              onClick={openDiscoverModal}
              className="ananim-btn bg-purple-500/20 text-purple-200 border border-purple-500/30 hover:bg-purple-500/25 px-4 py-2"
            >
              Descobrir Projetos Automaticamente
            </button>
            <button
              type="button"
              onClick={clearVisibleProjects}
              disabled={clearVisibleLoading}
              className="ananim-btn-ghost px-4 py-2 disabled:opacity-60"
              title="Limpa a lista fixa visível para buscar novamente com a nova implementação"
            >
              {clearVisibleLoading ? 'Limpando...' : 'Limpar projetos visíveis'}
            </button>
          </div>
          )}
          {huaweiError && (
            <p className="mt-3 text-sm text-red-600">{huaweiError}</p>
          )}
           {huaweiProjects && (
             <>
               <div className="mt-4 flex flex-wrap items-center gap-3">
                 <div className="flex items-center gap-3 flex-wrap">
                   <div className="rounded-2xl bg-black/20 border border-white/10 p-3">
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
                         if (selectedProjectFromBar) loadEcsForProject(selectedProjectFromBar);
                       }}
                       loading={huaweiEcsLoading || huaweiLoading}
                       requireProject
                     />
                   </div>
                   <button
                     type="button"
                     className="ananim-btn-ghost px-4 py-2"
                     onClick={() => setShowProjectsList((v) => !v)}
                   >
                     {showProjectsList ? 'Ocultar lista' : 'Ver lista de projetos'}
                   </button>
                 </div>
               </div>

              {showProjectsList && (
                <div className="mt-4 overflow-x-auto border border-white/10 rounded-lg bg-white/[0.02]">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.04] border-b border-white/10">
                      <tr>
                        {isAdmin && <th className="w-10 py-2 px-2 text-center font-semibold text-gray-200"> </th>}
                        <th className="text-left py-2 px-3 font-semibold text-gray-200">Perfil</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-200">Projeto</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-200">Região</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-200">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjects.length === 0 ? (
                        <tr>
                          <td colSpan={isAdmin ? 5 : 4} className="py-6 px-3 text-center text-gray-400">
                            {huaweiSearch.trim() ? 'Nenhum projeto encontrado para esta busca.' : 'Nenhum projeto carregado.'}
                          </td>
                        </tr>
                      ) : (
                        filteredProjects.map((p) => (
                          <tr
                            key={projectKey(p)}
                            onClick={() => loadEcsForProject(p)}
                            className={`border-b border-white/10 cursor-pointer hover:bg-white/[0.03] ${selectedProject?.id === p.id && selectedProject?.perfil === p.perfil ? 'bg-ananim-accent/10' : ''}`}
                          >
                            {isAdmin && (
                              <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isProjectSelected(p)}
                                  onChange={() => toggleProjectSelection(p)}
                                  className="rounded border-gray-300"
                                />
                              </td>
                            )}
                            <td className="py-2 px-3 font-medium">{displayPerfil(p.perfil)}</td>
                            <td className="py-2 px-3">{p.name || '(sem nome)'}</td>
                            <td className="py-2 px-3 text-gray-300">{p.region || '—'}</td>
                            <td className="py-2 px-3">{p.enabled ? 'Ativo' : 'Desativado'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {isAdmin && (
                <p className="mt-2 text-xs text-gray-400">Marque o checkbox para enviar o projeto para a tabela abaixo. Clique na linha para ver as ECS.</p>
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
                  <span className="text-xs text-gray-400">
                    {selectedProjects.length} projeto(s) selecionado(s) — escolha o usuário que poderá ver estes projetos ao logar.
                  </span>
                </div>
              )}

              {isAdmin && selectedProjects.length > 0 && (
                <div className="mt-6 pt-4 border-t border-white/10">
                  <h4 className="text-base font-medium text-white mb-2">Projetos selecionados</h4>
                  <div className="overflow-x-auto border border-white/10 rounded-lg bg-white/[0.02]">
                    <table className="w-full text-sm">
                      <thead className="bg-white/[0.04] border-b border-white/10">
                        <tr>
                          <th className="text-left py-2 px-3 font-semibold text-gray-200">Perfil</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-200">Projeto</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-200">Região</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-200">Status do Ambiente</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-200">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProjects.map((p) => (
                          <tr key={projectKey(p)} className="border-b border-white/10 hover:bg-white/[0.03]">
                            <td className="py-2 px-3 font-medium">{p.displayPerfil ?? displayPerfil(p.perfil)}</td>
                            <td className="py-2 px-3">{p.name || '(sem nome)'}</td>
                            <td className="py-2 px-3 text-gray-300">{p.region || '—'}</td>
                            <td className="py-2 px-3 capitalize">{p.enabled !== false ? 'Ativo' : 'Desativado'}</td>
                            <td className="py-2 px-3">
                              <span className="inline-flex gap-1 items-center">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); loadEcsForProject(p); }}
                                  className="p-1 rounded hover:bg-white/[0.06] border border-transparent hover:border-white/10"
                                  title="Ver ECS"
                                >
                                  📋
                                </button>
                                <Link
                                  to="/programacao"
                                  className="p-1 rounded hover:bg-white/[0.06] border border-transparent hover:border-white/10"
                                  title="Programação"
                                >
                                  📅
                                </Link>
                                <button
                                  type="button"
                                  className="p-1 rounded hover:bg-white/[0.06] border border-transparent hover:border-white/10"
                                  title="Atualizar"
                                  onClick={(e) => { e.stopPropagation(); loadEcsForProject(p); }}
                                >
                                  🔄
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
                <div className="mt-6 pt-4 border-t border-white/10">
                  <h4 className="text-base font-medium text-white mb-2">
                    ECS do projeto: {ecsProjectTitle(selectedProject, huaweiEcs)}
                    {huaweiEcs?.[0]?.schedule?.start != null && huaweiEcs[0].schedule?.end != null && (
                      <span className="ml-2 text-sm font-normal text-gray-400">
                        (Horário geral: {huaweiEcs[0].schedule.start}–{huaweiEcs[0].schedule.end})
                      </span>
                    )}
                  </h4>
                  {schedulesVmForProject.length > 0 && (
                    <p className="text-sm text-gray-300 mb-2">
                      Agendamentos por VM (igual à página Programação):{' '}
                      {schedulesVmForProject
                        .map(
                          (s) =>
                            `${s.serverName} ${s.action === 'stop' ? 'Stop' : 'Start'} ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`
                        )
                        .join('; ')}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <label className="text-sm font-medium text-gray-200">Filtrar por cliente (como CBR):</label>
                    <input
                      type="search"
                      value={ecsClienteFilter}
                      onChange={(e) => setEcsClienteFilter(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadEcsForProject(selectedProject)}
                      placeholder="centro_custo, metadata.cliente ou nome da ECS"
                      className="ananim-input flex-1 min-w-[180px] max-w-sm text-sm"
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
                      className="ananim-btn bg-amber-500/10 text-amber-200 border border-amber-500/30 hover:bg-amber-500/15 px-3 py-2"
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
                            <span className="px-3 py-2 rounded text-sm font-medium bg-emerald-500/10 text-emerald-200 border border-emerald-500/20" title="O próximo stop programado foi cancelado">
                              Stop cancelado (prorrogação)
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={onCancelStop}
                              disabled={cancelStopLoading}
                              className="ananim-btn bg-emerald-500/10 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-500/15 px-3 py-2 disabled:opacity-50"
                              title="Cancela o próximo stop programado (extensão de horário)"
                            >
                              {cancelStopLoading ? '...' : 'Cancelar stop'}
                            </button>
                          )
                        )}
                        {selectedEcsIds.length > 0 && (
                          <>
                            <span className="text-xs text-gray-400">{selectedEcsIds.length} ECS selecionada(s)</span>
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
                  {huaweiEcsLoading && <p className="text-sm text-gray-400">Carregando ECS...</p>}
                  {huaweiEcsError && <p className="text-sm text-red-600">{huaweiEcsError}</p>}
                  {huaweiEcs && !huaweiEcsLoading && (
                    <div className="overflow-x-auto border border-white/10 rounded-lg bg-white/[0.02]">
                      <table className="w-full text-sm">
                        <thead className="bg-white/[0.04] border-b border-white/10">
                          <tr>
                            {isAdmin && <th className="w-10 py-2 px-2 text-center font-semibold text-gray-200"> </th>}
                            <th className="text-left py-2 px-3 font-semibold text-gray-200">Nome</th>
                            {isAdmin && <th className="text-left py-2 px-3 font-semibold text-gray-200">ID</th>}
                            <th className="text-left py-2 px-3 font-semibold text-gray-200">Cliente (metadata)</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-200">Status</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-200">Flavor</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-200">Disco(s)</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-200">IPs</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-200" title="Tempo fora do horário programado: ex.: cancelou a programação do dia ou ligou a VM após o horário de início">Horas a mais</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-200">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {huaweiEcs.length === 0 ? (
                            <tr><td colSpan={isAdmin ? 10 : 8} className="py-4 px-3 text-gray-400 text-center">Nenhuma ECS neste projeto.{ecsClienteFilter.trim() ? ' Tente outro filtro de cliente.' : ''}</td></tr>
                          ) : (
                            huaweiEcs.map((s) => {
                              const ips = s.addresses
                                ? Object.values(s.addresses).flat().map((a) => a.addr).filter(Boolean).join(', ')
                                : '—';
                              const metaCliente = s.metadata?.centro_custo || s.metadata?.centrodecusto || s.metadata?.cost_center || s.metadata?.cliente || s.metadata?.client || '—';
                              const loading = huaweiEcsActionLoading !== null;
                              return (
                                <tr key={s.id} className="border-b border-white/10 hover:bg-white/[0.03]">
                                  {isAdmin && (
                                    <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        checked={isEcsSelected(s.id)}
                                        onChange={() => toggleEcsSelection(s.id)}
                                        className="rounded border-gray-300"
                                        title="Selecionar para atribuir a um usuário"
                                      />
                                    </td>
                                  )}
                                  <td className="py-2 px-3 font-medium">{s.name || s.id}</td>
                                  {isAdmin && <td className="py-2 px-3 font-mono text-xs">{s.id}</td>}
                                  <td className="py-2 px-3 text-gray-300">{metaCliente}</td>
                                  <td className="py-2 px-3">{s.status}</td>
                                  <td className="py-2 px-3 text-gray-300">{formatFlavor(s.flavor)}</td>
                                  <td className="py-2 px-3 text-gray-300">{formatDiskSize(s)}</td>
                                  <td className="py-2 px-3 text-gray-300">{ips || '—'}</td>
                                  <td className="py-2 px-3 text-gray-200 font-medium" title={(s.extraHours ?? 0) > 0 ? `Extensão de horário: ${Math.round(Number(s.extraHours) * 60)} min (cancelou o dia ou ligou a VM após o horário). Cobrança por hora cheia.` : 'Nenhuma extensão de horário'}>
                                    {formatMinutes(s.extraHours ? Math.round(Number(s.extraHours) * 60) : undefined)}
                                  </td>
                                  <td className="py-2 px-3">
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
                <h3 className="text-lg font-medium text-white mb-2">Programação das VMs</h3>
                <p className="text-sm text-gray-300 mb-3">
                  Horário em que as VMs deste projeto ficam ligadas. Fora desse intervalo, o marcador &quot;Horas a mais&quot; acumula.
                </p>
                {scheduleError && <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg text-sm">{scheduleError}</div>}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-200 mb-1">Início (HH:mm)</label>
                    <input
                      type="time"
                      value={scheduleStart}
                      onChange={(e) => setScheduleStart(e.target.value)}
                      className="ananim-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-200 mb-1">Fim (HH:mm)</label>
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
                <p className="text-sm text-gray-300 mb-3">
                  No dia escolhido o agendamento não será executado. No dia seguinte a programação oficial volta a valer.
                </p>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-200 mb-1">Data</label>
                  <input
                    type="date"
                    value={cancelScheduleDate}
                    onChange={(e) => setCancelScheduleDate(e.target.value)}
                    className="ananim-input"
                  />
                </div>
                {cancelScheduleLoading && <p className="text-sm text-gray-400 mb-2">Carregando agendamentos...</p>}
                {!cancelScheduleLoading && cancelScheduleList.length === 0 && (
                  <p className="text-sm text-gray-400 mb-3">Nenhum agendamento por VM neste projeto. Crie em Programação.</p>
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
                <p className="text-sm text-gray-300 mb-3">
                  O usuário selecionado poderá ver estes {selectedProjects.length} projeto(s) sempre que logar.
                </p>
                {huaweiEcsError && <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg text-sm">{huaweiEcsError}</div>}
                <div className="mb-4 max-h-48 overflow-y-auto border border-white/10 rounded-lg bg-white/[0.02]">
                  {usersList.length === 0 ? (
                    <p className="p-3 text-sm text-gray-400">Nenhum usuário encontrado.</p>
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
                <p className="text-sm text-gray-300 mb-3">
                  O usuário selecionado verá apenas estas {selectedEcsIds.length} ECS neste projeto ({ecsProjectTitle(selectedProject, huaweiEcs)}) e poderá fazer start/stop/restart nelas.
                </p>
                {huaweiEcsError && <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg text-sm">{huaweiEcsError}</div>}
                <div className="mb-4 max-h-48 overflow-y-auto border border-white/10 rounded-lg bg-white/[0.02]">
                  {usersList.length === 0 ? (
                    <p className="p-3 text-sm text-gray-400">Nenhum usuário encontrado.</p>
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
                  <button type="button" onClick={() => { setShowDiscoverModal(false); setDiscoverStep('account'); }} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
                </div>
                {discoverError && <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg text-sm">{discoverError}</div>}
                {discoverStep === 'account' && (
                  <>
                    <p className="text-sm text-gray-300 mb-3">Selecione a conta para descobrir projetos:</p>
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
                          {acc.projectId && <span className="text-xs text-gray-400">(Região: {acc.region}, Project ID: {acc.projectId.slice(0, 8)}…)</span>}
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
                    <div className="flex-1 overflow-auto border border-white/10 rounded-lg mb-4 bg-white/[0.02]">
                      <table className="w-full text-sm">
                        <thead className="bg-white/[0.04] border-b border-white/10 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-2 w-10 text-gray-200 font-semibold">Adicionar</th>
                            <th className="text-left py-2 px-3 text-gray-200 font-semibold">Nome do Perfil</th>
                            <th className="text-left py-2 px-3 text-gray-200 font-semibold">Project ID</th>
                            <th className="text-left py-2 px-3 text-gray-200 font-semibold">Região</th>
                            <th className="text-left py-2 px-3 text-gray-200 font-semibold">Status</th>
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
