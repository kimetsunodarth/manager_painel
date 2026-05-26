# Gera Setup-IIS.exe a partir de Setup-IIS.ps1 usando o modulo ps2exe.
# Execute em PowerShell: .\Gerar-Setup-IIS-Exe.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$inputFile = Join-Path $scriptDir "Setup-IIS.ps1"
$outputFile = Join-Path $scriptDir "Setup-IIS.exe"

if (-not (Test-Path $inputFile)) {
    Write-Error "Setup-IIS.ps1 nao encontrado em $scriptDir"
    exit 1
}

if (-not (Get-Module -ListAvailable -Name ps2exe)) {
    Write-Host "Instalando modulo ps2exe (necessario uma vez)..." -ForegroundColor Yellow
    Install-Module -Name ps2exe -Scope CurrentUser -Force
}

Write-Host "Gerando Setup-IIS.exe..." -ForegroundColor Green
Invoke-ps2exe -inputFile $inputFile -outputFile $outputFile -noConsole
Write-Host "Concluido: $outputFile" -ForegroundColor Green
Write-Host "Execute Setup-IIS.exe como Administrador na pasta do projeto." -ForegroundColor Gray
