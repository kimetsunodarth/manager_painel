# Implantação no Linux (equivalente ao pacote IIS)

Este documento descreve como obter e rodar a **versão “pacote”** do Ananim Manager Painel no **Linux** — o equivalente ao instalador IIS no Windows: um **único binário** (sem precisar instalar Node.js no servidor), servindo API + frontend.

---

## Visão geral

| Item | Windows (IIS) | Linux |
|------|----------------|--------|
| Binário | `Ananim-Manager-Painel-API.exe` | `Ananim-Manager-Painel-API` |
| Build | `build-package-iis.ps1` + Inno Setup | `build-package-linux.sh` (rodar **no Linux**) |
| Servidor web | IIS (HttpPlatformHandler) | Processo direto ou atrás de Nginx/Caddy |
| Config | config.enc + key.bin (ou .encryption_key) | Idem |

A mesma lógica do pacote IIS vale no Linux: **config/** e **data/** são criados na primeira execução; o app lê **config.enc** (ou .env) e usa **lib/node_modules/better-sqlite3** para o banco SQLite.

---

## 1. Gerar o pacote Linux

O build do binário e do **better-sqlite3** é específico por sistema operacional. Por isso o pacote Linux precisa ser **construído em um ambiente Linux** (máquina Linux, WSL2 ou container).

### 1.1 No Linux (ou WSL2)

Na raiz do projeto:

```bash
chmod +x installer/build-package-linux.sh
./installer/build-package-linux.sh
```

O script:

1. Faz o build do frontend (Vite) → `frontend/dist/`
2. No backend: `npm rebuild better-sqlite3` e `npm run build:linux` (bundle + **pkg** para `node18-linux-x64`)
3. Monta a pasta **installer/package-linux/** com:
   - **Ananim-Manager-Painel-API** (binário)
   - **public/** (frontend)
   - **lib/node_modules/better-sqlite3**
   - **logs/**
   - **CONFIG-README.txt**

Se você tiver **config.enc** e **key.bin** (ou .encryption_key) em `backend/`, eles são copiados para o pacote (opcional; pode copiar depois no servidor).

### 1.2 Cross-compilar a partir do Windows

**pkg** não gera binário Linux a partir do Windows de forma confiável porque o **better-sqlite3** é um módulo nativo (`.node`). A opção é usar **WSL2** no Windows:

```powershell
wsl -d Ubuntu -- bash -c "cd /mnt/c/Projetos/Ananim_manager_painel && ./installer/build-package-linux.sh"
```

(Ajuste o caminho se o projeto estiver em outro disco/pasta no WSL.)

---

## 2. Instalar no servidor Linux

1. Copie a pasta **installer/package-linux/** (ou um .tar.gz dela) para o servidor, por exemplo:
   ```bash
   scp -r installer/package-linux usuario@servidor:/opt/ananim-manager-painel
   ```

2. Se não tiver **config.enc** e a chave no pacote, copie do projeto:
   ```bash
   scp backend/config.enc backend/key.bin usuario@servidor:/opt/ananim-manager-painel/
   ```

3. No servidor:
   ```bash
   cd /opt/ananim-manager-painel
   chmod +x Ananim-Manager-Painel-API
   PORT=3001 NODE_ENV=production ./Ananim-Manager-Painel-API
   ```

A aplicação fica em **http://localhost:3001/** (API em `/api`). Para escutar em todas as interfaces, o binário já usa `0.0.0.0` quando não está sob IIS (no Linux não há `HTTP_PLATFORM_PORT`).

---

## 3. Rodar como serviço (systemd)

Crie o unit em `/etc/systemd/system/ananim-manager-painel.service`:

```ini
[Unit]
Description=Ananim Manager Painel API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/ananim-manager-painel
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/opt/ananim-manager-painel/Ananim-Manager-Painel-API
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Ajuste **User** e **WorkingDirectory** se usar outro usuário ou pasta. Em seguida:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ananim-manager-painel
sudo systemctl start ananim-manager-painel
sudo systemctl status ananim-manager-painel
```

Logs: `journalctl -u ananim-manager-painel -f`.

---

## 4. Reverse proxy (Nginx) com HTTPS

Para expor a aplicação com HTTPS e eventualmente esconder a porta 3001:

```nginx
server {
    listen 443 ssl http2;
    server_name painel.seudominio.com.br;

    ssl_certificate     /etc/ssl/certs/seu-certificado.crt;
    ssl_certificate_key /etc/ssl/private/sua-chave.key;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

No **config.enc** (ou .env) do painel, defina:

```env
FRONTEND_ORIGIN=https://painel.seudominio.com.br
```

Assim o CORS e as políticas de segurança ficam corretos. Documentação de segurança: **backend/SECURITY.md**.

---

## 5. Segurança

- **config.enc** e **key.bin** (ou .encryption_key) são sensíveis: permissões restritas (ex.: `chmod 600`) e apenas o usuário do serviço deve ter acesso.
- **JWT_SECRET** com pelo menos 32 caracteres (dentro do config.enc).
- Em produção use **HTTPS** (reverse proxy) e **NODE_ENV=production**.
- Não exponha a pasta do pacote via servidor web; o app já serve o frontend e a API na mesma porta.

---

## 6. Referência rápida

| Ação | Comando |
|------|--------|
| Gerar pacote (no Linux) | `./installer/build-package-linux.sh` |
| Executar manualmente | `PORT=3001 NODE_ENV=production ./Ananim-Manager-Painel-API` |
| Build só do binário (backend) | `cd backend && npm run build:linux` |

Documentação geral: **DOCUMENTACAO.md**. Resumo do projeto: **RESUMO-PROJETO.md**. Segurança (validação e melhorias): **backend/SECURITY.md**.
