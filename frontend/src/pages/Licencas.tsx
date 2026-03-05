import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { licenses as api, type LicenseSummary, type AddonItem } from '../api/client';
import type { User } from '../api/client';

const LABELS: Record<string, string> = {
  crm: 'CRM',
  financials: 'Financials',
  logistics: 'Logistics',
  professional: 'Professional',
  licencasIndiretas: 'Licenças Indiretas',
  totalUsuariosLicenciados: 'Total de usuários licenciados',
  totalLicencas: 'Total de licenças',
};

const BAR_COLORS: Record<string, string> = {
  crm: 'bg-gray-200',
  financials: 'bg-orange-500',
  logistics: 'bg-yellow-500',
  professional: 'bg-teal-600',
  licencasIndiretas: 'bg-blue-600',
  totalUsuariosLicenciados: 'bg-gray-400',
  totalLicencas: 'bg-purple-600',
};

function safeUser(): User {
  try {
    const raw = localStorage.getItem('user') || '{}';
    const u = JSON.parse(raw) as User;
    return u && typeof u === 'object' ? u : ({} as User);
  } catch {
    return {} as User;
  }
}

export default function Licencas() {
  const user = safeUser();
  const isAdmin = user?.role === 'admin';

  const [summary, setSummary] = useState<LicenseSummary | null>(null);
  const [addons, setAddons] = useState<AddonItem[]>([]);
  const [licencaAddons, setLicencaAddons] = useState('');
  const [licencaAddonsSaving, setLicencaAddonsSaving] = useState(false);
  const [licencaAddonsMessage, setLicencaAddonsMessage] = useState<string | null>(null);
  const [summarySaving, setSummarySaving] = useState(false);
  const [addonsSaving, setAddonsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [s, a, lic] = await Promise.all([api.summary(), api.addons(), api.addonsLicense()]);
        setSummary(s);
        setAddons(a);
        setLicencaAddons(lic.licencaAddons ?? '');
      } catch (e) {
        console.error(e);
        setLoadError('Não foi possível carregar. Verifique se o backend está rodando (porta 3001 ou a indicada no terminal).');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const summaryEntries = summary && typeof summary === 'object' ? Object.entries(summary) : [];
  const maxVal = summaryEntries.length
    ? Math.max(
        1,
        ...summaryEntries
          .filter(([k]) => k !== 'totalLicencas' && k !== 'totalUsuariosLicenciados')
          .map(([, v]) => Number(v) || 0),
        Number((summary as LicenseSummary)?.totalLicencas) || 0
      )
    : 1;

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Licenças SAP e Add-ons</h2>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Carregando...</div>
      ) : loadError ? (
        <div className="p-8 bg-amber-50 border border-amber-200 rounded-lg text-center">
          <p className="text-amber-800 mb-2">{loadError}</p>
          <p className="text-sm text-gray-600 mb-1">Se o backend estiver em outra porta (ex.: 3002), pare o frontend (Ctrl+C) e suba de novo com a porta certa:</p>
          <p className="text-sm font-mono bg-gray-200 px-2 py-1 rounded inline-block mt-1">npm run dev:3002</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-800 text-white px-4 py-3 font-medium">
              Quantidade de licenças SAP
            </div>
            <div className="p-4 space-y-3">
              {summaryEntries.map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-48 flex-shrink-0">
                      {LABELS[key] || key}:
                    </span>
                    {isAdmin ? (
                      <input
                        type="number"
                        min={0}
                        value={value}
                        onChange={(e) =>
                          setSummary((s) =>
                            s ? { ...s, [key]: Math.max(0, parseInt(String(e.target.value), 10) || 0) } : s
                          )
                        }
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="text-sm font-medium w-8">{value}</span>
                    )}
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden min-w-0">
                      <div
                        className={`h-full rounded-full ${BAR_COLORS[key] || 'bg-gray-400'}`}
                        style={{
                          width: maxVal > 0 ? `${((Number(value) || 0) / maxVal) * 100}%` : '0%',
                        }}
                      />
                    </div>
                  </div>
                ))}
              {isAdmin && summary && (
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onSaveSummary}
                    disabled={summarySaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                  >
                    {summarySaving ? 'Salvando...' : 'Salvar quantidades'}
                  </button>
                  {saveMessage && (
                    <span className={`text-sm ${saveMessage.includes('salv') ? 'text-green-600' : 'text-red-600'}`}>
                      {saveMessage}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-800 text-white px-4 py-3 font-medium">
              Add-on(s) detalhes
            </div>
            <div className="p-4 flex flex-col items-center">
              <div
                className="w-40 h-40 rounded-full border-4 border-gray-200 flex items-center justify-center text-sm text-gray-600"
                style={{
                  background: addons.length
                    ? `conic-gradient(${addons
                        .map(
                          (a, i) =>
                            `${a.color} ${(i / addons.length) * 360}deg ${((i + 1) / addons.length) * 360}deg`
                        )
                        .join(', ')})`
                    : 'gray',
                }}
              >
                {addons.length === 0 && 'Nenhum'}
              </div>
              {isAdmin ? (
                <div className="mt-4 w-full space-y-2">
                  {addons.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        value={a.name}
                        onChange={(e) =>
                          setAddons((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))
                          )
                        }
                        placeholder="Nome"
                        className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        value={a.count}
                        onChange={(e) =>
                          setAddons((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, count: Math.max(0, parseInt(String(e.target.value), 10) || 0) } : x
                            )
                          )
                        }
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                      <input
                        type="color"
                        value={a.color}
                        onChange={(e) =>
                          setAddons((prev) => prev.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))
                        }
                        className="w-10 h-8 rounded cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => setAddons((prev) => prev.filter((_, j) => j !== i))}
                        className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-sm"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setAddons((prev) => [...prev, { name: '', count: 0, color: '#2196f3' }])}
                      className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
                    >
                      + Adicionar add-on
                    </button>
                    <button
                      type="button"
                      onClick={onSaveAddons}
                      disabled={addonsSaving}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {addonsSaving ? 'Salvando...' : 'Salvar add-ons'}
                    </button>
                  </div>
                </div>
              ) : (
                <ul className="mt-4 space-y-1 text-sm">
                  {addons.map((a, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: a.color }}
                      />
                      {a.name} ({a.count})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-800 text-white px-4 py-3 font-medium">
              Reinício de serviços (SAP/HANA)
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-3">
                Ações de reinício pré-definidas para ambiente HANA. Execute na tela Serviços.
              </p>
              <ul className="space-y-2 text-sm text-gray-700 mb-4">
                <li>• Reiniciar Banco HANA</li>
                <li>• Reiniciar EDS HANA</li>
                <li>• Reiniciar Service Layer HANA</li>
                <li>• Reiniciar SLD HANA</li>
              </ul>
              <Link
                to="/servicos"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
              >
                Ir para Serviços (restart)
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-800 text-white px-4 py-3 font-medium">
              Licença de add-ons
            </div>
            <div className="p-4">
              {isAdmin ? (
                <>
                  <textarea
                    value={licencaAddons}
                    onChange={(e) => setLicencaAddons(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Texto da licença de add-ons (editável apenas por admin)"
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setLicencaAddonsMessage(null);
                        setLicencaAddonsSaving(true);
                        try {
                          await api.updateAddonsLicense(licencaAddons);
                          setLicencaAddonsMessage('Salvo com sucesso.');
                          setTimeout(() => setLicencaAddonsMessage(null), 3000);
                        } catch (e: unknown) {
                          const err = e as { response?: { data?: { error?: string } }; message?: string };
                          setLicencaAddonsMessage(err.response?.data?.error || err.message || 'Erro ao salvar.');
                        } finally {
                          setLicencaAddonsSaving(false);
                        }
                      }}
                      disabled={licencaAddonsSaving}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {licencaAddonsSaving ? 'Salvando...' : 'Salvar'}
                    </button>
                    {licencaAddonsMessage && (
                      <span className={`text-sm ${licencaAddonsMessage.includes('sucesso') ? 'text-green-600' : 'text-red-600'}`}>
                        {licencaAddonsMessage}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap min-h-[6rem]">
                  {licencaAddons || '(Nenhum texto cadastrado)'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
