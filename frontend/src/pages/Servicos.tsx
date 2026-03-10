import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { services as api, type ServicesHealth, type HanaProcess, type ServiceItem, type AvailableServer } from '../api/client';

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
  return 'gray';
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
  const [controlCenterAvailable, setControlCenterAvailable] = useState(false);
  const [controlCenterDisplayName, setControlCenterDisplayName] = useState<string | null>(null);
  const [activateSupportLoading, setActivateSupportLoading] = useState(false);
  /** Quando o usuário tem mais de um servidor (ex.: Águas Pratas SQL + Servidor Web), qual está selecionado. */
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  const [availableServers, setAvailableServers] = useState<AvailableServer[]>([]);
  const isAdmin = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      return u?.role === 'admin';
    } catch { return false; }
  })();

  const healthKeys = sqlMode && serviceList?.length
    ? serviceList.map((s) => s.id)
    : [...SAP_HEALTH_KEYS];
  /** Chaves exibidas nos cartões de status (sem "TUDO", que só aparece como botão em Ações de Controle). */
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
        { id: 'all', name: 'TUDO' },
      ];

  /** Cliente em uso: selecionado no dropdown (SQL ou vários HANA) ou inferido pelo backend quando único. */
  const effectiveClientKey = selectedClientKey || null;

  const fetchHealth = async () => {
    try {
      setStatusLoading(true);
      const data = await api.health(effectiveClientKey);
      setStatus(data);
    } catch {
      setStatus(
        healthKeys.reduce((acc, k) => ({ ...acc, [k]: 'error' as const }), {} as ServicesHealth)
      );
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchConnectionInfo = async () => {
    try {
      const data = await api.connectionInfo(effectiveClientKey);
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

  const fetchServiceList = async (clientKeyFromUser?: string | null) => {
    setListError(null);
    try {
      const data = await api.list(clientKeyFromUser ?? undefined);
      if (Array.isArray(data)) {
        setServiceList(data);
        setSqlMode(false);
        setAvailableServers([]);
        setSelectedClientKey(null);
      } else if (data && 'list' in data && (data.mode === 'sql' || data.mode === 'hana')) {
        setServiceList(Array.isArray(data.list) ? data.list : []);
        setSqlMode(true);
        setSqlDisplayName('displayName' in data && data.displayName ? data.displayName : '');
        const servers = 'availableServers' in data && Array.isArray(data.availableServers) ? data.availableServers : [];
        setAvailableServers(servers);
        const fromBackend = 'clientKey' in data && typeof data.clientKey === 'string' ? data.clientKey : null;
        const nextKey =
          clientKeyFromUser != null && clientKeyFromUser !== '' && servers.some((s) => s.clientKey === clientKeyFromUser)
            ? clientKeyFromUser
            : fromBackend || (servers.length ? servers[0].clientKey : null);
        setSelectedClientKey(nextKey);
        if (nextKey) {
          try {
            sessionStorage.setItem('servicos.selectedClientKey', nextKey);
          } catch { /* ignora */ }
        }
        // Garantir que a VM exibida seja a do cliente retornado pela lista
        if (nextKey) {
          try {
            const conn = await api.connectionInfo(nextKey);
            setVmHost(conn.configured ? conn.vmHost : null);
            setVmDisplayName(conn.vmDisplayName ?? null);
          } catch { /* ignora */ }
        }
      } else {
        setServiceList(Array.isArray(data) ? data : []);
        setSqlMode(false);
        setAvailableServers([]);
        setSelectedClientKey(null);
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
    }
  };

  const fetchHanaProcesses = async () => {
    setHanaProcessesError(null);
    setHanaProcessesLoading(true);
    try {
      const data = await api.hanaProcesses();
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
    const savedKey = (() => {
      try {
        return sessionStorage.getItem('servicos.selectedClientKey');
      } catch {
        return null;
      }
    })();
    fetchServiceList(savedKey || undefined);
  }, []);

  useEffect(() => {
    fetchConnectionInfo();
  }, [sqlMode, selectedClientKey]);

  const fetchControlCenterInfo = async () => {
    try {
      const data = await api.controlCenterInfo(effectiveClientKey);
      setControlCenterAvailable(data.available);
      setControlCenterDisplayName(data.displayName ?? null);
    } catch {
      setControlCenterAvailable(false);
      setControlCenterDisplayName(null);
    }
  };

  useEffect(() => {
    fetchControlCenterInfo();
  }, [effectiveClientKey]);

  useEffect(() => {
    if (serviceList === null || listError) return;
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [serviceList, listError]);

  const onTestConnection = async () => {
    setTestMessage(null);
    setTestLoading(true);
    try {
      const data = await api.testConnection(effectiveClientKey);
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

  const onActivateSupport = async () => {
    if (!window.confirm('Executar Ativar Support User no Control Center? O processo pode levar alguns minutos.')) return;
    setActivateSupportLoading(true);
    try {
      const data = await api.activateSupport(effectiveClientKey);
      if (data.ok) {
        alert(data.message || 'Ativar Support executado com sucesso.');
      } else {
        alert(data.error || 'Falha ao executar Ativar Support.');
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      alert(err.response?.data?.error || err.message || 'Erro ao executar Ativar Support.');
    } finally {
      setActivateSupportLoading(false);
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
      await api.execute(serviceId, effectiveClientKey);
      alert('Comando enviado com sucesso! Aguarde alguns instantes e atualize o status.');
      setTimeout(fetchHealth, 5000);
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { error?: string } } };
      alert(`Erro: ${err.response?.data?.error || err.message || 'Falha na execução'}`);
    } finally {
      setExecuting(null);
    }
  };

  const onSelectServer = (clientKey: string) => {
    setSelectedClientKey(clientKey);
    try {
      sessionStorage.setItem('servicos.selectedClientKey', clientKey);
    } catch { /* ignora */ }
    fetchServiceList(clientKey);
  };

  if (listError) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="font-medium text-amber-800">{listError}</p>
      </div>
    );
  }

  if (serviceList === null) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">
        Carregando serviços...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-semibold text-gray-800">
          {sqlMode ? `Serviços (${sqlDisplayName || 'SQL'})` : 'SAP B1 Admin Panel'}
        </h2>
        <span className="text-sm text-gray-500">
          {sqlMode ? 'Serviços e status na VM / Servidor' : 'Serviços e status na VM SUSE'}
        </span>
        {(availableServers || []).length > 1 && (
          <select
            value={selectedClientKey ?? ''}
            onChange={(e) => onSelectServer(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            title="Trocar servidor"
          >
            {(availableServers || []).map((s) => (
              <option key={s.clientKey} value={s.clientKey}>
                {s.displayName}
              </option>
            ))}
          </select>
        )}
        {isAdmin && effectiveClientKey && (
          <Link
            to={`/clientes?editServices=${encodeURIComponent(effectiveClientKey)}`}
            className="text-blue-600 hover:underline text-sm"
          >
            Editar serviços deste cliente
          </Link>
        )}
      </div>

      {/* VM de banco conectada + Testar conexão + Atualizar status */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700">VM de banco conectada</p>
          <p className="text-gray-900 font-mono truncate" title={vmDisplayName ?? vmHost ?? undefined}>
            {vmDisplayName || vmHost || 'Não configurada'}
            {vmDisplayName && vmHost && vmHost !== vmDisplayName ? ` (${vmHost})` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onTestConnection}
            disabled={testLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {testLoading ? 'Testando...' : 'Testar conexão'}
          </button>
          <button
            type="button"
            onClick={() => { fetchHealth(); if (!sqlMode) fetchHanaProcesses(); }}
            disabled={statusLoading}
            className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-50 text-sm font-medium"
            title="Consultar status dos serviços na VM"
          >
            {statusLoading ? 'Atualizando...' : 'Atualizar status'}
          </button>
          {controlCenterAvailable && (
            <button
              type="button"
              onClick={onActivateSupport}
              disabled={activateSupportLoading}
              className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
              title={controlCenterDisplayName ? `Ativar Support (${controlCenterDisplayName})` : 'Ativar Support User no SAP Control Center'}
            >
              {activateSupportLoading ? 'Executando...' : 'Ativar Support'}
            </button>
          )}
          {testMessage && (
            <span className={`text-sm ${testMessage.includes('sucesso') ? 'text-green-600' : 'text-red-600'}`}>
              {testMessage}
            </span>
          )}
        </div>
      </div>

      {/* Status Grid + botão Validar em cada card */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium text-gray-800">Status dos serviços</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {statusKeysForDisplay.map((key) => {
          const s = status[key] ?? '';
          const color = getStatusColor(s);
          const borderColor =
            color === 'green'
              ? 'border-l-green-500'
              : color === 'red'
                ? 'border-l-red-500'
                : 'border-l-gray-400';
          return (
            <div
              key={key}
              className={`bg-white p-4 rounded shadow border-l-4 ${borderColor}`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-semibold ${sqlMode ? '' : 'capitalize'}`}>
                  {labels[key] || key}
                </span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      color === 'green'
                        ? '#22c55e'
                        : color === 'red'
                          ? '#ef4444'
                          : '#9ca3af',
                  }}
                  title={s || 'Checking...'}
                />
              </div>
              <p className="text-sm text-gray-500 mt-1" title={s === 'unconfigured' ? 'Configure as variáveis SSH no .env do backend (ex.: SSH_HANA_ROLAND_JUMP_* para ROLANDWEB, SSH_HANA_ROLAND_* para ROLANDHDB) e reinicie o backend.' : undefined}>
                {statusLoading && !status[key] ? 'Verificando...' : s === 'unconfigured' ? 'Não configurado (SSH no .env do backend)' : s || '—'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchHealth()}
                  disabled={statusLoading}
                  className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  {statusLoading ? '…' : 'Validar status'}
                </button>
                {controlServices.some((c) => c.id === key) && (
                  <button
                    type="button"
                    onClick={() => onExecute(key, labels[key] || key)}
                    disabled={!!executing}
                    className={`text-xs font-medium disabled:opacity-50 ${
                      key === 'hana'
                        ? 'text-red-600 hover:text-red-800'
                        : 'text-blue-600 hover:text-blue-800'
                    }`}
                    title={`Reiniciar ${labels[key] || key}`}
                  >
                    {executing === key ? '…' : 'Reiniciar'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Processos HANA — oculto no modo SQL (Alfa Agro) */}
      {!sqlMode && (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-8">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-lg font-medium text-gray-800">Processos HANA</h3>
          <button
            type="button"
            onClick={fetchHanaProcesses}
            disabled={hanaProcessesLoading}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded border border-gray-300 hover:bg-gray-200 disabled:opacity-50 text-sm"
          >
            {hanaProcessesLoading ? 'Atualizando...' : 'Atualizar processos'}
          </button>
        </div>
        {hanaProcessesError && hanaProcesses.length === 0 && (
          <div className="px-4 py-2 text-sm text-amber-800 bg-amber-50 border-t border-amber-200">
            <p className="font-medium mb-1">Erro ao obter lista de processos</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs mt-1">{hanaProcessesError}</pre>
          </div>
        )}
        {hanaProcesses.length === 0 && !hanaProcessesLoading && !hanaProcessesError && (
          <p className="p-4 text-sm text-gray-500">Clique em &quot;Atualizar processos&quot; para carregar a lista.</p>
        )}
        {hanaProcesses.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Processo</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Descrição</th>
                  <th className="text-left py-2 px-4 font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {hanaProcesses.map((p) => (
                  <tr key={p.name} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-4 font-mono">{p.name}</td>
                    <td className="py-2 px-4">{p.description}</td>
                    <td className="py-2 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          p.status === 'up'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-100 text-amber-800'
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

      {/* Ações de Controle — dinâmico: SAP ou só serviços SQL (Alfa Agro) */}
      <h3 className="text-lg font-medium text-gray-800 mb-4">Ações de Controle</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {controlServices.map((svc) => (
          <button
            key={svc.id}
            type="button"
            onClick={() => onExecute(svc.id, svc.name)}
            disabled={!!executing}
            className={`p-4 rounded border flex items-center justify-center gap-2 disabled:opacity-50 ${
              svc.id === 'hana'
                ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                : svc.id === 'all'
                  ? 'bg-gray-800 text-white border-gray-700 hover:bg-black md:col-span-2'
                  : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
            } ${svc.id === 'all' ? 'md:col-span-2' : ''}`}
          >
            {executing === svc.id ? (
              <span className="animate-pulse">⏳</span>
            ) : (
              <span>⚡</span>
            )}
            Reiniciar {svc.name}
          </button>
        ))}
      </div>
    </div>
  );
}
