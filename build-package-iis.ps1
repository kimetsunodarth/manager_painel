# Prepara o pacote para instalacao no IIS com API como .exe (conceito do adds-password-reset).
# Saida: pasta package-iis com Huawei-Cloud-Panel-API.exe, frontend em public/, web.config e scripts.
# Uso: .\build-package-iis.ps1
# Requer: Node/npm instalados. No servidor: IIS e HttpPlatformHandler.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$packageIis = Join-Path $root "package-iis"
$iisDir = Join-Path $root "installer\iis"

Write-Host "Raiz do projeto: $root"
Write-Host "Pasta de saida (IIS): $packageIis"

# 0) Criptografar .env em config.enc + key.bin (para incluir no pacote; exe usara na instalacao)
$envPath = Join-Path $root ".env"
$configEnc = Join-Path $root "config.enc"
$keyBin = Join-Path $root "key.bin"
if (Test-Path $envPath) {
    Write-Host "Criptografando .env em config.enc e key.bin..."
    Push-Location $backend
    & node scripts/encrypt-config.js
    Pop-Location
    if (Test-Path $configEnc) {
        Write-Host "  config.enc e key.bin gerados na raiz; serao incluidos no pacote." -ForegroundColor Green
    } else {
        Write-Host "  Aviso: encrypt-config nao gerou config.enc. O instalador nao tera config embutida." -ForegroundColor Yellow
    }
} else {
    Write-Host "Aviso: .env nao encontrado na raiz. Gere config.enc/key.bin manualmente (npm run encrypt-config no backend) ou use .env no servidor." -ForegroundColor Yellow
}

# 0b) Criptografar logo.png em logo.enc (mesma chave que config.enc; servido via GET /api/logo)
$logoEnc = Join-Path $root "logo.enc"
$logoPng = Join-Path $frontend "logo.png"
if (Test-Path $logoPng) {
    if (Test-Path $keyBin) {
        Push-Location $backend
        & node scripts/encrypt-logo.js
        Pop-Location
        if (Test-Path $logoEnc) {
            Write-Host "  logo.enc gerado; sera incluido no pacote." -ForegroundColor Green
        }
    } else {
        Write-Host "  Aviso: key.bin nao existe. Execute build com .env na raiz para criptografar o logo." -ForegroundColor Yellow
    }
}

# 1) Build do backend em .exe (pkg) - codigo nao exposto
Push-Location $backend
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias do backend..."
    npm install 2>&1 | Out-Null
}
if (-not (Test-Path "node_modules\pkg")) {
    Write-Host "Instalando pkg..."
    npm install --save-dev pkg 2>&1 | Out-Null
}
$distDir = Join-Path $backend "dist"
if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
$pkgCache = Join-Path $backend ".pkg-cache"
New-Item -ItemType Directory -Path $pkgCache -Force | Out-Null
$env:PKG_CACHE_PATH = $pkgCache
Write-Host "Empacotando backend em .exe (pkg)..."
npm run build:exe
if (-not (Test-Path (Join-Path $distDir "Huawei-Cloud-Panel-API.exe"))) {
    throw "Build do exe falhou - Huawei-Cloud-Panel-API.exe nao encontrado em dist"
}
Write-Host "Gerando Descriptografar-Logs.exe..."
npm run build:decrypt-logs
Pop-Location

# 2) Montar package-iis: exe, public (frontend estatico), web.config, scripts, logs
if (Test-Path $packageIis) { Remove-Item $packageIis -Recurse -Force }
New-Item -ItemType Directory -Path $packageIis -Force | Out-Null

Copy-Item (Join-Path $backend "dist\Huawei-Cloud-Panel-API.exe") (Join-Path $packageIis "Huawei-Cloud-Panel-API.exe") -Force
if (Test-Path (Join-Path $backend "dist\Descriptografar-Logs.exe")) {
    Copy-Item (Join-Path $backend "dist\Descriptografar-Logs.exe") (Join-Path $packageIis "Descriptografar-Logs.exe") -Force
    Write-Host "  Descriptografar-Logs.exe incluido no pacote." -ForegroundColor Green
}
$publicDir = Join-Path $packageIis "public"
New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
Copy-Item (Join-Path $frontend "*") $publicDir -Recurse -Force
Copy-Item (Join-Path $iisDir "web.config") (Join-Path $packageIis "web.config") -Force
Copy-Item (Join-Path $iisDir "Setup-IIS-Exe.ps1") (Join-Path $packageIis "Setup-IIS.ps1") -Force
Copy-Item (Join-Path $iisDir "Configurar-IIS.bat") (Join-Path $packageIis "Configurar-IIS.bat") -Force
Copy-Item (Join-Path $iisDir "Run-IIS-Setup-Now.bat") (Join-Path $packageIis "Run-IIS-Setup-Now.bat") -Force
Copy-Item (Join-Path $iisDir "ENV-EXAMPLE.txt") (Join-Path $packageIis "ENV-EXAMPLE.txt") -Force
Copy-Item (Join-Path $iisDir "Gerar-SESSION_SECRET.bat") (Join-Path $packageIis "Gerar-SESSION_SECRET.bat") -Force
if (Test-Path (Join-Path $iisDir "Monitor-Panel-Health.ps1")) {
    Copy-Item (Join-Path $iisDir "Monitor-Panel-Health.ps1") (Join-Path $packageIis "Monitor-Panel-Health.ps1") -Force
}

