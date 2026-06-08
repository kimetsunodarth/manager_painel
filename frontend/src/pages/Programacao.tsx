import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Server, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import {
  huawei,
  type HuaweiProject,
  type HuaweiEcsServer,
  type ScheduleVm,
  type ScheduleVmCreate,
} from '../api/client';
import AccountProjectBar from '../components/AccountProjectBar';

const DAYS_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const STORAGE_PROJECTS_KEY = 'ananim_programacao_projects';
const STORAGE_SELECTED_KEY = 'ananim_programacao_selected_project';

function projectKey(p: { id: string; perfil?: string | null }) {
  return p.perfil ? `${p.perfil}-${p.id}` : p.id;
}

function loadProjectsFromStorage(): HuaweiProject[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PROJECTS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as HuaweiProject[];
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function saveProjectsToStorage(projects: HuaweiProject[]) {
  try {
    sessionStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(projects));
  } catch (_) {}
}

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
  return /^[a-z]{2}-[a-z0-9-]+-\d+$/.test(n);
}

function projectDisplayName(p: HuaweiProject): string {
  if (p.id === '079fd9f3ab8026fe2fcbc00192167cda' || String(p.name || '').trim().toUpperCase() === 'MOS') return 'Grupo Moove';
  const name = (p.name || '').trim();
  if (!name) return p.id;
  let base = name;
  let regionPrefix: string | null = null;
  if (name.includes('_')) {
    const [prefix, ...rest] = name.split('_');
    const suffix = rest.join('_').trim();
    if (suffix) base = suffix;
    if (isRegionLikeProjectName(prefix)) regionPrefix = prefix.trim().toLowerCase();
  }

  const accountId = accountIdFromPerfil(p.perfil);
  const region = ((p as any).region || regionPrefix || '').toLowerCase();
  if (accountId === 'MOOVE_RAMOSISTEMAS' && base.toUpperCase() === 'MOS') return 'Grupo Moove';
  if (accountId === 'RAMO_SISTEMAS') {
    if (region === 'sa-brazil-1') return `${base} (SP)`;
    if (region === 'la-south-2') return `${base} (CH)`;
  }
  return base;
}

function isMooveMosProject(p: HuaweiProject): boolean {
  return String(p?.name || '').trim().toUpperCase() === 'MOS';
}

function isMooveTenantProject(p: HuaweiProject): boolean {
  return p?.id === '079fd9f3ab8026fe2fcbc00192167cda';
}

function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDays(days: number[] | null): string {
  if (!days || days.length === 0) return 'Todos';
  if (days.length === 7) return 'Todos';
  return days.sort((a, b) => a - b).map((d) => DAYS_LABELS[d]).join(', ');
}

