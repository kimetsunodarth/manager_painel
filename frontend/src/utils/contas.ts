import type { HuaweiProject } from '../api/client';

/** Conta (como na Home) a partir do perfil do projeto; projetos manuais ficam em "Manual". */
export function contaDoProjeto(p: { id: string; perfil?: string | null }): string {
  if (p.id.startsWith('manual-')) return 'MANUAL';
  const perfil = String(p.perfil || '').toUpperCase();
  if (!perfil) return 'OUTROS';
  if (perfil.startsWith('ANANIMCLOUD')) return 'ANANIMCLOUD';
  if (perfil.startsWith('RAMO_SP') || perfil.startsWith('RAMO_CH') || perfil.startsWith('RAMO_SISTEMAS')) return 'RAMO_SISTEMAS';
  if (perfil.startsWith('MOOVE')) return 'MOOVE_RAMOSISTEMAS';
  if (perfil.startsWith('RSDONE')) return 'RSDONE';
  if (perfil.includes('__')) return perfil.split('__')[0];
  return perfil.replace(/_DISCOVERY$/, '');
}

/** Esconde os "projetos" de região (sa-brazil-1, af-north-1, MOS…) que a Huawei devolve junto. */
export const projetoUtil = (p: HuaweiProject) => !/^[a-z]{2}-[a-z]+-\d+$/i.test(p.name) && p.name !== 'MOS';

/** "sa-brazil-1_Ecoa" → "Ecoa". */
export const nomeProjeto = (nome: string) => nome.replace(/^[a-z]{2}-[a-z]+-\d+_/i, '') || nome;

const CACHE_HOME = 'huawei_projects_cache';

/** Lista de projetos que a Home já carregou nesta sessão (abre a tela na hora; atualiza em segundo plano). */
export function projetosEmCache(): HuaweiProject[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_HOME);
    const data = raw ? JSON.parse(raw).data : null;
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

export function guardarProjetosEmCache(data: HuaweiProject[]) {
  try { sessionStorage.setItem(CACHE_HOME, JSON.stringify({ data, scope: 'region', source: 'all_perfis' })); } catch { /* sem sessionStorage */ }
}
