@echo off
cd /d "%~dp0"
title Huawei Cloud Panel
echo.
echo === Iniciando Huawei Cloud Panel ===
echo.

rem 1) Tentar Node.js (na pasta backend)
where node >nul 2>nul && (
  echo Usando Node.js...
  cd backend
  if not exist "node_modules" (
    echo Instalando dependencias (npm install)...
    call npm install
  )
  echo Iniciando API em http://localhost:5000
  start "Huawei Cloud - API" cmd /k "node server.js"
  cd ..
  timeout /t 2 /nobreak >nul
  start "" "frontend\index.html"
  echo.
  echo Painel aberto no navegador. API rodando em outra janela.
  echo Para encerrar: feche a janela "Huawei Cloud - API".
  pause
  exit /b 0
)

rem 2) Tentar Python (venv no backend)
if exist "backend\venv\Scripts\python.exe" (
  echo Usando Python (venv)...
  start "Huawei Cloud - API" cmd /k "cd /d \"%~dp0backend\" && backend\venv\Scripts\python.exe app.py"
  timeout /t 2 /nobreak >nul
  start "" "frontend\index.html"
  echo Painel aberto. API rodando em outra janela.
  pause
  exit /b 0
)

echo.
echo Nenhum ambiente encontrado.
echo.
echo Instale Node.js (recomendado): https://nodejs.org/
echo   Depois execute INICIAR.bat de novo.
echo.
echo Ou instale Python e na pasta backend execute: setup.bat e run.bat
echo.
pause
exit /b 1
