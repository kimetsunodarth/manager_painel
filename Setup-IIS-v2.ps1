# Configura o IIS para o Ananim Manager Painel v2 (iisnode ou HttpPlatformHandler).
# Versão 2: não sobrescreve a instalação existente (ananim-manager-painel).
# Execute como Administrador. Requer IIS; iisnode OU HttpPlatformHandler + Node.js.
# Uso: .\Setup-IIS-v2.ps1 [-SitePath "C:\caminho"] [-AppPath "C:\caminho"] [-Port 8891]
#      Opcional: -AppPoolIdentity "worker@cloud.local" -AppPoolPassword "senha"

param(
    [string]$SitePath = (Get-Location).Path,
    [string]$AppPath,
    [string]$SiteName = "ananim-manager-painel-v2",
    [string]$AppPoolName = "AnanimManagerPanelV2",
    [int]$Port = 8891,
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

# Verificar Admin
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Err "Execute como Administrador. Use Configurar-IIS.bat (ele pede elevacao) ou botao direito > Executar como administrador."
    exit 1
}

Write-Step "Pasta do site (raiz do projeto): $SitePath"
if (-not (Test-Path $SitePath)) {
    Write-Err "Pasta nao encontrada: $SitePath"
    exit 1
}

if (-not (Test-Path (Join-Path $SitePath "web.config"))) {
    Write-Err "web.config nao encontrado em $SitePath. Execute este script na pasta raiz do projeto ou na pasta instalada."
    exit 1
}
Write-Ok "web.config encontrado"

$exeEntry = Join-Path $SitePath "Ananim-Manager-Painel-API.exe"
$apiEntry = Join-Path $SitePath "api\src\index.js"
$backendEntry = Join-Path $SitePath "backend\src\index.js"
$hasExe = Test-Path $exeEntry
$hasNodeApp = (Test-Path $apiEntry) -or (Test-Path $backendEntry)
if (-not $hasExe -and -not $hasNodeApp) {
    Write-Host "    Instalacao apenas frontend (sem exe/api/backend). Site servira conteudo estatico." -ForegroundColor Cyan
} elseif ($hasExe) {
    Write-Ok "API (exe) encontrada: Ananim-Manager-Painel-API.exe"
} else {
    Write-Ok "Runtime Node encontrado (api ou backend)"
}

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
    Write-Err "A porta $Port ja esta em uso. Libere a porta ou altere -Port no script."
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
& $appcmdPath unlock config -section:system.webServer/rewrite 2>$null
& $appcmdPath unlock config -section:system.webServer/iisnode 2>$null
& $appcmdPath unlock config -section:system.webServer/httpPlatform 2>$null
Write-Ok "Secoes desbloqueadas"

# Atualizar web.config com caminho real do node.exe (evita 502.3 se Node estiver em Program Files (x86))
$nodeExe = $null
try {
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
} catch {}
if ($nodeExe -and (Test-Path $nodeExe)) {
    $webConfigPath = Join-Path $SitePath "web.config"
    $content = Get-Content $webConfigPath -Raw -Encoding UTF8
    if ($content -match 'processPath="[^"]*node\.exe"') {
        $content = $content -replace 'processPath="[^"]*"', "processPath=`"$($nodeExe.Replace('\','\\'))`""
        Set-Content -Path $webConfigPath -Value $content -Encoding UTF8 -NoNewline
        Write-Ok "web.config atualizado com caminho do Node: $nodeExe"
    }
}

# Pasta de log (HttpPlatformHandler; nao usar iisnode)
$logsDir = Join-Path $SitePath "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    Write-Ok "Pasta logs criada (HttpPlatformHandler)"
}

# Permissoes: App Pool precisa ler/executar e gravar (backend cria ananim.db, logs)
Write-Step "Definindo permissoes para o IIS na pasta do site..."
try {
    $acl = Get-Acl $SitePath
    $identity = "IIS_IUSRS"
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, "Modify", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.SetAccessRule($rule)
    if ($AppPoolIdentity -and $AppPoolIdentity -notmatch "^(ApplicationPoolIdentity|LocalSystem|NetworkService)$") {
        $rule2 = New-Object System.Security.AccessControl.FileSystemAccessRule($AppPoolIdentity, "Modify", "ContainerInherit,ObjectInherit", "None", "Allow")
        $acl.SetAccessRule($rule2)
        Write-Ok "Permissoes (Modify) definidas para $identity e $AppPoolIdentity"
    } else {
        Write-Ok "Permissoes (Modify) definidas para $identity"
    }
    Set-Acl -Path $SitePath -AclObject $acl
} catch {
    Write-Host "    Aviso: $($_.Exception.Message)" -ForegroundColor Yellow
}

# NÃO remove site antigo - esta é a versão v2, coexiste com a v1
Write-Step "Criando site v2 (nao remove instalacao existente)..."

# App Pool (No Managed Code - para iisnode/HttpPlatformHandler)
Write-Step "Criando App Pool: $AppPoolName"
& $appcmdPath delete apppool /apppool.name:$AppPoolName 2>$null
$poolOut = & $appcmdPath add apppool /name:$AppPoolName /managedRuntimeVersion:"" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "    Aviso app pool: $poolOut" -ForegroundColor Yellow
}

