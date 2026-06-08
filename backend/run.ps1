# Iniciar backend - Huawei Cloud Panel
$dir = $PSScriptRoot

if (-not (Test-Path "$dir\venv\Scripts\python.exe")) {
    Write-Host "Ambiente virtual nao encontrado. Execute primeiro: .\setup.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "Iniciando API em http://localhost:5000" -ForegroundColor Cyan
Set-Location $dir
& "$dir\venv\Scripts\python.exe" "$dir\app.py"
