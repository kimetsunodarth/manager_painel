import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  huawei,
  type HuaweiProject,
  type HuaweiEcsServer,
  type ScheduleVm,
  type ScheduleVmCreate,
} from '../api/client';

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
  const [selectedProject, setSelectedProject] = useState<HuaweiProject | null>(() => {
    if (!cachedProjects?.length || !cachedSelectedKey) return null;
    return cachedProjects.find((p) => projectKey(p) === cachedSelectedKey) ?? null;
  });
  const [schedulesVm, setSchedulesVm] = useState<ScheduleVm[]>([]);
  const [ecsList, setEcsList] = useState<HuaweiEcsServer[]>([]);
  const [loading, setLoading] = useState(!cachedProjects?.length);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
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
      await loadProjects();
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
    } else {
      setSchedulesVm([]);
      setEcsList([]);
    }
  }, [selectedProject]);

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
        <h2 className="text-xl font-semibold text-gray-800">Programação</h2>
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
            className="bg-gray-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
            title="Ver por que as programações executam ou não (hora do servidor, agendamentos devidos)"
          >
            {diagnosticLoading ? '...' : 'Diagnóstico'}
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Carregando...' : 'Atualizar'}
          </button>
        </span>
      </div>
      {diagnostic && (
        <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm">
          <h3 className="font-semibold text-gray-800 mb-2">Diagnóstico de programações (hora do servidor)</h3>
          <p className="mb-1">Hora do servidor: <strong>{diagnostic.serverTimeLocal}</strong> (hora/minuto: {diagnostic.serverHour}:{String(diagnostic.serverMinute).padStart(2, '0')}, dia da semana: {diagnostic.serverDayOfWeek})</p>
          <p className="mb-1">Arquivo de agendamentos: <code className="text-xs bg-gray-200 px-1 rounded">{diagnostic.agendamentosFilePath ?? '—'}</code></p>
          <p className="mb-1">Total de agendamentos: {diagnostic.totalSchedules} (habilitados: {diagnostic.enabledCount})</p>
          {diagnostic.invalidForCronCount != null && diagnostic.invalidForCronCount > 0 && (
            <p className="mb-1 text-amber-700"><strong>{diagnostic.invalidForCronCount} agendamento(s) inválido(s)</strong> (sem projectId ou serverId) — não executam. Edite e salve de novo com o projeto correto.</p>
          )}
          <p className="mb-2">Devidos agora (executando neste minuto): <strong>{diagnostic.dueNowCount}</strong> {diagnostic.dueNowCount > 0 ? `— ${diagnostic.dueNow.map((d) => `${d.serverName} ${d.action}`).join(', ')}` : ''}</p>
          {diagnostic.hint && <p className="mb-2 text-amber-700">{diagnostic.hint}</p>}
          <p className="text-gray-600">Se a VM não ligar no horário: confira se a hora do servidor está correta (fuso). O cron usa a hora local do servidor.</p>
          <button type="button" onClick={() => setDiagnostic(null)} className="mt-2 text-gray-600 underline">Fechar</button>
        </div>
      )}

      <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <strong>Cobrança:</strong> As cobranças são feitas de hora em hora. Ex.: 30 min = 1 hora cheia.
      </div>

      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <strong>Programação por VM:</strong> Cada VM pode ter horários individuais de Start e Stop. O cancelamento é somente para o dia específico — no dia seguinte a programação oficial é seguida.
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {/* Seletor de projeto */}
      <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-medium text-gray-800 mb-2">Projeto / Cliente</h3>
        <select
          value={selectedProject ? projectKey(selectedProject) : ''}
          onChange={(e) => {
            const pk = e.target.value;
            const p = projects?.find((x) => projectKey(x) === pk) || null;
            setSelectedProject(p);
            try {
              if (pk) sessionStorage.setItem(STORAGE_SELECTED_KEY, pk);
              else sessionStorage.removeItem(STORAGE_SELECTED_KEY);
            } catch (_) {}
          }}
          className="w-full max-w-md border border-gray-300 rounded px-3 py-2 text-sm"
        >
          <option value="">Selecione um projeto...</option>
          {projects?.map((p) => (
            <option key={projectKey(p)} value={projectKey(p)}>
              {displayPerfil(p.perfil)} — {p.name || p.id}
            </option>
          ))}
        </select>
      </div>

      {selectedProject && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-800">
              {displayPerfil(selectedProject.perfil)} — {selectedProject.name || selectedProject.id}
            </h3>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
            >
              + Novo agendamento
            </button>
          </div>

          {schedulesVm.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Nenhum agendamento. Clique em &quot;Novo agendamento&quot; para criar (ex.: MAXTECHDB Stop 23:00, Start 06:45).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2 px-4 font-semibold text-gray-700">VM</th>
                    <th className="text-left py-2 px-4 font-semibold text-gray-700">Horário</th>
                    <th className="text-left py-2 px-4 font-semibold text-gray-700">Ação</th>
                    <th className="text-left py-2 px-4 font-semibold text-gray-700">Recorrência</th>
                    <th className="text-left py-2 px-4 font-semibold text-gray-700">Criado / Modificado por</th>
                    <th className="text-left py-2 px-4 font-semibold text-gray-700">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {schedulesVm.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-4 font-medium">{s.serverName || s.serverId}</td>
                      <td className="py-2 px-4">{formatTime(s.hour, s.minute)}</td>
                      <td className="py-2 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            s.action === 'stop'
                              ? 'bg-amber-100 text-amber-800'
                              : s.action === 'restart'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {s.action === 'stop' ? 'Stop' : s.action === 'restart' ? 'Restart' : 'Start'}
                        </span>
                        {s.isExternal && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-purple-100 text-purple-800" title="Execução externa (fora da API do Painel)">
                            Externo
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4">{formatDays(s.days)}</td>
                      <td className="py-2 px-4 text-gray-600">
                        {s.createdBy || '—'}
                        {s.lastModifiedBy ? ` / ${s.lastModifiedBy}` : ''}
                      </td>
                      <td className="py-2 px-4">
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingSchedule(s)}
                            className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs font-medium hover:bg-blue-200"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCancelDateModal({ schedule: s })}
                            className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-xs font-medium hover:bg-amber-200"
                            title="Cancelar somente para um dia específico"
                          >
                            Cancelar dia
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveSchedule(s.id)}
                            disabled={saving}
                            className="px-2 py-1 rounded bg-red-100 text-red-800 text-xs font-medium hover:bg-red-200 disabled:opacity-50"
                          >
                            Excluir
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Novo agendamento */}
      {showAddModal && selectedProject && (
        <ScheduleFormModal
          ecsList={ecsList}
          onSave={(body) => handleAddSchedule(body)}
          onClose={() => setShowAddModal(false)}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-800 mb-2">Cancelar para dia específico</h3>
            <p className="text-sm text-gray-600 mb-3">
              {showCancelDateModal.schedule.serverName} — {showCancelDateModal.schedule.action === 'stop' ? 'Stop' : showCancelDateModal.schedule.action === 'restart' ? 'Restart' : 'Start'} às{' '}
              {formatTime(showCancelDateModal.schedule.hour, showCancelDateModal.schedule.minute)}
            </p>
            <p className="text-sm text-gray-500 mb-3">
              No dia selecionado o agendamento não será executado. No dia seguinte a programação oficial será seguida.
            </p>
            <input
              type="date"
              value={cancelDate}
              onChange={(e) => setCancelDate(e.target.value)}
              min={today}
              className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowCancelDateModal(null); setCancelDate(''); }}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCancelForDate}
                disabled={saving || !cancelDate}
                className="px-4 py-2 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? '...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-sm text-gray-500">
        Defina também o horário geral do projeto na <Link to="/" className="text-blue-600 hover:underline">Home</Link> (Definir programação).
      </p>
    </div>
  );
}

