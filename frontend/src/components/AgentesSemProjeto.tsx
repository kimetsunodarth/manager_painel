import { useEffect, useState } from 'react';
import { huawei, type HuaweiEcsServer, type HuaweiProject } from '../api/client';
import { agentAdmin, isManualProject, projectKeyOf, type AgentInfo } from '../api/agent';
import SeletorProjeto from './SeletorProjeto';
import { nomeProjeto } from '../utils/contas';

const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
type Sugestao = Awaited<ReturnType<typeof agentAdmin.suggest>>['suggestion'];

/**
 * Servidores cadastrados pelo instalador geral (botões Agente Windows/Linux) ainda sem projeto.
 * O painel procura sozinho a VM de mesmo nome nos projetos dos clientes e sugere; senão, escolha conta → projeto → VM.
 */
export default function AgentesSemProjeto({ projetos, onVinculado }: { projetos: HuaweiProject[]; onVinculado: (msg: string) => void }) {
  const [agentes, setAgentes] = useState<AgentInfo[]>([]);
  const [sugestoes, setSugestoes] = useState<Record<string, Sugestao | 'buscando'>>({});
  const [contaDe, setContaDe] = useState<Record<string, string>>({});
  const [projetoDe, setProjetoDe] = useState<Record<string, HuaweiProject | null>>({});
  const [vmsDe, setVmsDe] = useState<Record<string, HuaweiEcsServer[]>>({});
  const [vmDe, setVmDe] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');

  async function carregar() {
    const lista = (await agentAdmin.unassigned().catch(() => ({ agents: [] as AgentInfo[] }))).agents;
    setAgentes(lista);
    for (const a of lista) {
      setSugestoes((x) => ({ ...x, [a.id]: 'buscando' }));
      agentAdmin.suggest(a.id).then((r) => setSugestoes((x) => ({ ...x, [a.id]: r.suggestion }))).catch(() => setSugestoes((x) => ({ ...x, [a.id]: null })));
    }
  }
  useEffect(() => { void carregar(); }, []);

  async function escolherProjeto(a: AgentInfo, p: HuaweiProject | null) {
    setProjetoDe((x) => ({ ...x, [a.id]: p })); setVmDe((x) => ({ ...x, [a.id]: '' })); setVmsDe((x) => ({ ...x, [a.id]: [] })); setErro('');
    if (!p) return;
    try {
      const vms = isManualProject(p) ? (await agentAdmin.manualServers(p.id)).servers as HuaweiEcsServer[] : await huawei.ecs(p.id, p.region || undefined, p.perfil);
      setVmsDe((x) => ({ ...x, [a.id]: vms }));
      const mesmoNome = vms.find((v) => v.name.toLowerCase() === a.hostname.toLowerCase());
      if (mesmoNome) setVmDe((x) => ({ ...x, [a.id]: mesmoNome.id }));
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao listar as VMs do projeto.'); }
  }

  async function ligar(a: AgentInfo, projectKey: string, projectName: string, vmId: string, vmName: string) {
    try {
      await agentAdmin.assign(a.id, vmId, vmName, { projectKey, projectName });
      onVinculado(`${a.hostname} ligado a ${nomeProjeto(projectName)} · ${vmName}.`);
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível vincular.'); }
  }

  async function descartar(a: AgentInfo) {
    if (!window.confirm(`Descartar o cadastro de ${a.hostname}? O agente nesse servidor deixa de funcionar.`)) return;
    try { await agentAdmin.revoke(a.id); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao descartar.'); }
  }

  if (!agentes.length) return null;
  return (
    <section className="ananim-card space-y-3 border-amber-400/30 p-5">
      <h2 className="ananim-section-title">Aguardando vínculo · {agentes.length} servidor(es) novo(s)</h2>
      <p className="text-sm text-ananim-muted">Instalados com o agente baixado no topo. Já estão conectados: falta só dizer o projeto e a VM. O painel procura a VM de mesmo nome nos projetos dos clientes.</p>
      {erro ? <div className="ananim-alert ananim-alert-danger">{erro}</div> : null}
      {agentes.map((a) => {
        const s = sugestoes[a.id];
        const p = projetoDe[a.id];
        const vm = (vmsDe[a.id] || []).find((v) => v.id === vmDe[a.id]);
        return (
          <div key={a.id} className="space-y-2 rounded-xl border border-white/10 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[180px]">
                <div className="font-mono font-semibold">{a.hostname}</div>
                <div className="text-xs text-ananim-muted">{a.os} · {a.online ? 'online' : `sem contato desde ${fmt(a.lastSeen)}`} · {a.serviceCount ?? 0} serviços</div>
              </div>
              {s === 'buscando' ? <span className="text-sm text-ananim-muted">Procurando a VM nos projetos dos clientes...</span>
                : s ? (
                  <>
                    <span className="text-sm">Encontrado: <strong>{nomeProjeto(s.projectName)}</strong> · <span className="font-mono">{s.ecsName}</span></span>
                    <button type="button" className="ananim-btn ananim-btn-primary" onClick={() => void ligar(a, s.projectKey, s.projectName, s.ecsId, s.ecsName)}>Vincular</button>
                  </>
                ) : <span className="text-sm text-amber-100">Nenhuma VM com esse nome nos projetos dos clientes: escolha abaixo.</span>}
              <button type="button" className="ananim-btn ananim-btn-ghost ml-auto" onClick={() => void descartar(a)}>Descartar</button>
            </div>
            {s !== 'buscando' ? (
              <div className="flex flex-wrap items-center gap-2">
                <SeletorProjeto compacto projetos={projetos} conta={contaDe[a.id] || ''} onConta={(c) => setContaDe((x) => ({ ...x, [a.id]: c }))}
                  valor={p ? projectKeyOf(p) : ''} onProjeto={(np) => void escolherProjeto(a, np)} />
                <select className="ananim-select h-10 max-w-xs" value={vmDe[a.id] || ''} disabled={!vmsDe[a.id]?.length} aria-label={`Servidor de ${a.hostname}`}
                  onChange={(e) => setVmDe((x) => ({ ...x, [a.id]: e.target.value }))}>
                  <option value="">Servidor...</option>
                  {(vmsDe[a.id] || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <button type="button" className="ananim-btn ananim-btn-soft" disabled={!p || !vm}
                  onClick={() => p && vm && void ligar(a, projectKeyOf(p), p.name, vm.id, vm.name)}>Vincular escolhido</button>
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
