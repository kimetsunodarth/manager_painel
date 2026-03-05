# Atualiza package-iis (exe + frontend) e compila o instalador em um único passo.
# Equivalente a: .\installer\update-package-iis-quick.ps1 ; .\installer\compile-installer-iis.ps1
# Execute na raiz do projeto: .\installer\build-and-compile-iis.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

Push-Location $rootDir
try {
  & (Join-Path $scriptDir "update-package-iis-quick.ps1")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & (Join-Path $scriptDir "compile-installer-iis.ps1")
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
