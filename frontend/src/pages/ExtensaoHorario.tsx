import { useState, useEffect } from 'react';
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

function formatHours(h: number | null) {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(2)} h`;
}

/** Cronômetro em tempo real para sessão aberta (endedAt null). */
function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  return (
    <span className="font-mono text-amber-700 font-medium">
      {h > 0 ? `${h}h ` : ''}{m} min
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar sessões.');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openSessions = list.filter((s) => !s.endedAt);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-semibold text-gray-800">Extensão de horário</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            title="De (data início)"
          />
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            title="Até (data início)"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">Todos os tipos</option>
            <option value="cancel_stop">Cancelou programação</option>
            <option value="manual_start">Ligou após horário</option>
          </select>
          <input
            type="text"
            value={filterProjectKey}
            onChange={(e) => setFilterProjectKey(e.target.value)}
            placeholder="Projeto (projectKey)"
            className="border border-gray-300 rounded px-2 py-1.5 text-sm w-40"
          />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Carregando...' : 'Consultar'}
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Horas a mais por cancelamento da programação do dia ou por ligar a VM após o horário. O cronômetro conta a partir do horário programado (quando cancelou) ou da hora em que a VM foi ligada.
      </p>

      {openSessions.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-medium text-amber-800">
            {openSessions.length} extensão(ões) em andamento — cronômetro ativo até desligar a VM.
          </p>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading && list.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhuma sessão de extensão no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Projeto</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">VM</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Tipo</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Início</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Fim</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Horas</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Usuário</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-4 text-gray-700">{s.projectKey}</td>
                    <td className="py-2 px-4">{s.serverName || s.serverId}</td>
                    <td className="py-2 px-4">{TYPE_LABELS[s.type] || s.type}</td>
                    <td className="py-2 px-4 text-gray-600">{formatDate(s.startedAt)}</td>
                    <td className="py-2 px-4 text-gray-600">
                      {s.endedAt ? formatDate(s.endedAt) : '—'}
                    </td>
                    <td className="py-2 px-4">
                      {s.endedAt != null ? formatHours(s.hours) : <LiveTimer startedAt={s.startedAt} />}
                    </td>
                    <td className="py-2 px-4 text-gray-600">{s.userName || s.userEmail || '—'}</td>
                    <td className="py-2 px-4">
                      {s.endedAt ? (
                        <span className="text-green-700">Encerrado</span>
                      ) : (
                        <span className="text-amber-700 font-medium">Em andamento</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
