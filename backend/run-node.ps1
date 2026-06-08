# Adiciona Node ao PATH desta sessao (se estiver em Program Files) e inicia a API
$nodePaths = @(
    "$env:ProgramFiles\nodejs",
    "${env:ProgramFiles(x86)}\nodejs",
    "$env:LOCALAPPDATA\Programs\node"
)
foreach ($dir in $nodePaths) {
    if (Test-Path "$dir\node.exe") {
        $env:Path = "$dir;$env:Path"
        break
    }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js nao encontrado. Execute run-node.bat ou instale em https://nodejs.org/"
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias..."
    npm install
}
Write-Host "API rodando em http://localhost:5000"
node server.js
