# Monitora o Huawei Cloud Panel (chama /api/health) e opcionalmente reinicia o App Pool se parar de responder.
# Uso: agende no Agendador de Tarefas para rodar a cada 1-2 minutos (ex.: a cada 2 min).
# Exemplo: .\Monitor-Panel-Health.ps1 -HealthUrl "http://localhost:8088/api/health" -AppPoolName "HuaweiCloudPanel" -LogDir ".\logs"
# Para apenas testar (sem reiniciar pool): .\Monitor-Panel-Health.ps1 -HealthUrl "http://localhost:8088/api/health" -LogOnly

param(
    [string]$HealthUrl = "http://localhost:8088/api/health",
    [string]$AppPoolName = "HuaweiCloudPanel",
    [string]$LogDir = ".\logs",
    [switch]$LogOnly,
    [int]$TimeoutSec = 10
)

$ErrorActionPreference = "Stop"
$now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "$now [$Level] $Message"
    Write-Host $line
    if ($LogDir -and (Test-Path $LogDir)) {
        $logFile = Join-Path $LogDir "monitor-health.log"
        Add-Content -Path $logFile -Value $line -ErrorAction SilentlyContinue
    }
}

try {
    $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Log "OK - $HealthUrl (StatusCode 200)"
        exit 0
    }
    Write-Log "Resposta inesperada: $($response.StatusCode)" "WARN"
} catch {
    Write-Log "Falha ao acessar $HealthUrl - $($_.Exception.Message)" "ERROR"
    if (-not $LogOnly -and $AppPoolName) {
        try {
            Import-Module WebAdministration -ErrorAction Stop
            $pool = Get-ChildItem "IIS:\AppPools" -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $AppPoolName }
            if ($pool) {
                Write-Log "Reiniciando App Pool: $AppPoolName"
                Restart-WebAppPool -Name $AppPoolName -ErrorAction Stop
                Write-Log "App Pool reiniciado." "INFO"
            } else {
                Write-Log "App Pool '$AppPoolName' nao encontrado. Nenhuma acao." "WARN"
            }
        } catch {
            Write-Log "Nao foi possivel reiniciar App Pool: $($_.Exception.Message)" "ERROR"
        }
    }
    exit 1
}
