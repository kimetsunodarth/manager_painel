#!/usr/bin/env node
/**
 * Instalador Ananim Huawei Painel - Windows (IIS) e Linux (Node/systemd).
 * Uso: node installer.js [pasta_do_projeto]
 *      ou: Setup-Ananim-Panel.exe [pasta]  (Windows)
 *      ou: ./setup-ananim-panel [pasta]    (Linux)
 * Se não informar pasta, usa o diretório do executável (pkg) ou cwd (node).
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const isPkg = typeof process.pkg !== "undefined";
const projectRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : isPkg
    ? path.dirname(process.execPath)
    : process.cwd();

function log(msg, color) {
  console.log(msg);
}

function getSetupPs1Path() {
  const candidates = [
    path.join(__dirname, "Setup-IIS.ps1"),
    path.join(path.dirname(process.execPath), "Setup-IIS.ps1"),
    path.join(projectRoot, "Setup-IIS.ps1"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.realpathSync(p);
    } catch (_) {}
  }
  return null;
}

function runWindowsSetup() {
  const scriptPath = getSetupPs1Path();
  let scriptContent = null;
  if (scriptPath) {
    try {
      scriptContent = fs.readFileSync(scriptPath, "utf8");
    } catch (e) {
      log("Erro ao ler Setup-IIS.ps1: " + e.message, "red");
      process.exit(1);
    }
  }
  if (!scriptContent) {
    log("Setup-IIS.ps1 nao encontrado. Coloque na pasta do exe ou do projeto.");
    process.exit(1);
  }

  const tmpFile = path.join(os.tmpdir(), "Setup-IIS-" + Date.now() + ".ps1");
  fs.writeFileSync(tmpFile, scriptContent, "utf8");

  function cleanup() {
    try {
      fs.unlinkSync(tmpFile);
    } catch (_) {}
  }

  log("=== Ananim Huawei Painel - Configuracao IIS ===");
  log("Pasta do projeto: " + projectRoot);
  log("Execute este instalador como Administrador para configurar o IIS.");
  log("");

  const ps = spawn(
    "powershell.exe",
    ["-ExecutionPolicy", "Bypass", "-NoProfile", "-File", tmpFile, "-SitePath", projectRoot],
    { stdio: "inherit", shell: false }
  );

  ps.on("close", (code) => {
    cleanup();
    process.exit(code !== null ? code : 0);
  });

  ps.on("error", (err) => {
    log("Erro ao executar PowerShell: " + err.message);
    cleanup();
    process.exit(1);
  });
}

function runLinuxSetup() {
  const backendPath = path.join(projectRoot, "backend");
  const serverJs = path.join(backendPath, "server.js");
  const envPath = path.join(projectRoot, ".env");
  const envExample = path.join(projectRoot, ".env.example");

  log("=== Ananim Huawei Painel - Configuracao Linux ===");
  log("Pasta do projeto: " + projectRoot);

  if (!fs.existsSync(serverJs)) {
    log("ERRO: backend/server.js nao encontrado em " + projectRoot);
    process.exit(1);
  }

  // .env
  if (!fs.existsSync(envPath) && fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, envPath);
    log(".env criado a partir de .env.example. Edite e preencha SESSION_SECRET e credenciais.");
  } else if (!fs.existsSync(envPath)) {
    log("AVISO: .env nao existe. Crie a partir de .env.example.");
  }

  // npm install --production no backend
  log("Executando npm install --production no backend...");
  const npm = spawn("npm", ["install", "--production"], {
    cwd: backendPath,
    stdio: "inherit",
    shell: true,
  });

  npm.on("close", (code) => {
    if (code !== 0) {
      log("AVISO: npm install retornou codigo " + code);
    } else {
      log("npm install concluido.");
    }

    // Sugestão de systemd
    const port = 5000;
    const systemdContent = `[Unit]
Description=Ananim Huawei Painel
After=network.target

[Service]
Type=simple
WorkingDirectory=${backendPath}
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${port}

[Install]
WantedBy=multi-user.target
`;

    const systemdPath = path.join(projectRoot, "ananim-panel.service");
    fs.writeFileSync(systemdPath, systemdContent, "utf8");
    log("");
    log("Arquivo systemd criado: " + systemdPath);
    log("Para instalar como servico:");
    log("  sudo cp " + systemdPath + " /etc/systemd/system/");
    log("  sudo systemctl daemon-reload");
    log("  sudo systemctl enable ananim-panel");
    log("  sudo systemctl start ananim-panel");
    log("");
    log("Para rodar manualmente:");
    log("  cd " + backendPath + " && node server.js");
    log("  (ou: npx pm2 start server.js --name ananim-panel -d " + backendPath + ")");
    log("");
    log("Acesso: http://localhost:" + port);
    process.exit(code !== null && code !== 0 ? code : 0);
  });

  npm.on("error", (err) => {
    log("Erro ao executar npm: " + err.message);
    process.exit(1);
  });
}

// Main
if (os.platform() === "win32") {
  runWindowsSetup();
} else {
  runLinuxSetup();
}
