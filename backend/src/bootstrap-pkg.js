/**
 * Executado primeiro no bundle: quando roda como .exe (pkg), adiciona lib/ e
 * node_modules/ ao caminho de módulos para require('better-sqlite3') e
 * import('playwright') resolverem na pasta do programa.
 */
if (typeof process.pkg !== 'undefined' && typeof require !== 'undefined') {
  const path = require('path');
  const Module = require('module');
  const cwd = process.cwd();
  const libDir = path.join(cwd, 'lib');
  const nodeModulesDir = path.join(cwd, 'node_modules');
  if (Module.globalPaths) {
    Module.globalPaths.unshift(libDir);
    Module.globalPaths.unshift(nodeModulesDir);
  }
}
