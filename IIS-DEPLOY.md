# Implantação da API no IIS

Este documento descreve como publicar a **API do Ananim Manager Painel** no **IIS (Internet Information Services)**, usando os mesmos métodos dos projetos **huawei-cloud-panel** e **adds-password-reset**: **iisnode**, **HttpPlatformHandler** ou **instalador Inno Setup (.exe)**.

**Resumo do projeto:** **RESUMO-PROJETO.md**. **Segurança (validação e melhorias):** **backend/SECURITY.md**.

---

## Opções de implantação

| Método | Módulo IIS | Requisitos no servidor | web.config |
|--------|------------|------------------------|------------|
| **iisnode** | iisnode + URL Rewrite | Node.js, iisnode, URL Rewrite | Raiz do projeto (padrão) |
| **HttpPlatformHandler** | HttpPlatformHandler | Node.js, HttpPlatformHandler | Copiar de `installer/iis/web.config` para a raiz |

A API escuta na porta definida pelo IIS (`HTTP_PLATFORM_PORT` ou `PORT`) e apenas em `127.0.0.1` quando rodando sob IIS.

---

## Pré-requisitos

1. **Windows Server** ou **Windows** com **IIS** instalado.
2. **Node.js LTS** (ex.: `C:\Program Files\nodejs\`).

Para **iisnode**:
3. **iisnode** – https://github.com/Azure/iisnode/releases (ex.: iisnode-full-v0.2.21-x64.msi).
4. **URL Rewrite Module** – https://www.iis.net/downloads/microsoft/url-rewrite.

Para **HttpPlatformHandler** (alternativa ao iisnode):
3. **HttpPlatformHandler** – https://www.iis.net/downloads/microsoft/httpplatformhandler (obrigatório; sem ele o site retorna 500.19).

---

## 1. Instalar componentes

### 1.1 Habilitar IIS

- **Painel de Controle** → **Programas** → **Ativar ou desativar recursos do Windows**:
  - Marque **Serviços de Informações da Internet (IIS)** e subitens (Console de Gerenciamento, etc.).
- Ou PowerShell (como Administrador):
  ```powershell
  Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole
  ```

### 1.2 iisnode (se usar essa opção)

- Instale **URL Rewrite** e depois **iisnode** (x64).
- O `web.config` na raiz usa `path="backend/src/index.js"` e `nodeProcessCommandLine="%ProgramFiles%\nodejs\node.exe"`. Ajuste se o Node estiver em outro caminho.

### 1.3 HttpPlatformHandler (se usar essa opção)

- Baixe e instale **HttpPlatformHandler** (x64). Reinicie o IIS.
- Copie `installer/iis/web.config` para a **raiz** do projeto (substituindo o `web.config` de iisnode).
- Edite `processPath` no `web.config` se o Node.js estiver em outro caminho (ex.: `D:\Node\node.exe`).

---

## 2. Instalador Inno Setup (.exe)

Para gerar um instalador Windows (igual Huawei Cloud Panel / adds-password-reset):

1. Na raiz do projeto: `.\installer\build-package-iis.ps1` (build do frontend, bundle + .exe do backend, instala **Chromium** em pasta dedicada e copia para `package-iis/browsers/`, monta `installer/package-iis/` com **exe**, **public/**, **lib/** (better-sqlite3), **browsers/** (Playwright/Chromium para **Ativar Support User**), **logs/**, web.config, scripts; **não** inclui config, data, node_modules na raiz).
2. Em seguida: `.\installer\compile-installer-iis.ps1` (requer Inno Setup 6). O instalador será criado em **installer\\Output\\Ananim-Manager-Painel-IIS-Setup-*.exe** (a versão no nome vem do script Inno Setup).
3. No servidor, execute o .exe **como Administrador**; marque a opção de configurar o site no IIS.
4. **Configuração pós-instalação:** copie **config.enc** e **key.bin** (ou **.encryption_key**) da pasta `backend/` do projeto para a **pasta do programa** (ex.: `C:\Program Files\Ananim Manager Painel\`). Não use .env em produção para segredos; o app lê JWT_SECRET e demais variáveis do config.enc. Ao **criar novos clientes** pela tela Clientes, o backend atualiza automaticamente o config.enc com as credenciais (não é necessário colar snippet). Reinicie o site no IIS se necessário.

A API roda como **.exe** (pkg); **não** é necessário Node.js no servidor. Veja **installer/README.md** e **DOCUMENTACAO.md**.

**Exe na pasta de instalação:** além do **Ananim-Manager-Painel-API.exe** (iniciado pelo IIS), o instalador inclui **Ananim-Abrir-Painel.exe** (abre o painel no navegador em http://localhost:8890/) e **Ananim-Configurar-IIS.exe** (executa Configurar-IIS.bat para criar/atualizar o site no IIS). A pasta **browsers/** (Chromium para **Ativar Support User** no SAP Control Center) é instalada junto; o .exe usa `PLAYWRIGHT_BROWSERS_PATH` apontando para ela. Descrição de cada exe: **installer/README.md** (seção "O que faz cada exe") e **CONFIG-README.txt** na pasta do programa.

## 3. Configuração automática (script, sem instalador)

1. Copie a pasta completa do projeto para o servidor (ex.: `C:\inetpub\ananim-manager-painel`).

2. Na pasta **backend** do projeto, instale as dependências e configure o ambiente:
   ```powershell
   cd C:\inetpub\ananim-manager-painel\backend
   npm install --production
   copy .env.example .env
   # Edite .env: PORT (opcional no IIS), JWT_SECRET (obrigatório em produção), demais variáveis.
   ```

3. Execute **Configurar-IIS.bat** como **Administrador** na pasta raiz do projeto (onde estão `web.config` e `Setup-IIS.ps1`).
   - O script cria o site **ananim-manager-painel** na porta **8890**, o App Pool **AnanimManagerPanel** com **Start Mode: AlwaysRunning**, **Idle Time-out: 0** e identidade **worker@cloud.local** (se informar a senha: `Setup-IIS.ps1 -AppPoolIdentity "worker@cloud.local" -AppPoolPassword "suaSenha"`). Permissões para IIS_IUSRS (e para a identidade do pool, se for conta específica).

4. **URL da API:** `http://localhost:8890/api/`  
   - Health: `http://localhost:8890/api/health`  
   - Se usou o instalador, a aplicação (frontend) também fica em `http://localhost:8890/`.

---

## 3. Estrutura esperada na raiz do site

```
C:\inetpub\ananim-manager-painel\
├── web.config              # iisnode ou HttpPlatformHandler (conforme opção)
├── Setup-IIS.ps1
├── Configurar-IIS.bat
├── backend\
│   ├── .env                # Variáveis (não versionar; ou config.enc)
│   ├── src\
│   │   ├── index.js
│   │   ├── config\
│   │   ├── data\            # ananim.db criado aqui
│   │   └── ...
│   └── node_modules\
├── frontend\               # Build do frontend pode ser servido por outro site ou proxy
├── iisnode\                # Logs do iisnode (criado pelo Setup)
└── logs\                   # api-stdout.log quando usar HttpPlatformHandler
```

O **frontend** em desenvolvimento usa proxy para `/api`. Em produção você pode:
- Fazer build do frontend (`npm run build` em `frontend/`) e servir os arquivos de `frontend/dist` por outro site IIS ou reverse proxy apontando a API para `http://localhost:8890/api`, ou
- Configurar um único site que sirva estáticos e repasse `/api` para o processo Node (requer regras de rewrite adicionais).

---

## 5. Criar o site no IIS (manual)

Se preferir não usar o script:

1. Abra **Gerenciador do IIS** (inetmgr).
2. **Application Pools** → Adicionar: nome **AnanimManagerPanel**, **Sem código gerenciado** (No Managed Code).
3. **Sites** → Adicionar: nome **ananim-manager-painel**, pasta física = pasta raiz do projeto, binding **http**, porta **8890**, pool = AnanimManagerPanel.
4. Na pasta do site, garanta que existem `web.config` e `backend\src\index.js`.
5. Permissões: a conta do App Pool (ex.: IIS AppPool\AnanimManagerPanel ou IIS_IUSRS) deve ter **Leitura e execução** e **Modificar** na pasta do site (para o backend criar/gravar `backend/src/data/ananim.db` e logs).

---

## 5. Segurança (web.config e backend)

- **web.config (HttpPlatformHandler / installer/iis/web.config):**
  - **hiddenSegments (requestFiltering):** bloqueia acesso HTTP direto a `node_modules`, `.env`, **`.encryption_key`**, **`config.enc`**, **`key.bin`**, `.git`, `logs`, `config`, `data`, **`lib`**. Assim, mesmo que o handler repasse tudo ao .exe, o IIS não entrega esses segmentos como recurso estático.
  - **directoryBrowse:** desabilitado.
  - O .exe recebe apenas requisições repassadas pelo IIS (não expõe arquivos do disco por URL).

- **Backend (.exe / index.js):**
  - Sob IIS (`HTTP_PLATFORM_PORT` ou `IISNODE_VERSION`), o app escuta em **127.0.0.1** (apenas tráfego do IIS).
  - Credenciais: use **config.enc + .encryption_key** (ou key.bin) na pasta do programa; **não** deixe .env com segredos em produção.

- **ACL na pasta do site:** o Setup-IIS.ps1 concede **Modify** a **IIS_IUSRS** para o app criar data/, logs e ananim.db. Restrinja o restante: apenas **Administradores** e a identidade do App Pool devem ter acesso à pasta; **config.enc** e a chave não devem ser legíveis por outros usuários do servidor.

- **Produção:** `NODE_ENV=production`, **JWT_SECRET** com pelo menos 32 caracteres (dentro do config.enc). Veja **backend/SECURITY.md** e **installer/package-iis/CONFIG-README.txt** (gerado pelo build).

---

## 7. Troubleshooting

| Erro | Causa / solução |
|------|------------------|
| **500.19 (0x80070021)** | Seção bloqueada. Execute como Admin: `%windir%\system32\inetsrv\appcmd.exe unlock config -section:system.webServer/handlers` e `unlock config -section:system.webServer/iisnode` (ou `httpPlatform`). Ou instale HttpPlatformHandler se estiver usando esse web.config. |
| **502.3 Bad Gateway** | O processo (.exe ou Node) não está subindo. Verifique: (1) **config.enc** e **key.bin** (ou .encryption_key) na pasta do programa (ex.: `C:\Program Files\Ananim Manager Painel\`); (2) JWT_SECRET com 32+ caracteres dentro do config.enc; (3) **logs\api-stdout.log** na pasta do site (mostra o erro exato); (4) pasta **lib\node_modules\better-sqlite3** presente; (5) permissões (IIS_IUSRS com Modify). Ver **DOCUMENTACAO.md**. |
| **Porta em uso** | Altere a porta no IIS (bindings do site) ou no script com `-Port 3010`. A API usa a porta injetada pelo IIS. |
| **404 em /api/health** | Confirme que todas as requisições são reescritas para `backend/src/index.js` (regra de rewrite no web.config). |

---

## 8. Referências

- iisnode: https://github.com/Azure/iisnode  
- HttpPlatformHandler: https://www.iis.net/downloads/microsoft/httpplatformhandler  
- **installer/iis/README-IIS.md** – resumo das duas opções (iisnode x HttpPlatformHandler).
