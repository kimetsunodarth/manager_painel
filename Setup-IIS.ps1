<#
.SYNOPSIS
    Configura o IIS para executar o Ananim Huawei Painel (iisnode).
.DESCRIPTION
    Cria App Pool, Site, permissões e executa npm install no backend.
    Execute como Administrador. Requer IIS, URL Rewrite e iisnode instalados.
.PARAMETER SitePath
    Pasta raiz do projeto (onde estão web.config, backend, frontend).
.PARAMETER SiteName
    Nome do site no IIS.
.PARAMETER AppPoolName
    Nome do pool de aplicativos.
.PARAMETER Port
    Porta HTTP do site (ex: 80).
.PARAMETER InstallIIS
    Se presente, tenta habilitar recursos do IIS (Web-Server básico).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$SitePath = (Get-Location).Path,
    [string]$SiteName = "Ananim Huawei Painel",
    [string]$AppPoolName = "AnanimPanel",
    [int]$Port = 80,
    [switch]$InstallIIS
)

$ErrorActionPreference = "Stop"

# Verificar administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERRO: Execute como Administrador (clique direito -> Executar como administrador)." -ForegroundColor Red
    exit 1
}

$SitePath = $SitePath.TrimEnd("\")
if (-not (Test-Path $SitePath)) {
    Write-Host "ERRO: Pasta nao encontrada: $SitePath" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $SitePath "web.config"))) {
    Write-Host "ERRO: web.config nao encontrado em $SitePath" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $SitePath "backend\server.js"))) {
    Write-Host "ERRO: backend\server.js nao encontrado em $SitePath" -ForegroundColor Red
    exit 1
}

Write-Host "=== Ananim Huawei Painel - Configuracao IIS ===" -ForegroundColor Cyan
Write-Host "Pasta do site: $SitePath"
Write-Host "Site: $SiteName | Pool: $AppPoolName | Porta: $Port"
Write-Host ""

# Opcional: habilitar IIS
if ($InstallIIS) {
    Write-Host "Habilitando recursos do IIS..." -ForegroundColor Yellow
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole -NoRestart -ErrorAction SilentlyContinue
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer -NoRestart -ErrorAction SilentlyContinue
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-CommonHttpFeatures -NoRestart -ErrorAction SilentlyContinue
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-ApplicationDevelopment -NoRestart -ErrorAction SilentlyContinue
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-HealthAndDiagnostics -NoRestart -ErrorAction SilentlyContinue
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpErrors -NoRestart -ErrorAction SilentlyContinue
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-ASPNET45 -NoRestart -ErrorAction SilentlyContinue
    Write-Host "Recursos do IIS habilitados. Reinicie o computador se solicitado." -ForegroundColor Green
}

# Verificar módulos IIS (iisnode e URL Rewrite)
Import-Module WebAdministration -ErrorAction SilentlyContinue
if (-not (Get-Module WebAdministration)) {
    Write-Host "AVISO: Modulo WebAdministration nao carregado. Instale o IIS e as Ferramentas de Gerenciamento." -ForegroundColor Yellow
}

$appCmd = "$env:SystemRoot\System32\inetsrv\appcmd.exe"
if (-not (Test-Path $appCmd)) {
    Write-Host "ERRO: IIS nao encontrado (appcmd inexistente). Instale o IIS primeiro." -ForegroundColor Red
    exit 1
}

# Remover site e pool existentes com o mesmo nome (reconfigurar)
& $appCmd list apppool /name:$AppPoolName 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Removendo pool existente: $AppPoolName"
    & $appCmd delete apppool /apppool.name:$AppPoolName
}
& $appCmd list site /name:$SiteName 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Removendo site existente: $SiteName"
    & $appCmd delete site /site.name:$SiteName
}

# Criar App Pool
Write-Host "Criando pool de aplicativos: $AppPoolName" -ForegroundColor Green
& $appCmd add apppool /name:$AppPoolName /managedRuntimeVersion:""
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao criar pool."; exit 1 }
& $appCmd set apppool /apppool.name:$AppPoolName /managedPipelineMode:Integrated
& $appCmd set apppool /apppool.name:$AppPoolName /processModel.identityType:ApplicationPoolIdentity

# Criar Site
Write-Host "Criando site: $SiteName" -ForegroundColor Green
& $appCmd add site /name:$SiteName /physicalPath:$SitePath /bindings:http/*:${Port}:
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao criar site."; exit 1 }
& $appCmd set site /site.name:$SiteName /[path='/'].applicationPool:$AppPoolName

# Permissões na pasta (IIS_IUSRS ou conta do App Pool)
$identity = "IIS_IUSRS"
$acl = Get-Acl $SitePath
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, "ReadAndExecute,Read", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.SetAccessRule($rule)
Set-Acl -Path $SitePath -AclObject $acl
Write-Host "Permissoes definidas para $identity na pasta do site." -ForegroundColor Green

# Gravação apenas na pasta backend (para users.json, actionLog.json, agendamentos.json)
$backendPath = Join-Path $SitePath "backend"
if (Test-Path $backendPath) {
    $aclB = Get-Acl $backendPath
    $ruleB = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, "Modify", "ContainerInherit,ObjectInherit", "None", "Allow")
    $aclB.SetAccessRule($ruleB)
    Set-Acl -Path $backendPath -AclObject $aclB
    Write-Host "Permissoes de gravacao definidas em backend." -ForegroundColor Green
}

# npm install --production no backend
$nodePath = "${env:ProgramFiles}\nodejs\node.exe"
$npmPath = "${env:ProgramFiles}\nodejs\npm.cmd"
if (Test-Path $nodePath) {
    Write-Host "Executando npm install --production no backend..." -ForegroundColor Green
    Push-Location $backendPath
    try {
        & $npmPath install --production 2>&1
        if ($LASTEXITCODE -ne 0) { Write-Host "AVISO: npm install retornou codigo $LASTEXITCODE" -ForegroundColor Yellow }
        else { Write-Host "npm install concluido." -ForegroundColor Green }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "AVISO: Node.js nao encontrado em $nodePath. Execute manualmente: cd backend && npm install --production" -ForegroundColor Yellow
}

# .env
$envPath = Join-Path $SitePath ".env"
$envExample = Join-Path $SitePath ".env.example"
if (-not (Test-Path $envPath) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envPath
    Write-Host "Arquivo .env criado a partir de .env.example. EDITE e preencha SESSION_SECRET e credenciais." -ForegroundColor Yellow
} elseif (-not (Test-Path $envPath)) {
    Write-Host "AVISO: .env nao existe. Crie a partir de .env.example e defina SESSION_SECRET e NODE_ENV=production." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Concluido ===" -ForegroundColor Cyan
Write-Host "Site disponivel em: http://localhost:$Port" -ForegroundColor Green
Write-Host "Verifique se URL Rewrite e iisnode estao instalados. Veja IIS-DEPLOY.md para HTTPS e mais opcoes." -ForegroundColor Gray
Write-Host ""
