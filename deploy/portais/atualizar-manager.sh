#!/bin/bash
# Publica uma release do Ananim Manager Painel na VM portais (usuário ananim, sem senha).
# Uso: atualizar-manager.sh <pacote.tgz>    (o publicar-portais.py do Windows envia o pacote e chama este script)
# Passos: releases/<ts> → npm ci --omit=dev → modelos novos de config → current → reinício → /api/health; falha = volta a release anterior.
set -euo pipefail

BASE=/opt/ananim/ananim-manager-painel
SHARED=$BASE/shared
UNIT=ananim-manager-painel
PKG=${1:?uso: atualizar-manager.sh <pacote.tgz>}
KEEP=5

[ -f "$PKG" ] || { echo "Pacote não encontrado: $PKG"; exit 1; }
mkdir -p "$BASE/releases"
install -d -m 700 "$SHARED" "$SHARED/config" "$SHARED/data" "$SHARED/logs"
TS=$(date +%Y%m%d-%H%M%S)
REL=$BASE/releases/$TS
mkdir -p "$REL"
tar -xzf "$PKG" -C "$REL"
for f in .env config.enc .encryption_key key.bin; do
  if find "$REL" -name "$f" -not -path '*/node_modules/*' | grep -q .; then echo "Pacote contém $f; recusado."; rm -rf "$REL"; exit 1; fi
done
[ -f "$REL/backend/src/index.js" ] && [ -f "$REL/public/index.html" ] || { echo "Pacote incompleto."; rm -rf "$REL"; exit 1; }

echo "== Dependências ($REL/backend)"
(cd "$REL/backend" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)

echo "== Modelos de configuração (só arquivos novos; o que já existe em $SHARED/config fica como está)"
(cd "$REL/backend/src/config" && find . -type f ! -name '*.js' -print0 | while IFS= read -r -d '' f; do
  [ -e "$SHARED/config/$f" ] || { mkdir -p "$SHARED/config/$(dirname "$f")"; cp -p "$f" "$SHARED/config/$f"; echo "   + $f"; }
done)

PREV=$(readlink -f "$BASE/current" 2>/dev/null || true)
ln -sfn "$REL" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
echo "== current → $TS"

restart() { sudo -n systemctl restart $UNIT; }
healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 3 http://127.0.0.1:5192/api/health 2>/dev/null; then echo; return 0; fi
    sleep 1
  done
  return 1
}

if [ ! -f "$SHARED/config.enc" ]; then
  echo "Release instalada; o serviço ainda não sobe: falta $SHARED/config.enc (+ .encryption_key). Ver deploy/portais/LEIAME.md."
elif ! sudo -n -l systemctl restart $UNIT >/dev/null 2>&1; then
  echo "Sem permissão para reiniciar (rode antes: sudo bash instalar-manager.sh)."
else
  restart
  if healthy; then
    echo "OK: release $TS no ar."
  else
    echo "Falha no /api/health da release $TS."
    if [ -n "$PREV" ] && [ -d "$PREV" ]; then
      ln -sfn "$PREV" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
      restart; healthy && echo "Revertido para $(basename "$PREV")." || echo "Release anterior também não respondeu; veja: journalctl -u $UNIT"
    fi
    exit 1
  fi
fi

echo "== Limpeza (mantém as $KEEP releases mais recentes e a atual)"
CUR=$(readlink -f "$BASE/current")
ls -1dt "$BASE"/releases/*/ | sed 's#/$##' | tail -n +$((KEEP + 1)) | while read -r old; do
  [ "$old" = "$CUR" ] || rm -rf "$old"
done
rm -f "$PKG"
