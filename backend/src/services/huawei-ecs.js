/**
 * Lista ECS (servidores) de um projeto Huawei — AK/SK assinado.
 * GET /v1/{project_id}/cloudservers/detail (Huawei ECS API).
 */

import { getCredentialsForApi, getProfileCredentials, getProfileNames } from '../config/configLoader.js';
import { signRequest } from './huawei-signer.js';
import fs from 'fs';
import path from 'path';
import { getDataDir } from '../appRoot.js';

const ECS_TIMEOUT = 30000;
const BLOCK_DEVICE_TIMEOUT = 10000;

const IAM_TIMEOUT = 15000;

const KNOWN_REGIONS = [
  'sa-brazil-1',
  'la-south-2',
  'af-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'cn-north-1',
  'cn-north-4',
  'cn-east-2',
  'cn-east-3',
  'cn-south-1',
  'na-mexico-1',
  'eu-west-0',
  'eu-west-101',
  'tr-west-1',
  'ae-ad-1',
  'my-kualalumpur-1',
];

let iamRegionsCache = null;
let iamRegionsCacheTs = 0;
const IAM_REGIONS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

async function listIamRegionsWithAKSK(ak, sk) {
  const now = Date.now();
  if (iamRegionsCache && (now - iamRegionsCacheTs) < IAM_REGIONS_CACHE_TTL_MS) return iamRegionsCache;
  const host = 'iam.myhuaweicloud.com';
  const urlPath = '/v3/regions';
  const url = `https://${host}${urlPath}`;
  const headers = signRequest('GET', host, urlPath, ak, sk, {}, null);
  const res = await fetch(url, {
    method: 'GET',
    headers: { ...headers, 'Content-Type': 'application/json;charset=utf8' },
    signal: AbortSignal.timeout(IAM_TIMEOUT),
  });
  if (!res.ok) {
    iamRegionsCache = null;
    iamRegionsCacheTs = now;
    return null;
  }
  const data = await res.json().catch(() => null);
  const regions = (data && (data.regions || data.region || data.items)) || [];
  const ids = [];
  if (Array.isArray(regions)) {
    for (const r of regions) {
      const id = (r && (r.id || r.region_id || r.name)) ? String(r.id || r.region_id || r.name) : '';
      const v = id.trim();
      if (!v) continue;
      // region ids nos endpoints são minúsculos com hífen (ex.: sa-brazil-1)
      const norm = v.toLowerCase();
      if (!ids.includes(norm)) ids.push(norm);
    }
  }
  iamRegionsCache = ids;
  iamRegionsCacheTs = now;
  return ids;
}

const REGION_CACHE_PATH = path.join(getDataDir(), 'huawei-project-region-cache.json');
let regionCache = null;

function loadRegionCache() {
  if (regionCache) return regionCache;
  try {
    const raw = fs.readFileSync(REGION_CACHE_PATH, 'utf8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      regionCache = obj;
      return regionCache;
    }
  } catch (_) {}
  regionCache = {};
  return regionCache;
}

function saveRegionCache() {
  try {
    const dir = path.dirname(REGION_CACHE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REGION_CACHE_PATH, JSON.stringify(regionCache || {}, null, 2), 'utf8');
  } catch (_) {}
}

function regionCacheKey(projectId, perfil) {
  return `${String(perfil || '').toUpperCase()}::${String(projectId || '').trim()}`;
}

function shouldTryNextRegion(err) {
  const msg = (err && (err.message || String(err))) || '';
  const m = String(msg).toLowerCase();
  return (
    m.includes('does not match') ||
    m.includes('current region') ||
    m.includes('not match with the project') ||
    m.includes('project name') ||
    m.includes('invalid region') ||
    m.includes('the current region is') ||
    m.includes('forbidden') ||
    m.includes('not supported for this domain')
  );
}

function extractProjectNameFromMismatch(err) {
  const msg = (err && (err.message || String(err))) || '';
  const m = String(msg);
  // Ex.: "does not match with the project name [MOS] in tk."
  const match = m.match(/project name\s*\[([^\]]+)\]/i);
  if (match && match[1]) return match[1].trim();
  return null;
}

