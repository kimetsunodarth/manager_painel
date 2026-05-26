@echo off
:: Chamado pelo instalador apos copiar os arquivos. Configura o site no IIS (porta 8088).
set "APP=%~dp0"
set "APP=%APP:~0,-1%"
cd /d "%APP%"
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%APP%\Setup-IIS.ps1" -AppPath "%APP%"
echo.
pause
