/**
 * Lista ECS (servidores) de um projeto Huawei — AK/SK assinado.
 * GET /v1/{project_id}/cloudservers/detail (Huawei ECS API).
 */

import { getCredentialsForApi, getProfileCredentials } from '../config/configLoader.js';
import { signRequest } from './huawei-signer.js';

const ECS_TIMEOUT = 30000;
const BLOCK_DEVICE_TIMEOUT = 10000;

/**
 * GET /v1/{project_id}/cloudservers/{server_id}/block_device — discos anexados ao ECS (tamanho em GB).
 */
async function getBlockDeviceWithAKSK(ak, sk, projectId, region, serverId) {
  const host = `ecs.${region}.myhuaweicloud.com`;
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
  const host = `ecs.${region}.myhuaweicloud.com`;
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
  const r = region || creds.region || 'sa-brazil-1';
  return listEcsWithAKSK(creds.ak, creds.sk, projectId, r);
}

/**
 * Chama a API ECS v1 POST /v1/{project_id}/cloudservers/action (batch).
 * A API v2.1 (Nova) retorna "The API does not exist or has not been published" em alguns ambientes;
 * a v1 (cloudservers/action) é a API oficial documentada e publicada.
 * Body: {"os-start":{servers:[{id}]}} | {"os-stop":{servers:[{id}]}} | {"reboot":{type:"SOFT",servers:[{id}]}}
 */
async function ecsActionWithAKSK(ak, sk, projectId, region, serverId, body) {
  const host = `ecs.${region}.myhuaweicloud.com`;
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
  const r = region || creds.region || 'sa-brazil-1';
  const body = JSON.stringify({ 'os-start': { servers: [{ id: serverId }] } });
  await ecsActionWithAKSK(creds.ak, creds.sk, projectId, r, serverId, body);
}

/**
 * Stop ECS. Usa API v1 cloudservers/action (os-stop com servers).
 */
export async function stopEcs(projectId, region, serverId, perfil = null) {
  const creds = perfil ? getProfileCredentials(perfil) : getCredentialsForApi();
  if (!creds?.ak || !creds?.sk) throw new Error('Configure AK/SK para ações ECS.');
  const r = region || creds.region || 'sa-brazil-1';
  const body = JSON.stringify({ 'os-stop': { servers: [{ id: serverId }] } });
  await ecsActionWithAKSK(creds.ak, creds.sk, projectId, r, serverId, body);
}

/**
 * Restart ECS (SOFT). Usa API v1 cloudservers/action (reboot com type e servers).
 */
export async function restartEcs(projectId, region, serverId, perfil = null) {
  const creds = perfil ? getProfileCredentials(perfil) : getCredentialsForApi();
  if (!creds?.ak || !creds?.sk) throw new Error('Configure AK/SK para ações ECS.');
  const r = region || creds.region || 'sa-brazil-1';
  const body = JSON.stringify({ reboot: { type: 'SOFT', servers: [{ id: serverId }] } });
  await ecsActionWithAKSK(creds.ak, creds.sk, projectId, r, serverId, body);
}
