# Recompila o backend (.exe), criptografa o .env (config.enc + key.bin), monta o pacote IIS e gera o instalador.
# Uso: .\Recompilar-E-Gerar-Exe.ps1
# Requer: .env na raiz (sera criptografado e incluido no instalador), Node/npm, Inno Setup 6.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=== Recompilando e gerando instalador ===" -ForegroundColor Cyan
Write-Host ""

# 1) Criptografa .env -> config.enc + key.bin; build exe; monta pacote (inclui config.enc e key.bin)
Write-Host "1/2 - Criptografando .env e gerando pacote IIS (exe + config + frontend)..." -ForegroundColor Yellow
& (Join-Path $root "build-package-iis.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host ""

# 2) Instalador Inno Setup
Write-Host "2/2 - Compilando instalador Inno Setup..." -ForegroundColor Yellow
& (Join-Path $root "installer\compile-installer-iis.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "=== Concluido ===" -ForegroundColor Green
Write-Host "  Pacote:    $root\package-iis\"
Write-Host "  Instalador: $root\installer\Output\Huawei-Cloud-Panel-IIS-Setup-1.0.0.exe"
Write-Host ""
Write-Host "Se havia .env na raiz, config.enc e key.bin estao em installer\Output\. Copie-os para a pasta do app apos instalar." -ForegroundColor Gray
