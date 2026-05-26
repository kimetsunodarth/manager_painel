@echo off
:: Gera um SESSION_SECRET aleatorio para colar no .env
:: Usa caminho completo do PowerShell (funciona quando powershell nao esta no PATH)
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
echo.
echo Cole a linha abaixo no seu .env (substitua SESSION_SECRET=...):
echo.
"%PS%" -NoProfile -Command "$b = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $hex = [BitConverter]::ToString($b).Replace('-',''); Write-Host ('SESSION_SECRET=' + $hex) -ForegroundColor Green"
echo.
pause