function buildRegionCandidates(projectId, explicitRegion, perfil, credsRegion) {
  const cache = loadRegionCache();
  const ck = regionCacheKey(projectId, perfil);
  const cachedRegion = cache[ck];

  const candidates = [];
  const add = (r) => {
    const v = (r && String(r).trim()) || '';
    if (!v) return;
    if (!candidates.includes(v)) candidates.push(v);
  };

  // Ordem: região explícita (quando veio do projeto) → cache → região do perfil → varrer known regions.
  add(explicitRegion);
  add(cachedRegion);
  add(credsRegion);
  for (const r of KNOWN_REGIONS) add(r);

  return { cache, ck, candidates };
}

/**
 * GET /v1/{project_id}/cloudservers/{server_id}/block_device — discos anexados ao ECS (tamanho em GB).
 */
async function getBlockDeviceWithAKSK(ak, sk, projectId, region, serverId) {
  const domain = String(region || '').toLowerCase().startsWith('cn-') ? 'myhuaweicloud.cn' : 'myhuaweicloud.com';
  const host = `ecs.${region}.${domain}`;
  const path = `/v1/${projectId}/cloudservers/${serverId}/block_device`;
  const headers = signRequest('GET', host, path, ak, sk, { 'X-Project-Id': projectId }, null);

  const res = await fetch(`https://${host}${path}`, {
    method: 'GET',
    headers: { ...headers, 'Content-Type': 'application/json;charset=utf8' },
    signal: AbortSignal.timeout(BLOCK_DEVICE_TIMEOUT),
  });

  if (!res.ok) return { volumeAttachments: [], totalDiskGb: 0 };
  const data = await res.json();
  const attachments = data.volumeAttachments || [];
  const totalDiskGb = attachments.reduce((sum, a) => sum + (Number(a.size) || 0), 0);
  return {
    volumeAttachments: attachments.map((a) => ({ size: Number(a.size) || 0, device: a.device || '' })),
    totalDiskGb,
  };
}

function normalizeSearchTerm(q) {
  const t = (q && String(q).trim()) || '';
  return t ? t.toLowerCase() : '';
}

function matchesClienteFilter(server, q) {
  if (!q) return true;
  const name = (server?.name || '').toLowerCase();
  if (name.includes(q)) return true;
  const meta = server?.metadata || {};
  const metaCliente = String(meta.centro_custo || meta.centrodecusto || meta.cost_center || meta.cliente || meta.client || '').toLowerCase();
  if (metaCliente.includes(q)) return true;
  return false;
}

