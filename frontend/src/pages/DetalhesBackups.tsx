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
        <h2 className="text-xl font-semibold text-gray-800">Detalhes / Backups</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="search"
            placeholder="Pesquisar por recurso, nome do backup ou projeto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-72 max-w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Pesquisar backups"
          />
          <button
            type="button"
            onClick={() => loadCbr()}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
          >
            Atualizar
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-4">Backups da semana (últimos 7 dias), agrupados por recurso.</p>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {cbrLoading ? (
            <div className="p-8 text-center text-gray-500">Carregando CBR...</div>
          ) : resourceGroups.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {resourceGroups.map((group) => (
                <div key={group.resourceName} className="p-4">
                  <h3 className="text-base font-semibold text-gray-800 mb-2">
                    {group.resourceName}
                    <span className="text-sm font-normal text-gray-500 ml-2">({group.backups.length} backup{group.backups.length !== 1 ? 's' : ''})</span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-2 px-3 font-semibold text-gray-700">Nome do backup</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-700">Projeto</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-700">Criado em</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-700">Tipo</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-700">Status</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-700">Tamanho</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.backups.map((b) => (
                          <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2 px-3">{b.name || b.id}</td>
                            <td className="py-2 px-3 text-gray-600">{b.clientName}{b.region ? ` (${b.region})` : ''}</td>
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
            <div className="p-8 text-center text-gray-500">Nenhum cliente/projeto configurado ou sem backups na semana.</div>
          ) : search.trim() ? (
            <div className="p-8 text-center text-gray-500">Nenhum resultado para &quot;{search.trim()}&quot;.</div>
          ) : null}
      </div>
    </div>
  );
}
