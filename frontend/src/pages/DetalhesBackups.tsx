import { useState, useEffect, useMemo } from 'react';
import { backups as api, type CbrByClientItem, type CbrBackupItem } from '../api/client';
import PageHeader from '../components/PageHeader';

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`;
  return `${bytes} B`;
}

function formatCbrDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

const DAYS_SEMANA = 7;

type BackupWithClient = CbrBackupItem & { clientName: string; region?: string };

/** Agrupa todos os backups por nome do recurso, ordenado por nome do recurso. */
function groupBackupsByResource(byClient: CbrByClientItem[]): { resourceName: string; backups: BackupWithClient[] }[] {
  const map = new Map<string, BackupWithClient[]>();
  for (const client of byClient) {
    if (client.error || !client.backups?.length) continue;
    for (const b of client.backups) {
      const key = (b.resource_name || b.resource_id || b.id || 'Outros').trim() || 'Outros';
      const list = map.get(key) || [];
      list.push({ ...b, clientName: client.clientName || client.profile || '', region: client.region });
      map.set(key, list);
    }
  }
  return Array.from(map.entries())
    .map(([resourceName, backups]) => ({
      resourceName,
      backups: backups.sort((a, b) =>
        (a.name || a.id || '').localeCompare(b.name || b.id || '', 'pt-BR', { sensitivity: 'base' })
      ),
    }))
    .sort((a, b) =>
      a.resourceName.localeCompare(b.resourceName, 'pt-BR', { sensitivity: 'base' })
    );
}

export default function DetalhesBackups() {
  const [cbrData, setCbrData] = useState<{ byClient: CbrByClientItem[]; days: number } | null>(null);
  const [cbrLoading, setCbrLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadCbr = async () => {
    setCbrLoading(true);
    const timeout = window.setTimeout(() => setCbrLoading(false), 30000);
    try {
      const res = await api.listCbr(DAYS_SEMANA);
      setCbrData(res);
    } catch (e) {
      console.error(e);
      setCbrData(null);
    } finally {
      window.clearTimeout(timeout);
      setCbrLoading(false);
    }
  };

  useEffect(() => {
    loadCbr();
  }, []);

  const searchLower = search.trim().toLowerCase();
  const resourceGroups = useMemo(() => {
    if (!cbrData?.byClient?.length) return [];
    const groups = groupBackupsByResource(cbrData.byClient);
    if (!searchLower) return groups;
    return groups
      .map((g) => ({
        ...g,
        backups: g.backups.filter(
          (b) =>
            (g.resourceName || '').toLowerCase().includes(searchLower) ||
            (b.name || '').toLowerCase().includes(searchLower) ||
            (b.id || '').toLowerCase().includes(searchLower) ||
            (b.clientName || '').toLowerCase().includes(searchLower)
        ),
      }))
      .filter((g) => g.backups.length > 0);
  }, [cbrData?.byClient, searchLower]);

  return (
    <div className="ananim-page">
      <PageHeader
        badge="Backups"
        title="Detalhes / Backups"
        description="Consulte backups CBR da semana com pesquisa rápida, agrupamento por recurso e leitura mais limpa para operação."
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="search"
              placeholder="Pesquisar por recurso, backup ou projeto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ananim-input min-w-[260px] max-w-full text-sm"
              aria-label="Pesquisar backups"
            />
            <button
              type="button"
              onClick={() => loadCbr()}
              className="ananim-btn-primary px-4"
            >
              Atualizar
            </button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="ananim-metric">
          <p className="ananim-metric-label">Janela</p>
          <p className="ananim-metric-value">Últimos {DAYS_SEMANA} dias</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Recursos</p>
          <p className="ananim-metric-value">{resourceGroups.length}</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Busca</p>
          <p className="ananim-metric-value">{search.trim() ? 'Filtrando' : 'Completa'}</p>
        </div>
      </div>

      <p className="text-sm text-ananim-textSoft">Backups da semana (últimos 7 dias), agrupados por recurso.</p>
      <div className="ananim-card overflow-hidden">
          {cbrLoading ? (
            <div className="p-8 text-center text-ananim-muted">Carregando CBR...</div>
          ) : resourceGroups.length > 0 ? (
            <div className="divide-y divide-white/10">
              {resourceGroups.map((group) => (
                <div key={group.resourceName} className="p-5 md:p-6">
                  <h3 className="ananim-section-title">
                    {group.resourceName}
                    <span className="ml-2 text-sm font-normal text-ananim-muted">({group.backups.length} backup{group.backups.length !== 1 ? 's' : ''})</span>
                  </h3>
                  <div className="ananim-table-wrap mt-4">
                    <table className="ananim-table">
                      <thead>
                        <tr>
                          <th>Nome do backup</th>
                          <th>Projeto</th>
                          <th>Criado em</th>
                          <th>Tipo</th>
                          <th>Status</th>
                          <th>Tamanho</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.backups.map((b) => (
                          <tr key={b.id}>
                            <td className="font-medium text-ananim-text">{b.name || b.id}</td>
                            <td>{b.clientName}{b.region ? ` (${b.region})` : ''}</td>
                            <td>{formatCbrDate(b.created_at)}</td>
                            <td>{b.type}</td>
                            <td>{b.status}</td>
                            <td>{formatSize(b.resource_size || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : cbrData && cbrData.byClient.length === 0 ? (
            <div className="p-8 text-center text-ananim-muted">Nenhum cliente/projeto configurado ou sem backups na semana.</div>
          ) : search.trim() ? (
            <div className="p-8 text-center text-ananim-muted">Nenhum resultado para &quot;{search.trim()}&quot;.</div>
          ) : null}
      </div>
    </div>
  );
}
