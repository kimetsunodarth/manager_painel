/**
 * Configuração por cliente HANA: cada cliente tem um arquivo em config/hana-clients/<clientKey>.json.
 * Conexão SSH para a VM SUSE (HANA): host/usuário/senha via chaves de env no JSON.
 * getHanaClientKey(user) identifica o cliente pelo visibleProjects do usuário.
 */

import fs from 'fs';
import path from 'path';
import { getServiceList } from './sapServices.js';
import { getConfigDir } from '../appRoot.js';

const HANA_CLIENTS_DIR = path.join(getConfigDir(), 'hana-clients');
const DYNAMIC_REGISTRY_PATH = path.join(getConfigDir(), 'dynamic-clients-registry.json');

const cache = new Map();

function loadClientConfig(clientKey) {
  if (cache.has(clientKey)) return cache.get(clientKey);
  const filePath = path.join(HANA_CLIENTS_DIR, `${clientKey}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data.envHostKey || !data.envUserKey) {
      cache.set(clientKey, null);
      return null;
    }
    const services = Array.isArray(data.services) && data.services.every((s) => s && typeof s.id === 'string' && typeof s.name === 'string' && ['listar', 'executar'].includes(s.action))
      ? data.services
      : null;
    let windowsServiceGroups = null;
    if (data.windowsServiceGroups && typeof data.windowsServiceGroups === 'object' && !Array.isArray(data.windowsServiceGroups)) {
      const entries = Object.entries(data.windowsServiceGroups).filter(
        ([_, arr]) => Array.isArray(arr) && arr.every((n) => typeof n === 'string')
      );
      if (entries.length) windowsServiceGroups = Object.fromEntries(entries);
    }
    const config = {
      clientKey: data.clientKey || clientKey,
      displayName: data.displayName || clientKey,
      envHostKey: data.envHostKey,
      envUserKey: data.envUserKey,
      envPasswordKey: data.envPasswordKey || null,
      envPortKey: data.envPortKey || null,
      envPrivateKeyPathKey: data.envPrivateKeyPathKey || null,
      envJumpHostKey: data.envJumpHostKey || null,
      envJumpUserKey: data.envJumpUserKey || null,
      envJumpPasswordKey: data.envJumpPasswordKey || null,
      envJumpPortKey: data.envJumpPortKey || null,
      hanaSid: data.hanaSid || 'NDB',
      hanaSapcontrol: data.hanaSapcontrol || '/usr/sap/NDB/HDB00/exe/sapcontrol -nr 00',
      services,
      windowsServiceGroups,
    };
    cache.set(clientKey, config);
    return config;
  } catch {
    cache.set(clientKey, null);
    return null;
  }
}

/** Regras dinâmicas (clientes adicionados pela página admin). */
function getDynamicHanaRules() {
  try {
    const raw = fs.readFileSync(DYNAMIC_REGISTRY_PATH, 'utf8');
    const registry = JSON.parse(raw);
    if (!Array.isArray(registry)) return [];
    const rules = [];
    for (const entry of registry) {
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
      rules.push({ key: `${entry.clientKey}-web`, test });
    }
    return rules;
  } catch {
    return [];
  }
}
/** Regras dinâmicas são lidas a cada uso para que novos clientes (criados pelo menu) sejam reconhecidos sem reiniciar o backend. */

/** Regras: primeira que der match no visibleProjects do usuário define o cliente HANA. */
const HANA_CLIENT_RULES = [
  {
    key: 'ananimcloud',
    test(project) {
      const name = (project?.name || '').toString().toLowerCase();
      const perfil = (project?.perfil || '').toString();
      if (perfil && /RAMOONE/i.test(perfil)) return false;
      if (name && (name.includes('ananim cloud') || name.includes('ananimcloud') || name.includes('cloudhdb'))) return true;
      if (perfil && /ANANIM|CLOUDHDB/i.test(perfil)) return true;
      return false;
    },
  },
  {
    key: 'cloudhdb',
    test(project) {
      const name = (project?.name || '').toString();
      const perfil = (project?.perfil || '').toString();
      if (perfil && /RAMOONE/i.test(perfil)) return false;
      if (name && (name.includes('Kitfire') || name.includes('CLOUDHDB') || name.toLowerCase().includes('cloudhdb'))) return true;
      if (perfil && /KITFIRE|CLOUDHDB/i.test(perfil)) return true;
      return false;
    },
  },
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
    key: 'roland-web',
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
  {
    key: 'controlla-web',
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
  {
    key: 'alfa-citrus',
    test(project) {
      const name = (project?.name || '').toString().toLowerCase();
      const perfil = (project?.perfil || '').toString();
      if (name && (name.includes('alfa') && name.includes('citrus'))) return true;
      if (perfil && /ALFA.?CITRUS|ALFA_CITRUS/i.test(perfil)) return true;
      return false;
    },
  },
];

/**
 * Retorna o clientKey HANA preferido conforme a ordem dos visibleProjects do usuário.
 * Assim o cliente exibido em Serviços segue a ordem em que os projetos foram atribuídos (vale para todos os projetos).
 */
function getPreferredHanaKeyByProjectOrder(u, allowedKeys) {
  if (!allowedKeys.length) return null;
  const projects = u?.visibleProjects || [];
  if (!Array.isArray(projects) || projects.length === 0) return allowedKeys[0];
  const allRules = [...getDynamicHanaRules(), ...HANA_CLIENT_RULES];
  const keySet = new Set(allowedKeys);
  for (const p of projects) {
    for (const rule of allRules) {
      if (keySet.has(rule.key) && rule.test(p)) return rule.key;
    }
  }
  return allowedKeys[0];
}

export function getHanaClientKey(u) {
  const keys = getHanaClientKeysForUser(u);
  if (!keys.length) return null;
  return getPreferredHanaKeyByProjectOrder(u, keys);
}

/** Retorna todos os clientKeys HANA que o usuário pode acessar (conforme visibleProjects). Só retorna clientes com config válida. Sem duplicatas. */
export function getHanaClientKeysForUser(u) {
  const projects = u?.visibleProjects || [];
  if (!Array.isArray(projects) || projects.length === 0) return [];
  const seen = new Set();
  const keys = [];
  const dynamicRules = getDynamicHanaRules();
  const allRules = [...dynamicRules, ...HANA_CLIENT_RULES];
  for (const rule of allRules) {
    if (seen.has(rule.key)) continue;
    if (projects.some((p) => rule.test(p)) && loadClientConfig(rule.key)) {
      seen.add(rule.key);
      keys.push(rule.key);
    }
  }
  return keys;
}

/** Lista de serviços para restart do cliente HANA (do JSON ou fallback sapServices). */
export function getHanaServiceList(clientKey) {
  const config = loadClientConfig(clientKey);
  if (config?.services?.length) return config.services;
  return getServiceList();
}

export function getHanaClientConfig(clientKey) {
  return loadClientConfig(clientKey) || null;
}

export function getHanaClientDisplayName(clientKey) {
  const config = loadClientConfig(clientKey);
  return config ? config.displayName : clientKey;
}

/**
 * Retorna configuração de conexão SSH para o cliente HANA (host, port, username, password/privateKey).
 * Usado por sshExecWithConfig. Credenciais vêm do process.env conforme chaves no JSON.
 * @param {string} clientKey
 * @returns {{ host: string, port: number, username: string, password?: string, privateKey?: string } | null}
 */
export function getHanaConnectionConfig(clientKey) {
  const config = loadClientConfig(clientKey);
  if (!config) return null;

  const host = process.env[config.envHostKey];
  const username = process.env[config.envUserKey];
  if (!host || !username) return null;

  const port = config.envPortKey && process.env[config.envPortKey]
    ? Number(process.env[config.envPortKey])
    : 22;

  const result = { host, port, username };

  const privateKeyPath = config.envPrivateKeyPathKey && process.env[config.envPrivateKeyPathKey];
  if (privateKeyPath) {
    try {
      result.privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    } catch {
      return null;
    }
  } else if (config.envPasswordKey && process.env[config.envPasswordKey]) {
    result.password = process.env[config.envPasswordKey];
  } else {
    return null;
  }

  return result;
}

/** Comando GetProcessList para o cliente (usa hanaSapcontrol e hanaSid do config). */
export function getHanaProcessListCommand(clientKey) {
  const config = loadClientConfig(clientKey);
  if (!config) return null;
  const sapcontrol = (config.hanaSapcontrol || '/usr/sap/NDB/HDB00/exe/sapcontrol -nr 00').trim();
  return `sudo su - ndbadm -c "${sapcontrol} -function GetProcessList"`;
}

export function isHanaClientConfigured(clientKey) {
  return getHanaConnectionConfig(clientKey) !== null;
}

/** Retorna a lista de nomes de serviços Windows para um grupo (ex.: roland-web invent-dfe). */
export function getHanaWindowsServiceGroup(clientKey, serviceId) {
  const config = loadClientConfig(clientKey);
  const groups = config?.windowsServiceGroups;
  if (!groups || typeof groups[serviceId] !== 'object' || !Array.isArray(groups[serviceId])) return null;
  return groups[serviceId];
}

/**
 * Retorna configuração do jump host (bastion) para o cliente HANA, quando definida.
 * Ex.: Roland: ROLANDWEB (worker) → ROLANDHDB (root).
 * @param {string} clientKey
 * @returns {{ host: string, port: number, username: string, password: string } | null}
 */
export function getHanaJumpConfig(clientKey) {
  const config = loadClientConfig(clientKey);
  if (!config?.envJumpHostKey || !config?.envJumpUserKey) return null;
  const host = process.env[config.envJumpHostKey];
  const username = process.env[config.envJumpUserKey];
  if (!host || !username) return null;
  const password = config.envJumpPasswordKey ? process.env[config.envJumpPasswordKey] : null;
  if (!password) return null;
  const port = config.envJumpPortKey && process.env[config.envJumpPortKey]
    ? Number(process.env[config.envJumpPortKey])
    : 22;
  return { host, port, username, password };
}

export function clearHanaClientsCache() {
  cache.clear();
}
