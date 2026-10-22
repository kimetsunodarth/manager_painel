import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { createAgentStore } from '../src/agent/agentStore.js';
import { canUserAct, listForUser, userCanSeeProject } from '../src/agent/agentAccess.js';

const AGENT = '11111111-1111-4111-8111-111111111111';
const jwk = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' });
const cliente = { id: 'u-ana', role: 'client', visibleProjects: [{ id: 'p1', perfil: 'RAMO', name: 'Rolandweb' }] };
const outro = { id: 'u-bia', role: 'client', visibleProjects: [{ id: 'p2', perfil: 'RAMO', name: 'Outro' }] };
const admin = { id: 'u-adm', role: 'admin', visibleProjects: [] };

function montar() {
  const store = createAgentStore(new Database(':memory:'));
  const { code } = store.issueCode({ projectKey: 'RAMO-p1', projectName: 'Rolandweb', ecsId: 'ecs-1', ecsName: 'ROLAND-WEB01', createdBy: 'adm' });
  store.activate({ code, agentId: AGENT, jwk, hostname: 'h', os: 'windows', agentVersion: 'v1' });
  store.saveCatalog(AGENT, [
    { name: 'B1iService', displayName: 'SAP B1i', status: 'Running', startType: 'Automatic' },
    { name: 'Spooler', displayName: 'Print Spooler', status: 'Running', startType: 'Automatic' },
  ], 'v1');
  store.setReleases(AGENT, [{ serviceName: 'B1iService', label: 'SAP B1i', actions: ['start', 'restart'] }, { serviceName: 'Spooler', label: 'Impressão', actions: ['restart'] }]);
  store.setGrants('u-ana', AGENT, ['B1iService']);
  return store;
}

test('projeto visivel: admin sempre; cliente so pelo visibleProjects', () => {
  assert.equal(userCanSeeProject(admin, 'RAMO-p1'), true);
  assert.equal(userCanSeeProject(cliente, 'RAMO-p1'), true);
  assert.equal(userCanSeeProject(outro, 'RAMO-p1'), false);
});

test('cliente so age em servico com acesso e acao liberada', () => {
  const store = montar();
  const agent = store.getAgent(AGENT);
  const ctx = { releases: store.getReleases(AGENT), grants: store.getGrants('u-ana') };
  assert.equal(canUserAct(cliente, agent, ctx.releases, ctx.grants, 'B1iService', 'restart'), true);
  assert.equal(canUserAct(cliente, agent, ctx.releases, ctx.grants, 'B1iService', 'stop'), false, 'acao nao liberada');
  assert.equal(canUserAct(cliente, agent, ctx.releases, ctx.grants, 'Spooler', 'restart'), false, 'sem acesso ao servico');
  assert.equal(canUserAct(outro, agent, ctx.releases, store.getGrants('u-bia'), 'B1iService', 'restart'), false, 'outro projeto');
  assert.equal(canUserAct(admin, agent, ctx.releases, [], 'Spooler', 'stop'), true, 'admin age em qualquer servico descoberto');
  assert.equal(canUserAct(admin, agent, ctx.releases, [], 'WinRM', 'stop'), false, 'bloqueado nunca');
  store.revoke(AGENT);
  assert.equal(canUserAct(admin, store.getAgent(AGENT), ctx.releases, [], 'Spooler', 'stop'), false, 'agente revogado');
});

test('listagem do cliente: so os servicos com acesso e presentes no ultimo catalogo', () => {
  const store = montar();
  let lista = listForUser(cliente, store);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].ecsName, 'ROLAND-WEB01');
  assert.deepEqual(lista[0].services.map((s) => [s.serviceName, s.label, s.actions.join('+')]), [['B1iService', 'SAP B1i', 'start+restart']]);
  assert.equal(listForUser(outro, store).length, 0);
  assert.equal(listForUser(admin, store)[0].services.length, 2);
  store.saveCatalog(AGENT, [{ name: 'Spooler', displayName: 'Print Spooler', status: 'Running', startType: 'Automatic' }], 'v2');
  lista = listForUser(cliente, store);
  assert.equal(lista[0]?.services.length ?? 0, 0, 'servico sumiu da descoberta');
});

test('cliente do projeto ve o servidor com conector mesmo sem servico liberado; outro cliente nao', () => {
  const store = montar();
  store.setGrants('u-ana', AGENT, []);
  const lista = listForUser(cliente, store);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].ecsName, 'ROLAND-WEB01');
  assert.deepEqual(lista[0].services, []);
  assert.equal(listForUser(outro, store).length, 0);
});

test('liberar servico bloqueado ou acao invalida e recusado', () => {
  const store = montar();
  assert.throws(() => store.setReleases(AGENT, [{ serviceName: 'WinRM', label: 'x', actions: ['stop'] }]), /service_not_allowed/);
  assert.throws(() => store.setReleases(AGENT, [{ serviceName: 'Spooler', label: 'x', actions: ['delete'] }]), /invalid_action/);
  assert.throws(() => store.setGrants('u-ana', AGENT, ['NaoLiberado']), /service_not_released/);
});