# Incluir config.enc e key.bin no pacote (gerados acima a partir do .env)
if (Test-Path $configEnc) {
    Copy-Item $configEnc (Join-Path $packageIis "config.enc") -Force
    Write-Host "  config.enc incluido no pacote." -ForegroundColor Green
}
if (Test-Path $keyBin) {
    Copy-Item $keyBin (Join-Path $packageIis "key.bin") -Force
    Write-Host "  key.bin incluido no pacote." -ForegroundColor Green
}
if (Test-Path $logoEnc) {
    Copy-Item $logoEnc (Join-Path $packageIis "logo.enc") -Force
    Write-Host "  logo.enc incluido no pacote." -ForegroundColor Green
}

$logsPath = Join-Path $packageIis "logs"
New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
Set-Content -Path (Join-Path $logsPath ".gitkeep") -Value "" -Encoding ASCII

$configReadme = @"
Huawei Cloud Panel - Configuracao (modo exe no IIS)

O site no IIS usa a porta 8088 por padrao. Ao instalar pelo .exe, o instalador
configura o IIS automaticamente (se a opcao estiver marcada).

Configuracao - config.enc e key.bin:
  O instalador NAO inclui config.enc/key.bin (por seguranca). Eles sao gerados na pasta
  installer\Output\ ao compilar (ao lado do .exe do instalador). Apos instalar, copie
  config.enc e key.bin de installer\Output\ para esta pasta (ao lado do .exe).
  Se nao tiver: na maquina com .env, execute no backend "node scripts/encrypt-config.js"
  e copie config.enc e key.bin para esta pasta.

Alternativa - .env em texto:
  Copie ENV-EXAMPLE.txt para .env (renomeie ou salve como .env).
  Execute Gerar-SESSION_SECRET.bat para gerar um SESSION_SECRET e cole no .env.
  Preencha as credenciais (RAMO_AK, RAMO_SK, etc.) e reinicie o site no IIS.

2. Logs em producao sao criptografados (logs\app.log.enc, logs\startup-error.log.enc).
   Para ler: execute Descriptografar-Logs.exe (key.bin na pasta do app):
     Descriptografar-Logs.exe logs\app.log.enc saida.txt
   Os arquivos users.json, actionLog.json e agendamentos tambem sao criptografados quando SESSION_SECRET esta definido.

3. Se aparecer HTTP 500.19 (0x80070021 "section is locked"): execute como
   Administrador no PowerShell:
     & "$env:windir\system32\inetsrv\appcmd.exe" unlock config -section:system.webServer/handlers
     & "$env:windir\system32\inetsrv\appcmd.exe" unlock config -section:system.webServer/httpPlatform
   Depois execute Configurar-IIS.bat como Administrador.

4. Se aparecer 500.19 por falta do modulo: instale HttpPlatformHandler
   (https://www.iis.net/downloads/microsoft/httpplatformhandler).

5. ERRO 502.3 (Bad Gateway): o .exe nao esta subindo. Causas comuns:
   - Falta config.enc + key.bin nesta pasta. Copie-os de installer\Output\ (onde o instalador foi gerado).
   - Permissoes: em "C:\Program Files\..." o IIS precisa de permissao. Execute Configurar-IIS.bat como
     Administrador de novo (ele define permissoes para IIS_IUSRS). Depois reinicie o site no IIS.
   - Logs de erro: use Descriptografar-Logs.exe para ler logs\startup-error.log.enc e logs\app.log.enc
     (ex: Descriptografar-Logs.exe --dir "esta pasta" logs\startup-error.log.enc saida.txt).

6. Agendamentos (cron) rodam no SERVIDOR a cada minuto; NAO dependem do navegador nem de usuario logado.
   Para nao haver falha de agendamentos nem "salto na data" no log:
   - OBRIGATORIO: no IIS, Application Pool do site, defina "Idle Time-out (minutes)" = 0
     (o processo nunca deve ser encerrado por inatividade).
   - O painel faz self-ping em /api/health a cada 60s. A cada 5 min e registrado um "Cron ativo (heartbeat)"
     no log de acoes; se houver gap nas datas, o processo esteve parado (reinicie o pool ou o site).

7. URL do painel e health: o site fica na PORTA 8088 (nao na 80). Use:
   - Painel: http://localhost:8088/   (ou http://SEU-SERVIDOR:8088/)
   - Health: http://localhost:8088/api/health
   Se abrir http://localhost/api/health (porta 80) dara 404 - e o site padrao do IIS (wwwroot).

8. Usuario do Application Pool: ApplicationPoolIdentity e suficiente. A pasta do app (onde esta
   o .exe, config.enc, users.json, etc.) deve ter permissao de Leitura e Execucao para o pool
   (ex.: IIS_IUSRS ou o nome do pool). O Configurar-IIS.bat define isso. Se usar outra conta
   (conta de servico), conceda Leitura/Execucao e Gravacao nessa pasta.

9. Monitorar quando o painel para de responder: use o script Monitor-Panel-Health.ps1 (na pasta
   installer\iis ou copie para a pasta do app). Agende no Agendador de Tarefas para rodar a cada
   2 minutos; em falha ele pode reiniciar o App Pool. Exemplo:
   powershell -File "C:\caminho\Monitor-Panel-Health.ps1" -HealthUrl "http://localhost:8088/api/health"
   Log em logs\monitor-health.log.
"@
Set-Content -Path (Join-Path $packageIis "CONFIG-README.txt") -Value $configReadme -Encoding UTF8

Write-Host "Pacote IIS preparado em: $packageIis"
Write-Host "Conteudo: Huawei-Cloud-Panel-API.exe, public/, web.config, Setup-IIS.ps1, Configurar-IIS.bat, logs/"
Write-Host "Proximo passo: copie a pasta package-iis para o servidor e execute Configurar-IIS.bat como Administrador."
exit 0
