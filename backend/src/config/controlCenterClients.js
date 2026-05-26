/**
 * Clientes com SAP Control Center (SLD): Ativar Support User.
 * Cada cliente tem um JSON em config/control-center/<clientKey>.json.
 * getControlCenterClientKey(user) identifica o cliente pelo visibleProjects do usuário.
 */

import fs from 'fs';
import path from 'path';
import { getConfigDir } from '../appRoot.js';

const CONTROL_CENTER_DIR = path.join(getConfigDir(), 'control-center');
const DYNAMIC_REGISTRY_PATH = path.join(getConfigDir(), 'dynamic-clients-registry.json');

const cache = new Map();

function loadControlCenterConfig(clientKey) {
  if (cache.has(clientKey)) return cache.get(clientKey);
  const filePath = path.join(CONTROL_CENTER_DIR, `${clientKey}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data.baseUrl || typeof data.baseUrl !== 'string') {
      cache.set(clientKey, null);
      return null;
    }
    const config = {
      clientKey: data.clientKey || clientKey,
      displayName: data.displayName || clientKey,
      baseUrl: data.baseUrl.replace(/\/$/, '') + '/',
      envUserKey: data.envUserKey || `CONTROL_CENTER_${clientKey.toUpperCase().replace(/-/g, '_')}_USER`,
      envPasswordKey: data.envPasswordKey || `CONTROL_CENTER_${clientKey.toUpperCase().replace(/-/g, '_')}_PASSWORD`,
      associatedHanaKeys: Array.isArray(data.associatedHanaKeys) ? data.associatedHanaKeys : [clientKey, `${clientKey}-web`],
    };
    cache.set(clientKey, config);
    return config;
  } catch {
    cache.set(clientKey, null);
    return null;
  }
}

/** Regras dinâmicas (clientes adicionados pela página admin com Control Center). */
function getDynamicControlCenterRules() {
  try {
    const raw = fs.readFileSync(DYNAMIC_REGISTRY_PATH, 'utf8');
    const registry = JSON.parse(raw);
    if (!Array.isArray(registry)) return [];
    const rules = [];
    for (const entry of registry) {
      if (!entry.hasControlCenter) continue;
      const nameContains = (entry.nameContains || entry.clientKey || '').toLowerCase();
      const perfilPattern = (entry.perfilPattern || entry.clientKey || '').toString();
      const test = (project) => {
        const name = (project?.name || '').toString().toLowerCase();
        const perfil = (project?.perfil || '').toString();
        const displayPerfil = (project?.displayPerfil || '').toString();
        if (nameContains && name && name.includes(nameContains)) return true;
        if (perfilPattern && perfil && new RegExp(perfilPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(perfil)) return true;
        if (perfilPattern && displayPerfil && new RegExp(perfilPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(displayPerfil)) return true;
        return false;
      };
      rules.push({ key: entry.clientKey, test });
    }
    return rules;
  } catch {
    return [];
  }
}
const dynamicControlCenterRules = getDynamicControlCenterRules();

/** Regras: primeira que der match no visibleProjects do usuário define o cliente Control Center. */
const CONTROL_CENTER_RULES = [
  {
    key: 'roland',
    test(project) {
      const name = (project?.name || '').toString().toLowerCase();
      const perfil = (project?.perfil || '').toString();
      const displayPerfil = (project?.displayPerfil || '').toString();
      if (name && name.includes('roland')) return true;
      if (perfil && /roland/i.test(perfil)) return true;
      if (displayPerfil && /ANANIM_ROLAND/i.test(displayPerfil)) return true;
      return false;
    },
  },
  {
    key: 'controlla',
    test(project) {
      const name = (project?.name || '').toString().toLowerCase();
      const perfil = (project?.perfil || '').toString();
      const displayPerfil = (project?.displayPerfil || '').toString();
      if (name && name.includes('controlla')) return true;
      if (perfil && /controlla/i.test(perfil)) return true;
      if (displayPerfil && /ANANIM_CONTROLLA|CONTROLLA/i.test(displayPerfil)) return true;
      return false;
    },
  },
];

export function getControlCenterClientKey(u) {
  const projects = u?.visibleProjects || [];
  if (!Array.isArray(projects) || projects.length === 0) return null;
  const allRules = [...dynamicControlCenterRules, ...CONTROL_CENTER_RULES];
  for (const rule of allRules) {
    if (projects.some((p) => rule.test(p))) return rule.key;
  }
  return null;
}

export function getControlCenterConfig(clientKey) {
  return loadControlCenterConfig(clientKey) || null;
}

/** Lista de clientKeys que possuem arquivo de config (para admin/listagem). */
export function listControlCenterClientKeys() {
  try {
    const files = fs.readdirSync(CONTROL_CENTER_DIR);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

/** Dado um clientKey HANA (ex.: roland-web), retorna o clientKey do Control Center associado (ex.: roland) ou null. */
export function getControlCenterKeyForHanaKey(hanaKey) {
  const keys = listControlCenterClientKeys();
  for (const ccKey of keys) {
    const config = loadControlCenterConfig(ccKey);
    if (config?.associatedHanaKeys?.includes(hanaKey)) return ccKey;
  }
  return null;
}

export function clearControlCenterCache() {
  cache.clear();
}
