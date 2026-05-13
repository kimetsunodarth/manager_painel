import { useState, useEffect, useMemo } from 'react';
import { backups as api, type CbrByClientItem, type CbrBackupItem } from '../api/client';

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
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        <h2 className="text-xl font-semibold font-display text-white">Detalhes / Backups</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="search"
            placeholder="Pesquisar por recurso, nome do backup ou projeto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ananim-input w-72 max-w-full py-1.5 text-sm"
            aria-label="Pesquisar backups"
          />
          <button
            type="button"
            onClick={() => loadCbr()}
            className="ananim-btn-primary px-3 py-1.5"
          >
            Atualizar
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-300 mb-4">Backups da semana (últimos 7 dias), agrupados por recurso.</p>
      <div className="ananim-card overflow-hidden">
          {cbrLoading ? (
            <div className="p-8 text-center text-gray-400">Carregando CBR...</div>
          ) : resourceGroups.length > 0 ? (
            <div className="divide-y divide-white/10">
              {resourceGroups.map((group) => (
                <div key={group.resourceName} className="p-4">
                  <h3 className="text-base font-semibold text-white mb-2">
                    {group.resourceName}
                    <span className="text-sm font-normal text-gray-400 ml-2">({group.backups.length} backup{group.backups.length !== 1 ? 's' : ''})</span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white/[0.04] border-b border-white/10">
                        <tr>
                          <th className="text-left py-2 px-3 font-semibold text-gray-200">Nome do backup</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-200">Projeto</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-200">Criado em</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-200">Tipo</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-200">Status</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-200">Tamanho</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.backups.map((b) => (
                          <tr key={b.id} className="border-b border-white/10 hover:bg-white/[0.03]">
                            <td className="py-2 px-3">{b.name || b.id}</td>
                            <td className="py-2 px-3 text-gray-300">{b.clientName}{b.region ? ` (${b.region})` : ''}</td>
                            <td className="py-2 px-3">{formatCbrDate(b.created_at)}</td>
                            <td className="py-2 px-3">{b.type}</td>
                            <td className="py-2 px-3">{b.status}</td>
                            <td className="py-2 px-3">{formatSize(b.resource_size || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : cbrData && cbrData.byClient.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Nenhum cliente/projeto configurado ou sem backups na semana.</div>
          ) : search.trim() ? (
            <div className="p-8 text-center text-gray-400">Nenhum resultado para &quot;{search.trim()}&quot;.</div>
          ) : null}
      </div>
    </div>
  );
}
