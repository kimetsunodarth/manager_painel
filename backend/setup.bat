@echo off
cd /d "%~dp0"
title Huawei Cloud Panel - Setup
echo.
echo === Setup Backend ===
echo.

rem Primeiro: tentar caminhos onde o Python costuma estar instalado (evita o atalho da Store)
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    goto :do_venv
)
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    goto :do_venv
)
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set "PY=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    goto :do_venv
)
if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" (
    set "PY=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    goto :do_venv
)
if exist "%ProgramFiles%\Python312\python.exe" (
    set "PY=%ProgramFiles%\Python312\python.exe"
    goto :do_venv
)
if exist "%ProgramFiles%\Python311\python.exe" (
    set "PY=%ProgramFiles%\Python311\python.exe"
    goto :do_venv
)

rem Segundo: tentar "py -3" (Python Launcher, nao abre a Store)
py -3 -c "exit(0)" 2>nul
if not errorlevel 1 (
    echo Usando: py -3
    echo.
    echo Criando ambiente virtual (venv)...
    py -3 -m venv venv
    if exist "venv\Scripts\python.exe" goto :install_deps
)

rem Terceiro: tentar "python" (pode ser o atalho da Store)
python -c "exit(0)" 2>nul
if not errorlevel 1 (
    echo Usando: python
    echo.
    echo Criando ambiente virtual (venv)...
    python -m venv venv
    if exist "venv\Scripts\python.exe" goto :install_deps
)

rem Nenhum Python funcionou
goto :no_python

:do_venv
echo Usando: %PY%
echo.
echo Criando ambiente virtual (venv)...
"%PY%" -m venv venv
if exist "venv\Scripts\python.exe" goto :install_deps
goto :no_python

:install_deps
echo Instalando dependencias...
venv\Scripts\pip.exe install -r requirements.txt -q
if errorlevel 1 (
    echo Erro ao instalar dependencias.
    pause
    exit /b 1
)
echo.
echo === Setup concluido ===
echo Para iniciar o servidor, execute: run.bat
echo.
pause
exit /b 0

:no_python
echo.
echo Python NAO esta instalado ou nao foi encontrado.
echo.
echo No Windows, "python" as vezes e so um atalho que abre a Loja.
echo Faca o seguinte:
echo.
echo   OPCAO 1 - Microsoft Store:
echo     Duplo clique em: abrir-store-python.bat
echo     Instale "Python 3.12". Depois FECHE e ABRA o PowerShell e rode setup.bat de novo.
echo.
echo   OPCAO 2 - Site oficial (recomendado):
echo     1. Abra: https://www.python.org/downloads/
echo     2. Baixe e instale. MARQUE "Add python.exe to PATH".
echo     3. Desative o atalho da Loja: Configuracoes ^> Apps ^> Apps executaveis ^> desligue "python.exe".
echo     4. Feche e abra o PowerShell e rode setup.bat de novo.
echo.
pause
exit /b 1
