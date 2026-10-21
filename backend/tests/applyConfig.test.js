import test from 'node:test';
import assert from 'node:assert/strict';
import { applyConfig } from '../src/config/applyConfig.js';

test('config.enc preenche o ambiente e ignora valores vazios', () => {
  const env = { A: '1' };
  applyConfig({ A: '2', B: 'x', C: '  ' }, env, new Set());
  assert.deepEqual(env, { A: '2', B: 'x' });
});

test('chaves protegidas (ambiente do systemd) não são sobrescritas pelo config.enc', () => {
  const env = { PORT: '5192', FRONTEND_ORIGIN: 'https://ananim-manager.ananim.com.br' };
  applyConfig({ PORT: '8890', FRONTEND_ORIGIN: 'https://antigo', JWT_SECRET: 's' }, env, new Set(['PORT', 'FRONTEND_ORIGIN']));
  assert.deepEqual(env, { PORT: '5192', FRONTEND_ORIGIN: 'https://ananim-manager.ananim.com.br', JWT_SECRET: 's' });
});
