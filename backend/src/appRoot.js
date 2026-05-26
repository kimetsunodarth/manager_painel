/**
 * Raiz do app e pasta config: quando rodando como .exe (pkg) usa process.cwd() e config/.
 * Em bundle CJS (pkg), import.meta.url e indefinido; nunca chamar fileURLToPath(undefined).
 */
import path from 'path';
import { fileURLToPath } from 'url';

function getDirname() {
  // Sob pkg/CJS, import.meta.url pode ser undefined; nunca usar fileURLToPath com valor indefinido
  if (typeof process !== 'undefined' && process.pkg)
    return path.dirname(process.argv[1] || process.cwd());
  try {
    const url = typeof import.meta !== 'undefined' && import.meta && import.meta.url;
    if (typeof url === 'string' && url.length > 0)
      return path.dirname(fileURLToPath(url));
  } catch (_) {}
  return path.dirname(process.argv[1] || process.cwd());
}
const __dirname = getDirname();
export function getAppRoot() {
  return typeof process.pkg !== 'undefined'
    ? process.cwd()
    : path.join(__dirname, '..');
}
/** Pasta config (src/config no dev; config/ no pacote .exe). */
export function getConfigDir() {
  return typeof process.pkg !== 'undefined'
    ? path.join(process.cwd(), 'config')
    : path.join(getAppRoot(), 'src', 'config');
}
/** Pasta data (src/data no dev; data/ no pacote .exe). */
export function getDataDir() {
  return typeof process.pkg !== 'undefined'
    ? path.join(process.cwd(), 'data')
    : path.join(getAppRoot(), 'src', 'data');
}
