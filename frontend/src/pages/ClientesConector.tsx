import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Server, Users } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { agentAdmin, type ClientOverview } from '../api/agent';

const fmt = (ms: number | null) => (ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Clientes pelo modelo do conector: servidores com o Ananim Manager Agent, serviços liberados e quem tem acesso.
 */
export default function ClientesConector() {
  const [clientes, setClientes] = useState<ClientOverview[] | null>(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    agentAdmin.clients().then((r) => setClientes(r.clients)).catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar clientes.'));
  }, []);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (clientes ?? []).filter((c) => !t || `${c.name} ${c.projectName} ${c.servers.map((s) => s.ecsName).join(' ')}`.toLowerCase().includes(t));
  }, [clientes, busca]);

  return (
    <div className="ananim-page space-y-6">
      <PageHeader badge="Clientes" title="Clientes"
        description="Servidores ligados pelo conector, serviços liberados e quem tem acesso. Para incluir um cliente, conecte o primeiro servidor dele em Servidores (conector)." />
      {erro ? <div className="ananim-alert ananim-alert-danger">{erro}</div> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input className="ananim-input max-w-md" placeholder="Buscar cliente ou servidor" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
        <Link to="/servidores" className="ananim-btn ananim-btn-soft">＋ Conectar servidor</Link>
      </div>
      {clientes && !visiveis.length ? (
        <div className="ananim-card p-5 text-sm text-ananim-muted">
          {clientes.length ? 'Nenhum cliente com esse nome.' : 'Nenhum cliente com conector ainda. Em Servidores (conector), escolha o projeto e conecte o primeiro servidor.'}
        </div>
      ) : null}
      {visiveis.map((c) => (
        <section key={c.projectKey} className="ananim-card space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="ananim-section-title">{c.name}</h2>
              <span className="ananim-chip">{c.manual ? 'manual' : c.projectName}</span>
            </div>
            <Link to={`/servidores?projectKey=${encodeURIComponent(c.projectKey)}`} className="ananim-btn ananim-btn-soft">Conectar servidor</Link>
          </div>

          {c.servers.length ? (
            <div className="ananim-table-wrap">
              <table className="ananim-table">
                <thead><tr><th>Servidor</th><th>Conector</th><th>Serviços</th><th /></tr></thead>
                <tbody>
                  {c.servers.map((s) => (
                    <tr key={s.agentId}>
                      <td className="font-mono"><Server className="mr-1 inline h-4 w-4 text-ananim-muted" aria-hidden="true" />{s.ecsName}</td>
                      <td className={s.online ? 'text-emerald-300' : 'text-amber-200'}>{s.online ? 'Online' : `Sem contato desde ${fmt(s.lastSeen)}`} · {s.os}</td>
                      <td>{s.releasedCount} liberados de {s.serviceCount} encontrados</td>
                      <td className="text-right">
                        <Link to={`/servidores?projectKey=${encodeURIComponent(c.projectKey)}&agentId=${encodeURIComponent(s.agentId)}`} className="ananim-btn ananim-btn-primary">Serviços e acesso</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-ananim-muted">Nenhum servidor conectado ainda.</p>}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-ananim-muted" aria-hidden="true" />
            {c.users.length ? c.users.map((u) => (
              <span key={u.id} className="ananim-chip" title={u.email}>{u.name} · {u.grantedCount ? `${u.grantedCount} serviço(s)` : 'sem serviço liberado'}</span>
            )) : <span className="text-ananim-muted">Nenhum usuário do cliente com este projeto.</span>}
            <Link to="/usuarios" className="ml-auto text-xs text-cyan-300 hover:underline">Atribuir usuário em Usuários</Link>
          </div>
        </section>
      ))}
    </div>
  );
}
