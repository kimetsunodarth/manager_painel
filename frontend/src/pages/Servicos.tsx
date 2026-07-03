import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { services as api, type ServicesHealth, type HanaProcess, type ServiceItem, type AvailableServer } from '../api/client';
import { useUser } from '../hooks/useUser';
import { getHomeProjectSelection } from '../utils/homeProjectSelection';
import PageHeader from '../components/PageHeader';

const SAP_HEALTH_KEYS = ['hana', 'serviceLayer', 'sld', 'authentication', 'sql-server'] as const;
const SAP_LABELS: Record<string, string> = {
  hana: 'HANA',
  serviceLayer: 'Service Layer',
  sld: 'SLD',
  authentication: 'Authentication',
  'sql-server': 'SQL Server',
};

function getStatusColor(s: string): string {
  if (s === 'active') return 'green';
  if (s === 'inactive') return 'red';
  if (s === 'error') return 'amber';
  return 'gray';
}

function getServerKindLabel(kind?: 'web' | 'database' | 'hana', sqlMode?: boolean): string {
  if (kind === 'web') return 'Servidor Web';
  if (kind === 'hana') return 'Banco / HANA';
  return sqlMode ? 'Banco' : 'Banco / HANA';
}


export default function Servicos() {
  const [serviceList, setServiceList] = useState<ServiceItem[] | null>(null);
  const [sqlMode, setSqlMode] = useState(false);
  const [sqlDisplayName, setSqlDisplayName] = useState<string>('');
  const [listError, setListError] = useState<string | null>(null);
  const [status, setStatus] = useState<ServicesHealth>({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [vmHost, setVmHost] = useState<string | null>(null);
  const [vmDisplayName, setVmDisplayName] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [hanaProcesses, setHanaProcesses] = useState<HanaProcess[]>([]);
  const [hanaProcessesLoading, setHanaProcessesLoading] = useState(false);
  const [hanaProcessesError, setHanaProcessesError] = useState<string | null>(null);
  /** Quando o projeto oferece mais de um ambiente (web/banco), exibe as opções reais devolvidas pela API. */
  const [availableServers, setAvailableServers] = useState<AvailableServer[]>([]);
  /** Quando o usuário tem mais de um servidor (ex.: Águas Pratas SQL + Servidor Web), qual está selecionado. */
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  const [selectedServerLabel, setSelectedServerLabel] = useState<string>('');
  const [selectedServerKind, setSelectedServerKind] = useState<'web' | 'database' | 'hana' | null>(null);
  const currentUser = useUser();
  const isAdmin = currentUser?.role === 'admin';
  const fetchingRef = useRef(false);
  const pendingHealthRef = useRef(false);
  const homeSelection = getHomeProjectSelection();
  const projectScope = homeSelection?.project
    ? {
        projectId: homeSelection.project.id,
        projectName: homeSelection.project.name,
        perfil: homeSelection.project.perfil,
        region: homeSelection.project.region,
        displayPerfil: homeSelection.project.displayPerfil,
      }
    : undefined;

  const healthKeys = sqlMode && serviceList?.length
    ? serviceList.map((s) => s.id)
    : [...SAP_HEALTH_KEYS];
  /** Chaves exibidas nos cartões da tela, sem a ação global "TUDO". */
  const statusKeysForDisplay = (healthKeys || []).filter((k) => k !== 'all');
  const labels: Record<string, string> = sqlMode && serviceList?.length
    ? serviceList.reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {})
    : SAP_LABELS;
  const controlServices = sqlMode && serviceList?.length
    ? serviceList.filter((s) => s.action === 'executar').map((s) => ({ id: s.id, name: s.name }))
    : [
        { id: 'serviceLayer', name: 'Service Layer' },
        { id: 'sld', name: 'SLD' },
        { id: 'hana', name: 'HANA (Cuidado)' },
        { id: 'authentication', name: 'Authentication' },
      ];

  const effectiveClientKey = selectedClientKey || null;
  const serviceScope = {
    ...(effectiveClientKey ? { clientKey: effectiveClientKey } : {}),
    ...(projectScope || {}),
  };

  const fetchHealth = async () => {
    if (fetchingRef.current) {
      pendingHealthRef.current = true;
      return;
    }
    fetchingRef.current = true;
    try {
      setStatusLoading(true);
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Tempo limite do health check excedido')), 30000);
      });
      try {
        const data = await Promise.race([api.health(serviceScope), timeoutPromise]);
        setStatus(data);
      } finally {
        clearTimeout(timeoutId!);
      }
    } catch {
      setStatus(
        healthKeys.reduce((acc, k) => ({ ...acc, [k]: 'error' as const }), {} as ServicesHealth)
      );
    } finally {
      setStatusLoading(false);
      fetchingRef.current = false;
      if (pendingHealthRef.current) {
        pendingHealthRef.current = false;
        void fetchHealth();
      }
    }
  };

  const fetchConnectionInfo = async () => {
    try {
      const data = await api.connectionInfo(serviceScope);
      setVmHost(data.configured ? data.vmHost : null);
      setVmDisplayName(data.vmDisplayName ?? null);
      if (data.mode === 'sql' || data.mode === 'hana') {
        setSqlMode(true);
        if (data.displayName) setSqlDisplayName(data.displayName);
      }
    } catch {
      setVmHost(null);
    }
  };

  const fetchServiceList = async () => {
    setListError(null);
    try {
      const data = await api.list(serviceScope);
      if (Array.isArray(data)) {
        setServiceList(data);
        setSqlMode(false);
        setAvailableServers([]);
        setSelectedClientKey(null);
        setSelectedServerLabel('');
        setSelectedServerKind('hana');
      } else if (data && 'list' in data && (data.mode === 'sql' || data.mode === 'hana')) {
        setServiceList(Array.isArray(data.list) ? data.list : []);
        setSqlMode(true);
        setSqlDisplayName('displayName' in data && data.displayName ? data.displayName : '');
        setAvailableServers(Array.isArray(data.availableServers) ? data.availableServers : []);
        setSelectedServerLabel('selectedServerLabel' in data && data.selectedServerLabel ? data.selectedServerLabel : '');
        setSelectedServerKind('selectedServerKind' in data && data.selectedServerKind ? data.selectedServerKind : null);
        const fromBackend = 'clientKey' in data && typeof data.clientKey === 'string' ? data.clientKey : null;
        const nextKey = fromBackend || null;
        setSelectedClientKey(nextKey);
      } else {
        setServiceList(Array.isArray(data) ? data : []);
        setSqlMode(false);
        setAvailableServers([]);
        setSelectedClientKey(null);
        setSelectedServerLabel('');
        setSelectedServerKind(null);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg && (msg.includes('permissão') || msg.includes('Sem permissão'))) {
        setListError(msg);
      } else {
        setListError(msg || 'Falha ao carregar lista de serviços.');
      }
      setServiceList([]);
      setSqlMode(false);
      setAvailableServers([]);
      setSelectedClientKey(null);
      setSelectedServerLabel('');
      setSelectedServerKind(null);
    }
  };

  const fetchHanaProcesses = async () => {
    setHanaProcessesError(null);
    setHanaProcessesLoading(true);
    try {
      const data = await api.hanaProcesses(serviceScope);
      const list = data.processes || [];
      setHanaProcesses(list);
      if (list.length > 0) setHanaProcessesError(null);
      else if (data.error) setHanaProcessesError(data.error);
    } catch {
      setHanaProcesses([]);
      setHanaProcessesError('Falha ao carregar processos');
    } finally {
      setHanaProcessesLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceList();
  }, [selectedClientKey, homeSelection?.project?.id, homeSelection?.project?.perfil, homeSelection?.project?.name]);

  useEffect(() => {
    fetchConnectionInfo();
  }, [sqlMode, selectedClientKey, homeSelection?.project?.id, homeSelection?.project?.perfil, homeSelection?.project?.name]);


  useEffect(() => {
    if (serviceList === null || listError) return;
    fetchHealth();
    const intervalHealth = setInterval(fetchHealth, 30000);
    const intervalList = setInterval(() => fetchServiceList(), 60000);
    return () => {
      clearInterval(intervalHealth);
      clearInterval(intervalList);
    };
  }, [serviceList, listError, selectedClientKey, homeSelection?.project?.id, homeSelection?.project?.perfil, homeSelection?.project?.name]);

  const onUpdateStatus = () => {
    fetchHealth();
    fetchServiceList();
    if (!sqlMode) fetchHanaProcesses();
  };

  const onTestConnection = async () => {
    setTestMessage(null);
    setTestLoading(true);
    try {
      const data = await api.testConnection(serviceScope);
      if (data.ok) {
        setTestMessage('Conexão SSH estabelecida com sucesso.');
        fetchConnectionInfo();
        setTimeout(fetchHealth, 1000);
      } else {
        setTestMessage(data.error || 'Falha no teste.');
      }
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { error?: string } } };
      setTestMessage(err.response?.data?.error || err.message || 'Erro ao testar conexão.');
    } finally {
      setTestLoading(false);
    }
  };


  const onExecute = async (serviceId: string, label: string) => {
    if (
      !window.confirm(
        `Tem certeza que deseja reiniciar: ${label}? Isso pode causar indisponibilidade temporária.`
      )
    )
      return;
    setExecuting(serviceId);
    try {
      await api.execute(serviceId, serviceScope);
      alert('Comando enviado com sucesso! Aguarde alguns instantes e atualize o status.');
      setTimeout(fetchHealth, 5000);
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { error?: string } } };
      alert(`Erro: ${err.response?.data?.error || err.message || 'Falha na execução'}`);
    } finally {
      setExecuting(null);
    }
  };

  if (listError) {
    return (
      <div className="ananim-alert-warning">
        <p className="font-medium">{listError}</p>
      </div>
    );
  }

  if (serviceList === null) {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-ananim-surface/70 p-8 text-ananim-muted">
        Carregando serviços...
      </div>
    );
  }

  const serviceStatusValues = statusKeysForDisplay
    .map((key) => status[key])
    .filter((value): value is NonNullable<typeof value> => typeof value === 'string' && value.length > 0);
  const hasLiveConnection = serviceStatusValues.some((value) => value === 'active' || value === 'inactive');
  const hasConnectionFailure =
    serviceStatusValues.length > 0 &&
    serviceStatusValues.every((value) => value === 'error' || value === 'unconfigured');
  const connectionState = testMessage
    ? testMessage.includes('sucesso')
      ? 'online'
      : 'offline'
    : hasLiveConnection
      ? 'online'
      : hasConnectionFailure
        ? 'offline'
        : 'checking';
  const connectionLabel =
    connectionState === 'online'
      ? 'Conexão OK'
      : connectionState === 'offline'
        ? 'Sem conexão'
        : 'Verificando';
  const connectionButtonClass =
    connectionState === 'online'
      ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-100 hover:bg-emerald-500/18'
      : connectionState === 'offline'
        ? 'border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/16'
        : 'border-white/10 bg-white/[0.04] text-ananim-text hover:bg-white/[0.08]';
  const connectionDotClass =
    connectionState === 'online'
      ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.55)]'
      : connectionState === 'offline'
        ? 'bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.45)]'
        : 'bg-slate-400';
  const connectionHint = testMessage || vmDisplayName || vmHost || 'Host não configurado';
  const hasServerSwitch = availableServers.length > 1;

  return (
    <div className="ananim-page">
      <PageHeader
        badge="Serviços"
        title={
          selectedServerLabel
            ? selectedServerLabel
            : sqlDisplayName
              ? `Serviços ${sqlDisplayName}`
              : selectedClientKey
                ? `Serviços ${selectedClientKey.toUpperCase()}`
                : 'Serviços'
        }
        description={
          sqlMode
            ? 'Monitore status e reinício por ambiente com leitura mais limpa entre servidor web e banco.'
            : 'Monitore status e processos HANA com melhor leitura em ambiente técnico.'
        }
        actions={
          <div className="flex w-full flex-col gap-3 md:w-auto md:items-end">
            <div className="flex flex-wrap items-end justify-end gap-2 md:flex-nowrap md:gap-3">
            {hasServerSwitch && (
              <label className="flex min-w-[260px] flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ananim-muted">Ambiente</span>
                <select
                  value={selectedClientKey || ''}
                  onChange={(event) => {
                    const nextKey = event.target.value || null;
                    const nextServer = availableServers.find((server) => server.clientKey === nextKey);
                    setSelectedClientKey(nextKey);
                    setSelectedServerLabel(nextServer?.displayName || '');
                    setSelectedServerKind(nextServer?.kind || null);
                    setTestMessage(null);
                    setServiceList(null);
                    setStatus({});
                    setHanaProcesses([]);
                    setHanaProcessesError(null);
                  }}
                  className="ananim-select h-11 min-w-[260px]"
                >
                  {availableServers.map((server) => (
                    <option key={server.clientKey} value={server.clientKey}>
                      {server.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={onTestConnection}
              disabled={testLoading}
              className={`inline-flex h-11 min-w-[132px] items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors disabled:opacity-60 ${connectionButtonClass}`}
              title={connectionHint}
              aria-label={`${connectionLabel}. ${connectionHint}. Clique para testar a conexão.`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${connectionDotClass}`} />
              <span>{testLoading ? 'Testando...' : connectionLabel}</span>
            </button>
            <button
              type="button"
              onClick={onUpdateStatus}
              disabled={statusLoading}
              className="ananim-btn-ghost min-w-[132px] justify-center"
              title="Consultar status dos serviços na VM"
            >
              {statusLoading ? 'Atualizando...' : 'Atualizar status'}
            </button>
            {isAdmin && effectiveClientKey && (
              <Link
                to={`/clientes?editServices=${encodeURIComponent(effectiveClientKey)}`}
                className="ananim-btn-soft min-w-[132px] justify-center"
              >
                Editar serviços
              </Link>
            )}
          </div>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="ananim-metric">
          <p className="ananim-metric-label">Estrutura ativa</p>
          <p className="ananim-metric-value">{getServerKindLabel(selectedServerKind ?? undefined, sqlMode)}</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Serviços monitorados</p>
          <p className="ananim-metric-value">{statusKeysForDisplay.length}</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Host</p>
          <p className="ananim-metric-value truncate font-mono text-base">{vmDisplayName || vmHost || 'Não configurada'}</p>
        </div>
      </div>
      {testMessage && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            testMessage.includes('sucesso')
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
              : 'border-red-500/30 bg-red-500/10 text-red-100'
          }`}
        >
          {testMessage}
        </div>
      )}

      {/* Cards de status em layout horizontal, no mesmo padrão visual das ações */}
      <div className="flex items-center justify-between">
        <h3 className="ananim-section-title">Status dos serviços</h3>
      </div>
      <div className="mb-8 grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2">
        {statusKeysForDisplay.map((key) => {
          const s = status[key] ?? '';
          const color = getStatusColor(s);
          const borderColor =
            color === 'green'
              ? 'border-l-green-500'
              : color === 'red'
                ? 'border-l-red-500'
                : color === 'amber'
                  ? 'border-l-amber-500'
                : 'border-l-gray-400';
          const badgeLabel =
            color === 'green'
              ? 'Ativo'
              : color === 'red'
                ? 'Inativo'
                : color === 'amber'
                  ? 'Erro'
                  : 'Verificando';
          const description =
            statusLoading && !status[key]
              ? 'Verificando...'
              : s === 'unconfigured'
                ? 'Não configurado (SSH no .env do backend)'
                : s === 'error'
                  ? 'Falha ao consultar status'
                  : s || 'Sem retorno';
          return (
            <div
              key={key}
              className={`ananim-card flex h-full border-l-4 ${borderColor} bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]`}
            >
              <div className="flex w-full flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 flex-1">
                  <p className={`text-base font-semibold text-white ${sqlMode ? '' : 'capitalize'}`}>
                    {labels[key] || key}
                  </p>
                  <p
                    className="mt-2 text-sm leading-6 text-ananim-muted"
                    title={s === 'unconfigured' ? 'Configure as variáveis SSH no .env do backend (ex.: SSH_HANA_ROLAND_JUMP_* para ROLANDWEB, SSH_HANA_ROLAND_* para ROLANDHDB) e reinicie o backend.' : undefined}
                  >
                    {description}
                  </p>
                </div>
                <div className="flex min-w-[280px] flex-wrap items-center justify-end gap-2 xl:flex-nowrap">
                  <span className="flex min-w-[88px] items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-ananim-textSoft">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          color === 'green'
                            ? '#22c55e'
                            : color === 'red'
                              ? '#ef4444'
                              : color === 'amber'
                                ? '#f59e0b'
                                : '#9ca3af',
                      }}
                      title={s || 'Verificando...'}
                    />
                    {badgeLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchHealth()}
                    disabled={statusLoading}
                    className="ananim-btn-ghost min-w-[108px] justify-center px-3 py-2 text-xs disabled:opacity-50"
                  >
                    {statusLoading ? 'Validando...' : 'Validar status'}
                  </button>
                  {controlServices.some((c) => c.id === key) && (
                    <button
                      type="button"
                      onClick={() => onExecute(key, labels[key] || key)}
                      disabled={!!executing}
                      className={`min-w-[96px] rounded-xl border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                        key === 'hana'
                          ? 'border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15'
                          : 'border-ananim-accent/30 bg-ananim-accent/10 text-ananim-accent hover:bg-ananim-accent/15 hover:text-white'
                      }`}
                      title={`Reiniciar ${labels[key] || key}`}
                    >
                      {executing === key ? 'Reiniciando...' : 'Reiniciar'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Processos HANA — oculto no modo SQL (Alfa Agro) */}
      {!sqlMode && (
      <div className="ananim-card overflow-hidden mb-8">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 p-5 md:p-6 flex-wrap">
          <h3 className="ananim-section-title">Processos HANA</h3>
          <button
            type="button"
            onClick={fetchHanaProcesses}
            disabled={hanaProcessesLoading}
            className="ananim-btn-ghost px-3 py-1.5"
          >
            {hanaProcessesLoading ? 'Atualizando...' : 'Atualizar processos'}
          </button>
        </div>
        {hanaProcessesError && hanaProcesses.length === 0 && (
          <div className="px-4 py-2 text-sm text-amber-200 bg-amber-500/10 border-t border-amber-500/30">
            <p className="font-medium mb-1">Erro ao obter lista de processos</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs mt-1">{hanaProcessesError}</pre>
          </div>
        )}
        {hanaProcesses.length === 0 && !hanaProcessesLoading && !hanaProcessesError && (
          <p className="p-4 text-sm text-gray-400">Clique em &quot;Atualizar processos&quot; para carregar a lista.</p>
        )}
        {hanaProcesses.length > 0 && (
          <div className="ananim-table-wrap m-4 mt-0 md:m-6 md:mt-0">
            <table className="ananim-table min-w-0">
              <thead>
                <tr>
                  <th>Processo</th>
                  <th>Descrição</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {hanaProcesses.map((p) => (
                  <tr key={p.name}>
                    <td className="font-mono text-ananim-text">{p.name}</td>
                    <td>{p.description}</td>
                    <td>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          p.status === 'up'
                            ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-200 border border-amber-500/20'
                        }`}
                      >
                        {p.status === 'up' ? 'Subiu' : 'Não subiu'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
