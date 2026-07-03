import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { licenses as api, type AddonItem, type LicenseSummary } from '../api/client';
import { useUser } from '../hooks/useUser';

const LABELS: Record<string, string> = {
  crm: 'CRM',
  financials: 'Financials',
  logistics: 'Logistics',
  professional: 'Professional',
  licencasIndiretas: 'Licenças indiretas',
  totalUsuariosLicenciados: 'Usuários licenciados',
  totalLicencas: 'Total de licenças',
};

const BAR_STYLES: Record<string, string> = {
  crm: 'from-cyan-400 to-sky-500',
  financials: 'from-amber-400 to-orange-500',
  logistics: 'from-yellow-300 to-amber-500',
  professional: 'from-emerald-400 to-teal-500',
  licencasIndiretas: 'from-blue-400 to-indigo-500',
  totalUsuariosLicenciados: 'from-slate-400 to-slate-500',
  totalLicencas: 'from-fuchsia-400 to-violet-500',
};

function sumAddonCount(addons: AddonItem[]) {
  return addons.reduce((total, addon) => total + (Number(addon.count) || 0), 0);
}

export default function Licencas() {
  const user = useUser();
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
        const [summaryData, addonsData, licenseData] = await Promise.all([
          api.summary(),
          api.addons(),
          api.addonsLicense(),
        ]);
        setSummary(summaryData);
        setAddons(addonsData);
        setLicencaAddons(licenseData.licencaAddons ?? '');
      } catch (error) {
        console.error(error);
        setLoadError('Não foi possível carregar. Verifique se o backend está rodando na porta esperada.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSaveSummary = async () => {
    if (!summary) return;
    setSummarySaving(true);
    setSaveMessage(null);
    try {
      await api.updateSummary(summary);
      setSaveMessage('Quantidades salvas com sucesso.');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error(error);
      setSaveMessage('Erro ao salvar quantidades.');
    } finally {
      setSummarySaving(false);
    }
  };

  const onSaveAddons = async () => {
    setAddonsSaving(true);
    setSaveMessage(null);
    try {
      await api.updateAddons(addons);
      setSaveMessage('Add-ons salvos com sucesso.');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      console.error(error);
      setSaveMessage('Erro ao salvar add-ons.');
    } finally {
      setAddonsSaving(false);
    }
  };

  const summaryEntries = summary && typeof summary === 'object' ? Object.entries(summary) : [];
  const maxVal = summaryEntries.length
    ? Math.max(
        1,
        ...summaryEntries.map(([, value]) => Number(value) || 0)
      )
    : 1;

  const totalLicencas = Number(summary?.totalLicencas) || 0;
  const totalUsuariosLicenciados = Number(summary?.totalUsuariosLicenciados) || 0;
  const occupancyPercent = totalLicencas > 0 ? Math.min(100, Math.round((totalUsuariosLicenciados / totalLicencas) * 100)) : 0;
  const addonsCount = addons.length;
  const addonsUnits = sumAddonCount(addons);

  const addonGradient = useMemo(() => {
    if (!addons.length) return 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))';
    const total = Math.max(1, addons.length);
    return `conic-gradient(${addons
      .map((addon, index) => `${addon.color} ${(index / total) * 360}deg ${((index + 1) / total) * 360}deg`)
      .join(', ')})`;
  }, [addons]);

  return (
    <div className="ananim-page">
      <PageHeader
        badge="Licenças"
        title="Licenças SAP e add-ons"
        description="Concentre capacidade contratada, ocupação atual, add-ons instalados e a licença operacional em um painel mais limpo."
        actions={
          <Link to="/servicos" className="ananim-btn-ghost">
            Abrir Serviços
          </Link>
        }
      />

      {loading ? (
        <div className="ananim-card p-10 text-center text-ananim-muted">Carregando licenças...</div>
      ) : loadError ? (
        <div className="ananim-card border-amber-400/20 bg-amber-500/10 p-8 text-center">
          <p className="text-sm font-medium text-amber-200">{loadError}</p>
          <p className="mt-3 text-sm text-ananim-textSoft">Se o backend estiver em outra porta, reinicie o frontend com a porta correta.</p>
          <code className="mt-3 inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-ananim-text">npm run dev:3002</code>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="ananim-metric">
              <p className="ananim-metric-label">Total contratado</p>
              <p className="ananim-metric-value">{totalLicencas}</p>
            </div>
            <div className="ananim-metric">
              <p className="ananim-metric-label">Usuários licenciados</p>
              <p className="ananim-metric-value">{totalUsuariosLicenciados}</p>
            </div>
            <div className="ananim-metric">
              <p className="ananim-metric-label">Add-ons ativos</p>
              <p className="ananim-metric-value">{addonsUnits}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
            <section className="ananim-card p-6">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="ananim-section-title">Capacidade por módulo</h3>
                  <p className="ananim-section-subtitle">Acompanhe distribuição, ocupação e ajuste os totais sem sair do painel.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-ananim-muted">Ocupação geral</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{occupancyPercent}%</p>
                </div>
              </div>

              <div className="space-y-4">
                {summaryEntries.map(([key, value]) => {
                  const numericValue = Number(value) || 0;
                  const percent = maxVal > 0 ? (numericValue / maxVal) * 100 : 0;
                  return (
                    <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-ananim-text">{LABELS[key] || key}</p>
                            {!isAdmin && <span className="text-lg font-semibold text-white">{numericValue}</span>}
                          </div>
                          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${BAR_STYLES[key] || 'from-slate-400 to-slate-500'}`}
                              style={{ width: `${Math.max(6, percent)}%` }}
                            />
                          </div>
                        </div>
                        {isAdmin ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-[0.16em] text-ananim-muted">Qtd.</span>
                            <input
                              type="number"
                              min={0}
                              value={numericValue}
                              onChange={(event) =>
                                setSummary((current) =>
                                  current
                                    ? { ...current, [key]: Math.max(0, parseInt(String(event.target.value), 10) || 0) }
                                    : current
                                )
                              }
                              className="ananim-input w-24 text-center"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {isAdmin && summary && (
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={onSaveSummary} disabled={summarySaving} className="ananim-btn-primary disabled:opacity-60">
                    {summarySaving ? 'Salvando...' : 'Salvar quantidades'}
                  </button>
                  {saveMessage && <span className={`text-sm ${saveMessage.includes('sucesso') ? 'text-emerald-300' : 'text-red-300'}`}>{saveMessage}</span>}
                </div>
              )}
            </section>

            <section className="space-y-6">
              <div className="ananim-card p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="ananim-section-title">Mapa de add-ons</h3>
                    <p className="ananim-section-subtitle">{addonsCount} tipo(s) cadastrados, total de {addonsUnits} unidade(s).</p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-ananim-muted">
                    Distribuição
                  </div>
                </div>
                <div className="flex flex-col items-center gap-5">
                  <div className="flex h-44 w-44 items-center justify-center rounded-full border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.35)]" style={{ background: addonGradient }}>
                    <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border border-white/10 bg-[#09111f]/90 backdrop-blur">
                      <span className="text-[11px] uppercase tracking-[0.16em] text-ananim-muted">Itens</span>
                      <span className="mt-1 text-2xl font-semibold text-white">{addonsUnits}</span>
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="w-full space-y-3">
                      {addons.map((addon, index) => (
                        <div key={index} className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 md:grid-cols-[1fr_90px_60px_auto] md:items-center">
                          <input
                            type="text"
                            value={addon.name}
                            onChange={(event) =>
                              setAddons((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)))
                            }
                            placeholder="Nome do add-on"
                            className="ananim-input"
                          />
                          <input
                            type="number"
                            min={0}
                            value={addon.count}
                            onChange={(event) =>
                              setAddons((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, count: Math.max(0, parseInt(String(event.target.value), 10) || 0) } : item
                                )
                              )
                            }
                            className="ananim-input text-center"
                          />
                          <input
                            type="color"
                            value={addon.color}
                            onChange={(event) =>
                              setAddons((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, color: event.target.value } : item)))
                            }
                            className="h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-transparent"
                          />
                          <button
                            type="button"
                            onClick={() => setAddons((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                            className="ananim-btn bg-red-500/10 text-red-200 border border-red-500/20 hover:bg-red-500/15"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setAddons((current) => [...current, { name: '', count: 0, color: '#38bdf8' }])}
                          className="ananim-btn-ghost"
                        >
                          Adicionar add-on
                        </button>
                        <button type="button" onClick={onSaveAddons} disabled={addonsSaving} className="ananim-btn-primary disabled:opacity-60">
                          {addonsSaving ? 'Salvando...' : 'Salvar add-ons'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full space-y-2">
                      {addons.map((addon, index) => (
                        <div key={index} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                          <span className="flex items-center gap-3 text-sm text-ananim-text">
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: addon.color }} />
                            {addon.name}
                          </span>
                          <span className="text-sm font-semibold text-white">{addon.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="ananim-card p-6">
                <h3 className="ananim-section-title">Licença de add-ons</h3>
                <p className="ananim-section-subtitle">Texto operacional usado para consulta e conferência de contrato.</p>
                {isAdmin ? (
                  <>
                    <textarea
                      value={licencaAddons}
                      onChange={(event) => setLicencaAddons(event.target.value)}
                      rows={6}
                      className="ananim-input mt-4 min-h-[160px] resize-y"
                      placeholder="Texto da licença de add-ons"
                    />
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={async () => {
                          setLicencaAddonsMessage(null);
                          setLicencaAddonsSaving(true);
                          try {
                            await api.updateAddonsLicense(licencaAddons);
                            setLicencaAddonsMessage('Salvo com sucesso.');
                            setTimeout(() => setLicencaAddonsMessage(null), 3000);
                          } catch (error: unknown) {
                            const err = error as { response?: { data?: { error?: string } }; message?: string };
                            setLicencaAddonsMessage(err.response?.data?.error || err.message || 'Erro ao salvar.');
                          } finally {
                            setLicencaAddonsSaving(false);
                          }
                        }}
                        disabled={licencaAddonsSaving}
                        className="ananim-btn-primary disabled:opacity-60"
                      >
                        {licencaAddonsSaving ? 'Salvando...' : 'Salvar licença'}
                      </button>
                      {licencaAddonsMessage && <span className={`text-sm ${licencaAddonsMessage.includes('sucesso') ? 'text-emerald-300' : 'text-red-300'}`}>{licencaAddonsMessage}</span>}
                    </div>
                  </>
                ) : (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-ananim-text whitespace-pre-wrap min-h-[140px]">
                    {licencaAddons || '(Nenhum texto cadastrado)'}
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="ananim-card p-6">
              <h3 className="ananim-section-title">Reinício de serviços</h3>
              <p className="ananim-section-subtitle">Ações operacionais de suporte HANA disponíveis no módulo de serviços.</p>
              <div className="mt-4 space-y-3">
                {[
                  'Reiniciar Banco HANA',
                  'Reiniciar EDS HANA',
                  'Reiniciar Service Layer HANA',
                  'Reiniciar SLD HANA',
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-ananim-text">
                    {item}
                  </div>
                ))}
              </div>
              <Link to="/servicos" className="ananim-btn-primary mt-5 inline-flex">
                Ir para Serviços
              </Link>
            </div>

            <div className="ananim-card p-6">
              <h3 className="ananim-section-title">Leitura rápida</h3>
              <p className="ananim-section-subtitle">Visão resumida para gestão sem poluição visual.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-ananim-muted">Capacidade livre</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{Math.max(0, totalLicencas - totalUsuariosLicenciados)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-ananim-muted">Tipos de add-on</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{addonsCount}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:col-span-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-ananim-muted">Diretriz operacional</p>
                  <p className="mt-2 text-sm leading-6 text-ananim-textSoft">
                    Use esta tela para manter números de contrato e inventário consistentes. Execução de restart continua separada em `Serviços`, sem misturar ações de infraestrutura com gestão de licenças.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
