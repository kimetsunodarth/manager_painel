# Configura o IIS para o Ananim Manager Painel (HttpPlatformHandler com .exe).
# Funciona tanto na pasta instalada quanto no projeto local.
# Execute como Administrador. Requer IIS e HttpPlatformHandler.

param(
    [string]$SitePath = (Get-Location).Path,
    [string]$AppPath,
    [string]$SiteName = "ananim-manager-painel",
    [string]$AppPoolName = "AnanimManagerPanel",
    [int]$Port = 8890,
    [switch]$InstallIIS,
    [string]$AppPoolIdentity,
    [string]$AppPoolPassword
)

$ErrorActionPreference = "Stop"
if ($AppPath) { $SitePath = $AppPath }
$SitePath = $SitePath.TrimEnd('\')

function Write-Step { param($msg) Write-Host ">>> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Err  { param($msg) Write-Host "    ERRO: $msg" -ForegroundColor Red }

$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Err "Execute como Administrador. Use Configurar-IIS.bat ou botão direito > Executar como administrador."
    exit 1
}

Write-Step "Pasta do site: $SitePath"
if (-not (Test-Path $SitePath)) {
    Write-Err "Pasta não encontrada: $SitePath"
    exit 1
}

$webConfigPath = Join-Path $SitePath "web.config"
if (-not (Test-Path $webConfigPath)) {
    Write-Err "web.config não encontrado em $SitePath"
    exit 1
}
Write-Ok "web.config encontrado"

$exeEntry = Join-Path $SitePath "Ananim-Manager-Painel-API.exe"
$apiEntry = Join-Path $SitePath "api\src\index.js"
$backendEntry = Join-Path $SitePath "backend\src\index.js"
$hasExe = Test-Path $exeEntry
$hasNodeApp = (Test-Path $apiEntry) -or (Test-Path $backendEntry)
if (-not $hasExe -and -not $hasNodeApp) {
    Write-Err "Nenhuma entrada encontrada (Ananim-Manager-Painel-API.exe, api\\src\\index.js ou backend\\src\\index.js)."
    exit 1
}
if ($hasExe) {
    Write-Ok "API .exe encontrada"
} else {
    Write-Ok "Runtime Node encontrado (api ou backend)"
}

$appcmdPath = Join-Path $env:windir "system32\inetsrv\appcmd.exe"
if (-not (Test-Path $appcmdPath)) {
    Write-Err "IIS não encontrado. Instale o Servidor Web (IIS) primeiro."
    exit 1
}

if ($InstallIIS) {
    Write-Step "Habilitando recursos do IIS..."
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole -NoRestart -ErrorAction SilentlyContinue | Out-Null
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer -NoRestart -ErrorAction SilentlyContinue | Out-Null
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-CommonHttpFeatures -NoRestart -ErrorAction SilentlyContinue | Out-Null
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-ApplicationDevelopment -NoRestart -ErrorAction SilentlyContinue | Out-Null
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-HealthAndDiagnostics -NoRestart -ErrorAction SilentlyContinue | Out-Null
    Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpErrors -NoRestart -ErrorAction SilentlyContinue | Out-Null
    Write-Ok "Recursos do IIS habilitados"
}

Write-Step "Desbloqueando seções do IIS..."
& $appcmdPath unlock config -section:system.webServer/handlers 2>$null | Out-Null
& $appcmdPath unlock config -section:system.webServer/httpPlatform 2>$null | Out-Null
& $appcmdPath unlock config -section:system.webServer/rewrite 2>$null | Out-Null
Write-Ok "Seções desbloqueadas"

Write-Step "Atualizando web.config para o executável correto..."
$content = Get-Content $webConfigPath -Raw -Encoding UTF8
if ($hasExe) {
    $content = $content -replace 'processPath="[^"]*"', 'processPath=".\Ananim-Manager-Painel-API.exe"'
} elseif ($content -match 'processPath="[^"]*node\.exe"') {
    try {
        $nodeExe = (Get-Command node -ErrorAction Stop).Source
        if ($nodeExe -and (Test-Path $nodeExe)) {
            $escapedNode = $nodeExe.Replace('\', '\\')
            $content = $content -replace 'processPath="[^"]*"', "processPath=`"$escapedNode`""
        }
    } catch {}
}
$content = $content -replace 'startupTimeLimit="20"', 'startupTimeLimit="60"'
Set-Content -Path $webConfigPath -Value $content -Encoding UTF8 -NoNewline
Write-Ok "web.config atualizado"

$logsDir = Join-Path $SitePath "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

Write-Step "Definindo permissões..."
try {
    $acl = Get-Acl $SitePath
    $identity = "IIS_IUSRS"
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, "Modify", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.SetAccessRule($rule)
    if ($AppPoolIdentity -and $AppPoolIdentity -notmatch "^(ApplicationPoolIdentity|LocalSystem|NetworkService)$") {
        $rule2 = New-Object System.Security.AccessControl.FileSystemAccessRule($AppPoolIdentity, "Modify", "ContainerInherit,ObjectInherit", "None", "Allow")
        $acl.SetAccessRule($rule2)
    }
    Set-Acl -Path $SitePath -AclObject $acl
    Write-Ok "Permissões aplicadas em $SitePath"
} catch {
    Write-Host "    Aviso: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Step "Recriando App Pool..."
& $appcmdPath delete apppool /apppool.name:$AppPoolName 2>$null | Out-Null
& $appcmdPath add apppool /name:$AppPoolName /managedRuntimeVersion:"" 2>&1 | Out-Null
& $appcmdPath set apppool /apppool.name:$AppPoolName /managedPipelineMode:Integrated 2>&1 | Out-Null
& $appcmdPath set config -section:system.applicationHost/applicationPools "/[name='$AppPoolName'].startMode:`"AlwaysRunning`"" /commit:apphost 2>&1 | Out-Null
& $appcmdPath set config -section:system.applicationHost/applicationPools "/[name='$AppPoolName'].processModel.idleTimeout:00:00:00" /commit:apphost 2>&1 | Out-Null
Write-Ok "App Pool configurado"

if ($AppPoolIdentity -and $AppPoolPassword) {
    & $appcmdPath set apppool /apppool.name:$AppPoolName /processModel.identityType:SpecificUser "/processModel.userName:$AppPoolIdentity" "/processModel.password:$AppPoolPassword" 2>&1 | Out-Null
}

Write-Step "Recriando site IIS..."
& $appcmdPath delete site /site.name:$SiteName 2>$null | Out-Null
$physArg = "/physicalPath:`"$SitePath`""
$bindings = "http/*:${Port}:"
$siteOut = & $appcmdPath add site /name:$SiteName $physArg "/bindings:$bindings" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "Falha ao criar site: $siteOut"
    exit 1
}
& $appcmdPath set app "$SiteName/" "/applicationPool:$AppPoolName" 2>&1 | Out-Null
Write-Ok "Site configurado na porta $Port"

Write-Step "Iniciando site e App Pool..."
& $appcmdPath start apppool /apppool.name:$AppPoolName 2>&1 | Out-Null
& $appcmdPath start site /site.name:$SiteName 2>&1 | Out-Null
Write-Ok "IIS iniciado"

Write-Host ""
Write-Host "=== CONCLUÍDO ===" -ForegroundColor Green
Write-Host "  Site:  $SiteName"
Write-Host "  Pool:  $AppPoolName"
Write-Host "  Porta: $Port"
Write-Host "  URL:   http://localhost:$Port/"
if ($hasExe) {
    Write-Host "  API:   http://localhost:$Port/api/"
}
exit 0
