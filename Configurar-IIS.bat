@echo off
:: Configura o site ananim-manager-painel no IIS (porta 8890).
:: Se nao estiver como Administrador, solicita elevacao.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permissoes de Administrador...
    powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "APP_DIR=%~dp0"
set "APP_DIR=%APP_DIR:~0,-1%"

echo.
echo Configurando IIS para Ananim Manager Painel...
echo Pasta do app: %APP_DIR%
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%\Setup-IIS.ps1" -SitePath "%APP_DIR%"

echo.
pause
