/**
 * Serviço Huawei Cloud CBR (Cloud Backup and Recovery) — listagem de backups.
 * Mesmo conceito do projeto cbr: ListBackups com resource_type=OS::Nova::Server.
 * API: GET /v3/{project_id}/backups (assinatura AK/SK).
 */

import { getProfileCredentials } from '../config/configLoader.js';
import { signRequest } from './huawei-signer.js';

const CBR_TIMEOUT = 30000;

/**
 * Lista backups CBR de um perfil no período informado (padrão última semana).
 * @param {string} profileName - Nome do perfil (ex: RAMO_SP_AFIPE)
 * @param {{ days?: number, projectId?: string, region?: string }} options - projectId/region do alvo (visibleProjects)
 * @returns {Promise<Array<{ id: string, name: string, status: string, type: string, resource_id: string, resource_name: string, resource_size: number, created_at: string, protected_at: string, vault_id: string }>>}
 */
export async function listBackups(profileName, options = {}) {
  const days = options.days ?? 7;
  const { ak, sk, project_id, region } = getProfileCredentials(profileName);
  const projectId = (options.projectId && String(options.projectId).trim()) || project_id;
  const regionUse = (options.region && String(options.region).trim()) || region || 'sa-brazil-1';
  if (!projectId) {
    throw new Error(`Perfil '${profileName}' sem PROJECT_ID em config.enc ou .env`);
  }

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  const startTime = start.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const endTime = now.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const host = `cbr.${regionUse}.myhuaweicloud.com`;
  const path = `/v3/${projectId}/backups`;

  const baseParams = { resource_type: 'OS::Nova::Server', limit: '1000' };
  let queryParams = { ...baseParams, start_time: startTime, end_time: endTime };

  const doRequest = async (params) => {
    const q = { ...params };
    const headers = signRequest('GET', host, path, ak, sk, { 'X-Project-Id': projectId }, q);
    const queryStr = new URLSearchParams(q).toString();
    const url = `https://${host}${path}?${queryStr}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(CBR_TIMEOUT),
    });
    return res;
  };

  let res = await doRequest(queryParams);
  if (!res.ok && (res.status === 400 || res.status === 404)) {
    const text = await res.text();
    if (/start_time|end_time|invalid.*time/i.test(text)) {
      queryParams = baseParams;
      res = await doRequest(queryParams);
    }
  }

  if (!res.ok) {
    const text = await res.text();
    let msg = `CBR list backups failed (${res.status})`;
    try {
      const data = JSON.parse(text);
      msg = data.error_msg || data.message || data.error?.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await res.json();
  let backups = data.backups || [];
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  backups = backups.filter((b) => {
    const t = b.created_at ? new Date(b.created_at).getTime() : 0;
    return t >= startMs && t <= endMs;
  });

  /**
   * A API CBR da Huawei pode retornar o tamanho em GB (campo size ou resource_size).
   * Valores pequenos (< 1e6) são tratados como GB e convertidos para bytes.
   */
  function toSizeBytes(raw) {
    if (raw == null || Number.isNaN(Number(raw))) return 0;
    const n = Number(raw);
    if (n <= 0) return 0;
    if (n >= 1e6) return Math.round(n);
    return Math.round(n * 1e9);
  }

  return backups.map((b) => {
    const rawSize = b.size != null ? b.size : b.resource_size;
    const sizeBytes = toSizeBytes(rawSize);
    return {
      id: b.id,
      name: b.name,
      status: b.status,
      type: b.incremental ? 'Incremental' : 'Full',
      resource_id: b.resource_id,
      resource_name: b.resource_name,
      resource_size: sizeBytes,
      created_at: b.created_at,
      protected_at: b.protected_at,
      vault_id: b.vault_id,
    };
  });
}
