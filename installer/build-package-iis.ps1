# Pacote IIS igual ao Huawei Cloud Panel: apenas .exe + public + lib + logs + scripts.
# NAO inclui: backend, api, config, data, iisnode, node_modules na raiz.
# config/ e data/ sao criados em tempo de execucao; better-sqlite3 fica em lib/node_modules.
# Uso: .\installer\build-package-iis.ps1   Depois: .\installer\compile-installer-iis.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$frontend = Join-Path $rootDir "frontend"
$backend = Join-Path $rootDir "backend"
$packageIis = Join-Path $scriptDir "package-iis"
$packageIisTmp = Join-Path $scriptDir "package-iis-tmp"
$iisDir = Join-Path $scriptDir "iis"

Write-Host "Raiz do projeto: $rootDir"
Write-Host "Pacote IIS (como Huawei): exe + public + lib + logs (sem config, data, node_modules, iisnode)"

# 1) Build do frontend
Push-Location $frontend
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias do frontend..."
    npm install 2>&1 | Out-Null
}
$env:VITE_API_URL = $null
$versionFile = Join-Path $rootDir "VERSION"
if (Test-Path $versionFile) {
    try {
        $env:VITE_APP_VERSION = (Get-Content $versionFile -Raw).Trim()
        Write-Host "Versao do app (VITE_APP_VERSION): $env:VITE_APP_VERSION" -ForegroundColor Gray
    } catch { }
}
Write-Host "Build do frontend (API em /api)..."
$ea = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
try { & npm exec -- vite build 2>&1 | Out-Null } finally { $ErrorActionPreference = $ea }
if (-not (Test-Path "dist")) { throw "Frontend build falhou - pasta dist nao criada." }
Pop-Location

# 1.5) Gerar config.enc e chave no backend (para copiar para Output apos compile)
Push-Location $backend
Write-Host "Gerando config.enc e chave (gerar-jwt-e-enc)..."
$ea = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
try { node scripts/gerar-jwt-e-enc.js 2>&1 | Out-Null } finally { $ErrorActionPreference = $ea }
Pop-Location

# 2) Build do backend: bundle + .exe
Push-Location $backend
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias do backend..."
    npm install 2>&1 | Out-Null
}

Write-Host "Rebuild better-sqlite3 para Node 18 (ABI 108) — necessario para o .exe (pkg) no IIS..." -ForegroundColor Cyan
$ea = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
$oldTarget = $env:npm_config_target
$oldRuntime = $env:npm_config_runtime
$oldDistUrl = $env:npm_config_disturl
$oldArch = $env:npm_config_target_arch
$env:npm_config_target = "18.5.0"
$env:npm_config_runtime = "node"
$env:npm_config_target_arch = "x64"
$env:npm_config_disturl = "https://nodejs.org/download/release"
try {
    npm rebuild better-sqlite3 --build-from-source 2>&1 | Out-Null
} finally {
    $ErrorActionPreference = $ea
    $env:npm_config_target = $oldTarget
    $env:npm_config_runtime = $oldRuntime
    $env:npm_config_disturl = $oldDistUrl
    $env:npm_config_target_arch = $oldArch
}

Write-Host "Build do backend (bundle + exe)..."
$ea = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
try { npm run build:exe 2>&1 | Out-Null } finally { $ErrorActionPreference = $ea }
$exePath = Join-Path $backend "dist\Ananim-Manager-Painel-API.exe"
if (-not (Test-Path $exePath)) { throw "Backend exe nao gerado. Execute no backend: npm run build:exe" }

Write-Host "Build do Descriptografar-Logs.exe..."
$ea = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
try { npm run build:decrypt-logs 2>&1 | Out-Null } finally { $ErrorActionPreference = $ea }
$decryptExePath = Join-Path $backend "dist\Descriptografar-Logs.exe"
if (-not (Test-Path $decryptExePath)) { throw "Descriptografar-Logs.exe nao gerado. Execute no backend: npm run build:decrypt-logs" }
Pop-Location

