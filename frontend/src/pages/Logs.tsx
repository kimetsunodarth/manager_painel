import { useState, useEffect } from 'react';
import { auditLogs, type AuditLogEntry } from '../api/client';
import PageHeader from '../components/PageHeader';

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
    login_failed: 'Login falhou',
    login_locked: 'Conta bloqueada',
    security_geo_block: 'Bloqueio geográfico',
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

  const formatLocation = (entry: AuditLogEntry) => {
    const parts = [entry.cityName, entry.regionName, entry.countryName].filter(Boolean);
    return parts.length ? parts.join(' / ') : 'Local não identificado';
  };

  return (
    <div className="ananim-page">
      <PageHeader
        badge="Auditoria"
        title="Log de auditoria"
        description="Rastreie login, ações operacionais e alterações administrativas com foco em leitura rápida e contexto técnico."
        actions={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="ananim-btn-primary"
          >
            {loading ? 'Carregando...' : 'Atualizar'}
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="ananim-metric">
          <p className="ananim-metric-label">Janela carregada</p>
          <p className="ananim-metric-value">Até 500 eventos</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Registros</p>
          <p className="ananim-metric-value">{list.length}</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Status</p>
          <p className="ananim-metric-value">{loading ? 'Sincronizando' : 'Atualizado'}</p>
        </div>
      </div>

      {error && <div className="ananim-alert-danger">{error}</div>}

      <div className="ananim-card overflow-hidden">
        {loading && list.length === 0 ? (
          <div className="p-8 text-center text-ananim-muted">Carregando...</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-ananim-muted">Nenhum registro no log.</div>
        ) : (
          <div className="ananim-table-wrap">
            <table className="ananim-table min-w-[1100px]">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Origem</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {list.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap text-ananim-textSoft">{formatDate(entry.createdAt)}</td>
                    <td>
                      <div className="font-medium text-ananim-text">{entry.userName || '—'}</div>
                      <div className="text-xs text-ananim-muted">{entry.userEmail || '—'}</div>
                    </td>
                    <td className="text-ananim-textSoft">{getActionLabel(entry.action || '') || '—'}</td>
                    <td className="text-ananim-textSoft">
                      <div className="mb-1 inline-block rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-sm text-ananim-text">{entry.ipAddress || '—'}</div>
                      <div className="text-xs text-ananim-textSoft">{formatLocation(entry)}</div>
                      {entry.countryCode && (
                        <div className="mt-1 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                          {entry.countryCode}
                        </div>
                      )}
                      {entry.userAgent && (
                        <div className="mt-1 max-w-[180px] truncate text-xs text-ananim-muted" title={entry.userAgent}>
                          {entry.userAgent}
                        </div>
                      )}
                    </td>
                    <td className="align-top text-ananim-textSoft">
                      {entry.details != null ? (
                        <div className="min-w-[200px] max-w-[480px]">
                          {formatDetailsSummary(entry.details) && (
                            <p className="mb-1 text-xs font-medium text-ananim-text">{formatDetailsSummary(entry.details)}</p>
                          )}
                          <pre className="max-h-32 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/20 p-2 text-xs text-ananim-textSoft">
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
                            className="mt-1 text-xs text-ananim-accent hover:text-white"
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
