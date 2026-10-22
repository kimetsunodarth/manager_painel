import { useEffect, useRef } from 'react';

export type AcaoTipo = 'start' | 'stop' | 'restart';
/** Ação disparada numa VM: acompanhada até a VM chegar ao estado esperado (ou 5 min). */
export interface AcaoVm { action: AcaoTipo; inicio: number; viuTransicao?: boolean; fim?: number; erro?: string }

const ALVO: Record<AcaoTipo, string> = { start: 'ACTIVE', stop: 'SHUTOFF', restart: 'ACTIVE' };
const ESPERADO_S: Record<AcaoTipo, number> = { start: 90, stop: 60, restart: 120 };
const VERBO: Record<AcaoTipo, string> = { start: 'Ligando', stop: 'Desligando', restart: 'Reiniciando' };
const LIMITE_MS = 5 * 60 * 1000;

/** A ação terminou? Reinício só conta depois de a VM sair de ACTIVE (ou de 25 s, quando o reboot é rápido demais para ver). */
function concluiu(a: AcaoVm, status: string, agora: number) {
  if (a.action === 'restart') return status === 'ACTIVE' && (a.viuTransicao || agora - a.inicio > 25_000);
  return status === ALVO[a.action];
}

/**
 * Consulta as VMs a cada 5 s enquanto houver ação em andamento e marca as concluídas (somem 8 s depois).
 * `recarregar` deve atualizar a lista de VMs sem mostrar "carregando".
 */
export function useAcompanharAcoesVm(
  acoes: Record<string, AcaoVm>,
  setAcoes: (fn: (x: Record<string, AcaoVm>) => Record<string, AcaoVm>) => void,
  servidores: { id: string; status: string }[] | null,
  recarregar: () => Promise<unknown>,
) {
  const emAndamento = Object.values(acoes).some((a) => !a.fim && !a.erro);
  const recarregarRef = useRef(recarregar);
  recarregarRef.current = recarregar;

  useEffect(() => {
    if (!emAndamento) return;
    const t = setInterval(() => { void recarregarRef.current().catch(() => undefined); }, 5000);
    return () => clearInterval(t);
  }, [emAndamento]);

  useEffect(() => {
    if (!servidores) return;
    const agora = Date.now();
    setAcoes((atual) => {
      let mudou = false;
      const novo: Record<string, AcaoVm> = {};
      for (const [id, a] of Object.entries(atual)) {
        const status = String(servidores.find((s) => s.id === id)?.status || '').toUpperCase();
        let b = a;
        if (!a.fim && !a.erro) {
          if (a.action === 'restart' && status && status !== 'ACTIVE' && !a.viuTransicao) b = { ...b, viuTransicao: true };
          if (concluiu(b, status, agora)) b = { ...b, fim: agora };
          else if (agora - a.inicio > LIMITE_MS) b = { ...b, erro: `Ainda ${status || 'sem status'} após 5 min. Confira no console da Huawei.` };
        }
        if ((b.fim && agora - b.fim > 8000)) { mudou = true; continue; }
        if (b !== a) mudou = true;
        novo[id] = b;
      }
      return mudou ? novo : atual;
    });
  }, [servidores, setAcoes]);
}

/** Barra de progresso de uma ação numa VM (estimada pelo tempo típico; 100% quando a Huawei confirma o estado). */
export default function AcaoVmProgresso({ acao, status }: { acao: AcaoVm; status: string }) {
  const segundos = Math.round(((acao.fim ?? Date.now()) - acao.inicio) / 1000);
  const pct = acao.fim ? 100 : Math.min(95, Math.round((segundos / ESPERADO_S[acao.action]) * 100));
  const texto = acao.erro ? acao.erro
    : acao.fim ? `Concluído em ${segundos} s`
      : `${VERBO[acao.action]}… ${segundos} s · agora: ${status || '—'}`;
  return (
    <div className="mt-1.5 w-44" role="status" aria-live="polite">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-[width] duration-500 ${acao.erro ? 'bg-rose-400' : acao.fim ? 'bg-emerald-400' : 'bg-ananim-accent'}`}
          style={{ width: `${acao.erro ? 100 : pct}%` }} />
      </div>
      <p className={`mt-1 text-[11px] ${acao.erro ? 'text-rose-300' : acao.fim ? 'text-emerald-300' : 'text-ananim-muted'}`}>{texto}</p>
    </div>
  );
}
