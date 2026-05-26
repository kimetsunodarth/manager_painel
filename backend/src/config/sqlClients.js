/**
 * Configuração por cliente SQL: cada cliente tem um arquivo em config/sql-clients/<clientKey>.json.
 * Modo grupos: "groups" = um botão por grupo; cada grupo tem id, name, serviceIds[] (nomes no Windows).
 * getSqlClientKey(user) identifica o cliente pelo visibleProjects do usuário.
 */

import fs from 'fs';
import path from 'path';
import { getConfigDir } from '../appRoot.js';

const SQL_CLIENTS_DIR = path.join(getConfigDir(), 'sql-clients');
const CLIENTS_DIR = path.join(getConfigDir(), 'clients');

const cache = new Map();

function parseSqlConfig(data, clientKey) {
  const displayName = data.displayName || clientKey;
  const connectionType = data.connectionType || 'sql';
  if (Array.isArray(data.groups) && data.groups.length > 0) {
    const valid = data.groups.every(
      (g) => g && typeof g.id === 'string' && typeof g.name === 'string' && Array.isArray(g.serviceIds)
    );
    return valid ? { displayName, groups: data.groups, connectionType } : null;
  }
  if (Array.isArray(data.services) && data.services.length > 0) {
    const valid = data.services.every((s) => s && typeof s.id === 'string' && typeof s.name === 'string');
    if (valid) {
      const groups = [{ id: 'default', name: data.displayName || clientKey, serviceIds: data.services.map((s) => s.id) }];
      return { displayName, groups, connectionType };
    }
  }
  return null;
}

