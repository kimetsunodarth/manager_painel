import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { getConfigDir, getDataDir, getAppRoot } from '../src/appRoot.js';

test('pastas de estado podem morar fora da release (ANANIM_CONFIG_DIR / ANANIM_DATA_DIR)', () => {
  process.env.ANANIM_CONFIG_DIR = '/opt/ananim/ananim-manager-painel/shared/config';
  process.env.ANANIM_DATA_DIR = '/opt/ananim/ananim-manager-painel/shared/data';
  try {
    assert.equal(getConfigDir(), '/opt/ananim/ananim-manager-painel/shared/config');
    assert.equal(getDataDir(), '/opt/ananim/ananim-manager-painel/shared/data');
  } finally {
    delete process.env.ANANIM_CONFIG_DIR;
    delete process.env.ANANIM_DATA_DIR;
  }
});

test('sem as variáveis, mantém src/config e src/data', () => {
  assert.equal(getConfigDir(), path.join(getAppRoot(), 'src', 'config'));
  assert.equal(getDataDir(), path.join(getAppRoot(), 'src', 'data'));
});