# 3) Montar pacote (sem api/ nem backend/)
if (Test-Path $packageIisTmp) { Remove-Item $packageIisTmp -Recurse -Force }
New-Item -ItemType Directory -Path $packageIisTmp -Force | Out-Null

# .exe na raiz
Copy-Item $exePath (Join-Path $packageIisTmp "Ananim-Manager-Painel-API.exe") -Force
Write-Host "Copiado: Ananim-Manager-Painel-API.exe"
Copy-Item $decryptExePath (Join-Path $packageIisTmp "Descriptografar-Logs.exe") -Force
Write-Host "Copiado: Descriptografar-Logs.exe"

# lib/node_modules para dependencias nativas/externalizadas do exe
$pkgLib = Join-Path $packageIisTmp "lib"
$pkgLibNodeModules = Join-Path $pkgLib "node_modules"
New-Item -ItemType Directory -Path $pkgLibNodeModules -Force | Out-Null
$runtimePackages = @(
    "better-sqlite3",
    "ssh2",
    "asn1",
    "bcrypt-pbkdf"
)
foreach ($runtimePackage in $runtimePackages) {
    $srcPackage = Join-Path $backend "node_modules\$runtimePackage"
    if (Test-Path $srcPackage) {
        Copy-Item $srcPackage (Join-Path $pkgLibNodeModules $runtimePackage) -Recurse -Force
        Write-Host "Copiado: lib/node_modules/$runtimePackage"
    }
}

# config.enc e .encryption_key (obrigatorio para JWT em producao)
foreach ($cfg in @("config.enc", ".encryption_key", "key.bin")) {
  $src = Join-Path $backend $cfg
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $packageIisTmp $cfg) -Force
    Write-Host "Copiado: $cfg"
  }
}

# public/ = frontend build
$publicDir = Join-Path $packageIisTmp "public"
New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
Copy-Item (Join-Path $frontend "dist\*") $publicDir -Recurse -Force
Write-Host "Copiado: public/"

# Copiar configuracoes estaticas de clientes (essencial para o funcionamento correto)
$pkgConfig = Join-Path $packageIisTmp "config"
New-Item -ItemType Directory -Path $pkgConfig -Force | Out-Null
foreach ($sub in @("hana-clients", "sql-clients")) {
    $src = Join-Path $backend "src\config\$sub"
    if (Test-Path $src) {
        Copy-Item $src $pkgConfig -Recurse -Force
        Write-Host "Copiado: config/$sub" -ForegroundColor Cyan
    }
}

# NAO copiar data/, iisnode/, node_modules/ (app cria data em tempo de execucao)

# logs/ (HttpPlatformHandler; app cria data/ ao iniciar)
New-Item -ItemType Directory -Path (Join-Path $packageIisTmp "logs") -Force | Out-Null
Set-Content -Path (Join-Path $packageIisTmp "logs\.gitkeep") -Value "" -Encoding ASCII

# web.config (aponta para o .exe)
Copy-Item (Join-Path $iisDir "web.config") (Join-Path $packageIisTmp "web.config") -Force

# Scripts e README
Copy-Item (Join-Path $rootDir "Setup-IIS.ps1") (Join-Path $packageIisTmp "Setup-IIS.ps1") -Force
Copy-Item (Join-Path $rootDir "Configurar-IIS.bat") (Join-Path $packageIisTmp "Configurar-IIS.bat") -Force

# Tools (Playwright no IIS/.exe): node.exe embarcado + worker do Control Center
$toolsDir = Join-Path $packageIisTmp "tools"
$toolsNodeDir = Join-Path $toolsDir "node"
New-Item -ItemType Directory -Path $toolsNodeDir -Force | Out-Null

try {
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
    if ($nodeExe -and (Test-Path $nodeExe)) {
        Copy-Item $nodeExe (Join-Path $toolsNodeDir "node.exe") -Force
        Write-Host "Copiado: tools\\node\\node.exe (runtime para Playwright)" -ForegroundColor Green
    }
} catch {
    Write-Host "Aviso: node.exe não encontrado para copiar (Playwright pode não funcionar no .exe)." -ForegroundColor Yellow
}