export default function Programacao() {
  const cachedProjects = loadProjectsFromStorage();
  const cachedSelectedKey = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_SELECTED_KEY) : null;
  const [projects, setProjects] = useState<HuaweiProject[] | null>(cachedProjects);
  const [projectsInUseKeys, setProjectsInUseKeys] = useState<Set<string>>(new Set());
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<HuaweiProject | null>(() => {
    if (!cachedProjects?.length || !cachedSelectedKey) return null;
    return cachedProjects.find((p) => projectKey(p) === cachedSelectedKey) ?? null;
  });
  const [schedulesVm, setSchedulesVm] = useState<ScheduleVm[]>([]);
  const [ecsList, setEcsList] = useState<HuaweiEcsServer[]>([]);
  const [projectSchedule, setProjectSchedule] = useState<{ start?: string | null; end?: string | null } | null>(null);
  const [loading, setLoading] = useState(!cachedProjects?.length);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForVm, setAddForVm] = useState<{ serverId: string; serverName: string } | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleVm | null>(null);
  const [showCancelDateModal, setShowCancelDateModal] = useState<{ schedule: ScheduleVm } | null>(null);
  const [cancelDate, setCancelDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [diagnostic, setDiagnostic] = useState<Awaited<ReturnType<typeof huawei.schedulesDiagnostic>> | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);

  const loadProjects = async () => {
    try {
      const data = await huawei.projects('all', 'all_perfis');
      const list = Array.isArray(data) ? data : [];
      setProjects(list);
      saveProjectsToStorage(list);
      const savedKey = sessionStorage.getItem(STORAGE_SELECTED_KEY);
      if (savedKey && list.length) {
        const found = list.find((p) => projectKey(p) === savedKey);
        if (found) setSelectedProject(found);
      }
    } catch {
      setProjects([]);
    }
  };

  const loadProjectsInUse = async () => {
    try {
      const data = await huawei.programacao();
      const keys = new Set<string>();
      // Nova programação por VM
      for (const s of (data?.schedulesVm || [])) {
        if (s?.projectKey) keys.add(String(s.projectKey));
      }
      // Programação antiga por projeto + flags
      for (const k of Object.keys((data?.schedules || {}) as Record<string, unknown>)) keys.add(k);
      for (const k of Object.keys((data?.skipNextStop || {}) as Record<string, unknown>)) keys.add(k);
      setProjectsInUseKeys(keys);
    } catch {
      setProjectsInUseKeys(new Set());
    }
  };

  const loadSchedules = async (pk: string) => {
    try {
      const list = await huawei.schedulesVm.list(pk);
      setSchedulesVm(list);
    } catch {
      setSchedulesVm([]);
    }
  };

  const loadEcs = async (project: HuaweiProject) => {
    try {
      const list = await huawei.ecs(project.id, project.region || undefined, project.perfil);
      setEcsList(list);
    } catch {
      setEcsList([]);
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadProjects(), loadProjectsInUse()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loadProjectsFromStorage()?.length) load();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      const pk = projectKey(selectedProject);
      loadSchedules(pk);
      loadEcs(selectedProject);
      huawei.ecsSchedule(selectedProject.id, selectedProject.perfil)
        .then((d) => setProjectSchedule(d.schedule))
        .catch(() => setProjectSchedule(null));
    } else {
      setSchedulesVm([]);
      setEcsList([]);
      setProjectSchedule(null);
    }
  }, [selectedProject]);

  // Em Programação, mostrar apenas projetos em uso (com agendamentos).
  const projectsInUse = (projects || []).filter((p) => {
    const pk = projectKey(p);
    if (projectsInUseKeys.size > 0 && !projectsInUseKeys.has(pk)) return false;
    return true;
  });

  const accountOptions = Array.from(
    new Set(projectsInUse.map((p) => accountIdFromPerfil(p.perfil)).filter(Boolean) as string[])
  )
    .map((id) => ({ id, name: id }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const projectsForAccount = selectedAccount ? projectsInUse.filter((p) => accountIdFromPerfil(p.perfil) === selectedAccount) : projectsInUse;

  const projectOptions = projectsForAccount
    .filter((p) => {
      const isMooveTenant = accountIdFromPerfil(p.perfil) === 'MOOVE_RAMOSISTEMAS' && isMooveTenantProject(p);
      if (isMooveTenant) return true;
      return !isRegionLikeProjectName(p.name) && !isRegionLikeProjectName(p.id);
    })
    .filter((p) => !(accountIdFromPerfil(p.perfil) === 'MOOVE_RAMOSISTEMAS' && isMooveMosProject(p)))
    .map((p) => ({ id: projectKey(p), name: projectDisplayName(p) }));

  const selectedProjectFromBar =
    selectedProjectKey ? (projects || []).find((p) => projectKey(p) === selectedProjectKey) || null : null;

  const effectiveSelectedProject =
    selectedProjectFromBar && accountIdFromPerfil(selectedProjectFromBar.perfil) === 'MOOVE_RAMOSISTEMAS' && isMooveMosProject(selectedProjectFromBar)
      ? (projects || []).find((p) => isMooveTenantProject(p)) || selectedProjectFromBar
      : selectedProjectFromBar;

  const handleAddSchedule = async (body: ScheduleVmCreate) => {
    if (!selectedProject) return;
    setSaving(true);
    setError(null);
    try {
      const pk = projectKey(selectedProject);
      await huawei.schedulesVm.add({
        ...body,
        projectKey: pk,
        projectId: selectedProject.id,
        region: selectedProject.region || null,
        perfil: selectedProject.perfil || null,
      });
      setShowAddModal(false);
      await loadSchedules(pk);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSchedule = async (id: number, body: Partial<ScheduleVmCreate>) => {
    setSaving(true);
    setError(null);
    try {
      await huawei.schedulesVm.update(id, body);
      setEditingSchedule(null);
      if (selectedProject) await loadSchedules(projectKey(selectedProject));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSchedule = async (id: number) => {
    if (!window.confirm('Excluir este agendamento?')) return;
    setSaving(true);
    setError(null);
    try {
      await huawei.schedulesVm.remove(id);
      if (selectedProject) await loadSchedules(projectKey(selectedProject));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelForDate = async () => {
    if (!showCancelDateModal || !cancelDate) return;
    const { schedule } = showCancelDateModal;
    setSaving(true);
    setError(null);
    try {
      await huawei.schedulesVm.cancelForDate(schedule.projectKey || '', schedule.serverId, cancelDate, schedule.action);
      setShowCancelDateModal(null);
      setCancelDate('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao cancelar.');
    } finally {
      setSaving(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold font-display text-white">Programação</h2>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              setDiagnosticLoading(true);
              setDiagnostic(null);
              try {
                const data = await huawei.schedulesDiagnostic();
                setDiagnostic(data);
              } catch (e) {
                setDiagnostic(null);
                window.alert(e instanceof Error ? e.message : 'Erro ao carregar diagnóstico.');
              } finally {
                setDiagnosticLoading(false);
              }
            }}
            disabled={diagnosticLoading}
            className="ananim-btn-ghost px-4 py-2 disabled:opacity-50"
            title="Ver por que as programações executam ou não (hora do servidor, agendamentos devidos)"
          >
            {diagnosticLoading ? '...' : 'Diagnóstico'}
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="ananim-btn-primary px-4 py-2 disabled:opacity-50"
          >
            {loading ? 'Carregando...' : 'Atualizar'}
          </button>
        </span>
      </div>
      {diagnostic && (
        <div className="mb-4 p-4 ananim-card text-sm">
          <h3 className="font-semibold text-white mb-2">Diagnóstico de programações (hora do servidor)</h3>
          <p className="mb-1 text-gray-200">Hora do servidor: <strong>{diagnostic.serverTimeLocal}</strong> (hora/minuto: {diagnostic.serverHour}:{String(diagnostic.serverMinute).padStart(2, '0')}, dia da semana: {diagnostic.serverDayOfWeek})</p>
          <p className="mb-1 text-gray-200">Arquivo: <code className="text-xs bg-white/[0.08] px-1.5 py-0.5 rounded font-mono">{diagnostic.agendamentosFilePath ?? '—'}</code></p>
          <p className="mb-1 text-gray-200">Total: {diagnostic.totalSchedules} agendamentos ({diagnostic.enabledCount} habilitados)</p>
          {diagnostic.invalidForCronCount != null && diagnostic.invalidForCronCount > 0 && (
            <p className="mb-1 text-amber-300"><strong>{diagnostic.invalidForCronCount} agendamento(s) inválido(s)</strong> (sem projectId ou serverId) — não executam. Edite e salve com o projeto correto.</p>
          )}
          <p className="mb-2 text-gray-200">Devidos agora: <strong>{diagnostic.dueNowCount}</strong> {diagnostic.dueNowCount > 0 ? `— ${diagnostic.dueNow.map((d) => `${d.serverName} ${d.action}`).join(', ')}` : ''}</p>
          {diagnostic.hint && <p className="mb-2 text-amber-300">{diagnostic.hint}</p>}
          <p className="text-gray-400">Se a VM não ligar no horário: confira se a hora do servidor está correta (fuso). O cron usa a hora local do servidor.</p>
          <button type="button" onClick={() => setDiagnostic(null)} className="mt-2 text-ananim-accent hover:underline text-xs">Fechar</button>
        </div>
      )}

      <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-200">
        <strong>Cobrança:</strong> As cobranças são feitas de hora em hora. Ex.: 30 min = 1 hora cheia.
      </div>

      <div className="mb-4 p-3 bg-ananim-accent/10 border border-ananim-accent/20 rounded-lg text-sm text-gray-300">
        <strong className="text-white">Programação por VM:</strong> Cada VM pode ter horários individuais de Start e Stop. O cancelamento é somente para o dia específico — no dia seguinte a programação oficial é seguida.
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {/* Seletor de projeto */}
      <div className="mb-6 ananim-card p-4">
        <h3 className="text-base font-medium text-white mb-2">Projeto / Cliente</h3>
        {projectsInUseKeys.size > 0 && (
          <p className="text-xs text-gray-400 mb-3">{projectsInUse.length} projeto(s) em uso</p>
        )}

        <div className="rounded-xl bg-black/20 border border-white/10 p-3 mb-3">
          <AccountProjectBar
            accounts={accountOptions}
            projects={projectOptions}
            selectedAccount={selectedAccount}
            selectedProject={selectedProjectKey}
            onChangeAccount={(id) => {
              setSelectedAccount(id);
              setSelectedProjectKey('');
            }}
            onChangeProject={(id) => setSelectedProjectKey(id)}
            onLoad={() => {
              if (!effectiveSelectedProject) return;
              setSelectedProject(effectiveSelectedProject);
              try { sessionStorage.setItem(STORAGE_SELECTED_KEY, projectKey(effectiveSelectedProject)); } catch (_) {}
            }}
            loading={loading}
            requireProject
          />
        </div>
      </div>

          {selectedProject && (
        <div className="ananim-card overflow-hidden">
          <div className="p-4 border-b border-white/10 bg-white/[0.03] flex items-center justify-between">
            <h3 className="text-base font-medium text-white">
              {displayPerfil(selectedProject.perfil)} — {projectDisplayName(selectedProject)}
            </h3>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="ananim-btn bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 px-3 py-1.5 text-sm"
            >
              + Novo agendamento
            </button>
          </div>

          {projectSchedule?.start && projectSchedule?.end && (
            <div className="px-4 py-2.5 bg-ananim-accent/[0.08] border-b border-ananim-accent/20 text-sm text-gray-300 flex items-center gap-3">
              <span>
                <strong className="text-white">Programação geral:</strong> Start {projectSchedule.start} → Stop {projectSchedule.end}
              </span>
              <span className="text-gray-500 text-xs">todos os dias · definida em Home</span>
            </div>
          )}

          {schedulesVm.length === 0 ? (
            <div className="p-10 text-center text-gray-500 text-sm">
              Nenhum agendamento. Clique em <strong className="text-gray-300">"+ Novo agendamento"</strong> para criar<br />
              <span className="text-gray-600 text-xs mt-1 block">Ex.: MAXTECHDB Stop 23:00 · Start 06:45 · Restart 04:00 (todos os dias)</span>
            </div>
          ) : (
            <ScheduleGroupedTable
              schedules={schedulesVm}
              saving={saving}
              onEdit={setEditingSchedule}
              onCancelDate={(s) => setShowCancelDateModal({ schedule: s })}
              onRemove={handleRemoveSchedule}
              onAddForVm={(serverId, serverName) => {
                setAddForVm({ serverId, serverName });
                setShowAddModal(true);
              }}
            />
          )}
        </div>
      )}

      {/* Modal: Novo agendamento */}
      {showAddModal && selectedProject && (
        <ScheduleFormModal
          ecsList={ecsList}
          initialServerId={addForVm?.serverId}
          initialServerName={addForVm?.serverName}
          onSave={(body) => handleAddSchedule(body)}
          onClose={() => { setShowAddModal(false); setAddForVm(null); }}
          saving={saving}
        />
      )}

      {/* Modal: Editar */}
      {editingSchedule && (
        <ScheduleFormModal
          ecsList={ecsList}
          initial={editingSchedule}
          onSave={(body) => handleUpdateSchedule(editingSchedule.id, body)}
          onClose={() => setEditingSchedule(null)}
          saving={saving}
        />
      )}

      {/* Modal: Cancelar para dia específico */}
      {showCancelDateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="ananim-card p-6 max-w-md w-full shadow-xl shadow-black/40">
            <h3 className="text-base font-medium text-white mb-2">Cancelar para dia específico</h3>
            <p className="text-sm text-gray-200 mb-1">
              <strong>{showCancelDateModal.schedule.serverName}</strong> —{' '}
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${showCancelDateModal.schedule.action === 'stop' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                {showCancelDateModal.schedule.action === 'stop' ? 'Stop' : showCancelDateModal.schedule.action === 'restart' ? 'Restart' : 'Start'}
              </span>{' '}
              às {formatTime(showCancelDateModal.schedule.hour, showCancelDateModal.schedule.minute)}
            </p>
            <p className="text-sm text-gray-400 mb-4">
              No dia selecionado o agendamento não será executado. No dia seguinte a programação oficial será seguida.
            </p>
            <input
              type="date"
              value={cancelDate}
              onChange={(e) => setCancelDate(e.target.value)}
              min={today}
              className="ananim-input mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowCancelDateModal(null); setCancelDate(''); }}
                className="ananim-btn-ghost px-4 py-2"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleCancelForDate}
                disabled={saving || !cancelDate}
                className="ananim-btn bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 px-4 py-2 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-sm text-gray-500">
        Defina também o horário geral do projeto na <Link to="/" className="text-ananim-accent hover:underline">Home</Link> (Definir programação).
      </p>
    </div>
  );
}

function ActionBadge({ action, isExternal }: { action: string; isExternal?: boolean }) {
  const cfg =
    action === 'stop'
      ? 'bg-amber-500/20 text-amber-300'
      : action === 'restart'
        ? 'bg-blue-500/20 text-blue-300'
        : 'bg-emerald-500/20 text-emerald-300';
  const label = action === 'stop' ? 'Stop' : action === 'restart' ? 'Restart' : 'Start';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${cfg}`}>{label}</span>
      {isExternal && (
        <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-purple-500/20 text-purple-300" title="Execução externa">
          Externo
        </span>
      )}
    </span>
  );
}

function ScheduleGroupedTable({
  schedules,
  saving,
  onEdit,
  onCancelDate,
  onRemove,
  onAddForVm,
}: {
  schedules: ScheduleVm[];
  saving: boolean;
  onEdit: (s: ScheduleVm) => void;
  onCancelDate: (s: ScheduleVm) => void;
  onRemove: (id: number) => void;
  onAddForVm: (serverId: string, serverName: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const groups = Object.values(
    schedules.reduce((acc, s) => {
      const key = s.serverName || s.serverId;
      if (!acc[key]) acc[key] = { name: key, serverId: s.serverId, items: [] as ScheduleVm[] };
      acc[key].items.push(s);
      return acc;
    }, {} as Record<string, { name: string; serverId: string; items: ScheduleVm[] }>)
  ).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.04] border-b border-white/10">
          <tr>
            <th className="w-8" />
            <th className="text-left py-2.5 px-4 font-medium text-gray-400 text-xs uppercase tracking-wide">Horário</th>
            <th className="text-left py-2.5 px-4 font-medium text-gray-400 text-xs uppercase tracking-wide">Ação</th>
            <th className="text-left py-2.5 px-4 font-medium text-gray-400 text-xs uppercase tracking-wide">Recorrência</th>
            <th className="text-left py-2.5 px-4 font-medium text-gray-400 text-xs uppercase tracking-wide">Criado / Modificado</th>
            <th className="text-left py-2.5 px-4 font-medium text-gray-400 text-xs uppercase tracking-wide">Ações</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const isOpen = !collapsed.has(group.name);
            return (
              <>
                {/* Cabeçalho do grupo (VM) */}
                <tr
                  key={`group-${group.name}`}
                  className="bg-white/[0.03] border-b border-white/10 cursor-pointer select-none hover:bg-white/[0.05] transition-colors"
                  onClick={() => toggleCollapse(group.name)}
                >
                  <td className="py-2.5 pl-3 pr-1 text-gray-400">
                    {isOpen
                      ? <ChevronDown className="w-3.5 h-3.5" />
                      : <ChevronRight className="w-3.5 h-3.5" />}
                  </td>
                  <td colSpan={4} className="py-2.5 px-2">
                    <span className="flex items-center gap-2">
                      <Server className="w-3.5 h-3.5 text-ananim-accent flex-shrink-0" aria-hidden="true" />
                      <span className="font-medium text-white">{group.name}</span>
                      <span className="text-xs text-gray-500">
                        {group.items.length} agendamento{group.items.length !== 1 ? 's' : ''}
                        {' · '}
                        {[...new Set(group.items.map((i) => i.action === 'stop' ? 'Stop' : i.action === 'restart' ? 'Restart' : 'Start'))].join(', ')}
                      </span>
                    </span>
                  </td>
                  <td className="py-2 px-4">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onAddForVm(group.serverId, group.name); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/[0.06] border border-white/10 text-gray-300 text-xs hover:bg-white/[0.10] hover:text-white transition-colors"
                      title="Adicionar agendamento para esta VM"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      Adicionar
                    </button>
                  </td>
                </tr>

                {/* Linhas do grupo */}
                {isOpen && group.items.map((s) => (
                  <tr key={s.id} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
                    <td />
                    <td className="py-2 px-4 font-mono text-gray-200 tabular-nums">{formatTime(s.hour, s.minute)}</td>
                    <td className="py-2 px-4">
                      <ActionBadge action={s.action} isExternal={s.isExternal} />
                    </td>
                    <td className="py-2 px-4 text-gray-300 text-xs">{formatDays(s.days)}</td>
                    <td className="py-2 px-4 text-gray-500 text-xs">
                      {s.createdBy || '—'}
                      {s.lastModifiedBy ? ` / ${s.lastModifiedBy}` : ''}
                    </td>
                    <td className="py-2 px-4">
                      <span className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => onEdit(s)}
                          className="px-2 py-1 rounded bg-ananim-accent/10 text-ananim-accent border border-ananim-accent/20 text-xs font-medium hover:bg-ananim-accent/20 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => onCancelDate(s)}
                          className="px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-medium hover:bg-amber-500/20 transition-colors"
                          title="Cancelar somente para um dia específico"
                        >
                          Cancelar dia
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(s.id)}
                          disabled={saving}
                          className="px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-medium hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                        >
                          Excluir
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleFormModal({
  ecsList,
  initial,
  initialServerId,
  initialServerName,
  onSave,
  onClose,
  saving,
}: {
  ecsList: HuaweiEcsServer[];
  initial?: ScheduleVm;
  initialServerId?: string;
  initialServerName?: string;
  onSave: (body: ScheduleVmCreate) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [serverId, setServerId] = useState(initial?.serverId || initialServerId || '');
  const [serverName, setServerName] = useState(initial?.serverName || initialServerName || '');
  const [action, setAction] = useState<'start' | 'stop' | 'restart'>(initial?.action || 'stop');
  const [hour, setHour] = useState(initial?.hour ?? 23);
  const [minute, setMinute] = useState(initial?.minute ?? 0);
  const [days, setDays] = useState<number[]>(initial?.days && initial.days.length ? [...initial.days] : [1, 2, 3, 4, 5]);
  const [isExternal, setIsExternal] = useState<boolean>(initial?.isExternal ?? false);

  const timeValue = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const setTimeFromInput = (value: string) => {
    const [h, m] = value.split(':').map((x) => parseInt(x, 10) || 0);
    setHour(Math.min(23, Math.max(0, h)));
    setMinute(Math.min(59, Math.max(0, m)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverId) return;
    const name = serverName || ecsList.find((e) => e.id === serverId)?.name || serverId;
    const payload: ScheduleVmCreate & { projectKey?: string; projectId?: string; region?: string | null; perfil?: string | null } = {
      serverId,
      serverName: name,
      projectId: initial?.projectId ?? '',
      action,
      hour,
      minute,
      days: days.length === 7 || days.length === 0 ? null : days,
      isExternal,
    };
    if (initial) {
      payload.projectKey = initial.projectKey;
      payload.projectId = initial.projectId;
      payload.region = initial.region ?? null;
      payload.perfil = initial.perfil ?? null;
    }
    onSave(payload);
  };

  const toggleDay = (d: number) => {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="ananim-card p-6 max-w-md w-full shadow-xl shadow-black/40 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-medium text-white mb-4">
          {initial ? 'Editar agendamento' : 'Novo agendamento'}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">VM</label>
              <select
                value={serverId}
                onChange={(e) => {
                  const id = e.target.value;
                  setServerId(id);
                  const ecs = ecsList.find((x) => x.id === id);
                  if (ecs) setServerName(ecs.name || id);
                }}
                required
                disabled={!!initial}
                className="ananim-input text-sm"
              >
                <option value="">Selecione...</option>
                {initial && serverId && !ecsList.some((e) => e.id === serverId) && (
                  <option value={serverId}>{serverName || serverId}</option>
                )}
                {ecsList.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name || e.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Ação</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as 'start' | 'stop' | 'restart')}
                className="ananim-input text-sm"
              >
                <option value="stop">Stop</option>
                <option value="start">Start</option>
                <option value="restart">Restart</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Horário</label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="time"
                  value={timeValue}
                  onChange={(e) => setTimeFromInput(e.target.value)}
                  className="ananim-input w-auto text-sm"
                />
                <span className="text-gray-500 text-sm">ou</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(e) => setHour(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                    className="ananim-input w-14 text-sm text-center"
                  />
                  <span className="text-gray-400 text-sm">h</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minute}
                    onChange={(e) => setMinute(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                    className="ananim-input w-14 text-sm text-center"
                  />
                  <span className="text-gray-400 text-sm">min</span>
                </div>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      let m = minute - 15;
                      let h = hour;
                      if (m < 0) { m += 60; h = (h - 1 + 24) % 24; }
                      setMinute(m); setHour(h);
                    }}
                    className="ananim-btn-ghost px-2 py-1 text-xs"
                  >
                    −15 min
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      let m = minute + 15;
                      let h = hour;
                      if (m >= 60) { m -= 60; h = (h + 1) % 24; }
                      setMinute(m); setHour(h);
                    }}
                    className="ananim-btn-ghost px-2 py-1 text-xs"
                  >
                    +15 min
                  </button>
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Dias (nenhum = todos)</label>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <label key={d} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={days.includes(d)}
                      onChange={() => toggleDay(d)}
                      className="rounded border-white/20 bg-white/[0.06] accent-ananim-accent w-3.5 h-3.5"
                    />
                    <span className="text-sm text-gray-300">{DAYS_LABELS[d]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="pt-3 border-t border-white/10">
              <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-purple-500/[0.08] rounded-lg border border-purple-500/20">
                <input
                  type="checkbox"
                  checked={isExternal}
                  onChange={(e) => setIsExternal(e.target.checked)}
                  className="rounded border-white/20 bg-white/[0.06] accent-purple-400 w-4 h-4 mt-0.5 flex-shrink-0"
                />
                <span className="text-sm text-purple-200">
                  <strong>Monitoramento Externo (Cloud8, etc.)</strong>
                  <br />
                  <span className="text-purple-300/80">Se marcado, a API <strong>não envia comandos</strong> de ligar/desligar — apenas monitora o status real para <strong>calcular horas extras</strong>.</span>
                </span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-6">
            <button type="button" onClick={onClose} className="ananim-btn-ghost px-4 py-2">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !serverId}
              className="ananim-btn-primary px-4 py-2 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : initial ? 'Atualizar' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
