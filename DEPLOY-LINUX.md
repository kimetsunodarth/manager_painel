# Instalação do Huawei Cloud Panel no Linux

Este documento descreve como instalar e executar o Huawei Cloud Panel em qualquer distribuição Linux. A aplicação é em Node.js; o instalador IIS (.exe) é apenas para Windows.

---

## Requisitos

- **Node.js 18** ou superior (LTS recomendado)
- Estrutura do projeto com as pastas `backend/`, `frontend/` e o arquivo de configuração na **raiz**

---

## 1. Instalar Node.js

Escolha o método conforme sua distribuição.

### Debian / Ubuntu

```bash
# Node 20 LTS (recomendado)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Conferir
node -v   # v20.x.x
npm -v
```

### RHEL / Fedora / CentOS / Rocky / AlmaLinux

```bash
# Node 20 LTS
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Ou no CentOS 7 / RHEL 7: yum install -y nodejs

node -v
npm -v
```

### openSUSE / SUSE Linux Enterprise

```bash
sudo zypper refresh
sudo zypper install nodejs18   # ou nodejs20, conforme disponível

# Alternativa: NodeSource para Node 20
# curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
# sudo zypper install nodejs

node -v
npm -v
```

### Arch Linux

```bash
sudo pacman -S nodejs npm
node -v
npm -v
```

---

## 2. Obter o projeto no servidor

Copie a árvore do projeto para o Linux (Git, rsync ou arquivo compactado).

Estrutura esperada na **raiz do projeto**:

```
/opt/huawei-cloud-panel/          (ou outro diretório)
├── .env                          # configuração (obrigatório ou config.enc + key.bin)
├── backend/
│   ├── package.json
│   ├── server.js
│   ├── config.js
│   ├── users.js
│   ├── schedules.js
│   ├── utils/
│   └── ...
└── frontend/
    ├── index.html
    ├── app.js
    ├── style.css
    └── ...
```

Exemplo com Git (se o projeto estiver em um repositório):

```bash
sudo mkdir -p /opt
cd /opt
sudo git clone <url-do-repositorio> huawei-cloud-panel
cd huawei-cloud-panel
```

Ajuste dono e permissões se necessário:

```bash
sudo chown -R seu_usuario:seu_usuario /opt/huawei-cloud-panel
```

---

## 3. Configuração (.env)

Na **raiz do projeto** (ao lado de `backend/` e `frontend/`) crie ou edite o arquivo `.env`. Use o `.env.example` do projeto como modelo.

Variáveis obrigatórias em produção:

| Variável         | Descrição |
|------------------|-----------|
| `SESSION_SECRET` | Chave secreta forte e única (sessões e criptografia de users/agendamentos). Gerar com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `RAMO_AK` / `RAMO_SK` | Credenciais da primeira conta Huawei (e as demais: `ANANIM_AK`, `ANANIM_SK`, etc., conforme suas contas) |

Exemplo mínimo de `.env`:

```bash
NODE_ENV=production
SESSION_SECRET=valor_gerado_pelo_comando_acima
PORT=5000

RAMO_AK=sua_access_key
RAMO_SK=sua_secret_key
# ANANIM_AK=...
# ANANIM_SK=...
```

- **Porta:** por padrão a aplicação usa a porta **5000**. Altere com `PORT=8080` no `.env` se quiser.
- **Produção com config criptografada:** você pode usar `config.enc` + `key.bin` na raiz em vez de `.env` (gerados no ambiente de build a partir do `.env`).

---

## 4. Instalar dependências e iniciar

Sempre a partir da pasta **backend**:

```bash
cd /opt/huawei-cloud-panel/backend
npm install --production
npm start
```

Saída esperada:

```
Painel e API em http://localhost:5000
```

A aplicação escuta em **0.0.0.0:5000** (todas as interfaces). Para acessar de outro computador na rede: `http://IP_DO_SERVIDOR:5000`.

Parar: `Ctrl+C`.

Para usar outra porta sem editar o `.env`:

