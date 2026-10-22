import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Database, Globe, Server } from 'lucide-react';
import { ACTION_LABEL, JOB_LABEL, agentServices, type AgentAction, type ServerServices } from '../api/agent';
import { useUser } from '../hooks/useUser';

const RUNNING = /^(running|active)$/i;
const ORDEM: AgentAction[] = ['start', 'stop', 'restart'];
const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
type Servico = ServerServices['services'][number];

/** Serviços com o mesmo nome de botão ficam juntos (ex.: 4 × "B1iF"), na ordem em que aparecem. */
function grupos(services: Servico[]): [string, Servico[]][] {
  const mapa = new Map<string, Servico[]>();
  for (const v of services) {
    const chave = v.label.trim();
    mapa.set(chave, [...(mapa.get(chave) ?? []), v]);
  }
  return [...mapa.entries()];
}

/** Banco/HANA × servidor web/aplicação: instância HANA descoberta ou nome do servidor com HDB/DB/SQL/HANA. */
function papel(s: ServerServices): 'banco' | 'web' {
  if (s.services.some((v) => v.serviceName.startsWith('HANA_'))) return 'banco';
  return /(HDB|HANA|SQL|DB\d*$|-DB)/i.test(s.ecsName) ? 'banco' : 'web';
}
const SECOES = [
  { id: 'banco' as const, titulo: 'Banco / HANA', icone: Database },
  { id: 'web' as const, titulo: 'Servidor web / aplicação', icone: Globe },
];

/**
 * Serviços liberados pelo conector (Ananim Manager Agent), separados em banco/HANA e servidor web.
 * Caixas recolhíveis: servidor inteiro e grupos com o mesmo nome de botão. Com `projectKey`, só o projeto escolhido na Home.
 */
