import { useEffect, useMemo, useState } from 'react';
import { Clock3, MapPin, Receipt, Settings2, ShieldCheck } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { huawei, type ClientExtraHourItem } from '../api/client';
import { useUser } from '../hooks/useUser';
import TarifaHorasExtras from './TarifaHorasExtras';

function formatDateTime(value: string | null) {
  if (!value) return 'Em aberto';
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 min';
  if (value < 1) return `${Math.round(value * 60)} min`;
  return `${value.toFixed(2)} h`;
}

function formatWholeHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 h';
  return `${Math.round(value)} h`;
}

function formatMoney(value: number | null, currency: string) {
  if (typeof value !== 'number') return 'Tarifa não configurada';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
}

function formatLocation(item: ClientExtraHourItem) {
  const parts = [item.cityName, item.regionName, item.countryName].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Local não identificado';
}

function formatEndedLocation(item: ClientExtraHourItem) {
  const parts = [item.endedByCityName, item.endedByRegionName, item.endedByCountryName].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Local não identificado';
}

function getOriginLabel(item: ClientExtraHourItem) {
  return item.type === 'cancel_stop' ? 'Cancelou' : 'Ligou';
}

function statusClass(status: 'open' | 'closed') {
  return status === 'open'
    ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
    : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
}

export default function HorasExtrasCliente() {
  const user = useUser();
  const [items, setItems] = useState<ClientExtraHourItem[]>([]);
  const [summary, setSummary] = useState({
    items: 0,
    extraHours: 0,
    billableHours: 0,
    totalAmountDue: null as number | null,
    currency: 'BRL',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await huawei.clientExtraHours();
        if (!mounted) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        if (data.summary) setSummary(data.summary);
      } catch (cause) {
        if (!mounted) return;
        setError(cause instanceof Error ? cause.message : 'Erro ao carregar horas extras.');
        setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const openItems = useMemo(() => items.filter((item) => item.status === 'open').length, [items]);

  const isAdminOrOperator = user?.role === 'admin' || user?.role === 'operator';
  const [activeTab, setActiveTab] = useState<'horas' | 'tarifa'>('horas');

  if (user?.role !== 'client' && !isAdminOrOperator) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="ananim-page">
      <PageHeader
        badge={isAdminOrOperator ? 'Gestão' : 'Cliente'}
        title="Horas extras"
        description={
          isAdminOrOperator
            ? 'Audite quem ligou, por quanto tempo ficou ativa e quanto será cobrado em hora cheia por cliente.'
            : 'Veja as VMs ligadas fora do horário, com tempo real, cobrança em hora cheia e rastreabilidade completa.'
        }
      />

      {isAdminOrOperator && (
        <div className="mb-6 flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1 w-fit">
          {([
            { key: 'horas', label: 'Resumo de horas', icon: Clock3 },
            { key: 'tarifa', label: 'Configuração de tarifa', icon: Settings2 },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                activeTab === key
                  ? 'bg-ananim-accent/10 text-white border border-ananim-accent/20 shadow-accent'
                  : 'text-ananim-textSoft hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {isAdminOrOperator && activeTab === 'tarifa' ? (
        <TarifaHorasExtras />
      ) : (
      <>
      <section className="ananim-metric-grid mb-6">
        <div className="ananim-metric">
          <p className="ananim-metric-label">VMs com registro</p>
          <p className="ananim-metric-value">{summary.items}</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Horas a mais</p>
          <p className="ananim-metric-value">{formatHours(summary.extraHours)}</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Tempo cobrado</p>
          <p className="ananim-metric-value">{formatWholeHours(summary.billableHours)}</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Valor devido</p>
          <p className="ananim-metric-value text-emerald-200">{formatMoney(summary.totalAmountDue, summary.currency)}</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Em aberto</p>
          <p className="ananim-metric-value">{openItems}</p>
        </div>
      </section>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="ananim-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-ananim-accent/20 bg-ananim-accent/10 text-ananim-accent">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ananim-text">Regra de cobrança ativa</p>
              <p className="mt-1 text-sm leading-6 text-ananim-textSoft">
                Ligou fora do horário, cobra <strong className="text-white">1 hora mínima</strong>. Se ficar ligada por
                {' '}<strong className="text-white">1h e 2min</strong>, a cobrança sobe para <strong className="text-white">2 horas</strong>.
              </p>
            </div>
          </div>
        </div>
        <div className="ananim-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ananim-text">Rastreabilidade</p>
              <p className="mt-1 text-sm leading-6 text-ananim-textSoft">
                Cada registro mostra usuário, data, hora, IP e local de origem para auditoria operacional.
              </p>
            </div>
          </div>
        </div>
      </div>

      {openItems > 0 ? (
        <div className="ananim-alert-warning mb-5">
          <strong>{openItems} VM(s) ainda em aberto.</strong> O valor continua sendo atualizado até o encerramento.
        </div>
      ) : null}

      {error ? <div className="ananim-alert-danger mb-5">{error}</div> : null}

      <section className="ananim-card overflow-hidden p-0">
        {loading ? (
          <div className="p-8 text-center text-ananim-muted">Carregando horas extras...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-ananim-muted">Nenhuma VM ficou ligada além do horário contratado.</div>
        ) : (
          <div className="ananim-table-wrap">
            <table className="ananim-table min-w-[1120px]">
              <thead>
                <tr>
                  <th>VM</th>
                  <th>Usuário / origem</th>
                  <th>Programação</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Tempo ligado</th>
                  <th>Tempo cobrado</th>
                  <th>Valor devido</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="font-medium text-ananim-text">{item.serverName || item.serverId}</div>
                    </td>
                    <td>
                      <div className="space-y-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ananim-muted">{getOriginLabel(item)}</div>
                          <div className="mt-1 font-medium text-ananim-text">{item.userName || item.userEmail || 'Sistema'}</div>
                          <div className="mt-1 text-xs text-ananim-muted">{item.userEmail || 'Sem e-mail'}</div>
                          <div className="mt-2 flex items-start gap-2 text-xs text-ananim-textSoft">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 text-ananim-accent" />
                            <div>
                              <div>{formatLocation(item)}</div>
                              <div className="font-mono text-[11px] text-ananim-muted">{item.userIp || 'IP não registrado'}</div>
                            </div>
                          </div>
                        </div>

                        {item.endedAt ? (
                          <div className="border-t border-white/10 pt-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ananim-muted">Desligou</div>
                            <div className="mt-1 font-medium text-ananim-text">{item.endedByUserName || item.endedByUserEmail || 'Não registrado'}</div>
                            <div className="mt-1 text-xs text-ananim-muted">{item.endedByUserEmail || 'Sem e-mail'}</div>
                            <div className="mt-2 flex items-start gap-2 text-xs text-ananim-textSoft">
                              <MapPin className="mt-0.5 h-3.5 w-3.5 text-ananim-accent" />
                              <div>
                                <div>{formatEndedLocation(item)}</div>
                                <div className="font-mono text-[11px] text-ananim-muted">{item.endedByUserIp || 'IP não registrado'}</div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="inline-flex items-center gap-2 text-ananim-textSoft">
                        <Clock3 className="h-4 w-4 text-ananim-accent" />
                        <span>{item.scheduleLabel}</span>
                      </div>
                    </td>
                    <td>{formatDateTime(item.fromAt)}</td>
                    <td>{formatDateTime(item.toAt)}</td>
                    <td className="font-semibold text-ananim-text">{formatHours(item.actualHours)}</td>
                    <td className="font-semibold text-white">{formatWholeHours(item.billableHours)}</td>
                    <td>
                      <div className="inline-flex items-center gap-2 font-semibold text-emerald-200">
                        <Receipt className="h-4 w-4" />
                        <span>{formatMoney(item.amountDue, item.currency)}</span>
                      </div>
                      <div className="mt-1 text-xs text-ananim-muted">
                        {item.hourlyRate != null ? `${formatMoney(item.hourlyRate, item.currency)}/h · cobrança cheia` : 'Configure a tarifa por projeto'}
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                        {item.status === 'open' ? 'Em aberto' : 'Encerrado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>
      )}
    </div>
  );
}