```bash
PORT=8080 npm start
```

---

## 5. Executar como serviço (systemd)

Para iniciar o painel com o sistema e mantê-lo rodando em segundo plano:

1. Crie o arquivo de serviço (ajuste `User`, `Group` e `WorkingDirectory`):

```bash
sudo tee /etc/systemd/system/huawei-cloud-panel.service << 'EOF'
[Unit]
Description=Huawei Cloud Panel
After=network.target

[Service]
Type=simple
User=seu_usuario
Group=seu_usuario
WorkingDirectory=/opt/huawei-cloud-panel/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=5000

[Install]
WantedBy=multi-user.target
EOF
```

Substitua `seu_usuario` pelo usuário que deve rodar o Node (e que tem permissão de leitura na raiz do projeto e em `.env`). O `WorkingDirectory` deve ser a pasta **backend**.

2. Recarregue o systemd, ative e inicie o serviço:

```bash
sudo systemctl daemon-reload
sudo systemctl enable huawei-cloud-panel
sudo systemctl start huawei-cloud-panel
sudo systemctl status huawei-cloud-panel
```

Comandos úteis:

- Ver logs em tempo real: `journalctl -u huawei-cloud-panel -f`
- Reiniciar: `sudo systemctl restart huawei-cloud-panel`
- Parar: `sudo systemctl stop huawei-cloud-panel`

---

## 6. Reverse proxy com Nginx (opcional)

Para publicar o painel na porta 80 (ou 443 com HTTPS) em vez de expor a 5000 diretamente:

1. Instale o Nginx (ex.: `sudo apt install nginx`, `sudo dnf install nginx` ou `sudo zypper install nginx`).

2. Crie um arquivo de site (ex.: `/etc/nginx/conf.d/huawei-cloud-panel.conf` ou dentro de `sites-available` no Debian/Ubuntu):

```nginx
server {
    listen 80;
    server_name _;   # ou seu domínio / IP

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. Teste e recarregue o Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Se usar **HTTPS** (certificado no Nginx), no `.env` da raiz do projeto:

- Defina `COOKIE_SECURE=true` (ou o padrão em produção).
- Ajuste `CORS_ORIGIN` se o front for acessado por outro domínio.

---

## 7. Firewall

Se o firewall estiver ativo, libere a porta em que o painel escuta (ex.: 5000 se não usar Nginx, ou 80/443 se usar Nginx):

```bash
# firewalld (RHEL, Fedora, openSUSE)
sudo firewall-cmd --permanent --add-port=5000/tcp
sudo firewall-cmd --reload

# ufw (Debian/Ubuntu)
sudo ufw allow 5000/tcp
sudo ufw reload
```

Se o acesso for só via Nginx em 80/443, libere essas portas e não é necessário expor a 5000 externamente.

---

## 8. Resumo do processo

| Passo | Ação |
|-------|------|
| 1 | Instalar Node.js 18+ (apt/dnf/zypper/pacman) |
| 2 | Copiar o projeto para o servidor (raiz com `backend/`, `frontend/`, `.env`) |
| 3 | Editar `.env` na raiz (SESSION_SECRET, contas Huawei, PORT se quiser) |
| 4 | `cd backend && npm install --production && npm start` |
| 5 | (Opcional) Configurar systemd para iniciar com o sistema |
| 6 | (Opcional) Nginx como reverse proxy na porta 80/443 |
| 7 | (Opcional) Liberar porta no firewall |

**Primeiro acesso:** usuário padrão `admin`, senha `admin123`. Altere a senha após o primeiro login (área de usuários / admin).

---

## Referência rápida

| Ambiente     | Como rodar |
|-------------|------------|
| Windows     | Instalador .exe + Setup-IIS.ps1 (site na porta 8088) |
| Linux       | Node.js na raiz do projeto; `cd backend && npm start` (porta 5000 ou a definida em `PORT`) |

A mesma aplicação roda em Windows (IIS) e em Linux (Node); apenas o modo de instalação e execução muda.
