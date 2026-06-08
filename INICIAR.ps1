# Huawei Cloud Panel - Iniciar (PowerShell)
# Execute: .\INICIAR.ps1   (na pasta huawei-cloud-panel)
# Ou na pasta backend: ..\INICIAR.ps1

$root = $PSScriptRoot
if (-not $root) { $root = Get-Location | Select-Object -ExpandProperty Path }

Set-Location $root

if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "Usando Node.js..." -ForegroundColor Cyan
    Set-Location "$root\backend"
    if (-not (Test-Path "node_modules")) {
        Write-Host "Instalando dependencias (npm install)..."
        npm install
    }
    Write-Host "Iniciando API em http://localhost:5000"
    Start-Process cmd -ArgumentList '/k', "node server.js" -WorkingDirectory "$root\backend"
    Start-Sleep -Seconds 2
    Start-Process "$root\frontend\index.html"
    Write-Host "Painel aberto. API rodando em outra janela."
    return
}

if (Test-Path "$root\backend\venv\Scripts\python.exe") {
    Write-Host "Usando Python..." -ForegroundColor Cyan
    Start-Process cmd -ArgumentList '/k', "cd /d `"$root\backend`" && venv\Scripts\python.exe app.py" -WorkingDirectory $root
    Start-Sleep -Seconds 2
    Start-Process "$root\frontend\index.html"
    Write-Host "Painel aberto. API rodando em outra janela."
    return
}

Write-Host "Nenhum ambiente encontrado. Instale Node.js: https://nodejs.org/" -ForegroundColor Yellow
