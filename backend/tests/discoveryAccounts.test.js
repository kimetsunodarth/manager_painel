import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountSnippet, extraAccountsFromConfig, accountIdFromLabel, discoveryPerfil, discoveryMasterFor } from '../src/services/discoveryAccounts.js';

test('perfil do projeto de conta nova: <CONTA>__<PROJETO>, resolvido para o perfil da conta', () => {
  assert.equal(discoveryPerfil('ANANIM_SISTEMAS', 'sa-brazil-1_Ecoa'), 'ANANIM_SISTEMAS__ECOA');
  assert.equal(discoveryPerfil('ANANIM_SISTEMAS', 'sa-brazil-1_Aguas Pratas'), 'ANANIM_SISTEMAS__AGUAS_PRATAS');
  const config = { DISCOVERY_ACCOUNT_ANANIM_SISTEMAS: 'Ananim Sistemas|sa-brazil-1' };
  assert.equal(discoveryMasterFor('ANANIM_SISTEMAS__ECOA', config), 'ANANIM_SISTEMAS_DISCOVERY');
  assert.equal(discoveryMasterFor('ANANIMCLOUD_ECOA', config), null);
  assert.equal(discoveryMasterFor('OUTRA__ECOA', config), null);
});

const valid = { label: 'Cliente Nova Conta', regions: ['sa-brazil-1'], ak: 'ABCDEFGHIJKLMNOPQRST', sk: 'a'.repeat(40), projectId: '0123456789abcdef0123456789abcdef' };

test('id da conta a partir do nome', () => {
  assert.equal(accountIdFromLabel('Cliente Nova Conta'), 'CLIENTE_NOVA_CONTA');
  assert.equal(accountIdFromLabel('Ação & Cia (SP)'), 'ACAO_CIA_SP');
});

test('monta as linhas do config.enc e lê de volta a conta extra', () => {
  const { id, snippet } = buildAccountSnippet(valid, ['RAMO_SISTEMAS']);
  assert.equal(id, 'CLIENTE_NOVA_CONTA');
  const config = Object.fromEntries(snippet.trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  assert.equal(config.CLIENTE_NOVA_CONTA_DISCOVERY_ACCESS_KEY, valid.ak);
  assert.equal(config.CLIENTE_NOVA_CONTA_DISCOVERY_PROJECT_ID, valid.projectId);
  assert.deepEqual(extraAccountsFromConfig(config), [{ id: 'CLIENTE_NOVA_CONTA', label: 'Cliente Nova Conta', profile: 'CLIENTE_NOVA_CONTA_DISCOVERY', regions: ['sa-brazil-1'] }]);
});

test('recusa campos inválidos (inclusive tentativa de injetar outra variável)', () => {
  assert.throws(() => buildAccountSnippet({ ...valid, ak: 'AKIA\nJWT_SECRET=x' }, []), /invalid_ak/);
  assert.throws(() => buildAccountSnippet({ ...valid, sk: 'curta' }, []), /invalid_sk/);
  assert.throws(() => buildAccountSnippet({ ...valid, projectId: 'xyz' }, []), /invalid_project_id/);
  assert.throws(() => buildAccountSnippet({ ...valid, regions: ['sa-brazil-1\nX=1'] }, []), /invalid_region/);
  assert.throws(() => buildAccountSnippet({ ...valid, label: 'x' }, []), /invalid_label/);
  assert.throws(() => buildAccountSnippet({ ...valid, label: 'Linha\nJWT_SECRET=x' }, []), /invalid_label/);
  assert.throws(() => buildAccountSnippet(valid, ['CLIENTE_NOVA_CONTA']), /duplicate_account/);
});
