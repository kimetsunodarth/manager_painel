$ErrorActionPreference = 'Stop'
# Ananim Manager Agent (Windows). .NET Framework 4.x, sem dependências externas.
$here = $PSScriptRoot
$csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$out = Join-Path $here 'dist'
New-Item -ItemType Directory -Force $out | Out-Null
& $csc /nologo /target:winexe /platform:x64 /optimize+ /out:"$out\AnanimManagerAgent.exe" /win32manifest:"$here\app.manifest" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.ServiceProcess.dll /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.Security.dll /r:System.Core.dll `
    "$here\Program.cs" "$here\Common.cs" "$here\Agent.cs" "$here\Service.cs" "$here\MainForm.cs"
if ($LASTEXITCODE -ne 0) { throw 'Compilation failed.' }
Get-FileHash "$out\AnanimManagerAgent.exe" -Algorithm SHA256 | Format-List Hash, Path
