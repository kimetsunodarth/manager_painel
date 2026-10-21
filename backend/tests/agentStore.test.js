import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import { createAgentStore } from '../src/agent/agentStore.js';
import { codeHash, isBlocked, newCode, unwrapEnvelope, validServiceName, verifySignature } from '../src/agent/agentCrypto.js';

const AGENT = '11111111-1111-4111-8111-111111111111';

function fresh() {
  return createAgentStore(new Database(':memory:'));
}

function keypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { jwk: publicKey.export({ format: 'jwk' }), privateKey };
}

function sign(privateKey, { path, agentId, timestamp, nonce, body }) {
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const message = ['POST', path, agentId, timestamp, nonce, hash].join('\n');
  return crypto.sign('sha256', Buffer.from(message), privateKey).toString('base64');
}

function activated(store, overrides = {}) {
  const { code } = store.issueCode({ projectKey: 'RAMO-p1', projectName: 'Rolandweb', ecsId: 'ecs-1', ecsName: 'ROLAND-WEB01', createdBy: 'admin@ananim.com.br' });
  const { jwk } = keypair();
  return store.activate({ code, agentId: AGENT, jwk, hostname: 'ROLAND-WEB01', os: 'windows', agentVersion: 'v1', ...overrides });
}

test('codigo de ativacao: formato, hash estavel e invalido recusado', () => {
  const code = newCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(codeHash(code), codeHash(code.toLowerCase().replaceAll('-', ' ')));
  assert.throws(() => codeHash('ABCD-EFGH'));
  assert.throws(() => codeHash('0000-0000-0000'));
});

test('codigo e de uso unico e expira em 1 hora', () => {
  const store = fresh();
  const { code } = store.issueCode({ projectKey: 'RAMO-p1', projectName: 'R', ecsId: 'e', ecsName: 'E', createdBy: 'a' });
  const { jwk } = keypair();
  const agent = store.activate({ code, agentId: AGENT, jwk, hostname: 'h', os: 'windows', agentVersion: 'v1' });
  assert.equal(agent.projectKey, 'RAMO-p1');
  assert.equal(agent.ecsName, 'E');
  assert.throws(() => store.activate({ code, agentId: '22222222-2222-4222-8222-222222222222', jwk, hostname: 'h', os: 'windows', agentVersion: 'v1' }), /invalid_or_expired_code/);
  const old = store.issueCode({ projectKey: 'p', projectName: 'R', ecsId: 'e', ecsName: 'E', createdBy: 'a' }, Date.now() - 2 * 3600 * 1000);
  assert.throws(() => store.activate({ code: old.code, agentId: '33333333-3333-4333-8333-333333333333', jwk, hostname: 'h', os: 'windows', agentVersion: 'v1' }), /invalid_or_expired_code/);
});

test('nonce repetido e recusado', () => {
  const store = fresh();
  activated(store);
  const now = Date.now();
  assert.equal(store.useNonce(AGENT, '44444444-4444-4444-8444-444444444444', now), true);
  assert.equal(store.useNonce(AGENT, '44444444-4444-4444-8444-444444444444', now), false);
});

test('fila: claim entrega a mais antiga, respeita lease e tentativas; finish so do proprio agente', () => {
  const store = fresh();
  activated(store);
  const a = store.enqueue({ agentId: AGENT, serviceName: 'B1iService', action: 'restart', requestedBy: 'ana@cliente.com' });
  store.enqueue({ agentId: AGENT, serviceName: 'Spooler', action: 'start', requestedBy: 'ana@cliente.com' });
  const now = Date.now();
  const first = store.claim(AGENT, now);
  assert.equal(first.id, a.id);
  assert.equal(store.claim(AGENT, now).serviceName, 'Spooler');
  assert.equal(store.claim(AGENT, now), null);
  // lease vencido (5 min) devolve a tarefa; depois de 3 tentativas ela falha
  assert.equal(store.claim(AGENT, now + 6 * 60 * 1000).id, a.id);
  assert.equal(store.claim(AGENT, now + 12 * 60 * 1000).id, a.id);
  assert.equal(store.claim(AGENT, now + 18 * 60 * 1000)?.id === a.id, false);
  assert.equal(store.finish('99999999-9999-4999-8999-999999999999', a.id, { status: 'done', code: 'ok', message: '', serviceStatus: 'Running' }), false);
});

