/**
 * Gera os executáveis do instalador (Windows .exe e Linux).
 * Uso: node build-exe.js
 * Requer: npm install (na raiz do projeto) para ter o pkg.
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname);
const dist = path.join(root, "dist");

if (!fs.existsSync(path.join(root, "node_modules", "pkg"))) {
  console.error("Execute primeiro: npm install");
  process.exit(1);
}

if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });

const winExe = path.join(dist, "Setup-Ananim-Panel.exe");
const linuxBin = path.join(dist, "setup-ananim-panel");

try {
  console.log("Gerando Setup-Ananim-Panel.exe (Windows)...");
  execSync(`npx pkg . --targets node18-win-x64 --output "${winExe}"`, {
    cwd: root,
    stdio: "inherit",
  });

  console.log("Gerando setup-ananim-panel (Linux)...");
  execSync(`npx pkg . --targets node18-linux-x64 --output "${linuxBin}"`, {
    cwd: root,
    stdio: "inherit",
  });

  console.log("");
  console.log("Concluído. Arquivos em: " + dist);
  console.log("  Windows: Setup-Ananim-Panel.exe (execute como Administrador na pasta do projeto)");
  console.log("  Linux:   setup-ananim-panel (chmod +x e execute na pasta do projeto)");
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
