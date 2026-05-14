/**
 * Serviço Huawei Cloud IAM - listagem de projetos.
 * Usa AK/SK com assinatura de requisição (mesmo formato CBR, change_disk, tags) — sem token.
 */

import { getCredentialsForApi, getProfileNames, getProfileCredentials } from '../config/configLoader.js';
import { signRequest } from './huawei-signer.js';

const IAM_AUTH_TIMEOUT = 30000;

/**
 * Obtém token IAM com AK/SK e escopo de projeto.
 * Tenta primeiro endpoint global (iam.myhuaweicloud.com), depois regional.
 * Nota: IAM internacional pode não aceitar método "ak_sk" no body; nesse caso use auth por senha (IAM user) ou assinatura AK/SK nas requisições.
 */
async function requestToken(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=utf8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(IAM_AUTH_TIMEOUT),
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch (_) {}
  if (!res.ok) {
    const msg = data.error?.message || data.error_msg || data.error?.code || `IAM auth failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  const token = res.headers.get('x-subject-token');
  if (!token) throw new Error('Token não retornado pelo IAM');
  return token;
}

export async function getIAMToken(ak, sk, projectId, region) {
  const body = {
    auth: {
      identity: {
        methods: ['ak_sk'],
        ak_sk: {
          access: { key: ak },
          secret: { key: sk },
        },
      },
      scope: {
        project: { id: projectId },
      },
    },
  };

  const urls = [
    `https://iam.${region}.myhuaweicloud.com/v3/auth/tokens`,
    'https://iam.myhuaweicloud.com/v3/auth/tokens',
    'https://iam.cn-north-4.myhuaweicloud.com/v3/auth/tokens',
  ];

  let lastError;
  for (const url of urls) {
    try {
      return await requestToken(url, body);
    } catch (e) {
      lastError = e;
      if (e.status === 401 || e.status === 404) break;
    }
  }

  const msg = lastError?.message || 'Falha ao obter token IAM';
  if (msg.includes('Unsupported method') || msg.includes('ak_sk')) {
    throw new Error(
      'Verifique região e PROJECT_ID. Se o IAM não aceitar AK/SK, use IAM_USERNAME, IAM_PASSWORD e IAM_DOMAIN no config.enc/.env.'
    );
  }
  throw lastError || new Error('Falha ao obter token IAM');
}

/**
 * Obtém token IAM com usuário e senha (método aceito pelo IAM internacional).
 */
export async function getIAMTokenByPassword(username, password, domainName, projectIdOrName) {
  const url = 'https://iam.myhuaweicloud.com/v3/auth/tokens';
  const scope = projectIdOrName
    ? { project: { id: projectIdOrName } }
    : { domain: { name: domainName } };
  const body = {
    auth: {
      identity: {
        methods: ['password'],
        password: {
          user: {
            name: username,
            password,
            domain: { name: domainName },
          },
        },
      },
      scope,
    },
  };

  return requestToken(url, body);
}

/**
 * Lista projetos acessíveis às credenciais AK/SK.
 * Se region for informado, retorna apenas projetos dessa região (nome igual à região ou começa com "região_").
 * Ex.: region=sa-brazil-1 → sa-brazil-1, sa-brazil-1_vazio, etc. (não af-south-1, la-south-2, MOS...).
 */