function ScheduleFormModal({
  ecsList,
  initial,
  onSave,
  onClose,
  saving,
}: {
  ecsList: HuaweiEcsServer[];
  initial?: ScheduleVm;
  onSave: (body: ScheduleVmCreate) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [serverId, setServerId] = useState(initial?.serverId || '');
  const [serverName, setServerName] = useState(initial?.serverName || '');
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-medium text-gray-800 mb-4">
          {initial ? 'Editar agendamento' : 'Novo agendamento'}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">VM</label>
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
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Ação</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as 'start' | 'stop' | 'restart')}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="stop">Stop</option>
                <option value="start">Start</option>
                <option value="restart">Restart</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Horário</label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="time"
                  value={timeValue}
                  onChange={(e) => setTimeFromInput(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm"
                />
                <span className="text-gray-500 text-sm">ou</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(e) => setHour(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                    className="w-14 border border-gray-300 rounded px-2 py-2 text-sm text-center"
                  />
                  <span className="text-gray-400">h</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minute}
                    onChange={(e) => setMinute(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                    className="w-14 border border-gray-300 rounded px-2 py-2 text-sm text-center"
                  />
                  <span className="text-gray-400">min</span>
                </div>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      let m = minute - 15;
                      let h = hour;
                      if (m < 0) {
                        m += 60;
                        h = (h - 1 + 24) % 24;
                      }
                      setMinute(m);
                      setHour(h);
                    }}
                    className="px-2 py-1 rounded border border-gray-300 text-gray-700 text-xs hover:bg-gray-50"
                  >
                    −15 min
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      let m = minute + 15;
                      let h = hour;
                      if (m >= 60) {
                        m -= 60;
                        h = (h + 1) % 24;
                      }
                      setMinute(m);
                      setHour(h);
                    }}
                    className="px-2 py-1 rounded border border-gray-300 text-gray-700 text-xs hover:bg-gray-50"
                  >
                    +15 min
                  </button>
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dias (vazio = todos)</label>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <label key={d} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={days.includes(d)}
                      onChange={() => toggleDay(d)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{DAYS_LABELS[d]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isExternal}
                  onChange={(e) => setIsExternal(e.target.checked)}
                  className="rounded border-gray-300 w-4 h-4 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">Controle externo (Apenas exibir, não executar API)</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !serverId}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : initial ? 'Atualizar' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