# Configuracoes avancadas do pool: somente Start Mode = AlwaysRunning, Idle Time-out = 0
Write-Step "Configurando App Pool (Start Mode: AlwaysRunning, Idle Time-out: 0)..."
try {
    Import-Module WebAdministration -ErrorAction Stop
    $filter = "system.applicationHost/applicationPools/add[@name='$AppPoolName']"
    Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter $filter -name "startMode" -value "AlwaysRunning"
    Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter "$filter/processModel" -name "idleTimeout" -value "00:00:00"
    Write-Ok "Start Mode = AlwaysRunning, Idle Time-out = 0"
} catch {
    Write-Host "    Fallback appcmd..." -ForegroundColor Yellow
    $poolFilter = "/[name='$AppPoolName'].startMode:`"AlwaysRunning`""
    & $appcmdPath set config -section:system.applicationHost/applicationPools $poolFilter /commit:apphost 2>&1
    $poolFilterIdle = "/[name='$AppPoolName'].processModel.idleTimeout:00:00:00"
    & $appcmdPath set config -section:system.applicationHost/applicationPools $poolFilterIdle /commit:apphost 2>&1
    Write-Ok "Start Mode e Idle Time-out (tente conferir no IIS)"
}

# Identidade do pool (SpecificUser): worker@cloud.local (ou -AppPoolIdentity / -AppPoolPassword)
if ($AppPoolIdentity) {
    if ($AppPoolPassword) {
        Write-Step "Definindo identidade do App Pool: $AppPoolIdentity"
        & $appcmdPath set apppool /apppool.name:$AppPoolName /processModel.identityType:SpecificUser "/processModel.userName:$AppPoolIdentity" "/processModel.password:$AppPoolPassword" 2>&1
        if ($LASTEXITCODE -eq 0) { Write-Ok "Identidade definida: $AppPoolIdentity" } else { Write-Host "    Aviso: nao foi possivel definir identidade (defina manualmente no IIS)." -ForegroundColor Yellow }
    } else {
        Write-Host "    Identidade $AppPoolIdentity informada sem senha. Defina a senha manualmente em IIS > App Pool > Advanced Settings > Identity." -ForegroundColor Yellow
    }
}

# Criar site
Write-Step "Criando site '$SiteName' na porta $Port..."
$physArg = "/physicalPath:`"$SitePath`""
$bindings = "http/*:${Port}:"
$siteOut = & $appcmdPath add site /name:$SiteName $physArg "/bindings:$bindings" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "appcmd add site falhou: $siteOut"
    exit 1
}
Write-Ok "Site criado"

# Atribuir Application Pool ao site
Write-Step "Atribuindo App Pool ao site..."
$setOut = & $appcmdPath set app "$SiteName/" "/applicationPool:$AppPoolName" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "    Aviso set app: $setOut" -ForegroundColor Yellow
} else {
    Write-Ok "App Pool atribuido"
}

Write-Step "Verificando site..."
$list = & $appcmdPath list site 2>&1
$listText = if ($list -is [array]) { $list | Out-String } else { [string]$list }
if ($listText -notmatch [regex]::Escape($SiteName)) {
    Write-Err "Site nao aparece apos criacao."
    exit 1
}
Write-Ok "Site '$SiteName' visivel no IIS"

Write-Host ""
Write-Host "=== CONCLUIDO (v2) ===" -ForegroundColor Green
Write-Host "  Site:   $SiteName (em Sites no IIS)"
Write-Host "  Pool:   $AppPoolName (AlwaysRunning, Idle Time-out 0)"
if ($AppPoolIdentity) { Write-Host "  Identity: $AppPoolIdentity" }
Write-Host "  Porta:  $Port"
Write-Host "  URL:    http://localhost:$Port/"
Write-Host ""
Write-Host "  A instalacao original (ananim-manager-painel) permanece intacta na porta 8890." -ForegroundColor Cyan
if ($hasExe -or $hasNodeApp) {
    Write-Host "  API:    http://localhost:$Port/api/"
    Write-Host "  Health: http://localhost:$Port/api/health"
    Write-Host ""
    if ($hasExe) { Write-Host "Configuracao: .env ou config.enc + .encryption_key na pasta do site." -ForegroundColor Cyan }
    else { Write-Host "Na pasta backend/ configure o .env (ou config.enc)." -ForegroundColor Cyan }
} else {
    Write-Host ""
    Write-Host "Este instalador so inclui o frontend. A API deve rodar separadamente." -ForegroundColor Cyan
    Write-Host "Veja CONFIG-README.txt." -ForegroundColor Cyan
}
exit 0
