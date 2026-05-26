/**
 * Instalador IIS para Ananim Huawei Painel.
 * Executa Setup-IIS.ps1 com privilégios (execute este exe como Administrador).
 * Uso: node installer-iis.js [pasta_do_projeto]
 *      ou: Setup-IIS.exe [pasta_do_projeto]
 * Se não informar pasta, usa o diretório atual.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const sitePath = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

function findScript() {
  const possiblePaths = [
    path.join(__dirname, "Setup-IIS.ps1"),
    path.join(process.execPath, "..", "Setup-IIS.ps1"),
    path.join(path.dirname(process.execPath), "Setup-IIS.ps1"),
    path.join(sitePath, "Setup-IIS.ps1"),
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) return fs.realpathSync(p);
    } catch (_) {}
  }
  return null;
}

const scriptPath = findScript();
if (!scriptPath) {
  console.error("Setup-IIS.ps1 nao encontrado.");
  console.error("Coloque Setup-IIS.ps1 na mesma pasta do exe ou execute a partir da pasta do projeto.");
  process.exit(1);
}

const scriptContent = fs.readFileSync(scriptPath, "utf8");
const tmpFile = path.join(os.tmpdir(), "Setup-IIS-" + Date.now() + ".ps1");
fs.writeFileSync(tmpFile, scriptContent, "utf8");

function cleanup() {
  try { fs.unlinkSync(tmpFile); } catch (_) {}
}

const ps = spawn(
  "powershell.exe",
  ["-ExecutionPolicy", "Bypass", "-NoProfile", "-File", tmpFile, "-SitePath", sitePath],
  { stdio: "inherit", shell: false }
);

ps.on("close", (code) => {
  cleanup();
  process.exit(code !== null ? code : 0);
});

ps.on("error", (err) => {
  console.error("Erro ao executar PowerShell:", err.message);
  cleanup();
  process.exit(1);
});
