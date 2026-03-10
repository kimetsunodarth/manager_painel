import { useState, useEffect } from 'react';
import { auditLogs, type AuditLogEntry } from '../api/client';

export default function Logs() {
  const [list, setList] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditLogs.list(500);
      setList(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar log.');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const actionLabels: Record<string, string> = {
    Login: 'Login',
    ecs_start: 'Ligar VM',
    ecs_stop: 'Stop VM',
    ecs_restart: 'Restart VM',
    service_restart: 'Restart serviço',
    service_list: 'Listar serviço',
    service_execute: 'Executar serviço',
    cancel_stop_requested: 'Cancelar stop (prorrogação)',
    cancel_stop_cleared: 'Remover cancelamento de stop',
    schedule_add: 'Agendamento adicionado',
    schedule_update: 'Agendamento atualizado',
    schedule_delete: 'Agendamento excluído',
    schedule_stop: 'Stop programado (cron)',
    schedule_start: 'Start programado (cron)',
    schedule_restart: 'Restart programado (cron)',
    schedule_error: 'Erro em agendamento',
    schedule_cancel_for_date: 'Cancelar agendamento para dia',
    schedule_clear_cancel_for_date: 'Remover cancelamento para dia',
    'Usuário criado': 'Usuário criado',
    'Usuário atualizado': 'Usuário atualizado',
    'Usuário removido': 'Usuário removido',
    'Senha redefinida': 'Senha redefinida',
    'Ativar Support (Control Center)': 'Ativar Support',
    client_delete: 'Cliente excluído',
    'apply-visible-projects': 'Aplicar projetos visíveis',
    'clear-visible-projects': 'Limpar projetos visíveis',
    'Serviço executado': 'Serviço executado',
  };
  const getActionLabel = (action: string) => actionLabels[action] || action;

  const formatDetailsSummary = (details: unknown): string | null => {
    if (details == null || typeof details !== 'object') return null;
    const d = details as Record<string, unknown>;
    const serverName = typeof d.serverName === 'string' ? d.serverName : null;
    const projectKey = typeof d.projectKey === 'string' ? d.projectKey : null;
    const projectId = typeof d.projectId === 'string' ? d.projectId : null;
    const scheduleCreatedBy = typeof d.scheduleCreatedBy === 'string' ? d.scheduleCreatedBy : null;
    const parts: string[] = [];
    if (serverName) parts.push(`VM ${serverName}`);
    if (projectKey || projectId) parts.push(`projeto ${projectKey || projectId}`);
    if (scheduleCreatedBy) parts.push(`(agend. por ${scheduleCreatedBy})`);
    return parts.length ? parts.join(' — ') : null;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Log de auditoria</h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Carregando...' : 'Atualizar'}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Log detalhado: login (nome), dia, hora e ação (restart de VM, restart de serviço, etc.).
      </p>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading && list.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhum registro no log.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Data</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Usuário</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Ação</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Origem</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {list.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-4 text-gray-600 whitespace-nowrap">{formatDate(entry.createdAt)}</td>
                    <td className="py-2 px-4">
                      <div className="font-medium">{entry.userName || '—'}</div>
                      <div className="text-xs text-gray-500">{entry.userEmail || '—'}</div>
                    </td>
                    <td className="py-2 px-4">{getActionLabel(entry.action || '') || '—'}</td>
                    <td className="py-2 px-4 text-gray-600">
                      <div className="text-sm font-mono bg-gray-100 px-1 rounded inline-block mb-1">{entry.ipAddress || '—'}</div>
                      {entry.userAgent && (
                        <div className="text-xs text-gray-400 max-w-[120px] truncate" title={entry.userAgent}>
                          {entry.userAgent}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-4 text-gray-700 align-top">
                      {entry.details != null ? (
                        <div className="min-w-[200px] max-w-[480px]">
                          {formatDetailsSummary(entry.details) && (
                            <p className="text-xs text-gray-800 font-medium mb-1">{formatDetailsSummary(entry.details)}</p>
                          )}
                          <pre className="text-xs whitespace-pre-wrap break-all bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto overflow-y-auto max-h-32 font-sans">
                            {typeof entry.details === 'object'
                              ? JSON.stringify(entry.details, null, 2)
                              : String(entry.details)}
                          </pre>
                          <button
                            type="button"
                            onClick={() => {
                              const text = typeof entry.details === 'object' ? JSON.stringify(entry.details, null, 2) : String(entry.details);
                              navigator.clipboard?.writeText(text);
                            }}
                            className="mt-1 text-xs text-blue-600 hover:underline"
                          >
                            Copiar
                          </button>
                        </div>
                      ) : (
                        '—'
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