export default function AgentServicesPanel({ projectKey, alwaysShow = false }: { projectKey?: string; alwaysShow?: boolean }) {
  const [todos, setServers] = useState<ServerServices[]>([]);
  const servers = projectKey ? todos.filter((s) => s.projectKey === projectKey) : todos;
  const isAdmin = useUser()?.role === 'admin';
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState('');
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    try {
      setServers((await agentServices.list()).servers);
      setErro('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os serviços do conector.');
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  // Enquanto houver tarefa pendente, atualiza a cada 5 s para mostrar o resultado do agente.
  const pendente = servers.some((s) => s.services.some((v) => v.lastJob && ['pending', 'claimed'].includes(v.lastJob.status)));
  useEffect(() => {
    if (!pendente) return;
    const t = setInterval(() => { void carregar(); }, 5000);
    return () => clearInterval(t);
  }, [pendente, carregar]);

  const alternar = (setter: typeof setAbertos, chave: string) => setter((x) => {
    const n = new Set(x);
    if (n.has(chave)) n.delete(chave); else n.add(chave);
    return n;
  });
  const chavesGrupos = servers.flatMap((s) => grupos(s.services).filter(([, i]) => i.length > 1).map(([l]) => `${s.agentId}/${l}`));
  // "Tudo aberto": nenhum servidor recolhido e todos os grupos expandidos (sem grupos, basta os servidores abertos).
  const tudoAberto = recolhidos.size === 0 && chavesGrupos.every((k) => abertos.has(k));
  const recolherTudo = () => { setAbertos(new Set()); setRecolhidos(new Set(servers.map((s) => s.agentId))); };
  const expandirTudo = () => { setRecolhidos(new Set()); setAbertos(new Set(chavesGrupos)); };

  async function executar(s: ServerServices, serviceName: string, label: string, action: AgentAction) {
    if (action === 'stop' && !window.confirm(`Parar "${label}" em ${s.ecsName}? O serviço fica parado até alguém iniciar de novo.`)) return;
    setEnviando(`${s.agentId}/${serviceName}`);
    try {
      await agentServices.run(s.agentId, serviceName, action);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Pedido recusado.');
    } finally {
      setEnviando('');
    }
  }

  /** Mesmo pedido para todos os serviços de um grupo (mesmo nome de botão), um após o outro. */
  async function executarGrupo(s: ServerServices, label: string, nomes: string[], action: AgentAction) {
    if (!window.confirm(`${ACTION_LABEL[action]} os ${nomes.length} serviços "${label}" em ${s.ecsName}?${action === 'stop' ? ' Eles ficam parados até alguém iniciar de novo.' : ''}`)) return;
    setEnviando(`${s.agentId}/grupo/${label}`);
    const falhas: string[] = [];
    for (const nome of nomes) {
      try { await agentServices.run(s.agentId, nome, action); } catch { falhas.push(nome); }
    }
    setEnviando('');
    if (falhas.length) setErro(`Não foi possível ${ACTION_LABEL[action].toLowerCase()}: ${falhas.join(', ')}`);
    await carregar();
  }

  function linhaServico(s: ServerServices, v: Servico, bloqueado: boolean) {
    const job = v.lastJob;
    const ocupado = bloqueado || enviando === `${s.agentId}/${v.serviceName}` || (!!job && ['pending', 'claimed'].includes(job.status));
    return (
      <div key={v.serviceName} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="font-semibold">{v.label}</div>
          <div className="font-mono text-xs text-ananim-muted">
            {v.displayName} · {job ? `${JOB_LABEL[job.status]} (${ACTION_LABEL[job.action]}) ${fmt(job.finishedAt || job.requestedAt)} por ${job.requestedBy}` : 'sem execuções pelo painel'}
            {job?.status === 'failed' && job.resultMessage ? ` · ${job.resultMessage}` : ''}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`ananim-chip ${RUNNING.test(v.status) ? 'text-emerald-300' : 'text-rose-300'}`}>{RUNNING.test(v.status) ? 'Em execução' : v.status || 'Desconhecido'}</span>
          {ORDEM.filter((a) => v.actions.includes(a)).map((a) => (
            <button key={a} type="button" disabled={ocupado || !s.online}
              className={`ananim-btn ${a === 'restart' ? 'ananim-btn-primary' : 'ananim-btn-soft'}`}
              onClick={() => void executar(s, v.serviceName, v.label, a)}>{ACTION_LABEL[a]}</button>
          ))}
        </div>
      </div>
    );
  }

  function cartaoServidor(s: ServerServices) {
    const fechado = recolhidos.has(s.agentId);
    return (
      <div key={s.agentId} className="ananim-card-muted space-y-3 p-4">
        <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" aria-expanded={!fechado}
          onClick={() => alternar(setRecolhidos, s.agentId)}>
          {fechado ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          <Server className="h-4 w-4 text-ananim-muted" aria-hidden="true" />
          <strong className="font-mono">{s.ecsName}</strong>
          <span className={`ananim-chip ${s.online ? 'text-emerald-300' : 'text-amber-200'}`}>{s.online ? 'Conector online' : `Conector sem contato desde ${fmt(s.lastSeen)}`}</span>
          <span className="text-xs text-ananim-muted">{s.services.length} serviço(s)</span>
        </button>
        {fechado ? null : (
          <>
            {s.services.length === 0 ? (
              <p className="text-sm text-ananim-muted">
                {isAdmin
                  ? 'Nenhum serviço liberado neste servidor. Libere em Servidores (conector) → Serviços e acesso.'
                  : 'Nenhum serviço liberado para você neste servidor ainda. Fale com a Ananim para liberar.'}
              </p>
            ) : null}
            {grupos(s.services).map(([label, itens]) => {
              if (itens.length === 1) return linhaServico(s, itens[0], false);
              const chave = `${s.agentId}/${label}`;
              const aberto = abertos.has(chave);
              const comuns = ORDEM.filter((a) => itens.every((v) => v.actions.includes(a)));
              const ocupadoGrupo = enviando === `${s.agentId}/grupo/${label}` || itens.some((v) => v.lastJob && ['pending', 'claimed'].includes(v.lastJob.status));
              const rodando = itens.filter((v) => RUNNING.test(v.status)).length;
              return (
                <div key={label} className="space-y-2 rounded-2xl border border-cyan-400/20 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-1">
                    <button type="button" className="flex items-center gap-2 text-left" aria-expanded={aberto} onClick={() => alternar(setAbertos, chave)}>
                      {aberto ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                      <span className="font-semibold">{label}</span>
                      <span className="text-sm text-ananim-muted">· {itens.length} serviços · {rodando} em execução</span>
                      <span className="text-xs text-cyan-300">{aberto ? 'Mostrar menos' : 'Mostrar todos'}</span>
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      {comuns.map((a) => (
                        <button key={a} type="button" disabled={ocupadoGrupo || !s.online}
                          className={`ananim-btn ${a === 'restart' ? 'ananim-btn-primary' : 'ananim-btn-soft'}`}
                          onClick={() => void executarGrupo(s, label, itens.map((v) => v.serviceName), a)}>{ACTION_LABEL[a]} todos ({itens.length})</button>
                      ))}
                    </div>
                  </div>
                  {aberto ? itens.map((v) => linhaServico(s, v, ocupadoGrupo)) : null}
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  if (!servers.length && !erro && !alwaysShow) return null;
  return (
    <section className="ananim-card mb-6 space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="ananim-section-title">Serviços dos servidores</h2>
          <p className="ananim-section-subtitle">Pelo conector instalado em cada servidor. O pedido é executado em até 30 segundos.</p>
        </div>
        <div className="flex gap-2">
          {servers.length ? (
            <button type="button" className="ananim-btn ananim-btn-ghost"
              onClick={tudoAberto ? recolherTudo : expandirTudo}>
              {tudoAberto ? 'Recolher tudo' : 'Expandir tudo'}
            </button>
          ) : null}
          <button type="button" className="ananim-btn ananim-btn-ghost" onClick={() => void carregar()}>Atualizar</button>
        </div>
      </div>
      {erro ? <div className="ananim-alert ananim-alert-danger">{erro}</div> : null}
      {!servers.length && !erro ? <p className="text-sm text-ananim-muted">Nenhum servidor deste cliente está com o conector ligado ainda.</p> : null}
      {SECOES.map(({ id, titulo, icone: Icone }) => {
        const daSecao = servers.filter((s) => papel(s) === id);
        if (!daSecao.length) return null;
        return (
          <div key={id} className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-ananim-muted">
              <Icone className="h-4 w-4" aria-hidden="true" />{titulo}
            </h3>
            {daSecao.map(cartaoServidor)}
          </div>
        );
      })}
    </section>
  );
}