export async function listProjectsWithAKSK(ak, sk, projectId, region) {
  const host = 'iam.myhuaweicloud.com';
  const path = '/v3/projects';
  const allProjects = [];
  const perPage = 500;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const queryParams = { per_page: String(perPage), page: String(page) };
    const queryStr = `?${new URLSearchParams(queryParams).toString()}`;
    const url = `https://${host}${path}${queryStr}`;

    const headers = signRequest('GET', host, path, ak, sk, {}, queryParams);

    const res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, 'Content-Type': 'application/json;charset=utf8' },
      signal: AbortSignal.timeout(IAM_AUTH_TIMEOUT),
    });

    if (!res.ok) {
      const text = await res.text();
      let msg = `List projects failed (${res.status})`;
      try {
        const data = JSON.parse(text);
        msg = data.error?.message || data.error_msg || msg;
      } catch (_) {}
      throw new Error(msg);
    }

    const data = await res.json();
    const projects = data.projects || [];
    for (const p of projects) {
      allProjects.push({
        id: p.id,
        name: p.name || p.id,
        enabled: !!p.enabled,
        description: p.description || '',
        domain_id: p.domain_id,
        parent_id: p.parent_id,
        region: null,
      });
    }

    const total = projects.length;
    if (total < perPage) hasMore = false;
    else page += 1;
  }

  let result = allProjects;
  if (region) {
    // Alguns ambientes não seguem o padrão "regiao_suffix" no nome do projeto.
    // Para não esconder projetos válidos, quando o profile já tem região conhecida,
    // retornamos todos os projetos e marcamos a região do perfil (fallback para chamadas ECS).
    result = allProjects;
    result.forEach((p) => { p.region = region; });
  } else {
    const knownRegions = new Set(['sa-brazil-1', 'la-south-2', 'af-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-3', 'cn-north-1', 'cn-north-4', 'cn-east-2', 'cn-east-3', 'cn-south-1', 'na-mexico-1', 'eu-west-0', 'eu-west-101', 'tr-west-1', 'ae-ad-1', 'my-kualalumpur-1']);
    result.forEach((p) => {
      const n = (p.name || '').toLowerCase();
      if (knownRegions.has(n)) {
        p.region = n;
        return;
      }
      if (n.includes('_')) {
        const parts = n.split('_');
        for (let i = 1; i < parts.length; i++) {
          const prefix = parts.slice(0, i).join('_');
          if (knownRegions.has(prefix)) {
            p.region = prefix;
            return;
          }
        }
      }
      p.region = null;
    });
  }

  // Exclui apenas projetos "vazios" gerados automaticamente (ex.: sa-brazil-1_vazio).
  result = result.filter((p) => {
    if (!p.name) return false;
    const n = p.name.toLowerCase().trim();
    if (n.endsWith('_vazio')) return false;
    return true;
  });

  return result;
}

/**
 * Obtém credenciais do config.enc/.env e lista projetos.
 * Usa AK/SK com assinatura de requisição (mesmo formato CBR, change_disk, tags).
 * @param {{ scope?: 'region' | 'all', source?: 'master' | 'all_perfis' }} [opts]
 *   - scope=region (padrão) filtra pela região; scope=all lista todos.
 *   - source=all_perfis lista projetos de TODAS as contas (perfis) do config e adiciona campo "perfil" (ex.: MOOVE_SP_PRINCIPAL).
 */
export async function listProjectsWithConfig(opts = {}) {
  if (opts.source === 'all_perfis') {
    return listProjectsFromAllProfiles(opts);
  }

  const creds = getCredentialsForApi();
  if (!creds) {
    throw new Error(
      'Configure config.enc (perfis com _ACCESS_KEY, _SECRET_KEY, _PROJECT_ID, _REGION) ou .env com HUAWEI_AK, HUAWEI_SK, HUAWEI_PROJECT_ID, HUAWEI_REGION.'
    );
  }

  const region = creds.region || 'la-south-2';
  const filterByRegion = opts.scope !== 'all';

  if (creds.ak && creds.sk) {
    if (!creds.project_id) {
      throw new Error('Configure PROJECT_ID no perfil ou HUAWEI_PROJECT_ID no .env.');
    }
    return listProjectsWithAKSK(creds.ak, creds.sk, creds.project_id, filterByRegion ? region : null);
  }

  if (creds.type === 'password' && creds.iamUsername && creds.iamPassword && creds.iamDomain) {
    const token = await getIAMTokenByPassword(
      creds.iamUsername,
      creds.iamPassword,
      creds.iamDomain,
      creds.project_id || null
    );
    return listProjectsWithToken(token, region);
  }

  throw new Error(
    'Configure AK/SK no config.enc/.env (perfis com _ACCESS_KEY, _SECRET_KEY, _PROJECT_ID, _REGION ou HUAWEI_AK, HUAWEI_SK, HUAWEI_PROJECT_ID, HUAWEI_REGION).'
  );
}

/** Retorna accountId (ex.: ANANIMCLOUD) se o perfil for de uma conta de descoberta; senão null. */
function getAccountIdForProfile(profileName) {
  const a = DISCOVERY_ACCOUNTS.find((x) => x.profile === profileName);
  return a ? a.id : null;
}

/** Retorna id da conta para perfis sugeridos (ex.: MOOVE_SP_CLIENTE -> MOOVE). */
function getAccountIdFromDisplayPerfil(displayPerfil) {
  if (!displayPerfil) return null;
  const p = String(displayPerfil).toUpperCase();
  if (p.startsWith('ANANIMCLOUD')) return 'ANANIMCLOUD';
  if (p.startsWith('RAMO_SP') || p.startsWith('RAMO_CH') || p.startsWith('RAMO_SISTEMAS')) return 'RAMO_SISTEMAS';
  if (p.startsWith('MOOVE')) return 'MOOVE';
  if (p.startsWith('RSDONE')) return 'RSDONE';
  return null;
}

