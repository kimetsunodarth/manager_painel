/**
 * Permissões que dão visão de TODOS os clientes (lista completa de projetos Huawei, programações COC/Cloud8).
 * Usuário com role `client` nunca as recebe, mesmo que estejam gravadas: ele vê só os projetos em visibleProjects.
 */
export const CROSS_TENANT_PERMISSIONS = ['huawei:projects', 'coc:schedule:toggle', 'coc:schedule:delete', 'cloud8:schedule:manage'];

export function effectivePermissions(role, permissions) {
  const list = Array.isArray(permissions) ? permissions : [];
  return role === 'client' ? list.filter((p) => !CROSS_TENANT_PERMISSIONS.includes(p)) : list;
}