export async function listEcsWithAKSK(ak, sk, projectId, region, opts = {}) {
  const domain = String(region || '').toLowerCase().startsWith('cn-') ? 'myhuaweicloud.cn' : 'myhuaweicloud.com';
  const host = `ecs.${region}.${domain}`;
  // Implementação alinhada ao projeto "tags": /v2/{project_id}/servers/detail (SDK oficial usa v2).
  // Alguns tenants retornam erro no endpoint antigo /v1/{project_id}/cloudservers/detail.
  const path = `/v2/${projectId}/servers/detail`;

  const maxServers = Number.isFinite(Number(opts.maxServers)) ? Math.max(1, Number(opts.maxServers)) : 500;
  const q = normalizeSearchTerm(opts.cliente);
  const rawCliente = (opts.cliente && String(opts.cliente).trim()) || '';
  let useNameQuery = !!(rawCliente && rawCliente.length >= 2 && rawCliente.length <= 64);

  const resultServers = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    // OpenStack Nova aceita filtro por name na listagem — isso reduz drasticamente o volume em projetos grandes.
    const queryParams = { limit: String(limit), offset: String(offset) };
    if (useNameQuery) {
      // Usamos name=cliente como "atalho" quando o usuário digitou algo (na UI o campo chama cliente mas também serve para nome).
      // Se for centro_custo, o filtro local ainda funciona; se for nome, o backend responde muito mais rápido.
      queryParams.name = rawCliente;
    }
    const queryStr = `?${new URLSearchParams(queryParams).toString()}`;
    const url = `https://${host}${path}${queryStr}`;
    const headers = signRequest('GET', host, path, ak, sk, { 'X-Project-Id': projectId }, queryParams);

    const res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, 'Content-Type': 'application/json;charset=utf8' },
      signal: AbortSignal.timeout(ECS_TIMEOUT),
    });

    if (!res.ok) {
      const text = await res.text();
      let msg = `List ECS failed (${res.status})`;
      try {
        const data = JSON.parse(text);
        msg = data.error?.message || data.error_msg || data.message || msg;
      } catch (_) {}
      throw new Error(msg);
    }

    const data = await res.json();
    const page = data.servers || [];
    const pageArr = Array.isArray(page) ? page : [];

    // Se name=... não retornou nada, fallback: refaz sem name para permitir filtrar por metadata/centro_custo.
    if (useNameQuery && offset === 0 && pageArr.length === 0) {
      useNameQuery = false;
      continue;
    }
    for (const s of pageArr) {
      if (!matchesClienteFilter(s, q)) continue;
      resultServers.push(s);
      if (resultServers.length >= maxServers) break;
    }

    // Sem filtro: retornamos rapidamente (não pagina tudo em projetos gigantes, ex.: MOOVE).
    // Com filtro: ainda limita a quantidade de resultados para evitar travar o frontend.
    const hasMore = pageArr.length >= limit;
    if (!hasMore) break;
    if (resultServers.length >= maxServers) break;
    offset += limit;
  }

  const baseList = resultServers.map((s) => ({
    id: s.id,
    name: s.name || s.id,
    status: s.status || 'UNKNOWN',
    description: s.description || '',
    created: s.created,
    updated: s.updated,
    flavor: s.flavor ? { id: s.flavor.id, name: s.flavor.name, vcpus: s.flavor.vcpus, ram: s.flavor.ram } : null,
    addresses: s.addresses || {},
    metadata: s.metadata || {},
    // v2/servers/detail pode retornar tags em alguns tenants; em outros vem vazio/undefined.
    tags: s.tags || s.tag || s.tags_list || null,
  }));

  const includeDisksMax = Number.isFinite(Number(opts.includeDisksMax)) ? Math.max(0, Number(opts.includeDisksMax)) : 200;
  const includeDisks = opts.includeDisks !== false && baseList.length > 0 && baseList.length <= includeDisksMax;
  if (!includeDisks) {
    return baseList.map((s) => ({ ...s, totalDiskGb: null, volumeAttachments: [] }));
  }

  const withDisks = await Promise.all(
    baseList.map(async (s) => {
      try {
        const disk = await getBlockDeviceWithAKSK(ak, sk, projectId, region, s.id);
        return { ...s, totalDiskGb: disk.totalDiskGb, volumeAttachments: disk.volumeAttachments };
      } catch {
        return { ...s, totalDiskGb: null, volumeAttachments: [] };
      }
    })
  );
  return withDisks;
}

/**
 * Lista ECS do projeto. Se perfil for informado, usa credenciais desse perfil (evita "get token error" ao clicar em projeto de outra conta).
 */
