import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import Database from 'better-sqlite3';
import { createAgentStore } from '../src/agent/agentStore.js';
import { createAgentRouter } from '../src/routes/agent.js';

const jwk = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' });
const pub = { kty: 'RSA', n: jwk.n, e: jwk.e };

async function server() {
  const store = createAgentStore(new Database(':memory:'));
  const vistos = [];
  // VMs do projeto (na vida real: listEcsForProject / servidores do projeto manual).
  const findServer = async (projeto, hostname) => {
    vistos.push([projeto.projectId, hostname]);
    return [{ id: 'e1', name: 'ECOAWEB' }, { id: 'e2', name: 'ECOAHDB' }].find((v) => v.name.toLowerCase() === hostname.toLowerCase()) || null;
  };
  const app = express();
  app.use('/api/agent', createAgentRouter(() => store, { findServer }));
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { store, vistos, base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

const enroll = (t, token, hostname) => fetch(`${t.base}/api/agent/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ enrollToken: token, agentId: crypto.randomUUID(), publicKey: pub, hostname, os: 'windows', agentVersion: 'v1' }) });

test('instalador do projeto: cadastra sozinho e liga pela VM com o mesmo nome do servidor', async () => {
  const t = await server();
  try {
    const { token } = t.store.issueEnrollment({ projectKey: 'P-d534', projectName: 'sa-brazil-1_Ecoa', projectId: 'd534', region: 'sa-brazil-1', perfil: 'P', createdBy: 'adm' });
    const r = await enroll(t, token, 'ecoaweb');
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.deepEqual({ ...body, agentId: undefined }, { agentId: undefined, projectName: 'sa-brazil-1_Ecoa', ecsName: 'ECOAWEB', pending: false });
    assert.deepEqual(t.vistos, [['d534', 'ecoaweb']]);
    const semVm = await (await enroll(t, token, 'OUTRO-SRV')).json();
    assert.equal(semVm.pending, true);
    assert.equal(semVm.ecsName, 'OUTRO-SRV');
  } finally { t.close(); }
});

test('chave inválida dá 403 e conta como tentativa errada', async () => {
  const t = await server();
  try {
    const r = await enroll(t, 'chave-que-nao-existe', 'ECOAWEB');
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error, 'invalid_or_expired_enrollment');
    assert.equal(t.vistos.length, 0, 'não consulta a Huawei com chave inválida');
  } finally { t.close(); }
});
