/**
 * Cliente ECS Huawei Cloud - listar servidores, start, stop (estilo Cloud8).
 * Usa Nova API v2.1: ecs.{region}.myhuaweicloud.com
 */
const fetch = require("node-fetch");
const { signRequest } = require("./huaweiSigner");

function getEcsEndpoint(region) {
  return `https://ecs.${region}.myhuaweicloud.com`;
}

/**
 * Lista ECS (servidores) de um projeto na região.
 * GET /v2.1/{project_id}/servers/detail
 */
async function listServers(ak, sk, region, projectId) {
  const base = getEcsEndpoint(region);
  const url = `${base}/v2.1/${projectId}/servers/detail`;
  const body = Buffer.alloc(0);
  const headers = signRequest("GET", url, body, ak, sk);
  headers["X-Project-Id"] = projectId;

  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Inicia um ECS.
 * POST /v2.1/{project_id}/servers/{server_id}/action { "os-start": {} }
 */
async function startServer(ak, sk, region, projectId, serverId) {
  const base = getEcsEndpoint(region);
  const url = `${base}/v2.1/${projectId}/servers/${serverId}/action`;
  const bodyStr = JSON.stringify({ "os-start": {} });
  const body = Buffer.from(bodyStr, "utf8");
  const headers = signRequest("POST", url, body, ak, sk);
  headers["X-Project-Id"] = projectId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: bodyStr,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.status === 202 ? {} : res.json().catch(() => ({}));
}

/**
 * Para um ECS.
 * POST /v2.1/{project_id}/servers/{server_id}/action { "os-stop": {} }
 */
async function stopServer(ak, sk, region, projectId, serverId) {
  const base = getEcsEndpoint(region);
  const url = `${base}/v2.1/${projectId}/servers/${serverId}/action`;
  const bodyStr = JSON.stringify({ "os-stop": {} });
  const body = Buffer.from(bodyStr, "utf8");
  const headers = signRequest("POST", url, body, ak, sk);
  headers["X-Project-Id"] = projectId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: bodyStr,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.status === 202 ? {} : res.json().catch(() => ({}));
}

/**
 * Reinicia um ECS (soft reboot).
 * POST /v2.1/{project_id}/servers/{server_id}/action { "reboot": { "type": "SOFT" } }
 */
async function restartServer(ak, sk, region, projectId, serverId) {
  const base = getEcsEndpoint(region);
  const url = `${base}/v2.1/${projectId}/servers/${serverId}/action`;
  const bodyStr = JSON.stringify({ reboot: { type: "SOFT" } });
  const body = Buffer.from(bodyStr, "utf8");
  const headers = signRequest("POST", url, body, ak, sk);
  headers["X-Project-Id"] = projectId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: bodyStr,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.status === 202 ? {} : res.json().catch(() => ({}));
}

module.exports = {
  listServers,
  startServer,
  stopServer,
  restartServer,
  getEcsEndpoint,
};
