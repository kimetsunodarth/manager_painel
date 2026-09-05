import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  cloud8,
  coc,
  huawei,
  type Cloud8ReconciliationClient,
  type Cloud8ReconciliationVm,
  type Cloud8ReconciliationSummary,
  type Cloud8ScheduleEntry,
  type CocTriggerTime,
} from '../api/client';
import PageHeader from '../components/PageHeader';
import { useUser } from '../hooks/useUser';
import Cloud8ScheduleModal from '../components/Cloud8ScheduleModal';

const ORIGIN_LABEL: Record<Cloud8ReconciliationVm['origin'], string> = {
  cloud8: 'Cloud8',
  portal: 'Portal',
  coc: 'COC',
  conflict: 'Conflito',
  none: 'Sem cobertura',
};

const ORIGIN_BADGE_CLASS: Record<Cloud8ReconciliationVm['origin'], string> = {
  cloud8: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-300',
  portal: 'border-ananim-accent/30 bg-ananim-accentSoft text-ananim-accentStrong',
  coc: 'border-orange-400/30 bg-orange-400/10 text-orange-300',
  conflict: 'border-red-400/30 bg-red-400/10 text-red-300',
  none: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
};

const ORIGIN_FILTERS: (Cloud8ReconciliationVm['origin'] | '')[] = ['', 'cloud8', 'portal', 'coc', 'conflict', 'none'];

const STORAGE_KEY = 'ananim_automacoes_reconciliation';

const WEEKDAY_LABELS: Record<string, string> = {
  '1': 'Dom', '2': 'Seg', '3': 'Ter', '4': 'Qua', '5': 'Qui', '6': 'Sex', '7': 'Sáb',
};

/** Cloud8 só expõe um booleano (`hasSchedule`) — nunca horário/dia. Só o COC tem esse detalhe. */
function formatCocTrigger(trigger: CocTriggerTime | null | undefined): string | null {
  if (!trigger) return null;
  if (trigger.policy === 'PERIODIC') {
    const days = (trigger.period || '').split(',').map((d) => WEEKDAY_LABELS[d.trim()] || d.trim()).join(', ');
    return `${days || '—'} às ${trigger.periodic_scheduled_time || '—'}`;
  }
  if (trigger.policy === 'ONCE') {
    const ms = Number(trigger.single_scheduled_time);
    return Number.isFinite(ms) ? new Date(ms).toLocaleString('pt-BR') : '—';
  }
  return null;
}

interface StoredReconciliation {
  clients: Cloud8ReconciliationClient[];
  summary: Cloud8ReconciliationSummary;
  totalRowsFound: number | null;
  cocErrors: { perfil: string; error: string }[];
  maxPages: number;
}

function loadFromStorage(): StoredReconciliation | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredReconciliation;
    return data && Array.isArray(data.clients) ? data : null;
  } catch {
    return null;
  }
}

function saveToStorage(data: StoredReconciliation) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