export async function listEcsForProject(projectId, region, perfil = null, opts = {}) {
  let creds;
  if (perfil) {
    try {
      creds = getProfileCredentials(perfil);
    } catch (e) {
      throw new Error(e.message || `Perfil '${perfil}' não encontrado ou sem AK/SK em config.enc/.env.`);
    }
  } else {
    creds = getCredentialsForApi();
  }
  if (!creds || !creds.ak || !creds.sk) {
    throw new Error('Configure AK/SK em config.enc ou .env para listar ECS.');
  }
  const { cache, ck, candidates } = buildRegionCandidates(projectId, region, perfil, creds.region);
  try {
    const iamRegions = await listIamRegionsWithAKSK(creds.ak, creds.sk);
    if (Array.isArray(iamRegions)) {
      for (const r of iamRegions) {
        const v = (r && String(r).trim().toLowerCase()) || '';
        if (!v) continue;
        if (!candidates.includes(v)) candidates.push(v);
      }
    }
  } catch (_) {
    // ignora fallback
  }

  let lastErr = null;
  const errorsByRegion = [];
  for (const r of candidates) {
    try {
      const list = await listEcsWithAKSK(creds.ak, creds.sk, projectId, r, opts);
      cache[ck] = r;
      regionCache = cache;
      saveRegionCache();
      return list;
    } catch (e) {
      lastErr = e;
      errorsByRegion.push({ region: r, message: e?.message || String(e) });
      // Se o caller passou uma região explícita, só tenta fallback quando o erro indicar mismatch.
      if (region && !shouldTryNextRegion(e)) break;
      if (!shouldTryNextRegion(e)) continue;

      // Caso especial: algumas APIs retornam "project name [XXX] in tk" — tenta usar XXX como "region".
      const projName = extractProjectNameFromMismatch(e);
      if (projName) {
        const alt = projName.toLowerCase();
        if (!candidates.includes(alt)) candidates.push(alt);
      }
    }
  }
  if (errorsByRegion.length > 1) {
    const unique = [];
    for (const x of errorsByRegion) {
      if (!unique.some((u) => u.region === x.region && u.message === x.message)) unique.push(x);
    }
    const tried = unique.map((u) => `${u.region}: ${u.message}`).slice(0, 6).join(' | ');
    throw new Error(`Falha ao listar ECS (regiões tentadas: ${unique.map((u) => u.region).join(', ')}). Últimos erros: ${tried}`);
  }
  throw lastErr || new Error('Falha ao listar ECS.');
}

/**
 * Chama a API ECS v1 POST /v1/{project_id}/cloudservers/action (batch).
 * A API v2.1 (Nova) retorna "The API does not exist or has not been published" em alguns ambientes;
 * a v1 (cloudservers/action) é a API oficial documentada e publicada.
 * Body: {"os-start":{servers:[{id}]}} | {"os-stop":{servers:[{id}]}} | {"reboot":{type:"SOFT",servers:[{id}]}}
 */
async function ecsActionWithAKSK(ak, sk, projectId, region, serverId, body) {
  const domain = String(region || '').toLowerCase().startsWith('cn-') ? 'myhuaweicloud.cn' : 'myhuaweicloud.com';
  const host = `ecs.${region}.${domain}`;
  const path = `/v1/${projectId}/cloudservers/action`;
  const url = `https://${host}${path}`;

  const headers = signRequest('POST', host, path, ak, sk, { 'X-Project-Id': projectId }, null, body);
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json;charset=UTF-8' },
    body,
    signal: AbortSignal.timeout(ECS_TIMEOUT),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `ECS action failed (${res.status})`;
    try {
      const data = JSON.parse(text);
      msg = data.error?.message || data.error_msg || data.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }
  return res;
}

/**
 * Start ECS. Usa API v1 cloudservers/action (os-start com servers).
 */
