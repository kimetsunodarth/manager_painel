import { useCallback, useEffect, useState } from 'react';
import { Server } from 'lucide-react';
import { ACTION_LABEL, JOB_LABEL, agentServices, type AgentAction, type ServerServices } from '../api/agent';

const RUNNING = /running|active/i;
const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Serviços liberados pelo conector (Ananim Manager Agent) nos servidores do usuário. Some quando não há nenhum.
 * Com `projectKey` (projeto escolhido na Home), mostra só os servidores desse projeto.
 */
export default function AgentServicesPanel({ projectKey, alwaysShow = false }: { projectKey?: string; alwaysShow?: boolean }) {
  const [todos, setServers] = useState<ServerServices[]>([]);
  const servers = projectKey ? todos.filter((s) => s.projectKey === projectKey) : todos;
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState('');

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

  if (!servers.length && !erro && !alwaysShow) return null;
  return (
    <section className="ananim-card mb-6 space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="ananim-section-title">Serviços dos servidores</h2>
          <p className="ananim-section-subtitle">Pelo conector instalado em cada servidor. O pedido é executado em até 30 segundos.</p>
        </div>
        <button type="button" className="ananim-btn ananim-btn-ghost" onClick={() => void carregar()}>Atualizar</button>
      </div>
      {erro ? <div className="ananim-alert ananim-alert-danger">{erro}</div> : null}
      {!servers.length && !erro ? <p className="text-sm text-ananim-muted">Nenhum servidor deste cliente está com o conector ligado ainda.</p> : null}
      {servers.map((s) => (
        <div key={s.agentId} className="ananim-card-muted space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Server className="h-4 w-4 text-ananim-muted" aria-hidden="true" />
            <strong className="font-mono">{s.ecsName}</strong>
            <span className="ananim-chip">{s.projectName}</span>
            <span className={`ananim-chip ${s.online ? 'text-emerald-300' : 'text-amber-200'}`}>{s.online ? 'Conector online' : `Conector sem contato desde ${fmt(s.lastSeen)}`}</span>
          </div>
          {s.services.length === 0 ? <p className="text-sm text-ananim-muted">Nenhum serviço liberado neste servidor. O administrador libera em Servidores (conector) → Serviços e acesso.</p> : null}
          {s.services.map((v) => {
            const job = v.lastJob;
            const ocupado = enviando === `${s.agentId}/${v.serviceName}` || (!!job && ['pending', 'claimed'].includes(job.status));
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
                  {v.actions.map((a) => (
                    <button key={a} type="button" disabled={ocupado || !s.online}
                      className={`ananim-btn ${a === 'restart' ? 'ananim-btn-primary' : 'ananim-btn-soft'}`}
                      onClick={() => void executar(s, v.serviceName, v.label, a)}>{ACTION_LABEL[a]}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
