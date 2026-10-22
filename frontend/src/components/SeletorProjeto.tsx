import { useMemo } from 'react';
import type { HuaweiProject } from '../api/client';
import { projectKeyOf } from '../api/agent';
import { contaDoProjeto, nomeProjeto, projetoUtil } from '../utils/contas';

/** Conta → projeto, como na Home. `valor` é a chave do projeto (perfil-id). */
export default function SeletorProjeto({ projetos, conta, onConta, valor, onProjeto, compacto = false }: {
  projetos: HuaweiProject[]; conta: string; onConta: (c: string) => void; valor: string; onProjeto: (p: HuaweiProject | null) => void; compacto?: boolean;
}) {
  const uteis = useMemo(() => projetos.filter(projetoUtil), [projetos]);
  const contas = useMemo(() => [...new Set(uteis.map(contaDoProjeto))].sort(), [uteis]);
  const daConta = useMemo(() => uteis.filter((p) => contaDoProjeto(p) === conta).sort((a, b) => nomeProjeto(a.name).localeCompare(nomeProjeto(b.name))), [uteis, conta]);
  const altura = compacto ? 'h-10' : 'h-11';
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-[200px] flex-col gap-1">
        {compacto ? null : <span className="ananim-label mb-0">Conta</span>}
        <select className={`ananim-select ${altura}`} value={conta} aria-label="Conta"
          onChange={(e) => { onConta(e.target.value); onProjeto(null); }}>
          <option value="">Conta...</option>
          {contas.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="flex min-w-[260px] flex-col gap-1">
        {compacto ? null : <span className="ananim-label mb-0">Projeto</span>}
        <select className={`ananim-select ${altura}`} value={valor} disabled={!conta} aria-label="Projeto"
          onChange={(e) => onProjeto(daConta.find((p) => projectKeyOf(p) === e.target.value) ?? null)}>
          <option value="">{conta ? `Projeto... (${daConta.length})` : 'Escolha a conta'}</option>
          {daConta.map((p) => <option key={projectKeyOf(p)} value={projectKeyOf(p)}>{nomeProjeto(p.name)}</option>)}
        </select>
      </label>
    </div>
  );
}
