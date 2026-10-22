import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import express from 'express';
import Database from 'better-sqlite3';
import { createAgentStore } from '../src/agent/agentStore.js';
import { createAgentRouter } from '../src/routes/agent.js';

const AGENT = '11111111-1111-4111-8111-111111111111';

async function server() {
  const store = createAgentStore(new Database(':memory:'));
  const app = express();
  app.use('/api/agent', createAgentRouter(() => store));
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { store, base, close: () => srv.close() };
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });

async function activate(t) {
  const { code } = t.store.issueCode({ projectKey: 'RAMO-p1', projectName: 'Rolandweb', ecsId: 'ecs-1', ecsName: 'ROLAND-WEB01', createdBy: 'admin' });
  return fetch(`${t.base}/api/agent/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, agentId: AGENT, publicKey: { kty: 'RSA', n: jwk.n, e: jwk.e }, hostname: 'ROLAND-WEB01', os: 'windows', agentVersion: 'v1' }) });
}

function signed(t, path, payload, { nonce = crypto.randomUUID(), raw } = {}) {
  const body = raw ?? Buffer.from(JSON.stringify(payload));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const signature = crypto.sign('sha256', Buffer.from(['POST', path, AGENT, timestamp, nonce, hash].join('\n')), privateKey).toString('base64');
  return fetch(`${t.base}${path}`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-Agent-Id': AGENT, 'X-Timestamp': timestamp, 'X-Nonce': nonce, 'X-Signature': signature } });
}

test('ativa com codigo valido e recusa reutilizado', async () => {
  const t = await server();
  try {
    const r = await activate(t);
    assert.equal(r.status, 201);
    assert.deepEqual(await r.json(), { agentId: AGENT, projectName: 'Rolandweb', ecsName: 'ROLAND-WEB01' });
    const again = await fetch(`${t.base}/api/agent/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'AAAA-BBBB-CCCC', agentId: AGENT, publicKey: jwk, hostname: 'x', os: 'windows', agentVersion: 'v1' }) });
    assert.equal(again.status, 403);
    assert.equal((await again.json()).error, 'invalid_or_expired_code');
  } finally { t.close(); }
});

test('claim assinado entrega tarefa; replay e revogado dao 401', async () => {
  const t = await server();
  try {
    await activate(t);
    t.store.enqueue({ agentId: AGENT, serviceName: 'B1iService', action: 'restart', requestedBy: 'ana@cliente.com' });
    const nonce = crypto.randomUUID();
    const r = await signed(t, '/api/agent/claim', {}, { nonce });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.job.serviceName, 'B1iService');
    assert.equal(body.job.action, 'restart');
    assert.ok(body.blocked.includes('winrm'));
    assert.equal((await signed(t, '/api/agent/claim', {}, { nonce })).status, 401);
    t.store.revoke(AGENT);
    assert.equal((await signed(t, '/api/agent/claim', {})).status, 401);
  } finally { t.close(); }
});

test('resultado registra a tarefa e o status do servico', async () => {
  const t = await server();
  try {
    await activate(t);
    t.store.saveCatalog(AGENT, [{ name: 'B1iService', displayName: 'SAP B1i', status: 'Stopped', startType: 'Automatic' }], 'v1');
    const job = t.store.enqueue({ agentId: AGENT, serviceName: 'B1iService', action: 'start', requestedBy: 'x' });
    await signed(t, '/api/agent/claim', {});
    const r = await signed(t, '/api/agent/result', { jobId: job.id, status: 'done', code: 'started', message: 'ok', serviceStatus: 'Running' });
    assert.equal(r.status, 200);
    assert.equal(t.store.listServices(AGENT)[0].status, 'Running');
    assert.equal((await signed(t, '/api/agent/result', { jobId: job.id, status: 'done', code: 'x', message: '', serviceStatus: '' })).status, 409);
  } finally { t.close(); }
});

test('catalogo em envelope gzip e aceito e bloqueados descartados', async () => {
  const t = await server();
  try {
    await activate(t);
    const inner = JSON.stringify({ agentVersion: 'v2', services: [
      { name: 'B1iService', displayName: 'SAP B1i', status: 'Running', startType: 'Automatic' },
      { name: 'WinRM', displayName: 'WinRM', status: 'Running', startType: 'Automatic' }] });
    const raw = Buffer.from(JSON.stringify({ format: 'gzip-base64-json', data: zlib.gzipSync(inner).toString('base64') }));
    const r = await signed(t, '/api/agent/catalog', null, { raw });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { services: 1 });
    assert.equal(t.store.getAgent(AGENT).agentVersion, 'v2');
  } finally { t.close(); }
});

test('assinatura errada ou sem headers da 401', async () => {
  const t = await server();
  try {
    await activate(t);
    const r = await fetch(`${t.base}/api/agent/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 401);
  } finally { t.close(); }
});

test('remocao pedida pelo painel chega no claim e a confirmacao revoga o agente', async () => {
  const t = await server();
  try {
    await activate(t);
    t.store.enqueue({ agentId: AGENT, serviceName: 'B1iService', action: 'restart', requestedBy: 'x' });
    t.store.requestUninstall(AGENT);
    assert.equal(t.store.getAgent(AGENT).uninstallRequested, true);
    const claim = await (await signed(t, '/api/agent/claim', {})).json();
    assert.equal(claim.uninstall, true);
    assert.equal(claim.job, null, 'com remocao pedida, nenhuma tarefa nova e entregue');
    const r = await signed(t, '/api/agent/uninstalled', { reason: 'portal' });
    assert.equal(r.status, 200);
    assert.equal(t.store.getAgent(AGENT).revoked, true);
    assert.equal((await signed(t, '/api/agent/claim', {})).status, 401);
  } finally { t.close(); }
});

test('desinstalacao local (sem pedido do painel) tambem revoga o agente', async () => {
  const t = await server();
  try {
    await activate(t);
    assert.equal((await (await signed(t, '/api/agent/claim', {})).json()).uninstall, false);
    assert.equal((await signed(t, '/api/agent/uninstalled', { reason: 'local' })).status, 200);
    assert.equal(t.store.getAgent(AGENT).revoked, true);
  } finally { t.close(); }
});
