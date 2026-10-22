#!/bin/bash
# Instala/atualiza o Ananim Manager Agent (Linux). Uso, como root, na pasta com os arquivos do agente:
#   bash install.sh                                  instala/atualiza (ativação e chave ficam como estão)
#   bash install.sh --code XXXX-XXXX-XXXX [--url https://ananim-manager.ananim.com.br]   instala e ativa
#   bash install.sh --hana-processos      também mostra os processos do HANA e reinicia os secundários (teste)
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
BIN=/usr/local/sbin/ananim-manager-agent
UNIT=/etc/systemd/system/ananim-manager-agent.service
CODE=""; URL=""; ENROLL=""; HANA_PROCS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --code) CODE="$2"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    --hana-processos) HANA_PROCS=on; shift ;;
    *) echo "Opção inválida: $1"; exit 1 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "Rode como root (sudo)."; exit 1; }

# Pacote baixado do painel já com a ativação deste servidor (Servidores → Conectar → Baixar para Linux): sem digitar código.
if [ -z "$CODE" ] && [ -f "$HERE/ativacao.conf" ]; then
  CODE=$(sed -n 's/^CODE=\([A-Za-z0-9-]*\)$/\1/p' "$HERE/ativacao.conf" | head -1)
  ENROLL=$(sed -n 's/^ENROLL=\([A-Za-z0-9_-]*\)$/\1/p' "$HERE/ativacao.conf" | head -1)
  [ -n "$URL" ] || URL=$(sed -n 's#^URL=\(https://[A-Za-z0-9.:-]*\)/*$#\1#p' "$HERE/ativacao.conf" | head -1)
  { [ -n "$CODE" ] || [ -n "$ENROLL" ]; } && echo "Usando a ativação que veio no pacote."
fi
command -v python3 >/dev/null || { echo "python3 não encontrado (SUSE: zypper install python3)."; exit 1; }
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 6) else 1)' || { echo "Python 3.6+ necessário."; exit 1; }
command -v openssl >/dev/null || { echo "openssl não encontrado."; exit 1; }
command -v systemctl >/dev/null || { echo "systemd necessário."; exit 1; }

install -m 0755 -o root -g root "$HERE/ananim-manager-agent" "$BIN.new"
mv -f "$BIN.new" "$BIN"
install -m 0644 -o root -g root "$HERE/ananim-manager-agent.service" "$UNIT"
install -d -m 0700 -o root -g root /etc/ananim-manager-agent
systemctl daemon-reload

if [ -n "$CODE" ] || [ -n "$ENROLL" ]; then
  if grep -q '"agentId"' /etc/ananim-manager-agent/config.json 2>/dev/null && [ -f "$HERE/ativacao.conf" ]; then
    echo "Este servidor já está ativado; a ativação do pacote não foi usada (só atualizei o agente)."
  elif [ -n "$CODE" ]; then
    "$BIN" activate --code "$CODE" ${URL:+--url "$URL"}
  else
    "$BIN" activate --enroll "$ENROLL" ${URL:+--url "$URL"}
  fi
  # Código de uso único; a chave do projeto também não fica no servidor depois de usada.
  rm -f "$HERE/ativacao.conf"
fi

# Teste: processos do HANA (ver + reiniciar secundários) só quando pedido.
if [ -n "$HANA_PROCS" ]; then "$BIN" config --hana-processos on; fi

if [ -f /etc/ananim-manager-agent/config.json ] && grep -q '"agentId"' /etc/ananim-manager-agent/config.json; then
  systemctl enable ananim-manager-agent >/dev/null 2>&1
  systemctl restart ananim-manager-agent
  sleep 2
  "$BIN" status
else
  echo "Instalado. Ative com: $BIN activate --code <código do painel>  e depois: systemctl enable --now ananim-manager-agent"
fi
