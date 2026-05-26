/**
 * Bundle do backend para um unico arquivo CJS (para depois empacotar com pkg em .exe).
 * External: better-sqlite3 (nativo), playwright (opcional, carregamento dinamico).
 */
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'app.cjs');

function readRootVersion() {
  try {
    const rootVersion = path.join(root, '..', 'VERSION');
    return String(readFileSync(rootVersion, 'utf8') || '').trim() || null;
  } catch {
    return null;
  }
}

const appVersion = readRootVersion() || '0.0.0';

await esbuild.build({
  entryPoints: [path.join(root, 'src', 'index.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  external: [
    'better-sqlite3',
    'playwright',
    'playwright-core',
    'cpu-features',
  ],
  sourcemap: false,
  minify: false,
  target: 'node18',
  banner: { js: '/* Ananim Manager Painel API - bundle */' },
}).catch(() => process.exit(1));

console.log('Bundle gerado:', out);
