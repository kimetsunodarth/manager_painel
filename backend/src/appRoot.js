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
// Cacheado no carregamento do módulo — não recalcular process.cwd() a cada chamada. Sob pkg, o
// boot (bootstrap-config.js) já fez process.chdir(dirname(process.execPath)) antes de qualquer
// módulo de negócio ser importado, então process.cwd() aqui já é a pasta certa; se o cwd do
// processo mudar por qualquer motivo depois disso, getAppRoot()/getConfigDir()/getDataDir() com
// process.cwd() "ao vivo" passariam a apontar pra outro lugar SEM avisar (ex.: credenciais
// salvas na pasta errada, sem erro) — cachear evita esse risco silencioso.
const BOOT_CWD = process.cwd();
export function getAppRoot() {
  return typeof process.pkg !== 'undefined'
    ? BOOT_CWD
    : path.join(__dirname, '..');
}
/** Pasta config (src/config no dev; config/ no pacote .exe). */
export function getConfigDir() {
  return typeof process.pkg !== 'undefined'
    ? path.join(BOOT_CWD, 'config')
    : path.join(getAppRoot(), 'src', 'config');
}
/** Pasta data (src/data no dev; data/ no pacote .exe). */
export function getDataDir() {
  return typeof process.pkg !== 'undefined'
    ? path.join(BOOT_CWD, 'data')
    : path.join(getAppRoot(), 'src', 'data');
}