export default function Automacoes() {
  const user = useUser();
  const isAdmin = user?.role === 'admin';
  const hasPerm = (perm: string) => isAdmin || (user?.permissions?.includes(perm) ?? false);

  const cached = loadFromStorage();
  const [clients, setClients] = useState<Cloud8ReconciliationClient[] | null>(cached?.clients ?? null);
  const [summary, setSummary] = useState<Cloud8ReconciliationSummary | null>(cached?.summary ?? null);
  const [totalRowsFound, setTotalRowsFound] = useState<number | null>(cached?.totalRowsFound ?? null);
  const [maxPages, setMaxPages] = useState(cached?.maxPages ?? 60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [origin, setOrigin] = useState<Cloud8ReconciliationVm['origin'] | ''>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cocErrors, setCocErrors] = useState<{ perfil: string; error: string }[]>(cached?.cocErrors ?? []);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [scheduleModal, setScheduleModal] = useState<{ vmName: string; resourceId: string; editing: Cloud8ScheduleEntry | null } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await cloud8.reconciliation(maxPages);
      setClients(res.clients);
      setSummary(res.summary);
      setTotalRowsFound(res.totalRowsFound ?? null);
      setCocErrors(res.cocErrors ?? []);
      setExpanded(new Set());
      saveToStorage({
        clients: res.clients,
        summary: res.summary,
        totalRowsFound: res.totalRowsFound ?? null,
        cocErrors: res.cocErrors ?? [],
        maxPages,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao ler dados do Cloud8.');
      setClients(null);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleClient = (provider: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  // Toda VM listada com inCoc=true tem uma tarefa HABILITADA por construção (a cobertura só conta
  // tarefas habilitadas) — "pausar" aqui é sempre desabilitar; não existe caso de "retomar" nesta tela.
  const handleCocPause = async (v: Cloud8ReconciliationVm) => {
    if (!v.cocSchedule?.taskId) return;
    if (!window.confirm(`Pausar a programação COC "${v.cocSchedule.taskName || v.cocSchedule.taskId}" (VM ${v.name})?`)) return;
    const key = `${v.recordId}:coc-pause`;
    setActionKey(key);
    setActionError(null);
    try {
      await coc.disableSchedule(v.cocSchedule.perfil, v.cocSchedule.taskId);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao pausar a programação no COC.');
    } finally {
      setActionKey(null);
    }
  };

  const handleCocDelete = async (v: Cloud8ReconciliationVm) => {
    if (!v.cocSchedule?.taskId) return;
    if (!window.confirm(`Remover definitivamente a programação COC "${v.cocSchedule.taskName || v.cocSchedule.taskId}" (VM ${v.name})? Essa ação não pode ser desfeita.`)) return;
    const key = `${v.recordId}:coc-delete`;
    setActionKey(key);
    setActionError(null);
    try {
      // A Huawei só deixa apagar tarefa desativada — a tarefa está habilitada aqui por construção,
      // então desativa antes (mesmo padrão que cocService.js já usa internamente pro update).
      await coc.disableSchedule(v.cocSchedule.perfil, v.cocSchedule.taskId).catch(() => {});
      await coc.deleteSchedule(v.cocSchedule.perfil, v.cocSchedule.taskId);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao remover a programação no COC.');
    } finally {
      setActionKey(null);
    }
  };

  const VM_ACTION_LABEL: Record<'start' | 'stop' | 'restart', string> = { start: 'Ligar', stop: 'Parar', restart: 'Reiniciar' };

  const handleVmAction = async (v: Cloud8ReconciliationVm, action: 'start' | 'stop' | 'restart') => {
    if (!v.vmIdentity) return;
    if (action !== 'start' && !window.confirm(`${VM_ACTION_LABEL[action]} a VM "${v.name}" agora?`)) return;
    const key = `${v.recordId}:vm-${action}`;
    setActionKey(key);
    setActionError(null);
    try {
      await huawei.ecsAction(v.vmIdentity.projectId, v.vmIdentity.serverId, action, {
        region: v.vmIdentity.region || undefined,
        perfil: v.vmIdentity.perfil,
        serverName: v.name,
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : `Erro ao ${VM_ACTION_LABEL[action].toLowerCase()} a VM.`);
    } finally {
      setActionKey(null);
    }
  };

  const handleCloud8Suspend = async (v: Cloud8ReconciliationVm, s: Cloud8ScheduleEntry) => {
    if (s.id == null) return;
    if (!window.confirm(`Suspender a programação "${s.name || 'Cloud8'}" (VM ${v.name})? Ela para de executar até ser retomada.`)) return;
    const key = `${v.recordId}:cloud8-suspend-${s.id}`;
    setActionKey(key);
    setActionError(null);
    try {
      await cloud8.suspendSchedule(Number(s.id), s.raw);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao suspender a programação no Cloud8.');
    } finally {
      setActionKey(null);
    }
  };

  const handleCloud8Delete = async (v: Cloud8ReconciliationVm, s: Cloud8ScheduleEntry) => {
    if (s.id == null) return;
    if (!window.confirm(`Remover definitivamente a programação "${s.name || 'Cloud8'}" (VM ${v.name})? Essa ação não pode ser desfeita.`)) return;
    const key = `${v.recordId}:cloud8-delete-${s.id}`;
    setActionKey(key);
    setActionError(null);
    try {
      await cloud8.deleteSchedule(Number(s.id));
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao remover a programação no Cloud8.');
    } finally {
      setActionKey(null);
    }
  };

  // Ao ativar/mudar um filtro, abre automaticamente os clientes que casam com ele (senão fica tudo
  // escondido) — mas só nesse momento: depois disso o toggle manual (comprimir/expandir) funciona
  // normalmente, sem o filtro forçar tudo aberto de novo a cada clique.
  useEffect(() => {
    if (!clients || (!search && !origin)) return;
    const matching = clients
      .filter((c) =>
        c.vms.some((v) => {
          if (search && !v.name.toLowerCase().includes(search.toLowerCase()) && !c.provider.toLowerCase().includes(search.toLowerCase())) return false;
          if (origin && v.origin !== origin) return false;
          return true;
        })
      )
      .map((c) => c.provider);
    setExpanded(new Set(matching));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, origin, clients]);

  const filteredClients = (clients || [])
    .map((c) => ({
      ...c,
      vms: c.vms.filter((v) => {
        if (search && !v.name.toLowerCase().includes(search.toLowerCase()) && !c.provider.toLowerCase().includes(search.toLowerCase())) return false;
        if (origin && v.origin !== origin) return false;
        return true;
      }),
    }))
    .filter((c) => c.vms.length > 0);

  const isOpen = (provider: string) => expanded.has(provider);

  return (
    <div className="ananim-page">
      <PageHeader
        badge="Automações"
        title="Origem das Automações"
        description="Cada cliente do Cloud8 (FinOps externo) com suas VMs, cruzadas com as programações nativas do Portal e as tarefas habilitadas do Huawei COC, por nome de servidor. VMs cobertas só pelo Portal e/ou COC (nunca cadastradas no Cloud8) aparecem em seções separadas, com o prefixo 'Fora do Cloud8'. Sem cobertura em nenhuma das três é a lacuna a fechar; em duas ou mais é conflito (dois sistemas podem brigar pelo mesmo start/stop). A coluna Programação mostra o horário real (Cloud8 ou COC); quando a identidade Huawei da VM é conhecida, dá pra ligar/parar/reiniciar direto daqui, e pausar/remover uma programação do COC exige a permissão específica em Usuários."
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-ananim-muted">
              Limite de páginas
              <input
                type="number"
                min={1}
                max={100}
                value={maxPages}
                onChange={(e) => setMaxPages(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                className="ananim-input w-20"
              />
            </label>
            <button type="button" onClick={load} disabled={loading} className="ananim-btn-primary disabled:opacity-50">
              {loading ? 'Lendo Cloud8...' : 'Carregar'}
            </button>
          </div>
        }
      />

      {error && (
        <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">{error}</div>
      )}

      {actionError && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="text-red-200 hover:text-white">Fechar</button>
        </div>
      )}

      {loading && !clients && (
        <div className="mt-6 ananim-card p-6 text-sm text-ananim-muted">
          Fazendo login no Cloud8 e paginando o inventário (~25 VMs por página), em paralelo com a leitura do Huawei COC —
          na primeira vez (sem cache) pode levar 1 a 2 minutos; carregamentos seguintes ficam bem mais rápidos.
        </div>
      )}

      {cocErrors.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
          Não consegui ler o COC de {cocErrors.length} conta(s) — essas VMs podem aparecer como "Sem cobertura" mesmo tendo
          agendamento no COC: {cocErrors.map((e) => e.perfil).join(', ')}.
        </div>
      )}

      {summary && (
        <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-6">
          <div className="ananim-metric">
            <p className="ananim-metric-label">VMs lidas</p>
            <p className="ananim-metric-value">{summary.total}</p>
          </div>
          <div className="ananim-metric">
            <p className="ananim-metric-label">No Cloud8</p>
            <p className="ananim-metric-value text-indigo-300">{summary.cloud8}</p>
          </div>
          <div className="ananim-metric">
            <p className="ananim-metric-label">No Portal</p>
            <p className="ananim-metric-value text-ananim-accentStrong">{summary.portal}</p>
          </div>
          <div className="ananim-metric">
            <p className="ananim-metric-label">No COC</p>
            <p className="ananim-metric-value text-orange-300">{summary.coc}</p>
          </div>
          <div className="ananim-metric">
            <p className="ananim-metric-label">Conflito</p>
            <p className="ananim-metric-value text-red-300">{summary.conflict}</p>
          </div>
          <div className="ananim-metric">
            <p className="ananim-metric-label">Sem cobertura</p>
            <p className="ananim-metric-value text-amber-300">{summary.none}</p>
          </div>
        </div>
      )}

      {totalRowsFound != null && clients && (
        <p className="mt-3 text-xs text-ananim-muted">
          {clients.length} cliente(s), {totalRowsFound} VMs no total.
        </p>
      )}

      {clients && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente ou nome da VM..."
              className="ananim-input w-72"
            />
            <div className="flex flex-wrap gap-2">
              {ORIGIN_FILTERS.map((o) => (
                <button
                  key={o || 'all'}
                  type="button"
                  onClick={() => setOrigin(o)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    origin === o
                      ? 'border-white/30 bg-white/10 text-white'
                      : 'border-white/10 text-ananim-muted hover:text-white'
                  }`}
                >
                  {o ? ORIGIN_LABEL[o] : 'Todas as origens'}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {filteredClients.map((c) => (
              <div key={c.provider} className="ananim-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleClient(c.provider)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.02]"
                >
                  <span className="flex items-center gap-2 font-medium text-white">
                    {isOpen(c.provider) ? <ChevronDown className="h-4 w-4 text-ananim-muted" /> : <ChevronRight className="h-4 w-4 text-ananim-muted" />}
                    {c.provider}
                  </span>
                  <span className="text-xs text-ananim-muted">{c.vms.length} VM{c.vms.length === 1 ? '' : 's'}</span>
                </button>

                {isOpen(c.provider) && (
                  <div className="overflow-x-auto border-t border-white/10">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-ananim-muted">
                          <th className="px-4 py-2">VM</th>
                          <th className="px-4 py-2">Tipo</th>
                          <th className="px-4 py-2">Região</th>
                          <th className="px-4 py-2">IP</th>
                          <th className="px-4 py-2">Origem</th>
                          <th className="px-4 py-2">Programação</th>
                          <th className="px-4 py-2">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.vms.map((v) => {
                          const cocTrigger = formatCocTrigger(v.cocSchedule?.triggerTime);
                          const isBusy = (suffix: string) => actionKey === `${v.recordId}:${suffix}`;
                          const anyBusy = actionKey !== null && actionKey.startsWith(`${v.recordId}:`);
                          return (
                            <tr key={v.recordId} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                              <td className="px-4 py-2 font-medium text-white">{v.name}</td>
                              <td className="px-4 py-2 text-ananim-textSoft">{v.tipo || '—'}</td>
                              <td className="px-4 py-2 text-ananim-textSoft">{v.region || '—'}</td>
                              <td className="px-4 py-2 text-ananim-textSoft">{v.ipExterno || v.ipLocal || '—'}</td>
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${ORIGIN_BADGE_CLASS[v.origin]}`}>
                                  {ORIGIN_LABEL[v.origin]}
                                </span>
                                {v.origin === 'conflict' && (
                                  <div className="mt-1 text-xs text-ananim-muted">{v.sources.map((s) => ORIGIN_LABEL[s]).join(' + ')}</div>
                                )}
                              </td>
                              <td className="px-4 py-2 text-xs text-ananim-textSoft">
                                {v.inCoc && v.cocSchedule ? (
                                  <div>
                                    <div className="font-medium text-orange-300">{v.cocSchedule.jobName || 'COC'}</div>
                                    <div>{cocTrigger || '—'}</div>
                                  </div>
                                ) : v.schedules && v.schedules.length > 0 ? (
                                  <div className="space-y-1">
                                    {v.schedules.map((s) => (
                                      <div key={s.scheduleId} className="flex items-start justify-between gap-2">
                                        <div>
                                          <div className="font-medium text-indigo-300">{s.name || 'Cloud8'}</div>
                                          <div>
                                            {new Date(s.nextRun).toLocaleString('pt-BR')}
                                            {s.isrecurrent ? ' (recorrente)' : ''}
                                          </div>
                                        </div>
                                        {hasPerm('cloud8:schedule:manage') && s.id != null && (() => {
                                          const suspendKey = `${v.recordId}:cloud8-suspend-${s.id}`;
                                          const deleteKey = `${v.recordId}:cloud8-delete-${s.id}`;
                                          const entryBusy = actionKey === suspendKey || actionKey === deleteKey;
                                          return (
                                          <span className="shrink-0 flex items-center gap-2">
                                            {!s.isrecurrent && (
                                              <button
                                                type="button"
                                                onClick={() => setScheduleModal({ vmName: v.name, resourceId: v.recordId, editing: s })}
                                                disabled={entryBusy}
                                                className="text-indigo-300 hover:text-white text-xs underline disabled:opacity-50"
                                              >
                                                Editar
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => handleCloud8Suspend(v, s)}
                                              disabled={entryBusy}
                                              className="text-orange-300 hover:text-orange-100 text-xs underline disabled:opacity-50"
                                            >
                                              {actionKey === suspendKey ? '...' : 'Suspender'}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleCloud8Delete(v, s)}
                                              disabled={entryBusy}
                                              className="text-red-300 hover:text-red-100 text-xs underline disabled:opacity-50"
                                            >
                                              {actionKey === deleteKey ? '...' : 'Remover'}
                                            </button>
                                          </span>
                                          );
                                        })()}
                                      </div>
                                    ))}
                                  </div>
                                ) : v.hasSchedule ? (
                                  <span title="O Cloud8 indicou que existe agendamento, mas não achei o horário exato na janela consultada.">
                                    Cloud8 (sem horário)
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-4 py-2">
                                <span className="inline-flex flex-wrap gap-1">
                                  {v.vmIdentity && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleVmAction(v, 'start')}
                                        disabled={anyBusy}
                                        className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-200 border border-emerald-500/20 text-xs font-medium hover:bg-emerald-500/15 disabled:opacity-50"
                                        title="Ligar VM"
                                      >
                                        {isBusy('vm-start') ? '...' : 'Ligar'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleVmAction(v, 'stop')}
                                        disabled={anyBusy}
                                        className="px-2 py-1 rounded bg-amber-500/10 text-amber-200 border border-amber-500/20 text-xs font-medium hover:bg-amber-500/15 disabled:opacity-50"
                                        title="Parar VM"
                                      >
                                        {isBusy('vm-stop') ? '...' : 'Parar'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleVmAction(v, 'restart')}
                                        disabled={anyBusy}
                                        className="px-2 py-1 rounded bg-ananim-accent/10 text-ananim-accent border border-ananim-accent/20 text-xs font-medium hover:bg-ananim-accent/15 disabled:opacity-50"
                                        title="Reiniciar VM"
                                      >
                                        {isBusy('vm-restart') ? '...' : 'Reiniciar'}
                                      </button>
                                    </>
                                  )}
                                  {v.inCoc && v.cocSchedule?.taskId && hasPerm('coc:schedule:toggle') && (
                                    <button
                                      type="button"
                                      onClick={() => handleCocPause(v)}
                                      disabled={anyBusy}
                                      className="px-2 py-1 rounded bg-orange-500/10 text-orange-200 border border-orange-500/20 text-xs font-medium hover:bg-orange-500/15 disabled:opacity-50"
                                      title="Pausar programação no COC"
                                    >
                                      {isBusy('coc-pause') ? '...' : 'Pausar prog.'}
                                    </button>
                                  )}
                                  {v.inCoc && v.cocSchedule?.taskId && hasPerm('coc:schedule:delete') && (
                                    <button
                                      type="button"
                                      onClick={() => handleCocDelete(v)}
                                      disabled={anyBusy}
                                      className="px-2 py-1 rounded bg-red-500/10 text-red-300 border border-red-500/20 text-xs font-medium hover:bg-red-500/15 disabled:opacity-50"
                                      title="Remover programação do COC"
                                    >
                                      {isBusy('coc-delete') ? '...' : 'Remover prog.'}
                                    </button>
                                  )}
                                  {hasPerm('cloud8:schedule:manage') && !v.recordId.startsWith('orphan-') && !v.inCoc && !v.inPortal && (
                                    <button
                                      type="button"
                                      onClick={() => setScheduleModal({ vmName: v.name, resourceId: v.recordId, editing: null })}
                                      disabled={anyBusy}
                                      className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-xs font-medium hover:bg-indigo-500/15 disabled:opacity-50"
                                      title="Criar nova programação no Cloud8"
                                    >
                                      Nova prog.
                                    </button>
                                  )}
                                  {!v.vmIdentity && !(v.inCoc && v.cocSchedule?.taskId) && !(hasPerm('cloud8:schedule:manage') && !v.recordId.startsWith('orphan-') && !v.inCoc && !v.inPortal) && (
                                    <span className="text-xs text-ananim-muted">—</span>
                                  )}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {filteredClients.length === 0 && (
              <div className="ananim-card p-6 text-center text-sm text-ananim-muted">Nenhum cliente/VM encontrado para esse filtro.</div>
            )}
          </div>
        </>
      )}

      {!clients && !loading && !error && (
        <div className="mt-6 ananim-card p-6 text-sm text-ananim-muted">
          Clique em "Carregar" para ler o inventário do Cloud8, agrupado por cliente.
        </div>
      )}

      {scheduleModal && (
        <Cloud8ScheduleModal
          open
          onClose={() => setScheduleModal(null)}
          onSaved={load}
          vmName={scheduleModal.vmName}
          resourceId={scheduleModal.resourceId}
          editing={scheduleModal.editing}
        />
      )}
    </div>
  );
}