/**
 * Sugere perfil único por projeto a partir do nome do perfil config e do nome do projeto.
 * Ex.: RAMO_CH_3BS_SCIENTIFIC + la-south-2_BEFLY → RAMO_CH_BEFLY (evita perfil duplicado em todas as linhas).
 */
function suggestedPerfilFromProfileAndProject(profileName, region, projectName) {
  if (!profileName || !projectName) return null;
  const pn = String(projectName).trim();
  const parts = pn.includes('_') ? pn.split('_').slice(1) : [pn.replace(/\s+/g, '_').replace(/-/g, '_')];
  const suffix = parts.join('_').toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (!suffix) return null;
  const pf = String(profileName);
  let prefix = null;
  if (pf.startsWith('RAMO_CH_')) prefix = 'RAMO_CH';
  else if (pf.startsWith('RAMO_SP_')) prefix = 'RAMO_SP';
  else if (pf.startsWith('MOOVE_SP_')) prefix = 'MOOVE_SP';
  else if (pf.startsWith('RSDONE_CH_')) prefix = 'RSDONE_CH';
  else if (pf.startsWith('ANANIMCLOUD_')) prefix = 'ANANIMCLOUD';
  if (!prefix) return null;
  return `${prefix}_${suffix}`;
}

/**
 * Lista todos os projetos de todas as contas (perfis), no mesmo formato CBR/tags.
 * Perfil exibido = um por projeto (sugerido pelo nome do projeto), sem repetir o mesmo perfil em várias linhas.
 * Remove duplicatas por project id e ordena por perfil e nome.
 */
async function listProjectsFromAllProfiles(opts = {}) {
  const profileNames = getProfileNames();
  const byId = new Map();
  const filterByRegion = opts.scope !== 'all';
  const masterProfiles = new Set(DISCOVERY_ACCOUNTS.map((a) => a.profile));

  for (const perfil of profileNames) {
    let creds;
    try {
      creds = getProfileCredentials(perfil);
    } catch (_) {
      continue;
    }
    if (!creds.ak || !creds.sk || !creds.project_id) continue;

    const projectId = creds.project_id.trim();
    if (!projectId) continue;

    const accountId = getAccountIdForProfile(perfil);
    const region = creds.region || 'la-south-2';

    try {
      const projects = await listProjectsWithAKSK(
        creds.ak,
        creds.sk,
        projectId,
        filterByRegion ? region : null
      );
      for (const p of projects) {
        const suggestedByAccount = accountId ? suggestedPerfilFromName(accountId, region, p.name) : null;
        const suggestedByProfile = suggestedPerfilFromProfileAndProject(perfil, region, p.name);
        const displayPerfil = suggestedByAccount || suggestedByProfile || perfil;
        const entry = { ...p, perfil: displayPerfil };
        const existing = byId.get(p.id);
        if (existing) {
          const existingIsMaster = masterProfiles.has(existing.perfil);
          const newIsSuggested = displayPerfil !== perfil;
          const existingHasAccountPrefix = !!getAccountIdFromDisplayPerfil(existing.perfil);
          const newHasAccountPrefix = !!suggestedByAccount;

          // Prioridade:
          // 1) Se a nova entrada veio de uma conta de descoberta (RAMO/MOOVE/RSDONE/ANANIMCLOUD), preferir ela.
          // 2) Se a existente era master e a nova é sugerida (mais específica), substituir.
          if (newHasAccountPrefix && !existingHasAccountPrefix) {
            byId.set(p.id, entry);
          } else if (existingIsMaster && newIsSuggested) {
            byId.set(p.id, entry);
          }
        } else {
          byId.set(p.id, entry);
        }
      }
    } catch (_) {
      // ignora perfil que falhou (ex.: credenciais inválidas)
    }
  }

  const allProjects = Array.from(byId.values());
  allProjects.sort((a, b) => {
    const pf = (a.perfil || '').localeCompare(b.perfil || '');
    return pf !== 0 ? pf : (a.name || '').localeCompare(b.name || '');
  });
  return allProjects;
}

/** Lista projetos com token (fallback quando usar IAM_USERNAME/IAM_PASSWORD). */
async function listProjectsWithToken(token, region) {
  const host = `iam.${region}.myhuaweicloud.com`;
  const url = `https://${host}/v3/auth/projects`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json;charset=utf8', 'X-Auth-Token': token },
    signal: AbortSignal.timeout(IAM_AUTH_TIMEOUT),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `List projects failed (${res.status})`;
    try {
      const data = JSON.parse(text);
      msg = data.error?.message || data.error_msg || msg;
    } catch (_) {}
    throw new Error(msg);
  }
  const data = await res.json();
  const projects = data.projects || [];
  return projects.map((p) => ({
    id: p.id,
    name: p.name || p.id,
    enabled: !!p.enabled,
    description: p.description || '',
    domain_id: p.domain_id,
    parent_id: p.parent_id,
  }));
}

