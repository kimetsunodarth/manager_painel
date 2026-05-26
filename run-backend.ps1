# Huawei Cloud Panel - Iniciar backend
$backend = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $backend

if (-not (Test-Path "backend\venv")) {
    Write-Host "Criando ambiente virtual..."
    python -m venv backend\venv
    & backend\venv\Scripts\pip.exe install -r backend\requirements.txt -q
}
Write-Host "Iniciando API em http://localhost:5000"
& backend\venv\Scripts\python.exe backend\app.py
