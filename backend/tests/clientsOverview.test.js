import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { createAgentStore } from '../src/agent/agentStore.js';
import { createManualProjects } from '../src/agent/manualProjects.js';
import { clientsOverview } from '../src/agent/clientsOverview.js';

const jwk = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' });
const AGENT = '22222222-2222-4222-8222-222222222222';

test('visão por cliente: servidores do conector, serviços liberados e usuários com acesso', () => {
  const db = new Database(':memory:');
  const store = createAgentStore(db);
  const manual = createManualProjects(db);
  const { code } = store.issueCode({ projectKey: 'ANANIMCLOUD_ECOA-d534', projectName: 'sa-brazil-1_Ecoa', ecsId: 'e1', ecsName: 'ECOAWEB', createdBy: 'adm' });
  store.activate({ code, agentId: AGENT, jwk, hostname: 'ECOAWEB', os: 'windows', agentVersion: 'v1' });
  store.saveCatalog(AGENT, [
    { name: 'B1iF1', displayName: 'B1iF 1', status: 'Running', startType: 'Automatic' },
    { name: 'B1iF2', displayName: 'B1iF 2', status: 'Running', startType: 'Automatic' },
    { name: 'Spooler', displayName: 'Print Spooler', status: 'Running', startType: 'Automatic' },
  ], 'v1');
  store.setReleases(AGENT, [{ serviceName: 'B1iF1', label: 'B1iF', actions: ['restart'] }, { serviceName: 'B1iF2', label: 'B1iF', actions: ['restart'] }]);
  store.setGrants('3', AGENT, ['B1iF1', 'B1iF2']);
  const vazio = manual.createProject({ name: 'On-Premise ACME', createdBy: 'adm' });
  const users = [
    { id: '1', name: 'João', role: 'admin', visibleProjects: [] },
    { id: '3', name: 'Edmar', email: 'edmar@x', role: 'client', visibleProjects: [{ id: 'd534', perfil: 'ANANIMCLOUD_ECOA', name: 'sa-brazil-1_Ecoa' }] },
    { id: '4', name: 'Outro', email: 'o@x', role: 'client', visibleProjects: [{ id: 'zzz', perfil: 'X', name: 'Outro' }] },
  ];

  const lista = clientsOverview({ store, manual, users, now: Date.now() });
  assert.deepEqual(lista.map((c) => c.name), ['Ecoa', 'On-Premise ACME']);
  const ecoa = lista[0];
  assert.equal(ecoa.projectKey, 'ANANIMCLOUD_ECOA-d534');
  assert.equal(ecoa.servers.length, 1);
  assert.deepEqual({ ...ecoa.servers[0], lastSeen: undefined }, { agentId: AGENT, ecsName: 'ECOAWEB', os: 'windows', online: true, agentVersion: 'v1',
    lastSeen: undefined, serviceCount: 3, releasedCount: 2 });
  assert.deepEqual(ecoa.users, [{ id: '3', name: 'Edmar', email: 'edmar@x', grantedCount: 2 }]);
  assert.equal(lista[1].projectKey, vazio.id);
  assert.equal(lista[1].manual, true);
  assert.deepEqual(lista[1].servers, []);
});