/**
 * Contas para "Descobrir Projetos" (fluxo CBR/tags): uma conta = um perfil + regiões.
 * Cada entrada: id, label, profile (perfil no .env), regions (array).
 */
const DISCOVERY_ACCOUNTS = [
  { id: 'RAMO_SISTEMAS', label: 'RAMO SISTEMAS (São Paulo e Santiago)', profile: 'RAMO_SP_RAMOONE', regions: ['sa-brazil-1', 'la-south-2'] },
  { id: 'MOOVE', label: 'Moove Ramosistemas (São Paulo)', profile: 'MOOVE_SP_PRINCIPAL', regions: ['sa-brazil-1'] },
  { id: 'RSDONE', label: 'RSDONE (Santiago)', profile: 'RSDONE_CH_ZHOUSE', regions: ['la-south-2'] },
  { id: 'ANANIMCLOUD', label: 'AnanimCloud (São Paulo)', profile: 'ANANIMCLOUD_MASTER', regions: ['sa-brazil-1'] },
];

/** Prefixo do perfil sugerido por conta e região (como no CBR/tags). */
const DISCOVERY_PREFIX = {
  RAMO_SISTEMAS: { 'sa-brazil-1': 'RAMO_SP', 'la-south-2': 'RAMO_CH' },
  MOOVE: { 'sa-brazil-1': 'MOOVE_SP' },
  RSDONE: { 'la-south-2': 'RSDONE_CH' },
  ANANIMCLOUD: { 'sa-brazil-1': 'ANANIMCLOUD' },
};

export function getDiscoveryAccounts() {
  return DISCOVERY_ACCOUNTS.map((a) => ({
    id: a.id,
    label: a.label,
    profile: a.profile,
    region: a.regions[0] || 'sa-brazil-1',
    projectId: null,
  }));
}

/**
 * Sugere nome do perfil a partir do nome do projeto (ex.: sa-brazil-1_AguasPratas → ANANIMCLOUD_AGUASPRATAS).
 */
function suggestedPerfilFromName(accountId, region, projectName) {
  const prefixes = DISCOVERY_PREFIX[accountId];
  if (!prefixes) return null;
  const prefix = prefixes[region] || prefixes['sa-brazil-1'] || prefixes['la-south-2'];
  if (!prefix) return null;
  let suffix = (projectName || '').trim();
  if (suffix.includes('_')) suffix = suffix.split('_').slice(1).join('_');
  suffix = suffix.replace(/\s+/g, '_').replace(/-/g, '_').toUpperCase();
  if (!suffix) return prefix;
  return `${prefix}_${suffix}`;
}

/**
 * Descobre todos os projetos de uma conta (como no CBR: botão Descobrir → seleciona conta → lista projetos).
 * Retorna projetos com perfil sugerido e status 'novo' | 'ja_existe' (já está em visibleProjects do usuário).
 */
export async function discoverProjectsForAccount(accountId, visibleProjectIds = new Set()) {
  const account = DISCOVERY_ACCOUNTS.find((a) => a.id === accountId);
  if (!account) throw new Error(`Conta '${accountId}' não encontrada`);

  let creds;
  try {
    creds = getProfileCredentials(account.profile);
  } catch (e) {
    throw new Error(`Perfil '${account.profile}' não configurado ou sem AK/SK. ${e.message}`);
  }
  if (!creds.ak || !creds.sk || !creds.project_id) {
    throw new Error(`Perfil '${account.profile}' precisa de ACCESS_KEY, SECRET_KEY e PROJECT_ID no .env.`);
  }

  const allProjects = [];
  const seenIds = new Set();

  for (const region of account.regions) {
    try {
      const list = await listProjectsWithAKSK(creds.ak, creds.sk, creds.project_id.trim(), region);
      for (const p of list) {
        if (seenIds.has(p.id)) continue;
        seenIds.add(p.id);
        const perfil = suggestedPerfilFromName(accountId, region, p.name);
        allProjects.push({
          id: p.id,
          name: p.name || p.id,
          region: p.region || region,
          perfil: perfil || account.profile,
          status: visibleProjectIds.has(p.id) ? 'ja_existe' : 'novo',
        });
      }
    } catch (err) {
      console.warn(`[discover] ${accountId} região ${region}:`, err.message);
    }
  }

  return allProjects.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}
