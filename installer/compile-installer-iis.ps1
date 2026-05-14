# Compila o instalador IIS com Inno Setup (iscc.exe).
# Gera tambem os dois exe GUI (Abrir Painel, Configurar IIS) e inclui no pacote.
# Requer: 1) Pacote gerado: .\installer\build-package-iis.ps1  2) Inno Setup 6 instalado
# Execute na raiz do projeto: .\installer\compile-installer-iis.ps1
# Ou de dentro de installer: .\compile-installer-iis.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageIis = Join-Path $scriptDir "package-iis"
$packageIisTmp = Join-Path $scriptDir "package-iis-tmp"
$exeInPackage = Join-Path $packageIis "Ananim-Manager-Painel-API.exe"
$exeInTmp = Join-Path $packageIisTmp "Ananim-Manager-Painel-API.exe"
$issPath = Join-Path $scriptDir "installer-iis.iss"
$guiLaunchersDir = Join-Path $scriptDir "gui-launchers"
$rootDir = Split-Path -Parent $scriptDir
$verFile = Join-Path $rootDir "VERSION"
$appVersion = "0.0.0"
if (Test-Path $verFile) {
  try { $appVersion = (Get-Content $verFile -Raw).Trim() } catch { }
}

$possiblePaths = @(
  "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
)
$iscc = $null
foreach ($p in $possiblePaths) {
  if (Test-Path $p) { $iscc = $p; break }
}
if (-not $iscc) {
  Write-Host "Inno Setup 6 nao encontrado. Instale em: https://jrsoftware.org/isdl.php" -ForegroundColor Red
  Write-Host "Ou abra installer\installer-iis.iss no Inno Setup e use Build > Compile."
  exit 1
}

$sourceFolder = "package-iis"
if (Test-Path $exeInPackage) {
  $sourceFolder = "package-iis"
} elseif (Test-Path $exeInTmp) {
  Write-Host "Usando package-iis-tmp (package-iis em uso ou ausente)." -ForegroundColor Cyan
  $sourceFolder = "package-iis-tmp"
} else {
  Write-Host "Pacote IIS nao encontrado (Ananim-Manager-Painel-API.exe). Execute antes: .\installer\build-package-iis.ps1" -ForegroundColor Red
  exit 1
}

# Gerar os dois exe GUI (Abrir Painel, Configurar IIS) e copiar para o pacote
$csc = $null
$csc64 = [System.IO.Path]::Combine($env:windir, "Microsoft.NET\Framework64\v4.0.30319\csc.exe")
$csc32 = [System.IO.Path]::Combine($env:windir, "Microsoft.NET\Framework\v4.0.30319\csc.exe")
if (Test-Path $csc64) { $csc = $csc64 } elseif (Test-Path $csc32) { $csc = $csc32 }
if ($csc -and (Test-Path $guiLaunchersDir)) {
  Write-Host "Gerando exe GUI (Abrir Painel, Configurar IIS)..." -ForegroundColor Cyan
  Push-Location $guiLaunchersDir
  try {
    & $csc /nologo /target:winexe /out:Ananim-Abrir-Painel.exe AbrirPainel.cs 2>&1
    if (Test-Path "Ananim-Abrir-Painel.exe") {
      Copy-Item "Ananim-Abrir-Painel.exe" (Join-Path $scriptDir $sourceFolder) -Force
      Write-Host "  Ananim-Abrir-Painel.exe" -ForegroundColor Gray
    }
    & $csc /nologo /target:winexe /out:Ananim-Configurar-IIS.exe ConfigurarIIS.cs 2>&1
    if (Test-Path "Ananim-Configurar-IIS.exe") {
      Copy-Item "Ananim-Configurar-IIS.exe" (Join-Path $scriptDir $sourceFolder) -Force
      Write-Host "  Ananim-Configurar-IIS.exe" -ForegroundColor Gray
    }
  } finally {
    Pop-Location
  }
} else {
  if (-not $csc) { Write-Host "csc.exe nao encontrado; exe GUI nao serao gerados." -ForegroundColor Yellow }
}

Write-Host "Compilando instalador Inno Setup (fonte: $sourceFolder)..." -ForegroundColor Cyan
Push-Location $scriptDir
try {
  & $iscc "/DPackageDir=$sourceFolder" "/DMyAppVersion=$appVersion" $issPath
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
if ($exitCode -eq 0) {
  $outDir = Join-Path $scriptDir "Output"
  Write-Host "Instalador gerado em: $outDir" -ForegroundColor Green
  Write-Host "  Instalador: Ananim-Manager-Painel-IIS-Setup-$appVersion.exe" -ForegroundColor Gray
  Write-Host "  Exe GUI no pacote: Ananim-Abrir-Painel.exe, Ananim-Configurar-IIS.exe" -ForegroundColor Gray
  # Copiar config.enc e chave para a mesma pasta do exe Inno (para uso na instalacao)
  $backendDir = Join-Path $rootDir "backend"
  foreach ($name in @("config.enc", ".encryption_key", "key.bin")) {
    $src = Join-Path $backendDir $name
    if (Test-Path $src) {
      Copy-Item $src $outDir -Force
      Write-Host "  Copiado para Output: $name" -ForegroundColor Gray
    }
  }
}
exit $exitCode
