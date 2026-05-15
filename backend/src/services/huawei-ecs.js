/**
 * Lista ECS (servidores) de um projeto Huawei — AK/SK assinado.
 * GET /v1/{project_id}/cloudservers/detail (Huawei ECS API).
 */

import { getCredentialsForApi, getProfileCredentials } from '../config/configLoader.js';
import { signRequest } from './huawei-signer.js';
import fs from 'fs';
import path from 'path';
import { getDataDir } from '../appRoot.js';

const ECS_TIMEOUT = 30000;
const BLOCK_DEVICE_TIMEOUT = 10000;

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

export async function listEcsWithAKSK(ak, sk, projectId, region) {
  const domain = String(region || '').toLowerCase().startsWith('cn-') ? 'myhuaweicloud.cn' : 'myhuaweicloud.com';
  const host = `ecs.${region}.${domain}`;
  const path = `/v1/${projectId}/cloudservers/detail`;
  const queryParams = { limit: '200' };
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
  const servers = data.servers || [];
  const baseList = servers.map((s) => ({
    id: s.id,
    name: s.name || s.id,
    status: s.status || 'UNKNOWN',
    description: s.description || '',
    created: s.created,
    updated: s.updated,
    flavor: s.flavor ? { id: s.flavor.id, name: s.flavor.name, vcpus: s.flavor.vcpus, ram: s.flavor.ram } : null,
    addresses: s.addresses || {},
    metadata: s.metadata || {},
    // Algumas APIs retornam tags diretamente no cloudserver detail; mantemos quando existir.
    tags: s.tags || s.tag || s.tags_list || null,
  }));

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
export async function listEcsForProject(projectId, region, perfil = null) {
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

  let lastErr = null;
  const errorsByRegion = [];
  for (const r of candidates) {
    try {
      const list = await listEcsWithAKSK(creds.ak, creds.sk, projectId, r);
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
    }
  }
  if (errorsByRegion.length > 1) {
    const uniqueRegions = Array.from(new Set(errorsByRegion.map((x) => x.region)));
    throw new Error(`Falha ao executar restart (regiões tentadas: ${uniqueRegions.join(', ')}). Último erro: ${lastErr?.message || String(lastErr)}`);
  }
  throw lastErr || new Error('Falha ao executar restart.');
}