function loadClientConfig(clientKey) {
  const clientConfigPath = path.join(CLIENTS_DIR, clientKey, 'config.json');
  const sqlClientPath = path.join(SQL_CLIENTS_DIR, `${clientKey}.json`);
  const configPath = fs.existsSync(clientConfigPath) ? clientConfigPath : (fs.existsSync(sqlClientPath) ? sqlClientPath : null);

  const existing = cache.get(clientKey);
  if (existing && configPath && fs.existsSync(configPath)) {
    const mtime = fs.statSync(configPath).mtimeMs;
    if (mtime <= existing.mtime) return existing.config;
    cache.delete(clientKey);
  } else if (existing && !configPath) {
    cache.delete(clientKey);
  }

  if (fs.existsSync(clientConfigPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(clientConfigPath, 'utf8'));
      if (data.type === 'sql') {
        const config = parseSqlConfig(data, clientKey);
        if (config) {
          const mtime = fs.statSync(clientConfigPath).mtimeMs;
          cache.set(clientKey, { config, mtime });
          return config;
        }
      }
    } catch {}
  }
  const filePath = path.join(SQL_CLIENTS_DIR, `${clientKey}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    const config = parseSqlConfig(data, clientKey);
    const mtime = fs.statSync(filePath).mtimeMs;
    cache.set(clientKey, { config, mtime });
    return config;
  } catch {
    cache.set(clientKey, { config: null, mtime: 0 });
    return null;
  }
}

/** Regras: primeira que der match no visibleProjects do usuário define o cliente SQL. */
const SQL_CLIENT_RULES = [
  {
    key: 'alfa-agro',
    test(project) {
      const name = (project?.name || '').toString();
      const perfil = (project?.perfil || '').toString();
      // Só Alfa Agro: nome ou perfil que indiquem explicitamente Alfa Agro (não RamoOne genérico).
      if (name && (name.includes('Alfa') || name.toLowerCase().includes('alfa agro'))) return true;
      if (perfil && /ALFA|ALFA.?AGRO/i.test(perfil)) return true;
      return false;
    },
  },
  {
    key: 'aguas-pratas',
    test(project) {
      const name = (project?.name || '').toString().toLowerCase();
      const normalized = name.normalize('NFD').replace(/\u0300-\u036f/g, '');
      const perfil = (project?.perfil || '').toString();
      if (name && (normalized.includes('aguas') && normalized.includes('pratas'))) return true;
      if (perfil && /RAMO_SP_.*AGUAS.*PRATAS?/i.test(perfil)) return true;
      return false;
    },
  },
  {
    key: 'aguas-pratas-web',
    test(project) {
      const name = (project?.name || '').toString().toLowerCase();
      const normalized = name.normalize('NFD').replace(/\u0300-\u036f/g, '');
      const perfil = (project?.perfil || '').toString();
      if (name && (normalized.includes('aguas') && normalized.includes('pratas'))) return true;
      if (perfil && /RAMO_SP_.*AGUAS.*PRATAS?/i.test(perfil)) return true;
      return false;
    },
  },
  {
    key: 'aguas-pratas-web2',
    test(project) {
      const name = (project?.name || '').toString().toLowerCase();
      const normalized = name.normalize('NFD').replace(/\u0300-\u036f/g, '');
      const perfil = (project?.perfil || '').toString();
      if (name && (normalized.includes('aguas') && normalized.includes('pratas'))) return true;
      if (perfil && /RAMO_SP_.*AGUAS.*PRATAS?/i.test(perfil)) return true;
      return false;
    },
  },
];

/**
 * Retorna o clientKey SQL preferido conforme a ordem dos visibleProjects do usuário.
 * Assim o cliente exibido em Serviços segue a ordem em que os projetos foram atribuídos (vale para todos os projetos).
 */
function getPreferredSqlKeyByProjectOrder(u, allowedKeys) {
  if (!allowedKeys.length) return null;
  const projects = u?.visibleProjects || [];
  if (!Array.isArray(projects) || projects.length === 0) return allowedKeys[0];
  for (const p of projects) {
    for (const rule of SQL_CLIENT_RULES) {
      if (allowedKeys.includes(rule.key) && rule.test(p)) return rule.key;
    }
  }
  return allowedKeys[0];
}

export function getSqlClientKey(u) {
  const keys = getSqlClientKeysForUser(u);
  if (!keys.length) return null;
  return getPreferredSqlKeyByProjectOrder(u, keys);
}

/** Retorna todos os clientKeys SQL que o usuário pode acessar (ex.: aguas-pratas e aguas-pratas-web). Sem duplicatas. */
export function getSqlClientKeysForUser(u) {
  const projects = u?.visibleProjects || [];
  if (!Array.isArray(projects) || projects.length === 0) return [];
  const seen = new Set();
  const keys = [];
  for (const rule of SQL_CLIENT_RULES) {
    if (seen.has(rule.key)) continue;
    if (projects.some((p) => rule.test(p))) {
      seen.add(rule.key);
      keys.push(rule.key);
    }
  }
  return keys;
}

/**
 * Lista de grupos do cliente SQL (para exibição: um item = um botão).
 * @param {string} clientKey
 * @returns {Array<{id: string, name: string, action: string}>}
 */
export function getSqlServiceList(clientKey) {
  const config = loadClientConfig(clientKey);
  if (!config?.groups) return [];
  return config.groups.map((g) => ({ id: g.id, name: g.name, action: 'executar' }));
}

/**
 * IDs dos serviços Windows de um grupo (para health e restart em lote).
 * @param {string} clientKey
 * @param {string} groupId
 * @returns {string[]}
 */
export function getSqlGroupServiceIds(clientKey, groupId) {
  const config = loadClientConfig(clientKey);
  if (!config?.groups) return [];
  const group = config.groups.find((g) => g.id === groupId);
  return group?.serviceIds || [];
}

export function getSqlClientDisplayName(clientKey) {
  const config = loadClientConfig(clientKey);
  return config ? config.displayName : clientKey;
}

/** 'web' = usa SSH_WEB_* (servidor web); 'sql' = usa SSH_SQL_* (com ou sem jump). */
export function getSqlClientConnectionType(clientKey) {
  const config = loadClientConfig(clientKey);
  return config?.connectionType || 'sql';
}

export function clearSqlClientsCache() {
  cache.clear();
}
