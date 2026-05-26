# Configura IIS para Huawei Cloud Panel (modo exe): cria um site na porta 8088.
# Executar como Administrador. Durante a instalacao (exe), o instalador executa este script automaticamente.

param(
    [Parameter(Mandatory = $true)]
    [string]$AppPath,
    [string]$SiteName = "huawei-cloud-panel",
    [string]$AppPoolName = "HuaweiCloudPanel",
    [int]$Port = 8088,
    [switch]$InstallHttpPlatformHandler
)

$ErrorActionPreference = "Stop"
$AppPath = $AppPath.TrimEnd('\')

function Write-Step { param($msg) Write-Host ">>> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Err  { param($msg) Write-Host "    ERRO: $msg" -ForegroundColor Red }

# Verificar Admin
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Err "Execute como Administrador. Use Configurar-IIS.bat (ele pede elevacao) ou botao direito > Executar como administrador."
    exit 1
}

Write-Step "Pasta do app: $AppPath"
if (-not (Test-Path $AppPath)) {
    Write-Err "Pasta nao encontrada: $AppPath"
    exit 1
}

$exePath = Join-Path $AppPath "Huawei-Cloud-Panel-API.exe"
if (-not (Test-Path $exePath)) {
    Write-Err "Executavel nao encontrado: $exePath"
    exit 1
}
Write-Ok "Executavel encontrado"

# Verificar se a porta esta em uso
Write-Step "Verificando se a porta $Port esta em uso..."
$portInUse = $false
try {
    $inUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
    if ($inUse) { $portInUse = $true }
} catch {
    $netstat = & netstat -an 2>$null
    if ($netstat -match ":$Port\s+.*(LISTENING|ESCUTANDO)") { $portInUse = $true }
}
if ($portInUse) {
    Write-Err "A porta $Port ja esta em uso. Libere a porta ou altere a porta no script (parametro -Port)."
    exit 1
}
Write-Ok "Porta $Port disponivel"

$appcmdPath = Join-Path $env:windir "system32\inetsrv\appcmd.exe"
if (-not (Test-Path $appcmdPath)) {
    Write-Err "IIS nao encontrado. Instale: Gerenciador do Servidor > Funcoes > Servidor Web (IIS)."
    exit 1
}

# Desbloquear secoes do IIS (evita 500.19)
Write-Step "Desbloqueando secoes system.webServer..."
& $appcmdPath unlock config -section:system.webServer/handlers 2>$null
& $appcmdPath unlock config -section:system.webServer/httpPlatform 2>$null
Write-Ok "Secoes desbloqueadas"

# Pasta logs
$logsDir = Join-Path $AppPath "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    Write-Ok "Pasta logs criada"
}

# Permissoes: App Pool precisa ler/executar e gravar na pasta do app (evita 502.3 em Program Files; exe cria users.json etc.)
Write-Step "Definindo permissoes para o IIS na pasta do app..."
try {
    $acl = Get-Acl $AppPath
    $identity = "IIS_IUSRS"
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, "Modify", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.SetAccessRule($rule)
    Set-Acl -Path $AppPath -AclObject $acl
    Write-Ok "Permissoes (Modify) definidas para $identity"
} catch {
    Write-Host "    Aviso: $($_.Exception.Message)" -ForegroundColor Yellow
}
$logsDir = Join-Path $AppPath "logs"
if (Test-Path $logsDir) {
    try {
        $aclLogs = Get-Acl $logsDir
        $ruleModify = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, "Modify", "ContainerInherit,ObjectInherit", "None", "Allow")
        $aclLogs.SetAccessRule($ruleModify)
        Set-Acl -Path $logsDir -AclObject $aclLogs
        Write-Ok "Pasta logs com permissao de gravacao para $identity"
    } catch { }
}

# Remover site antigo (se existir)
Write-Step "Removendo site antigo (se existir)..."
& $appcmdPath delete site $SiteName 2>$null

# Criar App Pool (No Managed Code para processo exe)
Write-Step "Criando App Pool: $AppPoolName"
& $appcmdPath delete apppool /apppool.name:$AppPoolName 2>$null
$poolOut = & $appcmdPath add apppool /name:$AppPoolName /managedRuntimeVersion:"" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "    Aviso app pool: $poolOut" -ForegroundColor Yellow
}

# Idle Time-out = 0 e Start Mode = AlwaysRunning (cron e painel ativos sem depender de requisicao)
Write-Step "Configurando App Pool: Idle Time-out = 0, Start Mode = AlwaysRunning"
& $appcmdPath set apppool /apppool.name:$AppPoolName /processModel.idleTimeout:00:00:00 2>$null
& $appcmdPath set apppool /apppool.name:$AppPoolName /startMode:AlwaysRunning 2>$null
Write-Ok "Idle Time-out = 0, Start Mode = AlwaysRunning"

# Criar site (apenas name, physicalPath e bindings - sem app pool)
Write-Step "Criando site '$SiteName' na porta $Port..."
$physArg = "/physicalPath:`"$AppPath`""
$bindings = "http/*:${Port}:"
$siteOut = & $appcmdPath add site /name:$SiteName $physArg "/bindings:$bindings" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "appcmd add site falhou: $siteOut"
    Write-Host "Verifique se a porta $Port nao esta em uso." -ForegroundColor Yellow
    exit 1
}
Write-Ok "Site criado"

# Atribuir Application Pool ao site (comando separado - set app "SiteName/" /applicationPool:...)
Write-Step "Atribuindo App Pool ao site..."
$setOut = & $appcmdPath set app "$SiteName/" "/applicationPool:$AppPoolName" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "    Aviso set app: $setOut" -ForegroundColor Yellow
} else {
    Write-Ok "App Pool atribuido"
}

# Confirmar (saida do appcmd pode ser array de linhas - converter para texto para -match)
Write-Step "Verificando site..."
$list = & $appcmdPath list site 2>&1
$listText = if ($list -is [array]) { $list | Out-String } else { [string]$list }
if ($listText -notmatch [regex]::Escape($SiteName)) {
    Write-Err "Site nao aparece apos criacao. Saida appcmd: $listText"
    exit 1
}
Write-Ok "Site '$SiteName' visivel no IIS"

# Atualizar web.config com caminho absoluto do exe
$webConfigPath = Join-Path $AppPath "web.config"
$exeFullPath = Join-Path $AppPath "Huawei-Cloud-Panel-API.exe"
if (Test-Path $webConfigPath) {
    $content = Get-Content $webConfigPath -Raw -Encoding UTF8
    $content = $content -replace 'processPath="[^"]*Huawei-Cloud-Panel-API\.exe"', ('processPath="' + $exeFullPath + '"')
    Set-Content -Path $webConfigPath -Value $content -Encoding UTF8 -NoNewline
    Write-Ok "web.config atualizado com caminho absoluto do exe"
}

Write-Host ""
Write-Host "=== CONCLUIDO ===" -ForegroundColor Green
Write-Host "  Site:   $SiteName (em Sites no IIS)"
Write-Host "  Porta:  $Port"
Write-Host "  URL:    http://localhost:$Port/"
Write-Host ""
Write-Host "Coloque config.enc e key.bin (ou .env) na pasta do app. Veja CONFIG-README.txt" -ForegroundColor Cyan
exit 0
