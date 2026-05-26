/**
 * Assinatura AK/SK no formato do SDK Huawei (igual CBR, change_disk, tags).
 * Algoritmo: SDK-HMAC-SHA256, canonical request, string to sign.
 */

import crypto from 'crypto';

const ALGORITHM = 'SDK-HMAC-SHA256';
const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function toHex(buffer) {
  return buffer.toString('hex');
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function urlEncode(s) {
  return encodeURIComponent(String(s)).replace(/!/g, '%21').replace(/'/g, '%27').replace(/~/g, '%7E').replace(/\*/g, '%2A');
}

/**
 * Canonical URI: SDK Huawei adiciona barra final ao path (igual Python SDK).
 */
function canonicalUri(path) {
  const p = path.endsWith('/') ? path : path + '/';
  return p.split('/').map((seg) => urlEncode(seg)).join('/');
}

/**
 * Canonical query string: params ordenados, key=value url-encoded, unidos por & (igual Python SDK).
 * @param {Record<string, string> | Array<[string, string]>} queryParams
 */
function canonicalQueryString(queryParams) {
  if (!queryParams || (Array.isArray(queryParams) && queryParams.length === 0)) return '';
  const entries = Array.isArray(queryParams)
    ? queryParams
    : Object.entries(queryParams);
  const sorted = [...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return sorted.map(([k, v]) => `${urlEncode(k)}=${urlEncode(v)}`).join('&');
}

/**
 * Gera header Authorization e headers necessários para uma requisição assinada com AK/SK.
 * Formato igual ao SDK Python (CBR, tags): canonical URI com barra final, query string suportada.
 * Para POST/PUT com body, informar body (string) para incluir hash do payload na assinatura.
 * @param {string} method - GET, POST, etc.
 * @param {string} host - ex: iam.myhuaweicloud.com
 * @param {string} path - ex: /v3/projects (barra final é adicionada na canonical URI)
 * @param {string} ak - Access Key
 * @param {string} sk - Secret Key
 * @param {Record<string, string>} extraHeaders - ex: { 'X-Project-Id': projectId }
 * @param {Record<string, string> | Array<[string, string]>} [queryParams] - ex: { name: 'sa-brazil-1' }
 * @param {string} [body] - corpo da requisição (para POST/PUT); se omitido usa EMPTY_HASH
 * @returns {{ 'X-Sdk-Date': string, 'Host': string, 'Authorization': string, ...extraHeaders }}
 */
export function signRequest(method, host, path, ak, sk, extraHeaders = {}, queryParams = null, body = null) {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const headers = {
    Host: host,
    'X-Sdk-Date': dateStr,
    ...extraHeaders,
  };

  const signedHeaderNames = Object.keys(headers)
    .filter((k) => !k.includes('_'))
    .map((k) => k.toLowerCase())
    .sort();

  const canonicalHeaders = signedHeaderNames
    .map((name) => {
      const value = headers[Object.keys(headers).find((k) => k.toLowerCase() === name)] || '';
      return `${name}:${String(value).trim()}`;
    })
    .join('\n');
  const signedHeadersStr = signedHeaderNames.join(';');

  const canonicalUriStr = canonicalUri(path);
  const canonicalQueryStr = canonicalQueryString(queryParams);
  const payloadHash = body != null && body !== '' ? sha256Hex(body) : EMPTY_HASH;

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUriStr,
    canonicalQueryStr,
    canonicalHeaders + '\n',
    signedHeadersStr,
    payloadHash,
  ].join('\n');

  const stringToSign = [ALGORITHM, dateStr, sha256Hex(canonicalRequest)].join('\n');
  const signature = toHex(hmacSha256(sk, stringToSign));
  const authorization = `${ALGORITHM} Access=${ak}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

  return {
    Host: host,
    'X-Sdk-Date': dateStr,
    ...extraHeaders,
    Authorization: authorization,
  };
}