export async function startEcs(projectId, region, serverId, perfil = null) {
  const creds = perfil ? getProfileCredentials(perfil) : getCredentialsForApi();
  if (!creds?.ak || !creds?.sk) throw new Error('Configure AK/SK para ações ECS.');
  const body = JSON.stringify({ 'os-start': { servers: [{ id: serverId }] } });
  const { cache, ck, candidates } = buildRegionCandidates(projectId, region, perfil, creds.region);
  try {
    const iamRegions = await listIamRegionsWithAKSK(creds.ak, creds.sk);
    if (Array.isArray(iamRegions)) {
      for (const r of iamRegions) {
        const v = (r && String(r).trim().toLowerCase()) || '';
        if (!v) continue;
        if (!candidates.includes(v)) candidates.push(v);
      }
    }
  } catch (_) {}
  let lastErr = null;
  const errorsByRegion = [];
  for (const r of candidates) {
    try {
      await ecsActionWithAKSK(creds.ak, creds.sk, projectId, r, serverId, body);
      cache[ck] = r;
      regionCache = cache;
      saveRegionCache();
      return;
    } catch (e) {
      lastErr = e;
      errorsByRegion.push({ region: r, message: e?.message || String(e) });
      if (region && !shouldTryNextRegion(e)) break;
      if (!shouldTryNextRegion(e)) continue;
      const projName = extractProjectNameFromMismatch(e);
      if (projName) {
        const alt = projName.toLowerCase();
        if (!candidates.includes(alt)) candidates.push(alt);
      }
    }
  }
  if (errorsByRegion.length > 1) {
    const uniqueRegions = Array.from(new Set(errorsByRegion.map((x) => x.region)));
    throw new Error(`Falha ao executar start (regiões tentadas: ${uniqueRegions.join(', ')}). Último erro: ${lastErr?.message || String(lastErr)}`);
  }
  throw lastErr || new Error('Falha ao executar start.');
}

/**
 * Stop ECS. Usa API v1 cloudservers/action (os-stop com servers).
 */
export async function stopEcs(projectId, region, serverId, perfil = null) {
  const creds = perfil ? getProfileCredentials(perfil) : getCredentialsForApi();
  if (!creds?.ak || !creds?.sk) throw new Error('Configure AK/SK para ações ECS.');
  const body = JSON.stringify({ 'os-stop': { servers: [{ id: serverId }] } });
  const { cache, ck, candidates } = buildRegionCandidates(projectId, region, perfil, creds.region);
  try {
    const iamRegions = await listIamRegionsWithAKSK(creds.ak, creds.sk);
    if (Array.isArray(iamRegions)) {
      for (const r of iamRegions) {
        const v = (r && String(r).trim().toLowerCase()) || '';
        if (!v) continue;
        if (!candidates.includes(v)) candidates.push(v);
      }
    }
  } catch (_) {}
  let lastErr = null;
  const errorsByRegion = [];
  for (const r of candidates) {
    try {
      await ecsActionWithAKSK(creds.ak, creds.sk, projectId, r, serverId, body);
      cache[ck] = r;
      regionCache = cache;
      saveRegionCache();
      return;
    } catch (e) {
      lastErr = e;
      errorsByRegion.push({ region: r, message: e?.message || String(e) });
      if (region && !shouldTryNextRegion(e)) break;
      if (!shouldTryNextRegion(e)) continue;
      const projName = extractProjectNameFromMismatch(e);
      if (projName) {
        const alt = projName.toLowerCase();
        if (!candidates.includes(alt)) candidates.push(alt);
      }
    }
  }
  if (errorsByRegion.length > 1) {
    const uniqueRegions = Array.from(new Set(errorsByRegion.map((x) => x.region)));
    throw new Error(`Falha ao executar stop (regiões tentadas: ${uniqueRegions.join(', ')}). Último erro: ${lastErr?.message || String(lastErr)}`);
  }
  throw lastErr || new Error('Falha ao executar stop.');
}

/**
 * Restart ECS (SOFT). Usa API v1 cloudservers/action (reboot com type e servers).
 */
