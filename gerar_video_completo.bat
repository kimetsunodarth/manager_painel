@echo off
echo =======================================================
echo Iniciando Geracao de Video Premium do Ananim Manager
echo =======================================================
echo.

echo [1] Iniciando o Backend...
start "Ananim Backend" cmd /c "cd backend && npm start"
timeout /t 3 /nobreak > nul

echo [2] Iniciando o Frontend...
start "Ananim Frontend" cmd /c "cd frontend && npm run dev"
timeout /t 10 /nobreak > nul

echo [3] Instalando dependencias do video e Playwright...
cd ananim-video
call npm install
call npx playwright install chromium

echo.
echo [4] Capturando as telas reais do painel...
call node capture.js

echo.
echo [5] Iniciando o video no navegador!
call npm run dev
