@echo off
cd /d "%~dp0"
if not exist "backend\venv" (
    echo Criando ambiente virtual...
    python -m venv backend\venv
    call backend\venv\Scripts\pip.exe install -r backend\requirements.txt -q
)
echo Iniciando API em http://localhost:5000
backend\venv\Scripts\python.exe backend\app.py
pause