export async function restartEcs(projectId, region, serverId, perfil = null) {
  const creds = perfil ? getProfileCredentials(perfil) : getCredentialsForApi();
  if (!creds?.ak || !creds?.sk) throw new Error('Configure AK/SK para ações ECS.');
  const body = JSON.stringify({ reboot: { type: 'SOFT', servers: [{ id: serverId }] } });
  const { cache, ck, candidates } = buildRegionCandidates(projectId, region, perfil, creds.region);
  try {
    const iamRegions = await listIamRegionsWithAKSK(creds.ak, creds.sk);
    if (Array.isArray(iamRegions)) {
      for (const r of iamRegions) {
        const v = (r && String(r).trim().toLowerCase()) || '';
        if (!v) continue;
        if (!candidates.includes(v)) candidates.push(v);
      }
    }
  } catch (_) {}
  let lastErr = null;
  const errorsByRegion = [];
  for (const r of candidates) {
    try {
      await ecsActionWithAKSK(creds.ak, creds.sk, projectId, r, serverId, body);
      cache[ck] = r;
      regionCache = cache;
      saveRegionCache();
      return;
    } catch (e) {
      lastErr = e;
      errorsByRegion.push({ region: r, message: e?.message || String(e) });
      if (region && !shouldTryNextRegion(e)) break;
      if (!shouldTryNextRegion(e)) continue;
      const projName = extractProjectNameFromMismatch(e);
      if (projName) {
        const alt = projName.toLowerCase();
        if (!candidates.includes(alt)) candidates.push(alt);
      }
    }
  }
  if (errorsByRegion.length > 1) {
    const uniqueRegions = Array.from(new Set(errorsByRegion.map((x) => x.region)));
    throw new Error(`Falha ao executar restart (regiões tentadas: ${uniqueRegions.join(', ')}). Último erro: ${lastErr?.message || String(lastErr)}`);
  }
  throw lastErr || new Error('Falha ao executar restart.');
}

/** Roda `fn` sobre `items` com no máximo `limit` chamadas em paralelo — evita disparar dezenas de contas de uma vez na Huawei. */
async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const ecsUuidIndexCache = { entries: null, expiresAt: 0 };
const ECS_UUID_INDEX_TTL_MS = 30 * 60 * 1000; // 30 min — inventário de ECS muda bem menos que agendamento

/**
 * Constrói um índice reverso `uuid do ECS -> { projectId, region, perfil }` varrendo TODOS os
 * perfis Huawei cadastrados (~74, mas muitos compartilham AK/SK/projeto via `_USE_PROFILE` —
 * deduplicados aqui antes de consultar). Usado pela tela `/automacoes` pra resolver a identidade
 * Huawei de VMs cobertas só pelo Cloud8 (que só dá o `cloudinstanceid`, nunca projeto/perfil).
 * Caro na primeira vez (uma listagem de ECS por conta/projeto única, até 5 em paralelo) — por isso
 * cacheado 30 min em memória. Falha numa conta específica não derruba as outras.
 */
export async function getEcsUuidIndex({ forceRefresh = false } = {}) {
  if (!forceRefresh && ecsUuidIndexCache.entries && ecsUuidIndexCache.expiresAt > Date.now()) {
    return ecsUuidIndexCache.entries;
  }

  const profiles = getProfileNames();
  const seenCombo = new Set(); // dedupe por "ak|projectId|region" — perfis com USE_PROFILE compartilham isso
  const uniqueTargets = [];
  for (const perfil of profiles) {
    let creds;
    try {
      creds = getProfileCredentials(perfil);
    } catch {
      continue;
    }
    if (!creds?.ak || !creds?.project_id) continue;
    const comboKey = `${creds.ak}|${creds.project_id}|${creds.region}`;
    if (seenCombo.has(comboKey)) continue;
    seenCombo.add(comboKey);
    uniqueTargets.push({ perfil, projectId: creds.project_id, region: creds.region });
  }

  const index = new Map();
  await mapWithConcurrency(uniqueTargets, 5, async (target) => {
    try {
      const servers = await listEcsForProject(target.projectId, target.region, target.perfil, { includeDisks: false, maxServers: 2000 });
      for (const s of servers) {
        if (s?.id && !index.has(s.id)) {
          index.set(s.id, { projectId: target.projectId, region: target.region, perfil: target.perfil });
        }
      }
    } catch (e) {
      console.warn(`[huawei-ecs] getEcsUuidIndex: falha no perfil ${target.perfil}: ${e?.message || e}`);
    }
  });

  ecsUuidIndexCache.entries = index;
  ecsUuidIndexCache.expiresAt = Date.now() + ECS_UUID_INDEX_TTL_MS;
  return index;
}
