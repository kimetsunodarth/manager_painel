# Release / Versionamento

Este repositório usa **SemVer** (`X.Y.Z`) e um arquivo `VERSION` como **fonte única**.

## Atualizar versão

1) Bump automático:

- Patch: `node scripts/bump-version.mjs patch`
- Minor: `node scripts/bump-version.mjs minor`
- Major: `node scripts/bump-version.mjs major`

2) Definir versão manual:

- `node scripts/set-version.mjs 1.2.15`

Isso atualiza:
- `VERSION`
- `backend/package.json`
- `frontend/package.json`
- `installer/installer-iis.iss` (`MyAppVersion`)

## Gerar build (IIS)

- Pacote: `installer/build-package-iis.ps1`
- Instalador: `installer/compile-installer-iis.ps1`

## Tag de release (opcional)

Após commitar a mudança de versão:
- `pwsh scripts/release-tag.ps1 -Version 1.2.15`
- `git push --tags`

