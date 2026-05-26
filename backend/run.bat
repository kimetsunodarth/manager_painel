@echo off
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
    echo Execute primeiro setup.bat para criar o ambiente.
    pause
    exit /b 1
)
echo Iniciando API em http://localhost:5000
venv\Scripts\python.exe app.py
pause
