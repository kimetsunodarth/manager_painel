import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AgentesSemProjeto from '../components/AgentesSemProjeto';
import { huawei, type HuaweiEcsServer, type HuaweiProject } from '../api/client';
import {
  ACTION_LABEL, JOB_LABEL, agentAdmin, isManualProject, projectKeyOf, statusLabel, type AgentAction, type AgentOs, type AgentDetail, type AgentInfo, type ServiceRelease,
} from '../api/agent';

const ACOES: AgentAction[] = ['start', 'stop', 'restart'];
const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('pt-BR') : '—');
const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Falha na operação.');

/** Caixa com estado "parcial" (indeterminate), para marcar/desmarcar em lote. */
function CaixaTri({ checked, parcial, rotulo, onChange }: { checked: boolean; parcial: boolean; rotulo: string; onChange: (marcar: boolean) => void }) {
  return (
    <input type="checkbox" className="h-4 w-4 cursor-pointer accent-cyan-400" aria-label={rotulo} title={rotulo}
      checked={checked} ref={(el) => { if (el) el.indeterminate = parcial; }}
      onChange={() => onChange(!checked)} />
  );
}

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
  const [nomeLote, setNomeLote] = useState('');
  const [conectando, setConectando] = useState<HuaweiEcsServer | null>(null);
  const [baixando, setBaixando] = useState('');
  const [codigo, setCodigo] = useState<{ code: string; expiresAt: number; ecsName: string } | null>(null);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [novoProjeto, setNovoProjeto] = useState('');
  const [novoServidor, setNovoServidor] = useState('');

  const carregarProjetos = () => huawei.projects('region', 'all_perfis').then(setProjetos).catch((e) => setErro(erroDe(e)));
  useEffect(() => { void carregarProjetos(); }, []);

  // Link vindo de Clientes: /servidores?projectKey=...&agentId=... abre o projeto (e o servidor) direto.
  const [params] = useSearchParams();
  const [linkAplicado, setLinkAplicado] = useState(false);
  useEffect(() => {
    const chave = params.get('projectKey');
    if (linkAplicado || !chave || !projetos.length) return;
    setLinkAplicado(true);
    const alvo = projetos.find((p) => projectKeyOf(p) === chave);
    if (!alvo) return;
    void abrirProjeto(alvo).then(() => {
      const agentId = params.get('agentId');
      if (agentId) void abrirAgente(agentId);
    });
  }, [projetos, params, linkAplicado]);

  async function criarProjeto() {
    setErro(''); setAviso('');
    try {
      const { project } = await agentAdmin.createManualProject(novoProjeto);
      setNovoProjeto('');
      await carregarProjetos();
      setAviso(`Projeto "${project.name}" criado. Adicione os servidores e conecte o agente; depois atribua o projeto aos clientes em Usuários.`);
      await abrirProjeto({ id: project.id, name: project.name } as HuaweiProject);
    } catch (e) { setErro(erroDe(e)); }
  }

  async function adicionarServidor() {
    if (!projeto) return;
    setErro('');
    try {
      await agentAdmin.addManualServer(projeto.id, novoServidor);
      setNovoServidor('');
      await abrirProjeto(projeto);
    } catch (e) { setErro(erroDe(e)); }
  }

  const projetosVisiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return projetos.filter((p) => !t || `${p.name} ${p.perfil ?? ''}`.toLowerCase().includes(t)).slice(0, 200);
  }, [projetos, busca]);

  async function abrirProjeto(p: HuaweiProject) {
    setProjeto(p); setDetalhe(null); setCodigo(null); setConectando(null); setAviso(''); setErro('');
    try {
      const servidoresDe = isManualProject(p)
        ? agentAdmin.manualServers(p.id).then((r) => r.servers as HuaweiEcsServer[])
        : huawei.ecs(p.id, p.region || undefined, p.perfil);
      const [servidores, lista] = await Promise.all([servidoresDe, agentAdmin.agents(projectKeyOf(p))]);
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

  /** Instalador com a ativação deste servidor dentro do arquivo: no servidor é só executar (Windows) ou rodar o install.sh (Linux). */
  async function baixarAtivado(servidor: HuaweiEcsServer, os: AgentOs) {
    if (!projeto) return;
    setBaixando(`${servidor.id}/${os}`); setErro('');
    try {
      await agentAdmin.downloadActivated({ projectKey: projectKeyOf(projeto), projectName: projeto.name, ecsId: servidor.id, ecsName: servidor.name, os });
      setAviso(os === 'windows'
        ? `Instalador de ${servidor.name} baixado. No servidor, execute-o como administrador: ele ativa e instala o serviço sozinho (vale 24 h, uma vez).`
        : `Pacote de ${servidor.name} baixado. No servidor: tar xzf no arquivo, entre na pasta e rode sudo bash install.sh (vale 24 h, uma vez).`);
    } catch (e) { setErro(erroDe(e)); } finally { setBaixando(''); }
  }

  /** Instalador do projeto: o mesmo arquivo serve para todos os servidores do projeto (7 dias); cada um é ligado pelo nome da VM. */
  async function baixarDoProjeto(os: AgentOs) {
    if (!projeto) return;
    setBaixando(`projeto/${os}`); setErro('');
    try {
      await agentAdmin.downloadProject({ projectKey: projectKeyOf(projeto), projectName: projeto.name, projectId: projeto.id,
        region: projeto.region || undefined, perfil: projeto.perfil || undefined, os });
      setAviso(os === 'windows'
        ? 'Instalador do projeto baixado. Em cada servidor do projeto, execute-o como administrador: ele se cadastra e aparece aqui ligado à VM de mesmo nome (vale 7 dias).'
        : 'Pacote do projeto baixado. Em cada servidor (root): tar xzf no arquivo, entre na pasta e rode bash install.sh. Ele aparece aqui ligado à VM de mesmo nome (vale 7 dias).');
    } catch (e) { setErro(erroDe(e)); } finally { setBaixando(''); }
  }

  async function vincular(agentId: string, ecsId: string) {
    const alvo = ecs.find((s) => s.id === ecsId);
    if (!alvo || !projeto) return;
    try {
      await agentAdmin.assign(agentId, alvo.id, alvo.name);
      setAviso(`Conector ligado a ${alvo.name}.`);
      await abrirProjeto(projeto);
    } catch (e) { setErro(erroDe(e)); }
  }

  async function invalidarInstaladores() {
    if (!projeto || !window.confirm('Invalidar todos os instaladores deste projeto já baixados? Os servidores já cadastrados continuam funcionando.')) return;
    try { await agentAdmin.revokeProjectInstallers(projectKeyOf(projeto)); setAviso('Instaladores do projeto invalidados.'); } catch (e) { setErro(erroDe(e)); }
  }

  async function baixarAgente(os: AgentOs) {
    setBaixando(os); setErro('');
    try {
      await agentAdmin.downloadAgent(os);
      setAviso(`Agente ${os === 'windows' ? 'Windows' : 'Linux'} baixado (vale 7 dias, vários servidores, sem código). Instale no servidor; ele aparece aqui em "Aguardando vínculo" para você escolher projeto e VM. Para ligar sozinho pela VM de mesmo nome, use o instalador do projeto (passo 2).`);
    } catch (e) { setErro(erroDe(e)); } finally { setBaixando(''); }
  }

  /** Marca ou desmarca as ações dadas em vários serviços de uma vez (filtrados, coluna ou linha). */
  function definir(servicos: { name: string; displayName: string }[], acoes: AgentAction[], marcar: boolean) {
    setLiberacoes((atual) => {
      const novo = { ...atual };
      for (const s of servicos) {
        const r = novo[s.name] ?? { serviceName: s.name, label: s.displayName, actions: [] };
        const conjunto = new Set(r.actions);
        for (const a of acoes) { if (marcar) conjunto.add(a); else conjunto.delete(a); }
        novo[s.name] = { ...r, actions: ACOES.filter((a) => conjunto.has(a)) };
      }
      return novo;
    });
  }

  function marcarFiltrados(marcar: boolean) {
    if (marcar && servicosFiltrados.length > 30 && !window.confirm(`Liberar iniciar, parar e reiniciar para ${servicosFiltrados.length} serviços? Use o filtro para escolher só os que o cliente precisa.`)) return;
    definir(servicosFiltrados, ACOES, marcar);
  }

  function nomearFiltrados() {
    const nome = nomeLote.trim();
    if (!nome) return;
    setLiberacoes((atual) => {
      const novo = { ...atual };
      for (const s of servicosFiltrados) if (novo[s.name]?.actions.length) novo[s.name] = { ...novo[s.name], label: nome };
      return novo;
    });
    setNomeLote('');
  }

  async function acessoTodos(userId: string, todos: boolean) {
    await salvarAcesso(userId, todos ? (detalhe?.releases ?? []).map((r) => r.serviceName) : []);
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
      <PageHeader badge="Conector" title="Servidores" description="Conecte o Ananim Manager Agent aos servidores do projeto, escolha os serviços e quem pode iniciar, parar ou reiniciar."
        actions={(
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ananim-btn ananim-btn-ghost" disabled={!!baixando} onClick={() => void baixarAgente('windows')}>
              <Download className="h-4 w-4" aria-hidden="true" />{baixando === 'windows' ? 'Baixando...' : 'Agente Windows'}
            </button>
            <button type="button" className="ananim-btn ananim-btn-ghost" disabled={!!baixando} onClick={() => void baixarAgente('linux')}>
              <Download className="h-4 w-4" aria-hidden="true" />{baixando === 'linux' ? 'Baixando...' : 'Agente Linux'}
            </button>
          </div>
        )} />
      {erro ? <div className="ananim-alert ananim-alert-danger">{erro}</div> : null}
      {aviso ? <div className="ananim-alert">{aviso}</div> : null}
      <AgentesSemProjeto projetos={projetos} onVinculado={(msg) => { setAviso(msg); if (projeto) void abrirProjeto(projeto); }} />

      <section className="ananim-card space-y-3 p-5">
        <h2 className="ananim-section-title">1. Projeto</h2>
        <input className="ananim-input" placeholder="Buscar projeto ou conta" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar projeto" />
        <div className="flex flex-wrap gap-2">
          {projetosVisiveis.map((p) => (
            <button key={projectKeyOf(p)} type="button" onClick={() => void abrirProjeto(p)}
              className={`ananim-btn ${projeto && projectKeyOf(projeto) === projectKeyOf(p) ? 'ananim-btn-primary' : 'ananim-btn-ghost'}`}>
              {p.name}{p.perfil ? <span className="ml-1 font-mono text-xs opacity-70">{p.perfil}</span> : null}
              {isManualProject(p) ? <span className="ml-1 text-xs opacity-70">manual</span> : null}
            </button>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3" onSubmit={(e) => { e.preventDefault(); void criarProjeto(); }}>
          <input className="ananim-input max-w-sm" placeholder="Novo projeto fora da Huawei (ex.: cliente on-premise)" value={novoProjeto}
            onChange={(e) => setNovoProjeto(e.target.value)} aria-label="Nome do novo projeto" maxLength={80} />
          <button type="submit" className="ananim-btn ananim-btn-soft" disabled={novoProjeto.trim().length < 2}>＋ Novo projeto</button>
        </form>
      </section>

      {projeto ? (
        <section className="ananim-card space-y-3 p-5">
          <h2 className="ananim-section-title">2. Servidores de {projeto.name}</h2>
          {/* Instalador do projeto: o caminho mais simples para conectar vários servidores */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ananim-accent/30 bg-ananim-accent/[0.06] p-3">
            <span className="mr-1 text-sm text-ananim-textSoft">Instalador do projeto (serve para todos os servidores, 7 dias):</span>
            <button type="button" className="ananim-btn ananim-btn-primary" disabled={!!baixando} onClick={() => void baixarDoProjeto('windows')}>
              <Download className="h-4 w-4" aria-hidden="true" />{baixando === 'projeto/windows' ? 'Gerando...' : 'Windows'}
            </button>
            <button type="button" className="ananim-btn ananim-btn-primary" disabled={!!baixando} onClick={() => void baixarDoProjeto('linux')}>
              <Download className="h-4 w-4" aria-hidden="true" />{baixando === 'projeto/linux' ? 'Gerando...' : 'Linux'}
            </button>
            <button type="button" className="ml-auto text-xs text-ananim-muted hover:text-white hover:underline" onClick={() => void invalidarInstaladores()}>Invalidar instaladores baixados</button>
          </div>
          {agentes.some((a) => a.pending && !a.revoked) ? (
            <div className="space-y-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3">
              <p className="text-sm font-semibold text-amber-100">Aguardando vínculo</p>
              <p className="text-xs text-ananim-muted">Instalados pelo instalador do projeto, mas o nome do servidor não bate com nenhuma VM livre. Escolha a VM de cada um.</p>
              {agentes.filter((a) => a.pending && !a.revoked).map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{a.hostname}</span>
                  <span className="text-xs text-ananim-muted">{a.os} · {a.online ? 'online' : `sem contato desde ${fmt(a.lastSeen)}`}</span>
                  <select className="ananim-select h-9 max-w-xs" defaultValue="" aria-label={`Servidor para ${a.hostname}`}
                    onChange={(e) => { if (e.target.value) void vincular(a.id, e.target.value); }}>
                    <option value="">Escolher servidor...</option>
                    {ecs.filter((s) => !agentes.some((x) => !x.revoked && !x.pending && x.ecsId === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button type="button" className="ananim-btn ananim-btn-ghost h-9 px-3 text-xs" onClick={() => void revogar(a)}>Descartar</button>
                </div>
              ))}
            </div>
          ) : null}
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
                      <td>{ag ? <span className={ag.online ? 'text-emerald-300' : 'text-amber-200'}>{ag.online ? 'Online' : `Sem contato desde ${fmt(ag.lastSeen)}`} · {ag.os} · {ag.agentVersion} · {ag.serviceCount ?? 0} serviços encontrados</span> : <span className="text-ananim-muted">Não conectado</span>}</td>
                      <td className="text-right">
                        {ag ? <button type="button" className="ananim-btn ananim-btn-primary" onClick={() => void abrirAgente(ag.id)}>Serviços e acesso ({ag.serviceCount ?? 0})</button>
                          : <button type="button" className="ananim-btn ananim-btn-primary" aria-expanded={conectando?.id === s.id}
                              onClick={() => { setConectando(conectando?.id === s.id ? null : s); setCodigo(null); }}>Conectar</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isManualProject(projeto) ? (
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void adicionarServidor(); }}>
              <input className="ananim-input max-w-sm" placeholder="Nome do servidor (ex.: SRV-SAP01)" value={novoServidor}
                onChange={(e) => setNovoServidor(e.target.value)} aria-label="Nome do novo servidor" maxLength={80} />
              <button type="submit" className="ananim-btn ananim-btn-soft" disabled={novoServidor.trim().length < 2}>＋ Adicionar servidor</button>
              {ecs.length === 0 ? <span className="text-sm text-ananim-muted">Projeto manual: informe os servidores e clique em Conectar em cada um.</span> : null}
            </form>
          ) : null}
          {conectando ? (
            <div className="ananim-card-muted space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="ananim-section-title">Conectar {conectando.name}</h3>
                <button type="button" className="ananim-btn ananim-btn-ghost h-8 px-3 text-xs" onClick={() => { setConectando(null); setCodigo(null); }}>Fechar</button>
              </div>
              <p className="text-sm text-ananim-muted">O instalador já sai ativado para este servidor: ninguém precisa digitar código. A ativação dentro do arquivo vale 24 horas e uma única vez.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-white/10 p-3">
                  <button type="button" className="ananim-btn ananim-btn-primary w-full" disabled={!!baixando} onClick={() => void baixarAtivado(conectando, 'windows')}>
                    <Download className="h-4 w-4" aria-hidden="true" />{baixando === `${conectando.id}/windows` ? 'Gerando...' : 'Baixar instalador Windows'}
                  </button>
                  <p className="text-xs text-ananim-muted">No servidor: execute o <span className="font-mono">AnanimManagerAgent-{conectando.name}.exe</span> como administrador. Ele ativa e instala o serviço sozinho. Sem tela: <span className="font-mono">Start-Process .\AnanimManagerAgent-{conectando.name}.exe --auto -Verb RunAs -Wait</span></p>
                </div>
                <div className="space-y-2 rounded-xl border border-white/10 p-3">
                  <button type="button" className="ananim-btn ananim-btn-primary w-full" disabled={!!baixando} onClick={() => void baixarAtivado(conectando, 'linux')}>
                    <Download className="h-4 w-4" aria-hidden="true" />{baixando === `${conectando.id}/linux` ? 'Gerando...' : 'Baixar pacote Linux'}
                  </button>
                  <p className="text-xs text-ananim-muted">No servidor (root): <span className="font-mono">tar xzf ananim-manager-agent-linux-{conectando.name}.tar.gz && cd ananim-manager-agent-linux && bash install.sh</span></p>
                </div>
              </div>
              {codigo ? (
                <div className="space-y-1 rounded-xl border border-white/10 p-3">
                  <div className="ananim-label">Código manual para {codigo.ecsName} · uso único · válido até {new Date(codigo.expiresAt).toLocaleTimeString('pt-BR')}</div>
                  <div className="font-mono text-2xl tracking-widest text-cyan-300">{codigo.code}</div>
                  <p className="text-xs text-ananim-muted">Use no agente já instalado: abra-o como administrador, informe o código e clique em Ativar.</p>
                </div>
              ) : (
                <button type="button" className="text-xs text-cyan-300 hover:underline" onClick={() => void gerarCodigo(conectando)}>Prefiro gerar só um código para digitar no agente</button>
              )}
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
          {/* Ações em lote sobre o que está filtrado */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <span className="text-sm text-ananim-muted">{servicosFiltrados.length} filtrado(s):</span>
            <button type="button" className="ananim-btn ananim-btn-soft" onClick={() => marcarFiltrados(true)} disabled={!servicosFiltrados.length}>Marcar tudo</button>
            <button type="button" className="ananim-btn ananim-btn-ghost" onClick={() => marcarFiltrados(false)} disabled={!servicosFiltrados.length}>Desmarcar tudo</button>
            <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" aria-hidden="true" />
            <input className="ananim-input h-10 max-w-[240px]" placeholder="Nome do botão (ex.: B1iF)" value={nomeLote} onChange={(e) => setNomeLote(e.target.value)}
              aria-label="Nome do botão para os serviços filtrados e marcados" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nomearFiltrados(); } }} />
            <button type="button" className="ananim-btn ananim-btn-soft" onClick={nomearFiltrados} disabled={!nomeLote.trim()}>Aplicar nome aos marcados</button>
          </div>
          <div className="ananim-table-wrap max-h-[420px] overflow-auto">
            <table className="ananim-table">
              <thead><tr>
                <th className="w-16">Linha</th><th>Serviço</th><th>Status</th>
                {ACOES.map((a) => {
                  const marcados = servicosFiltrados.filter((s) => liberacoes[s.name]?.actions.includes(a)).length;
                  return (
                    <th key={a}>
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <CaixaTri checked={!!servicosFiltrados.length && marcados === servicosFiltrados.length} parcial={marcados > 0 && marcados < servicosFiltrados.length}
                          rotulo={`${ACTION_LABEL[a]}: marcar ou desmarcar todos os filtrados`} onChange={(v) => definir(servicosFiltrados, [a], v)} />
                        {ACTION_LABEL[a]}
                      </label>
                    </th>
                  );
                })}
                <th>Nome do botão</th>
              </tr></thead>
              <tbody>
                {servicosFiltrados.map((s) => {
                  const r = liberacoes[s.name];
                  const qtd = r?.actions.length ?? 0;
                  return (
                    <tr key={s.name}>
                      <td><CaixaTri checked={qtd === ACOES.length} parcial={qtd > 0 && qtd < ACOES.length}
                        rotulo={`Todas as ações de ${s.displayName}`} onChange={(v) => definir([s], ACOES, v)} /></td>
                      <td><div>{s.displayName}</div><div className="font-mono text-xs text-ananim-muted">{s.name}</div></td>
                      <td>{statusLabel(s.status)}</td>
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
                {detalhe.releases.length ? (
                  <div className="flex gap-1">
                    <button type="button" className="ananim-btn ananim-btn-soft h-8 px-3 text-xs" onClick={() => void acessoTodos(u.id, true)}
                      disabled={atuais.length === detalhe.releases.length}>Todos</button>
                    <button type="button" className="ananim-btn ananim-btn-ghost h-8 px-3 text-xs" onClick={() => void acessoTodos(u.id, false)}
                      disabled={!atuais.length}>Nenhum</button>
                  </div>
                ) : null}
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
