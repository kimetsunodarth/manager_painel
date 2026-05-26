@echo off
cd /d "%~dp0"
set "NODE="
set "NPM="

rem 1) PATH
where node >nul 2>nul && set "NODE=node" && set "NPM=npm" && goto :run

rem 2) Program Files (instalacao padrao do winget/installer)
if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE=%ProgramFiles%\nodejs\node.exe"
  set "NPM=%ProgramFiles%\nodejs\npm.cmd"
  goto :run
)
if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
  set "NODE=%ProgramFiles(x86)%\nodejs\node.exe"
  set "NPM=%ProgramFiles(x86)%\nodejs\npm.cmd"
  goto :run
)

rem 3) AppData (instalacao pelo usuario)
if exist "%LOCALAPPDATA%\Programs\node\node.exe" (
  set "NODE=%LOCALAPPDATA%\Programs\node\node.exe"
  set "NPM=%LOCALAPPDATA%\Programs\node\npm.cmd"
  goto :run
)

echo Node.js nao encontrado.
echo.
echo Se acabou de instalar (winget ou site), FECHE e ABRA de novo o terminal.
echo Ou instale em: https://nodejs.org/
pause
exit /b 1

:run
if not exist "node_modules" (
  echo Instalando dependencias...
  "%NPM%" install
  if errorlevel 1 ( pause & exit /b 1 )
)
echo API rodando em http://localhost:5000
"%NODE%" server.js
pause
