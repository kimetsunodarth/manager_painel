param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$ErrorActionPreference = "Stop"

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Versao invalida: $Version (use X.Y.Z)"
}

git status --porcelain | Out-String | ForEach-Object {
  if ($_.Trim().Length -gt 0) {
    throw "Working tree nao esta limpo. Faça commit antes de criar tag."
  }
}

git tag "v$Version"
Write-Host "Tag criada: v$Version"
Write-Host "Para enviar: git push --tags"
