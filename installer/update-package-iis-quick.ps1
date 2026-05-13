# Atualiza apenas exe e frontend no package-iis.
# IMPORTANTE: o .exe do pkg roda com Node 18; se o better-sqlite3 estiver com ABI diferente, o IIS dá 502.3.
# Use depois de alterar backend ou frontend. Depois execute: .\installer\compile-installer-iis.ps1
# Para build completo (incl. better-sqlite3 e config.enc): .\installer\build-package-iis.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$frontend = Join-Path $rootDir "frontend"
$backend = Join-Path $rootDir "backend"
$packageIis = Join-Path $scriptDir "package-iis"

Write-Host ">>> Atualizando exe e frontend no package-iis (quick)..." -ForegroundColor Cyan

# 1) Frontend
Push-Location $frontend
if (-not (Test-Path "node_modules")) { Write-Host "Instalando deps frontend..."; npm install 2>&1 | Out-Null }
$env:VITE_API_URL = $null
Write-Host "Build frontend (vite build)..."
& npx vite build 2>&1 | Out-Null
if (-not (Test-Path "dist")) { throw "Frontend build falhou." }
Copy-Item (Join-Path $frontend "dist\*") (Join-Path $packageIis "public") -Recurse -Force
Write-Host "  OK: public/ atualizado" -ForegroundColor Green
Pop-Location

# 2) Backend (bundle + exe; rebuild better-sqlite3 para Node 18)
Push-Location $backend
if (-not (Test-Path "node_modules")) { Write-Host "Instalando deps backend..."; npm install 2>&1 | Out-Null }
Write-Host "Rebuild better-sqlite3 para Node 18 (ABI 108)..." -ForegroundColor Cyan
$ea = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
$oldTarget = $env:npm_config_target
$oldRuntime = $env:npm_config_runtime
$oldDistUrl = $env:npm_config_disturl
$oldArch = $env:npm_config_target_arch
$env:npm_config_target = "18.5.0"
$env:npm_config_runtime = "node"
$env:npm_config_target_arch = "x64"
$env:npm_config_disturl = "https://nodejs.org/download/release"
try { npm rebuild better-sqlite3 --build-from-source 2>&1 | Out-Null } finally {
  $ErrorActionPreference = $ea
  $env:npm_config_target = $oldTarget
  $env:npm_config_runtime = $oldRuntime
  $env:npm_config_disturl = $oldDistUrl
  $env:npm_config_target_arch = $oldArch
}
Write-Host "Build backend (bundle + exe)..."
& npm run build:exe 2>&1 | Out-Null
$exePath = Join-Path $backend "dist\Ananim-Manager-Painel-API.exe"
if (-not (Test-Path $exePath)) { throw "Backend exe nao gerado." }
Copy-Item $exePath (Join-Path $packageIis "Ananim-Manager-Painel-API.exe") -Force
Write-Host "  OK: Ananim-Manager-Painel-API.exe atualizado" -ForegroundColor Green
Pop-Location

# 2.5) Tools para Control Center (node.exe embarcado + worker)
$toolsDir = Join-Path $packageIis "tools"
$toolsNodeDir = Join-Path $toolsDir "node"
New-Item -ItemType Directory -Path $toolsNodeDir -Force | Out-Null
try {
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
    if ($nodeExe -and (Test-Path $nodeExe)) {
        Copy-Item $nodeExe (Join-Path $toolsNodeDir "node.exe") -Force
        Write-Host "  OK: tools\\node\\node.exe atualizado" -ForegroundColor Green
    }
} catch {}
$ccWorkerSrc = Join-Path $scriptDir "tools\\control-center-worker.cjs"
if (Test-Path $ccWorkerSrc) {
    Copy-Item $ccWorkerSrc (Join-Path $toolsDir "control-center-worker.cjs") -Force
    Write-Host "  OK: tools\\control-center-worker.cjs atualizado" -ForegroundColor Green
}

# 3) Garantir node_modules/playwright + pasta browsers (Chromium) para Ativar Support User no IIS
$playwrightRuntime = Join-Path $scriptDir "playwright-runtime"
$playwrightBrowsers = Join-Path $playwrightRuntime "browsers"
$pkgPlaywright = Join-Path $packageIis "node_modules\playwright"
$pkgBrowsers = Join-Path $packageIis "browsers"
if (-not (Test-Path $pkgPlaywright) -or -not (Test-Path $pkgBrowsers)) {
    $hasChromium = (Test-Path $playwrightBrowsers) -and ((Get-ChildItem $playwrightBrowsers -Directory -Filter "chromium*" -ErrorAction SilentlyContinue).Count -gt 0)
if (-not (Test-Path (Join-Path $playwrightRuntime "node_modules\playwright")) -or -not $hasChromium) {
        Write-Host "Preparando Playwright + Chromium (primeira vez)..." -ForegroundColor Cyan
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
    $pkgNodeModules = Join-Path $packageIis "node_modules"
    New-Item -ItemType Directory -Path $pkgNodeModules -Force | Out-Null
    Copy-Item (Join-Path $playwrightRuntime "node_modules\*") $pkgNodeModules -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $pkgBrowsers -Force | Out-Null
    if (Test-Path $playwrightBrowsers) {
        Copy-Item -Path "$playwrightBrowsers\*" -Destination $pkgBrowsers -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  OK: node_modules (playwright) + browsers (chromium) adicionado ao pacote" -ForegroundColor Green
}

Write-Host ""
Write-Host "Pacote IIS atualizado em: $packageIis" -ForegroundColor Green
Write-Host "Proximo passo: .\installer\compile-installer-iis.ps1" -ForegroundColor Cyan
