import test from 'node:test';
import assert from 'node:assert/strict';
import { matchServer } from '../src/agent/findServer.js';

const vms = [{ id: 'e1', name: 'ECOAWEB' }, { id: 'e2', name: 'ECOA-SAPHANA-PRODUCAO' }, { id: 'e3', name: 'CLIENTE-APP-SERVIDOR-01' }, { id: 'e4', name: 'CLIENTE-APP-SERVIDOR-02' }];

test('nome igual (sem diferenciar maiúsculas)', () => {
  assert.deepEqual(matchServer(vms, 'ecoaweb'), { id: 'e1', name: 'ECOAWEB' });
});

test('nome do Windows cortado em 15 caracteres, quando só uma VM bate', () => {
  assert.deepEqual(matchServer(vms, 'ECOA-SAPHANA-PR'), { id: 'e2', name: 'ECOA-SAPHANA-PRODUCAO' });
  assert.equal(matchServer(vms, 'CLIENTE-APP-SER'), null, 'duas VMs começam igual: fica para o admin escolher');
  assert.equal(matchServer(vms, 'OUTRO'), null);
});
