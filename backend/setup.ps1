# Setup do backend - Huawei Cloud Panel
# Execute: .\setup.ps1

$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot

# Usar 'py' (Python Launcher) se 'python' nao estiver no PATH
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) { $pythonCmd = "python" }
elseif (Get-Command py -ErrorAction SilentlyContinue) { $pythonCmd = "py" }
else {
    Write-Host "Python nao encontrado. Instale em https://www.python.org/downloads/ ou use a Microsoft Store." -ForegroundColor Red
    exit 1
}

Write-Host "Usando: $pythonCmd" -ForegroundColor Cyan
Write-Host "Criando ambiente virtual em $dir\venv ..."
& $pythonCmd -m venv "$dir\venv"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Instalando dependencias..."
& "$dir\venv\Scripts\pip.exe" install -r "$dir\requirements.txt" -q
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Setup concluido. Para iniciar o servidor:" -ForegroundColor Green
Write-Host "  .\venv\Scripts\python.exe app.py" -ForegroundColor Yellow
Write-Host "  ou execute: .\run.ps1" -ForegroundColor Yellow
