/**
 * Ananim Manager Agent: códigos de ativação, assinatura das requisições do agente e regras de serviço.
 * Mesmo modelo do conector AD do Cofre: o agente só faz HTTPS de saída e assina cada requisição com
 * uma chave RSA que nunca sai da máquina dele.
 */
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ACTIONS = ['start', 'stop', 'restart'];
export const MAX_CATALOG_BYTES = 1024 * 1024;
export const ENVELOPE = 'gzip-base64-json';

// Nunca liberáveis: o próprio agente e o que mantém o servidor acessível e auditável.
export const BLOCKED_SERVICES = new Set(['ananimmanageragent', 'ananim-manager-agent', 'winrm', 'sshd', 'termservice', 'eventlog',
  'rpcss', 'rpceptmapper', 'dcomlaunch', 'lsm', 'samss', 'schedule', 'cryptsvc',
  // Linux (unidades systemd, sem ".service")
  'ssh', 'dbus', 'dbus-broker', 'networkmanager', 'wicked', 'wickedd', 'network', 'auditd', 'polkit', 'firewalld']);
/** Prefixos bloqueados no Linux: núcleo do systemd e sessões de login. */
export const BLOCKED_PREFIXES = ['systemd-', 'getty@', 'serial-getty@', 'autovt@', 'user@', 'user-runtime-dir@', 'dbus-'];

export function isBlocked(name) {
  const value = String(name || '').toLowerCase();
  return BLOCKED_SERVICES.has(value) || BLOCKED_PREFIXES.some((p) => value.startsWith(p));
}

export function validServiceName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9_.@-]{1,256}$/.test(name);
}

export function newCode() {
  const raw = Array.from({ length: 12 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function codeHash(code) {
  const normalized = String(code || '').toUpperCase().replace(/[\s-]/g, '');
  if (normalized.length !== 12 || [...normalized].some((ch) => !ALPHABET.includes(ch))) throw new Error('invalid_code');
  return crypto.createHash('sha256').update('mgr:' + normalized).digest('hex');
}

/** Chave pública do agente (JWK RSA) → KeyObject; exige RSA de 2048 bits ou mais. */
export function publicKeyFromJwk(jwk) {
  if (!jwk || jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') throw new Error('invalid_key');
  const key = crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
  if ((key.asymmetricKeyDetails?.modulusLength || 0) < 2048) throw new Error('weak_key');
  return key;
}

/** RSA PKCS#1 v1.5 SHA-256 sobre "POST\npath\nagentId\ntimestamp\nnonce\nsha256hex(body)". */
export function verifySignature({ jwk, method, path, agentId, timestamp, nonce, body, signature }) {
  try {
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    const message = [method, path, agentId, timestamp, nonce, hash].join('\n');
    return crypto.verify('sha256', Buffer.from(message), publicKeyFromJwk(jwk), Buffer.from(String(signature || ''), 'base64'));
  } catch {
    return false;
  }
}

/** {"format":"gzip-base64-json","data":...} → conteúdo; JSON aberto volta como veio. Limite de 1 MB descomprimido. */
export function unwrapEnvelope(raw) {
  let outer;
  try { outer = JSON.parse(raw.toString('utf8')); } catch { return raw; }
  if (!outer || typeof outer !== 'object' || Array.isArray(outer) || Object.keys(outer).sort().join(',') !== 'data,format') return raw;
  if (outer.format !== ENVELOPE || typeof outer.data !== 'string') throw new Error('unsupported_envelope');
  try {
    return zlib.gunzipSync(Buffer.from(outer.data, 'base64'), { maxOutputLength: MAX_CATALOG_BYTES });
  } catch {
    throw new Error('invalid_envelope');
  }
}
