const HOME_PROJECT_SELECTION_KEY = 'ananim_home_project_selection';

type StoredHomeProject = {
  id: string;
  name: string;
  perfil: string | null;
  region: string | null;
  displayPerfil: string | null;
};

export type HomeProjectSelection = {
  accountId: string | null;
  project: StoredHomeProject | null;
};

export function getHomeProjectKey(project: { id: string; perfil?: string | null } | null | undefined): string | null {
  if (!project?.id) return null;
  return project.perfil ? `${project.perfil}-${project.id}` : project.id;
}

export function saveHomeProjectSelection(selection: HomeProjectSelection): void {
  try {
    sessionStorage.setItem(HOME_PROJECT_SELECTION_KEY, JSON.stringify(selection));
  } catch (_) {}
}

export function getHomeProjectSelection(): HomeProjectSelection | null {
  try {
    const raw = sessionStorage.getItem(HOME_PROJECT_SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeProjectSelection;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      accountId: parsed.accountId || null,
      project: parsed.project && parsed.project.id
        ? {
            id: parsed.project.id,
            name: parsed.project.name || '',
            perfil: parsed.project.perfil || null,
            region: parsed.project.region || null,
            displayPerfil: parsed.project.displayPerfil || null,
          }
        : null,
    };
  } catch {
    return null;
  }
}
