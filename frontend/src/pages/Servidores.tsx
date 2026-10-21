import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { huawei, type HuaweiEcsServer, type HuaweiProject } from '../api/client';
import {
  ACTION_LABEL, JOB_LABEL, agentAdmin, projectKeyOf, type AgentAction, type AgentDetail, type AgentInfo, type ServiceRelease,
} from '../api/agent';

const ACOES: AgentAction[] = ['start', 'stop', 'restart'];
const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('pt-BR') : '—');
const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Falha na operação.');

/** Admin: conecta servidores do projeto ao Ananim Manager Agent, libera serviços e dá acesso aos clientes do projeto. */
export default function Servidores() {
  const [projetos, setProjetos] = useState<HuaweiProject[]>([]);
  const [busca, setBusca] = useState('');
  const [projeto, setProjeto] = useState<HuaweiProject | null>(null);
  const [ecs, setEcs] = useState<HuaweiEcsServer[]>([]);
  const [agentes, setAgentes] = useState<AgentInfo[]>([]);
  const [detalhe, setDetalhe] = useState<AgentDetail | null>(null);
  const [liberacoes, setLiberacoes] = useState<Record<string, ServiceRelease>>({});
  const [filtroServico, setFiltroServico] = useState('');
  const [codigo, setCodigo] = useState<{ code: string; expiresAt: number; ecsName: string } | null>(null);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    huawei.projects('region', 'all_perfis').then(setProjetos).catch((e) => setErro(erroDe(e)));
  }, []);

  const projetosVisiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return projetos.filter((p) => !t || `${p.name} ${p.perfil ?? ''}`.toLowerCase().includes(t)).slice(0, 200);
  }, [projetos, busca]);

  async function abrirProjeto(p: HuaweiProject) {
    setProjeto(p); setDetalhe(null); setCodigo(null); setAviso(''); setErro('');
    try {
      const [servidores, lista] = await Promise.all([huawei.ecs(p.id, p.region || undefined, p.perfil), agentAdmin.agents(projectKeyOf(p))]);
      setEcs(servidores); setAgentes(lista.agents);
    } catch (e) { setErro(erroDe(e)); }
  }

  async function abrirAgente(id: string) {
    setErro(''); setAviso('');
    try {
      const d = await agentAdmin.detail(id);
      setDetalhe(d);
      setLiberacoes(Object.fromEntries(d.releases.map((r) => [r.serviceName, r])));
    } catch (e) { setErro(erroDe(e)); }
  }

  async function gerarCodigo(servidor: HuaweiEcsServer) {
    if (!projeto) return;
    try {
      const r = await agentAdmin.issueCode({ projectKey: projectKeyOf(projeto), projectName: projeto.name, ecsId: servidor.id, ecsName: servidor.name });
      setCodigo({ ...r, ecsName: servidor.name });
    } catch (e) { setErro(erroDe(e)); }
  }

  function alternar(serviceName: string, displayName: string, acao: AgentAction) {
    setLiberacoes((atual) => {
      const r = atual[serviceName] ?? { serviceName, label: displayName, actions: [] };
      const actions = r.actions.includes(acao) ? r.actions.filter((a) => a !== acao) : [...r.actions, acao];
      return { ...atual, [serviceName]: { ...r, actions } };
    });
  }

  async function salvarLiberacoes() {
    if (!detalhe) return;
    try {
      await agentAdmin.saveReleases(detalhe.agent.id, Object.values(liberacoes).filter((r) => r.actions.length));
      setAviso('Liberações salvas. Os clientes com acesso já veem os botões.');
      await abrirAgente(detalhe.agent.id);
    } catch (e) { setErro(erroDe(e)); }
  }

  async function salvarAcesso(userId: string, services: string[]) {
    if (!detalhe) return;
    try {
      await agentAdmin.saveGrants(detalhe.agent.id, userId, services);
      setAviso('Acesso atualizado.');
      await abrirAgente(detalhe.agent.id);
    } catch (e) { setErro(erroDe(e)); }
  }

  async function revogar(a: AgentInfo) {
    if (!window.confirm(`Desconectar o conector de ${a.ecsName}? Os pedidos pendentes são cancelados.`) || !projeto) return;
    try { await agentAdmin.revoke(a.id); setDetalhe(null); await abrirProjeto(projeto); } catch (e) { setErro(erroDe(e)); }
  }

  const servicosFiltrados = (detalhe?.services ?? []).filter((s) => {
    const t = filtroServico.trim().toLowerCase();
    return !t || `${s.name} ${s.displayName}`.toLowerCase().includes(t) || liberacoes[s.name]?.actions.length;
  });
  const conectados = new Set(agentes.filter((a) => !a.revoked).map((a) => a.ecsId));

  return (
    <div className="ananim-page space-y-6">
      <PageHeader badge="Conector" title="Servidores" description="Conecte o Ananim Manager Agent aos servidores do projeto, escolha os serviços e quem pode iniciar, parar ou reiniciar." />
      {erro ? <div className="ananim-alert ananim-alert-danger">{erro}</div> : null}
      {aviso ? <div className="ananim-alert">{aviso}</div> : null}

      <section className="ananim-card space-y-3 p-5">
        <h2 className="ananim-section-title">1. Projeto</h2>
        <input className="ananim-input" placeholder="Buscar projeto ou conta" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar projeto" />
        <div className="flex flex-wrap gap-2">
          {projetosVisiveis.map((p) => (
            <button key={projectKeyOf(p)} type="button" onClick={() => void abrirProjeto(p)}
              className={`ananim-btn ${projeto && projectKeyOf(projeto) === projectKeyOf(p) ? 'ananim-btn-primary' : 'ananim-btn-ghost'}`}>
              {p.name}{p.perfil ? <span className="ml-1 font-mono text-xs opacity-70">{p.perfil}</span> : null}
            </button>
          ))}
        </div>
      </section>

      {projeto ? (
        <section className="ananim-card space-y-3 p-5">
          <h2 className="ananim-section-title">2. Servidores de {projeto.name}</h2>
          <div className="ananim-table-wrap">
            <table className="ananim-table">
              <thead><tr><th>Servidor</th><th>Situação</th><th>Conector</th><th /></tr></thead>
              <tbody>
                {ecs.map((s) => {
                  const ag = agentes.find((a) => a.ecsId === s.id && !a.revoked);
                  return (
                    <tr key={s.id}>
                      <td className="font-mono">{s.name}</td>
                      <td>{s.status}</td>
                      <td>{ag ? <span className={ag.online ? 'text-emerald-300' : 'text-amber-200'}>{ag.online ? 'Online' : `Sem contato desde ${fmt(ag.lastSeen)}`} · {ag.os} · {ag.agentVersion}</span> : <span className="text-ananim-muted">Não conectado</span>}</td>
                      <td className="text-right">
                        {ag ? <button type="button" className="ananim-btn ananim-btn-soft" onClick={() => void abrirAgente(ag.id)}>Serviços e acesso</button>
                          : <button type="button" className="ananim-btn ananim-btn-primary" onClick={() => void gerarCodigo(s)}>Conectar</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {codigo ? (
            <div className="ananim-card-muted space-y-2 p-4">
              <div className="ananim-label">Código para {codigo.ecsName} · uso único · válido até {new Date(codigo.expiresAt).toLocaleTimeString('pt-BR')}</div>
              <div className="font-mono text-2xl tracking-widest text-cyan-300">{codigo.code}</div>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ananim-muted">
                <li>No servidor, abra o <strong>AnanimManagerAgent.exe</strong> como administrador.</li>
                <li>Informe o endereço do painel e este código e clique em <strong>Ativar</strong>; depois em <strong>Instalar / atualizar serviço</strong>.</li>
                <li>Em até 1 minuto os serviços aparecem em "Serviços e acesso".</li>
              </ol>
            </div>
          ) : null}
          {agentes.filter((a) => !a.revoked && !ecs.some((s) => s.id === a.ecsId)).length && conectados.size ? (
            <p className="text-sm text-ananim-muted">Há conectores de servidores que não aparecem mais no projeto.</p>
          ) : null}
        </section>
      ) : null}

      {detalhe ? (
        <section className="ananim-card space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="ananim-section-title">3. {detalhe.agent.ecsName}: {detalhe.services.length} serviços encontrados pelo agente</h2>
            <div className="flex gap-2">
              <button type="button" className="ananim-btn ananim-btn-ghost" onClick={() => void revogar(detalhe.agent)}>Desconectar</button>
              <button type="button" className="ananim-btn ananim-btn-primary" onClick={() => void salvarLiberacoes()}>Salvar liberações</button>
            </div>
          </div>
          <p className="text-sm text-ananim-muted">Lista enviada automaticamente pelo agente (ao iniciar, a cada 6 h e depois de cada tarefa). Marque as ações que podem aparecer para o cliente; o que ficar sem marcação continua oculto. Serviços críticos do sistema e o próprio conector nunca aparecem aqui.</p>
          {detalhe.services.length === 0 ? <div className="ananim-alert">O agente ainda não enviou a lista de serviços. Confira se o serviço do agente está instalado e em execução no servidor.</div> : null}
          <input className="ananim-input" placeholder="Filtrar serviços (os já liberados sempre aparecem)" value={filtroServico} onChange={(e) => setFiltroServico(e.target.value)} aria-label="Filtrar serviços" />
          <div className="ananim-table-wrap max-h-[420px] overflow-auto">
            <table className="ananim-table">
              <thead><tr><th>Serviço</th><th>Status</th>{ACOES.map((a) => <th key={a}>{ACTION_LABEL[a]}</th>)}<th>Nome do botão</th></tr></thead>
              <tbody>
                {servicosFiltrados.map((s) => {
                  const r = liberacoes[s.name];
                  return (
                    <tr key={s.name}>
                      <td><div>{s.displayName}</div><div className="font-mono text-xs text-ananim-muted">{s.name}</div></td>
                      <td>{s.status}</td>
                      {ACOES.map((a) => (
                        <td key={a}><input type="checkbox" className="h-4 w-4" aria-label={`${ACTION_LABEL[a]} ${s.displayName}`}
                          checked={!!r?.actions.includes(a)} onChange={() => alternar(s.name, s.displayName, a)} /></td>
                      ))}
                      <td><input className="ananim-input" disabled={!r?.actions.length} value={r?.label ?? ''} aria-label={`Nome do botão de ${s.displayName}`}
                        onChange={(e) => setLiberacoes((x) => ({ ...x, [s.name]: { ...(x[s.name] ?? { serviceName: s.name, actions: [] }), label: e.target.value } }))} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h2 className="ananim-section-title">4. Quem vê cada serviço</h2>
          {detalhe.users.length === 0 ? <p className="text-sm text-ananim-muted">Nenhum usuário com este projeto. Em Usuários, dê ao cliente acesso ao projeto e às VMs; depois volte aqui.</p> : null}
          {detalhe.users.map((u) => {
            const atuais = detalhe.grants.filter((g) => g.userId === u.id).map((g) => g.serviceName);
            return (
              <div key={u.id} className="ananim-card-muted flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-[220px]"><div className="font-semibold">{u.name}</div><div className="font-mono text-xs text-ananim-muted">{u.email}</div></div>
                {detalhe.releases.map((r) => (
                  <label key={r.serviceName} className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={atuais.includes(r.serviceName)}
                      onChange={(e) => void salvarAcesso(u.id, e.target.checked ? [...atuais, r.serviceName] : atuais.filter((n) => n !== r.serviceName))} />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            );
          })}

          <h2 className="ananim-section-title">Tarefas recentes</h2>
          <div className="ananim-table-wrap">
            <table className="ananim-table">
              <thead><tr><th>Quando</th><th>Serviço</th><th>Ação</th><th>Pedido por</th><th>Situação</th><th>Resultado</th></tr></thead>
              <tbody>
                {detalhe.jobs.map((j) => (
                  <tr key={j.id}><td>{fmt(j.requestedAt)}</td><td className="font-mono">{j.serviceName}</td><td>{ACTION_LABEL[j.action]}</td>
                    <td>{j.requestedBy}</td><td>{JOB_LABEL[j.status]}</td><td>{j.resultMessage || j.resultCode || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
