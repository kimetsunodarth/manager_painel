import test from 'node:test';
import assert from 'node:assert/strict';
import { effectivePermissions, CROSS_TENANT_PERMISSIONS } from '../src/utils/clientPermissions.js';

test('cliente nunca fica com permissões que mostram todos os clientes', () => {
  const stored = ['backups:list', 'services:*', 'ecs:*', 'huawei:projects', 'coc:schedule:toggle', 'coc:schedule:delete', 'cloud8:schedule:manage'];
  assert.deepEqual(effectivePermissions('client', stored), ['backups:list', 'services:*', 'ecs:*']);
});

test('admin e operador mantêm as permissões gravadas', () => {
  const stored = ['huawei:projects', 'coc:schedule:toggle', 'services:*'];
  assert.deepEqual(effectivePermissions('admin', stored), stored);
  assert.deepEqual(effectivePermissions('operator', stored), stored);
});

test('lista inválida vira vazia', () => {
  assert.deepEqual(effectivePermissions('client', null), []);
  assert.ok(CROSS_TENANT_PERMISSIONS.includes('huawei:projects'));
});
