@echo off
:: Cria o site huawei-cloud-panel no IIS (porta 8080).
:: Se nao estiver como Administrador, solicita elevacao automaticamente.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permissoes de Administrador...
    powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "APP_DIR=%~dp0"
set "APP_DIR=%APP_DIR:~0,-1%"

echo.
echo Configurando IIS para Huawei Cloud Panel...
echo Pasta do app: %APP_DIR%
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%\Setup-IIS.ps1" -AppPath "%APP_DIR%"

echo.
pause
