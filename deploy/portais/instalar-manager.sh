#!/bin/bash
# Ananim Manager Painel na VM portais — preparação única (root): pastas, systemd, sudoers do reinício,
# certificado (Traefik/Route53, mesmo processo dos outros portais) e site nginx atrás do WAF.
# Uso: sudo bash instalar-manager.sh        (pode rodar de novo: não apaga dados nem sobrescreve o .env)
set -euo pipefail

BASE=/opt/ananim/ananim-manager-painel
SHARED=$BASE/shared
DOMAIN=ananim-manager.ananim.com.br
PORT=5192
APP_USER=ananim
UNIT=ananim-manager-painel
CERTDIR=/etc/nginx/qa-certs

[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo."; exit 1; }
NODE=$(command -v node) || { echo "node não encontrado no PATH do root."; exit 1; }
"$NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || { echo "Node 20+ necessário."; exit 1; }
[ -f /etc/nginx/conf.d/portais-waf-only.conf ] || { echo "Gate do WAF (/etc/nginx/conf.d/portais-waf-only.conf) ausente."; exit 1; }

echo "== Pastas"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$BASE" "$BASE/releases" "$BASE/incoming" "$BASE/bin"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$SHARED" "$SHARED/config" "$SHARED/data" "$SHARED/logs"

echo "== Variáveis do serviço ($SHARED/manager.env)"
if [ ! -f "$SHARED/manager.env" ]; then
  cat > "$SHARED/manager.env" <<EOF
NODE_ENV=production
ANANIM_ENV_PRIORITY=1
PORT=$PORT
LISTEN_HOST=127.0.0.1
BEHIND_PROXY=1
FRONTEND_ORIGIN=https://$DOMAIN
ANANIM_CONFIG_DIR=$SHARED/config
ANANIM_DATA_DIR=$SHARED/data
DB_PATH=$SHARED/data/ananim.db
EOF
  chown "$APP_USER:$APP_USER" "$SHARED/manager.env"; chmod 600 "$SHARED/manager.env"
else
  echo "   já existe; mantido."
fi

echo "== systemd ($UNIT.service)"
cat > /etc/systemd/system/$UNIT.service <<EOF
[Unit]
Description=Ananim Manager Painel (API + portal)
After=network-online.target
Wants=network-online.target
# config.enc + .encryption_key (copiados da produção) ficam em $SHARED; sem eles o serviço não sobe em produção.
ConditionPathExists=$SHARED/config.enc

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$SHARED
EnvironmentFile=$SHARED/manager.env
ExecStart=$NODE $BASE/current/backend/src/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$SHARED

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable $UNIT.service >/dev/null

echo "== sudoers (só reiniciar/consultar este serviço, para o atualizador)"
SYSTEMCTL=$(command -v systemctl)
TMP=$(mktemp)
cat > "$TMP" <<EOF
$APP_USER ALL=(root) NOPASSWD: $SYSTEMCTL restart $UNIT, $SYSTEMCTL is-active $UNIT
EOF
visudo -cf "$TMP" >/dev/null
install -o root -g root -m 440 "$TMP" /etc/sudoers.d/$UNIT; rm -f "$TMP"

echo "== Certificado $DOMAIN"
if [ ! -s "$CERTDIR/$DOMAIN.crt" ]; then
  /opt/ananim/cert/emitir-cert.sh "$DOMAIN"
else
  echo "   já existe; mantido."
fi
cat > /etc/systemd/system/ananim-cert-manager.service <<EOF
[Unit]
Description=Renova o certificado de $DOMAIN (Traefik + Route53)
[Service]
Type=oneshot
ExecStart=/opt/ananim/cert/emitir-cert.sh $DOMAIN
EOF
cat > /etc/systemd/system/ananim-cert-manager.timer <<EOF
[Unit]
Description=Renovação semanal do certificado de $DOMAIN
[Timer]
OnCalendar=Sun *-*-* 03:45
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now ananim-cert-manager.timer >/dev/null

echo "== nginx ($DOMAIN, só pelo WAF)"
cat > /etc/nginx/conf.d/ananim-manager.conf <<EOF
# Ananim Manager Painel — https://$DOMAIN — API/portal Node em 127.0.0.1:$PORT.
# Só aceita conexões que chegam pelo WAF (mapa em portais-waf-only.conf); qualquer outro par recebe 403.
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;
    set_real_ip_from 124.81.4.214;
    real_ip_header X-Real-IP;
    real_ip_recursive off;
    if (\$ananim_portais_waf_only = 0) { return 403; }

    ssl_certificate     $CERTDIR/$DOMAIN.crt;
    ssl_certificate_key $CERTDIR/$DOMAIN.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Documentos do portal e catálogo de serviços do agente (gzip, até 1 MB aberto).
    client_max_body_size 25M;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass         http://127.0.0.1:$PORT;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$remote_addr;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_read_timeout 300s;
    }

    access_log /var/log/nginx/ananim-manager-access.log;
    error_log  /var/log/nginx/ananim-manager-error.log;
}
EOF
nginx -t
systemctl reload nginx

echo
if [ -f "$SHARED/config.enc" ] && [ -e "$BASE/current" ]; then
  systemctl restart $UNIT && sleep 3 && systemctl is-active $UNIT
else
  echo "Pronto. Falta copiar config.enc e .encryption_key da produção para $SHARED (dono $APP_USER, modo 600)"
  echo "e rodar: sudo systemctl restart $UNIT"
fi
