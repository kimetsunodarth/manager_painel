import { useEffect, useState } from 'react';
import { huawei, type HuaweiEcsServer, type HuaweiProject } from '../api/client';
import { agentAdmin, isManualProject, projectKeyOf, type AgentInfo } from '../api/agent';

const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Servidores cadastrados pelo instalador geral (botões Agente Windows/Linux): já estão conectados ao painel e só
 * esperam o admin escolher o projeto e a VM. A VM com o mesmo nome do servidor vem sugerida.
 */
export default function AgentesSemProjeto({ projetos, onVinculado }: { projetos: HuaweiProject[]; onVinculado: (msg: string) => void }) {
  const [agentes, setAgentes] = useState<AgentInfo[]>([]);
  const [projetoDe, setProjetoDe] = useState<Record<string, string>>({});
  const [vmsDe, setVmsDe] = useState<Record<string, HuaweiEcsServer[]>>({});
  const [vmDe, setVmDe] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');

  const carregar = () => agentAdmin.unassigned().then((r) => setAgentes(r.agents)).catch(() => undefined);
  useEffect(() => { void carregar(); }, []);

  async function escolherProjeto(a: AgentInfo, chave: string) {
    setProjetoDe((x) => ({ ...x, [a.id]: chave })); setVmDe((x) => ({ ...x, [a.id]: '' })); setErro('');
    const p = projetos.find((x) => projectKeyOf(x) === chave);
    if (!p) return;
    try {
      const vms = isManualProject(p)
        ? (await agentAdmin.manualServers(p.id)).servers as HuaweiEcsServer[]
        : await huawei.ecs(p.id, p.region || undefined, p.perfil);
      setVmsDe((x) => ({ ...x, [a.id]: vms }));
      const mesmoNome = vms.find((v) => v.name.toLowerCase() === a.hostname.toLowerCase());
      if (mesmoNome) setVmDe((x) => ({ ...x, [a.id]: mesmoNome.id }));
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao listar as VMs do projeto.'); }
  }

  async function vincular(a: AgentInfo) {
    const p = projetos.find((x) => projectKeyOf(x) === projetoDe[a.id]);
    const vm = (vmsDe[a.id] || []).find((v) => v.id === vmDe[a.id]);
    if (!p || !vm) return;
    try {
      await agentAdmin.assign(a.id, vm.id, vm.name, { projectKey: projectKeyOf(p), projectName: p.name });
      onVinculado(`${a.hostname} ligado a ${p.name} · ${vm.name}.`);
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
      <p className="text-sm text-ananim-muted">Instalados com o agente baixado no topo desta página. Já estão conectados: escolha o projeto e a VM de cada um. A VM com o mesmo nome vem sugerida.</p>
      {erro ? <div className="ananim-alert ananim-alert-danger">{erro}</div> : null}
      {agentes.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-3">
          <div className="min-w-[180px]">
            <div className="font-mono font-semibold">{a.hostname}</div>
            <div className="text-xs text-ananim-muted">{a.os} · {a.online ? 'online' : `sem contato desde ${fmt(a.lastSeen)}`} · {a.serviceCount ?? 0} serviços</div>
          </div>
          <select className="ananim-select h-10 max-w-xs" value={projetoDe[a.id] || ''} aria-label={`Projeto de ${a.hostname}`}
            onChange={(e) => void escolherProjeto(a, e.target.value)}>
            <option value="">Projeto...</option>
            {projetos.map((p) => <option key={projectKeyOf(p)} value={projectKeyOf(p)}>{p.name}{p.perfil ? ` (${p.perfil})` : ''}</option>)}
          </select>
          <select className="ananim-select h-10 max-w-xs" value={vmDe[a.id] || ''} disabled={!vmsDe[a.id]?.length} aria-label={`Servidor de ${a.hostname}`}
            onChange={(e) => setVmDe((x) => ({ ...x, [a.id]: e.target.value }))}>
            <option value="">Servidor...</option>
            {(vmsDe[a.id] || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button type="button" className="ananim-btn ananim-btn-primary" disabled={!vmDe[a.id]} onClick={() => void vincular(a)}>Vincular</button>
          <button type="button" className="ananim-btn ananim-btn-ghost" onClick={() => void descartar(a)}>Descartar</button>
        </div>
      ))}
    </section>
  );
}
