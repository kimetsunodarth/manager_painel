/**
 * Projeto escolhido na Home (enviado pelo frontend) → projetos considerados na tela de serviços.
 * Cliente/operador: só vale se o projeto estiver na visão dele (id e perfil); senão, nenhum.
 * Admin: qualquer projeto.
 */
export function scopeVisibleProjects(user, visibleProjects, scoped) {
  const visible = Array.isArray(visibleProjects) ? visibleProjects : [];
  if (!scoped) return visible;
  if (user?.role === 'admin') return [scoped];
  const match = visible.find((p) => p && p.id === scoped.id && (!scoped.perfil || !p.perfil || p.perfil === scoped.perfil));
  return match ? [match] : [];
}

/** Nome do cliente para títulos: "sa-brazil-1_Ecoa" → "Ecoa". */
export function projectDisplayName(project) {
  const name = String(project?.name || project?.id || '').trim();
  return name.replace(/^[a-z]{2}-[a-z]+-\d+_/i, '') || name;
}
