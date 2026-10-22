import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createManualProjects, isManualProjectId } from '../src/agent/manualProjects.js';

test('cria projeto manual com cara de projeto (sem perfil, só serviços)', () => {
  const store = createManualProjects(new Database(':memory:'));
  const p = store.createProject({ name: '  Cliente On-Premise  ', createdBy: 'admin@x' });
  assert.match(p.id, /^manual-[0-9a-f]{12}$/);
  assert.ok(isManualProjectId(p.id));
  assert.deepEqual(store.listProjects(), [{ id: p.id, name: 'Cliente On-Premise', perfil: null, region: null, enabled: true, manual: true, servicesOnly: true }]);
});

test('nome de projeto repetido ou vazio é recusado', () => {
  const store = createManualProjects(new Database(':memory:'));
  store.createProject({ name: 'ACME', createdBy: 'a' });
  assert.throws(() => store.createProject({ name: 'acme', createdBy: 'a' }), /duplicate_name/);
  assert.throws(() => store.createProject({ name: ' ', createdBy: 'a' }), /invalid_name/);
});

test('servidores do projeto manual', () => {
  const store = createManualProjects(new Database(':memory:'));
  const p = store.createProject({ name: 'ACME', createdBy: 'a' });
  const s = store.addServer(p.id, 'SRV-SAP01');
  assert.match(s.id, /^manual-srv-[0-9a-f]{12}$/);
  assert.deepEqual(store.listServers(p.id), [{ id: s.id, name: 'SRV-SAP01', status: 'MANUAL' }]);
  assert.throws(() => store.addServer(p.id, 'srv-sap01'), /duplicate_name/);
  assert.throws(() => store.addServer('manual-000000000000', 'X'), /not_found/);
});
