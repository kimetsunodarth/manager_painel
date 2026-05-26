#!/usr/bin/env bash
# Pacote Linux equivalente ao IIS: binário + public + lib + logs.
# Executar EM LINUX (ou WSL): better-sqlite3 é nativo e o pkg gera binário Linux.
# Uso: ./installer/build-package-linux.sh
# Saída: installer/package-linux/ (copiar para o servidor e rodar com config.enc + key)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND="$ROOT_DIR/frontend"
BACKEND="$ROOT_DIR/backend"
PACKAGE="$SCRIPT_DIR/package-linux"
PACKAGE_TMP="${PACKAGE}-tmp"

echo "Raiz do projeto: $ROOT_DIR"
echo "Pacote Linux: binário + public + lib + logs (sem config/data)"

# 1) Build do frontend
cd "$FRONTEND"
if [ ! -d node_modules ]; then
  echo "Instalando dependências do frontend..."
  npm install
fi
echo "Build do frontend (API em /api)..."
npm exec -- vite build
if [ ! -d dist ]; then
  echo "Erro: frontend build falhou - pasta dist não criada." >&2
  exit 1
fi

# 2) Build do backend (bundle + binário Linux)
cd "$BACKEND"
if [ ! -d node_modules ]; then
  echo "Instalando dependências do backend..."
  npm install
fi
echo "Rebuild better-sqlite3 para Node 18..."
npm rebuild better-sqlite3
echo "Build do backend (bundle + binário Linux)..."
npm run build:linux
BIN_PATH="$BACKEND/dist/Ananim-Manager-Painel-API"
if [ ! -f "$BIN_PATH" ]; then
  echo "Erro: binário não gerado. Execute no backend: npm run build:linux" >&2
  exit 1
fi

# 3) Montar pacote
rm -rf "$PACKAGE_TMP"
mkdir -p "$PACKAGE_TMP"

cp "$BIN_PATH" "$PACKAGE_TMP/Ananim-Manager-Painel-API"
chmod +x "$PACKAGE_TMP/Ananim-Manager-Painel-API"
echo "Copiado: Ananim-Manager-Painel-API"

mkdir -p "$PACKAGE_TMP/lib/node_modules"
if [ -d "$BACKEND/node_modules/better-sqlite3" ]; then
  cp -r "$BACKEND/node_modules/better-sqlite3" "$PACKAGE_TMP/lib/node_modules/"
  echo "Copiado: lib/node_modules/better-sqlite3"
fi

for cfg in config.enc .encryption_key key.bin; do
  if [ -f "$BACKEND/$cfg" ]; then
    cp "$BACKEND/$cfg" "$PACKAGE_TMP/"
    echo "Copiado: $cfg"
  fi
done

mkdir -p "$PACKAGE_TMP/public"
cp -r "$FRONTEND/dist/"* "$PACKAGE_TMP/public/"
echo "Copiado: public/"

mkdir -p "$PACKAGE_TMP/logs"
touch "$PACKAGE_TMP/logs/.gitkeep"

cat > "$PACKAGE_TMP/CONFIG-README.txt" << 'EOF'
Ananim Manager Painel - Instalação Linux

Estrutura: Ananim-Manager-Painel-API, public/, lib/, config/, data/, logs/.
Equivalente ao pacote IIS (Windows), sem .exe: um único binário Node (pkg).

1. Requisitos: nenhum (Node.js não é necessário no servidor; o binário é standalone).

2. Configuração: na pasta de instalação use config.enc + .encryption_key (recomendado)
   ou key.bin. Copie config.enc e a chave do projeto (backend/) para esta pasta.
   JWT_SECRET com pelo menos 32 caracteres (dentro do config.enc ou .env).

3. Executar:
   cd /caminho/do/pacote
   PORT=3001 NODE_ENV=production ./Ananim-Manager-Painel-API

   Ou use o unit systemd (ver LINUX-DEPLOY.md).

4. URL: http://localhost:3001/   Login demo: joao@example.com / admin123

5. Em produção: use um reverse proxy (Nginx/Caddy) com HTTPS na frente;
   defina FRONTEND_ORIGIN com a URL do frontend. Documentação: LINUX-DEPLOY.md e backend/SECURITY.md.
EOF

# Remover pastas que não devem ir no pacote
for dir in config data node_modules; do
  if [ -d "$PACKAGE_TMP/$dir" ]; then
    rm -rf "$PACKAGE_TMP/$dir"
    echo "Removido do pacote: $dir"
  fi
done

# Substituir package-linux
if [ -d "$PACKAGE" ]; then
  rm -rf "$PACKAGE"
fi
mv "$PACKAGE_TMP" "$PACKAGE"

echo ""
echo "Pacote Linux preparado em: $PACKAGE"
echo "Copie a pasta para o servidor Linux e execute:"
echo "  cd package-linux && PORT=3001 NODE_ENV=production ./Ananim-Manager-Painel-API"
echo "Documentação: LINUX-DEPLOY.md"
exit 0
