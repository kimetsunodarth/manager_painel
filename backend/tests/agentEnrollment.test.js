import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { createAgentStore, ENROLL_TTL_MS } from '../src/agent/agentStore.js';

const jwk = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' });
const id = () => crypto.randomUUID();
const projeto = { projectKey: 'ANANIMCLOUD_ECOA-d534', projectName: 'sa-brazil-1_Ecoa', projectId: 'd534', region: 'sa-brazil-1', perfil: 'ANANIMCLOUD_ECOA', createdBy: 'adm' };
const agente = (token, hostname, ecs) => ({ token, agentId: id(), jwk, hostname, os: 'windows', agentVersion: 'v1', ecs });

test('chave do projeto: vários servidores se cadastram sozinhos e são ligados pela VM com o mesmo nome', () => {
  const store = createAgentStore(new Database(':memory:'));
  const now = 1_000_000;
  const { token, expiresAt } = store.issueEnrollment(projeto, now);
  assert.equal(expiresAt, now + ENROLL_TTL_MS);
  assert.deepEqual(store.peekEnrollment(token, now), { projectKey: projeto.projectKey, projectName: projeto.projectName, projectId: 'd534', region: 'sa-brazil-1', perfil: 'ANANIMCLOUD_ECOA' });

  const web = store.enroll(agente(token, 'ECOAWEB', { id: 'e1', name: 'ECOAWEB' }), now);
  assert.equal(web.ecsId, 'e1');
  assert.equal(web.pending, false);
  const db2 = store.enroll(agente(token, 'ECOAHDB', { id: 'e2', name: 'ECOAHDB' }), now);
  assert.equal(db2.projectKey, projeto.projectKey);
  assert.equal(db2.ecsName, 'ECOAHDB');
});

test('sem VM com o mesmo nome, ou VM que já tem conector: fica aguardando vínculo e o admin escolhe', () => {
  const store = createAgentStore(new Database(':memory:'));
  const { token } = store.issueEnrollment(projeto);
  const semVm = store.enroll(agente(token, 'SRV-SEM-NOME', null));
  assert.equal(semVm.pending, true);
  assert.equal(semVm.ecsName, 'SRV-SEM-NOME');
  store.enroll(agente(token, 'ECOAWEB', { id: 'e1', name: 'ECOAWEB' }));
  const repetido = store.enroll(agente(token, 'ECOAWEB', { id: 'e1', name: 'ECOAWEB' }));
  assert.equal(repetido.pending, true, 'a VM já tem conector ativo');

  const ligado = store.assignServer(semVm.id, { ecsId: 'e9', ecsName: 'ECOAAPP' });
  assert.equal(ligado.pending, false);
  assert.equal(ligado.ecsName, 'ECOAAPP');
  assert.throws(() => store.assignServer(repetido.id, { ecsId: 'e1', ecsName: 'ECOAWEB' }), /server_taken/);
});

test('chave vencida, revogada ou inválida é recusada', () => {
  const store = createAgentStore(new Database(':memory:'));
  const now = 1_000_000;
  const { token } = store.issueEnrollment(projeto, now);
  assert.equal(store.peekEnrollment(token, now + ENROLL_TTL_MS + 1), null);
  assert.throws(() => store.enroll(agente(token, 'X', null), now + ENROLL_TTL_MS + 1), /invalid_or_expired_enrollment/);
  assert.throws(() => store.enroll(agente('nao-existe', 'X', null), now), /invalid_or_expired_enrollment/);
  const outra = store.issueEnrollment(projeto, now);
  store.revokeEnrollments(projeto.projectKey);
  assert.equal(store.peekEnrollment(outra.token, now), null);
});