$ccWorkerSrc = Join-Path $scriptDir "tools\\control-center-worker.cjs"
if (Test-Path $ccWorkerSrc) {
    Copy-Item $ccWorkerSrc (Join-Path $toolsDir "control-center-worker.cjs") -Force
    Write-Host "Copiado: tools\\control-center-worker.cjs" -ForegroundColor Green
} else {
    Write-Host "Aviso: worker Control Center não encontrado em $ccWorkerSrc" -ForegroundColor Yellow
}

$configReadme = "Ananim Manager Painel - veja IIS-DEPLOY.md, backend/SECURITY.md e use Configurar-IIS.bat para configurar o site."
Set-Content -Path (Join-Path $packageIisTmp "CONFIG-README.txt") -Value $configReadme -Encoding UTF8

# 4) Remover pastas que NAO devem ir na instalacao (caso tenham sido criadas por engano)
foreach ($dir in @('data', 'iisnode', 'node_modules_old')) {
    $p = Join-Path $packageIisTmp $dir
    if (Test-Path $p) {
        Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Removido do pacote: $dir" -ForegroundColor Yellow
    }
}

# 4.5) Incluir Playwright + Chromium para "Ativar Support User" na instalacao IIS
$playwrightRuntime = Join-Path $scriptDir "playwright-runtime"
$playwrightBrowsers = Join-Path $playwrightRuntime "browsers"
$playwrightPkg = Join-Path $playwrightRuntime "node_modules\playwright"
$hasChromium = (Test-Path $playwrightBrowsers) -and ((Get-ChildItem $playwrightBrowsers -Directory -Filter "chromium*" -ErrorAction SilentlyContinue).Count -gt 0)
if (-not (Test-Path $playwrightPkg) -or -not $hasChromium) {
    Write-Host "Preparando Playwright + Chromium (primeira vez pode demorar)..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $playwrightRuntime -Force | Out-Null
    New-Item -ItemType Directory -Path $playwrightBrowsers -Force | Out-Null
    Push-Location $playwrightRuntime
    $oldPwPath = $env:PLAYWRIGHT_BROWSERS_PATH
    $env:PLAYWRIGHT_BROWSERS_PATH = $playwrightBrowsers
    npm init -y 2>&1 | Out-Null
    npm install playwright 2>&1 | Out-Null
    npx playwright install chromium 2>&1 | Out-Null
    $env:PLAYWRIGHT_BROWSERS_PATH = $oldPwPath
    Pop-Location
}
$pkgNodeModules = Join-Path $packageIisTmp "node_modules"
New-Item -ItemType Directory -Path $pkgNodeModules -Force | Out-Null
Copy-Item (Join-Path $playwrightRuntime "node_modules\*") $pkgNodeModules -Recurse -Force -ErrorAction SilentlyContinue
$pkgBrowsers = Join-Path $packageIisTmp "browsers"
New-Item -ItemType Directory -Path $pkgBrowsers -Force | Out-Null
if (Test-Path $playwrightBrowsers) {
    Copy-Item -Path "$playwrightBrowsers\*" -Destination $pkgBrowsers -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "Copiado: node_modules (playwright) + browsers (chromium)" -ForegroundColor Green

# 5) Substituir package-iis
Write-Host "Substituindo pasta package-iis..."
try {
    if (Test-Path $packageIis) { Remove-Item $packageIis -Recurse -Force -ErrorAction Stop }
    Rename-Item -Path $packageIisTmp -NewName "package-iis" -ErrorAction Stop
} catch {
    Write-Host "Pasta package-iis em uso. Pacote atualizado ficou em: $packageIisTmp" -ForegroundColor Yellow
    Write-Host "O compile-installer-iis.ps1 agora detecta automaticamente a pasta mais nova e pode usar package-iis-tmp." -ForegroundColor Yellow
    exit 0
}

Write-Host "Pacote IIS preparado em: $packageIis (exe + public + lib + logs, sem config/data/node_modules)" -ForegroundColor Green
Write-Host "Proximo passo: .\installer\compile-installer-iis.ps1"
exit 0