test('finish grava resultado e status do servico', () => {
  const store = fresh();
  activated(store);
  store.saveCatalog(AGENT, [{ name: 'B1iService', displayName: 'SAP B1i', status: 'Stopped', startType: 'Automatic' }], 'v1');
  const job = store.enqueue({ agentId: AGENT, serviceName: 'B1iService', action: 'start', requestedBy: 'x' });
  store.claim(AGENT, Date.now());
  assert.equal(store.finish(AGENT, job.id, { status: 'done', code: 'started', message: 'ok', serviceStatus: 'Running' }), true);
  assert.equal(store.listJobs({ agentId: AGENT })[0].status, 'done');
  assert.equal(store.listServices(AGENT)[0].status, 'Running');
});

test('catalogo substitui a lista e descarta bloqueados e nomes invalidos', () => {
  const store = fresh();
  activated(store);
  store.saveCatalog(AGENT, [{ name: 'Old', displayName: 'Old', status: 'Running', startType: 'Manual' }], 'v1');
  store.saveCatalog(AGENT, [
    { name: 'B1iService', displayName: 'SAP B1i', status: 'Running', startType: 'Automatic' },
    { name: 'WinRM', displayName: 'Windows Remote Management', status: 'Running', startType: 'Automatic' },
    { name: 'bad name;rm', displayName: 'x', status: 'Running', startType: 'Manual' },
  ], 'v2');
  assert.deepEqual(store.listServices(AGENT).map((s) => s.name), ['B1iService']);
  assert.equal(store.getAgent(AGENT).agentVersion, 'v2');
});

test('revogado: getAgent marca revoked', () => {
  const store = fresh();
  activated(store);
  store.revoke(AGENT);
  assert.equal(store.getAgent(AGENT).revoked, true);
});

test('regras de nome e bloqueio', () => {
  assert.equal(isBlocked('winrm'), true);
  assert.equal(isBlocked('AnanimManagerAgent'), true);
  assert.equal(isBlocked('B1iService'), false);
  assert.equal(validServiceName('25.2.5.43284_InventNFeService'), true);
  assert.equal(validServiceName('sapb1servertools-servicelayer.service'), true);
  assert.equal(validServiceName('a b'), false);
  assert.equal(validServiceName(''), false);
});

test('assinatura valida verifica; corpo alterado falha', () => {
  const { jwk, privateKey } = keypair();
  const body = Buffer.from('{"x":1}');
  const parts = { path: '/api/agent/claim', agentId: AGENT, timestamp: '1792600000', nonce: '55555555-5555-4555-8555-555555555555', body };
  const signature = sign(privateKey, parts);
  assert.equal(verifySignature({ jwk, method: 'POST', ...parts, signature }), true);
  assert.equal(verifySignature({ jwk, method: 'POST', ...parts, body: Buffer.from('{"x":2}'), signature }), false);
  assert.equal(verifySignature({ jwk, method: 'POST', ...parts, signature: 'AAAA' }), false);
});

test('envelope gzip: aceita, recusa grande e corrompido, JSON aberto passa direto', () => {
  const inner = Buffer.from(JSON.stringify({ services: [] }));
  const env = Buffer.from(JSON.stringify({ format: 'gzip-base64-json', data: zlib.gzipSync(inner).toString('base64') }));
  assert.deepEqual(unwrapEnvelope(env), inner);
  assert.deepEqual(unwrapEnvelope(inner), inner);
  const bomb = Buffer.from(JSON.stringify({ format: 'gzip-base64-json', data: zlib.gzipSync(Buffer.alloc(2 * 1024 * 1024, 32)).toString('base64') }));
  assert.throws(() => unwrapEnvelope(bomb));
  assert.throws(() => unwrapEnvelope(Buffer.from(JSON.stringify({ format: 'gzip-base64-json', data: Buffer.from('nao').toString('base64') }))));
});
