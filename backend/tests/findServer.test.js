import test from 'node:test';
import assert from 'node:assert/strict';
import { matchServer, findServerAnywhere } from '../src/agent/findServer.js';

test('instalador geral: procura a VM de mesmo nome nos projetos dos clientes', async () => {
  const projetos = [{ projectKey: 'A-1', projectId: '1' }, { projectKey: 'B-2', projectId: '2' }, { projectKey: 'C-3', projectId: '3' }];
  const vmsPorProjeto = { 1: [{ id: 'x', name: 'OUTRA' }], 2: [{ id: 'w', name: 'BRADOWEB' }], 3: [] };
  const finder = async (p, h) => matchServer(vmsPorProjeto[p.projectId], h);
  assert.deepEqual(await findServerAnywhere('bradoweb', projetos, finder), { projeto: projetos[1], ecs: { id: 'w', name: 'BRADOWEB' } });
  assert.equal(await findServerAnywhere('NADA', projetos, finder), null);
  const duplicado = { 1: [{ id: 'a', name: 'SRV' }], 2: [{ id: 'b', name: 'SRV' }], 3: [] };
  assert.equal(await findServerAnywhere('SRV', projetos, async (p, h) => matchServer(duplicado[p.projectId], h)), null, 'ambíguo: admin escolhe');
  const comErro = async (p, h) => { if (p.projectId === '1') throw new Error('sem permissão'); return finder(p, h); };
  assert.deepEqual((await findServerAnywhere('BRADOWEB', projetos, comErro)).ecs.id, 'w', 'projeto com erro não impede os outros');
});

const vms = [{ id: 'e1', name: 'ECOAWEB' }, { id: 'e2', name: 'ECOA-SAPHANA-PRODUCAO' }, { id: 'e3', name: 'CLIENTE-APP-SERVIDOR-01' }, { id: 'e4', name: 'CLIENTE-APP-SERVIDOR-02' }];

test('nome igual (sem diferenciar maiúsculas)', () => {
  assert.deepEqual(matchServer(vms, 'ecoaweb'), { id: 'e1', name: 'ECOAWEB' });
});

test('nome do Windows cortado em 15 caracteres, quando só uma VM bate', () => {
  assert.deepEqual(matchServer(vms, 'ECOA-SAPHANA-PR'), { id: 'e2', name: 'ECOA-SAPHANA-PRODUCAO' });
  assert.equal(matchServer(vms, 'CLIENTE-APP-SER'), null, 'duas VMs começam igual: fica para o admin escolher');
  assert.equal(matchServer(vms, 'OUTRO'), null);
});
