import { useEffect, useMemo, useState } from 'react';
import { Clock3, Filter, RefreshCw } from 'lucide-react';
import { huawei, type ExtensionSession } from '../api/client';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatHours(hours: number | null) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(2)} h`;
}

function statusBadge(open: boolean) {
  return open
    ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
    : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
}

function typeBadge(type: string) {
  if (type === 'manual_start') return 'border-sky-400/25 bg-sky-400/10 text-sky-100';
  return 'border-violet-400/25 bg-violet-400/10 text-violet-100';
}

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);

  return (
    <span className="inline-flex min-w-[92px] justify-center rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 font-mono text-xs font-semibold text-amber-100">
      {hours > 0 ? `${hours}h ` : ''}
      {minutes} min
    </span>
  );
}

const TYPE_LABELS: Record<string, string> = {
  cancel_stop: 'Cancelou programação do dia',
  manual_start: 'Ligou VM após horário',
};

export default function ExtensaoHorario() {
  const [list, setList] = useState<ExtensionSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterProjectKey, setFilterProjectKey] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { from?: string; to?: string; type?: string; projectKey?: string } = {};
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;
      if (filterType) params.type = filterType;
      if (filterProjectKey) params.projectKey = filterProjectKey;
      const data = await huawei.extensionSessions(params);
      setList(Array.isArray(data) ? data : []);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Erro ao carregar sessões.');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openSessions = useMemo(() => list.filter((item) => !item.endedAt), [list]);

  return (
    <div className="ananim-page">
      <section className="ananim-page-header">
        <div className="ananim-page-header-copy">
          <span className="ananim-page-eyebrow">
            <Clock3 className="h-3.5 w-3.5" />
            Monitoramento de jornada
          </span>
          <h2 className="ananim-page-title">Extensão de horário</h2>
          <p className="ananim-page-description">
            Acompanhe cancelamentos de parada programada e ligações manuais fora da janela prevista. Os tempos ficam mais legíveis e o histórico não corta descrições longas.
          </p>
        </div>
        <div className="grid w-full gap-3 md:max-w-sm md:grid-cols-2">
          <div className="ananim-metric">
            <p className="ananim-metric-label">Sessões abertas</p>
            <p className="ananim-metric-value">{openSessions.length}</p>
          </div>
          <div className="ananim-metric">
            <p className="ananim-metric-label">Total listado</p>
            <p className="ananim-metric-value">{list.length}</p>
          </div>
        </div>
      </section>

      <section className="ananim-card p-5 md:p-6">
        <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h3 className="ananim-section-title">Filtros</h3>
            <p className="ananim-section-subtitle">
              Refine por período, tipo ou projeto para localizar rapidamente a extensão desejada.
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading} className="ananim-btn-primary min-w-[160px]">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Atualizando...' : 'Atualizar lista'}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.2fr_auto]">
          <label className="block">
            <span className="ananim-label">Data inicial</span>
            <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="ananim-input" />
          </label>
          <label className="block">
            <span className="ananim-label">Data final</span>
            <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="ananim-input" />
          </label>
          <label className="block">
            <span className="ananim-label">Tipo</span>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="ananim-select">
              <option value="">Todos os tipos</option>
              <option value="cancel_stop">Cancelou programação</option>
              <option value="manual_start">Ligou após horário</option>
            </select>
          </label>
          <label className="block">
            <span className="ananim-label">Projeto</span>
            <input
              type="text"
              value={filterProjectKey}
              onChange={(e) => setFilterProjectKey(e.target.value)}
              placeholder="Project key ou parte do nome"
              className="ananim-input"
            />
          </label>
          <button type="button" onClick={load} disabled={loading} className="ananim-btn-soft xl:self-end">
            <Filter className="h-4 w-4" />
            Consultar
          </button>
        </div>
      </section>

      {openSessions.length > 0 ? (
        <div className="ananim-alert-warning">
          <strong>{openSessions.length} extensão(ões) em andamento.</strong> O cronômetro segue ativo até o encerramento da VM.
        </div>
      ) : null}

      {error ? <div className="ananim-alert-danger">{error}</div> : null}

      <section className="ananim-card p-0 overflow-hidden">
        {loading && list.length === 0 ? (
          <div className="p-8 text-center text-ananim-muted">Carregando sessões...</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-ananim-muted">Nenhuma sessão de extensão encontrada para os filtros informados.</div>
        ) : (
          <div className="ananim-table-wrap">
            <table className="ananim-table min-w-[1180px]">
              <thead>
                <tr>
                  <th>Projeto</th>
                  <th>VM</th>
                  <th>Tipo</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Horas</th>
                  <th>Usuário</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((session) => {
                  const open = !session.endedAt;
                  return (
                    <tr key={session.id}>
                      <td className="max-w-[300px]">
                        <div className="font-medium text-ananim-text break-words">{session.projectKey}</div>
                      </td>
                      <td className="max-w-[180px]">
                        <div className="break-words text-ananim-text">{session.serverName || session.serverId}</div>
                      </td>
                      <td className="max-w-[220px]">
                        <span className={`inline-flex whitespace-normal rounded-full border px-2.5 py-1 text-xs font-semibold leading-5 ${typeBadge(session.type)}`}>
                          {TYPE_LABELS[session.type] || session.type}
                        </span>
                      </td>
                      <td>{formatDate(session.startedAt)}</td>
                      <td>{session.endedAt ? formatDate(session.endedAt) : '—'}</td>
                      <td>
                        {session.endedAt ? (
                          <span className="inline-flex min-w-[92px] justify-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs font-semibold text-ananim-text">
                            {formatHours(session.hours)}
                          </span>
                        ) : (
                          <LiveTimer startedAt={session.startedAt} />
                        )}
                      </td>
                      <td className="max-w-[180px]">
                        <div className="break-words text-ananim-textSoft">{session.userName || session.userEmail || '—'}</div>
                      </td>
                      <td>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadge(open)}`}>
                          {open ? 'Em andamento' : 'Encerrado'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
