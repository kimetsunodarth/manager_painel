@echo off
title Ananim Huawei Painel - Configuracao IIS
:: Solicita execucao como Administrador e executa Setup-IIS.ps1
:: Coloque esta pasta (com web.config, backend, frontend, Setup-IIS.ps1) no servidor e execute como Admin.

net session >nul 2>&1
if %errorLevel% == 0 goto :run
echo Solicitando permissoes de Administrador...
powershell -Command "Start-Process '%~f0' -Verb RunAs"
exit /b

:run
cd /d "%~dp0"
if not exist "web.config" (
    echo ERRO: web.config nao encontrado. Execute este arquivo na pasta raiz do projeto.
    pause
    exit /b 1
)
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0Setup-IIS.ps1" -SitePath "%~dp0"
set EXIT_CODE=%errorLevel%
if %EXIT_CODE% neq 0 pause
exit /b %EXIT_CODE%
