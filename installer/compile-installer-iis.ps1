# Compila o instalador IIS com Inno Setup (iscc.exe).
# Requer: 1) Pacote gerado (na raiz): .\build-package-iis.ps1  2) Inno Setup 6 instalado
# Execute na raiz do projeto: .\installer\compile-installer-iis.ps1
# Ou de dentro de installer: .\compile-installer-iis.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$packageIis = Join-Path $rootDir "package-iis"
$exePath = Join-Path $packageIis "Huawei-Cloud-Panel-API.exe"
$issPath = Join-Path $scriptDir "installer-iis.iss"

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
  Write-Host "Ou abra installer-iis.iss no Inno Setup e use Build > Compile."
  exit 1
}

if (-not (Test-Path $exePath)) {
  Write-Host "Pacote IIS nao encontrado. Execute antes (na raiz do projeto): .\build-package-iis.ps1" -ForegroundColor Red
  exit 1
}

Write-Host "Compilando instalador Inno Setup..." -ForegroundColor Cyan
Push-Location $scriptDir
try {
  & $iscc $issPath
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
if ($exitCode -eq 0) {
  $outDir = Join-Path $scriptDir "Output"
  Write-Host "Instalador gerado em: $outDir" -ForegroundColor Green
  # Copiar config.enc e key.bin para a pasta do instalador (ao lado do .exe gerado) - NAO vao dentro do setup
  $configEnc = Join-Path $packageIis "config.enc"
  $keyBin = Join-Path $packageIis "key.bin"
  if (Test-Path $configEnc) {
    Copy-Item $configEnc (Join-Path $outDir "config.enc") -Force
    Write-Host "  config.enc copiado para $outDir (copie para a pasta do app apos instalar)" -ForegroundColor Gray
  }
  if (Test-Path $keyBin) {
    Copy-Item $keyBin (Join-Path $outDir "key.bin") -Force
    Write-Host "  key.bin copiado para $outDir (copie para a pasta do app apos instalar)" -ForegroundColor Gray
  }
  $logoEnc = Join-Path $packageIis "logo.enc"
  if (Test-Path $logoEnc) {
    Copy-Item $logoEnc (Join-Path $outDir "logo.enc") -Force
    Write-Host "  logo.enc copiado para $outDir (opcional: copie para a pasta do app se quiser logo criptografado)" -ForegroundColor Gray
  }
}
exit $exitCode
