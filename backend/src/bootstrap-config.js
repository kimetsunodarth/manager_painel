/**
 * Carrega config.enc (ou .env) e preenche process.env ANTES de qualquer módulo
 * que use JWT_SECRET (ex.: middleware/auth.js). Deve ser importado no index
 * logo após bootstrap-pkg.js.
 */
import path from 'path';
import { join } from 'path';
import { existsSync } from 'fs';
import dotenv from 'dotenv';
import { getAppRoot } from './appRoot.js';

if (typeof process.pkg !== 'undefined' && process.execPath) {
  try {
    process.chdir(path.dirname(process.execPath));
  } catch (e) {
    console.error('[Ananim] Erro ao definir cwd:', e && e.message);
  }
}

const appRoot = getAppRoot();
const envPath = join(appRoot, '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
  if (!process.env.CONTROL_CENTER_ROLAND_USER) dotenv.config({ path: envPath, override: true });
}

import { loadConfig } from './config/configLoader.js';
const merged = loadConfig();
for (const [k, v] of Object.entries(merged)) {
  if (v !== undefined && v !== null && String(v).trim() !== '') process.env[k] = v;
}
