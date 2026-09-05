# Guia de instalação – Huawei Cloud Panel

> ⚠️ **Documento obsoleto (identificado em 2026-09-04).** Descreve o produto pelo nome antigo
> ("Huawei Cloud Panel", pré-rebranding para "Ananim Manager Painel"), porta padrão 8088, login
> `admin`/`admin123` e arquivos (`agendamentos.json`, `actionLog.json`, `SESSION_SECRET`) que não
> existem na versão atual. O fluxo de build/instalação real está documentado no **`README.md`**
> ("Build e deploy") e em **`docs/HANDOFF_AGENTE.md`**. Mantido aqui só como histórico até decisão
> de reescrever ou remover.

Este documento descreve **o que é necessário para compilar o projeto, gerar o executável (.exe) e o instalador**, **o que deve estar instalado no servidor para rodar a aplicação** e **o que fazer antes e depois** de cada etapa.

---

## Visão geral

| Etapa | Onde | Resultado |
|-------|------|-----------|
| Desenvolvimento / build | Máquina de desenvolvimento (Windows) | Código fonte, pacote `package-iis`, instalador `.exe` |
| Implantação | Servidor Windows com IIS | Site na porta 8088, painel acessível no navegador |

O fluxo resumido: **preparar .env → compilar backend em .exe → montar pacote IIS → compilar instalador Inno Setup → instalar no servidor → configurar IIS (se não foi feito pelo instalador) → colocar config.enc/key.bin na pasta do app.**

---

## 1. O que precisa para compilar e gerar o .exe

### 1.1 Requisitos na máquina de desenvolvimento (Windows)

| Requisito | Versão / observação |
|-----------|----------------------|
| **Windows** | 10 ou Server (64 bits) para build do .exe (alvo `node18-win-x64`) |
| **Node.js** | **18** (LTS). O `pkg` usa alvo `node18-win-x64`. Instale em [nodejs.org](https://nodejs.org/) ou via winget: `winget install OpenJS.NodeJS.LTS` |
| **npm** | Incluído com o Node.js |
| **PowerShell** | 5.1 ou superior (já vem no Windows) |
| **Inno Setup** | **6** (para gerar o instalador). Download: [jrsoftware.org/isdl.php](https://jrsoftware.org/isdl.php) |

### 1.2 Estrutura do projeto (antes de compilar)

- **Raiz do projeto** deve conter:
  - `backend/` (com `package.json`, `server.js`, `scripts/encrypt-config.js`, etc.)
  - `frontend/` (com `index.html`, `app.js`, `style.css`, etc.)
  - **`.env`** na raiz (veja seção “O que fazer antes de compilar”).
- Scripts na raiz: `build-package-iis.ps1`, `Recompilar-E-Gerar-Exe.ps1`.

---

## 2. O que fazer antes de compilar

### 2.1 Arquivo .env na raiz

O `.env` é usado para:

- **Criptografar** credenciais em `config.enc` + `key.bin` (incluídos no pacote ou copiados para `installer\Output`).
- O .exe em produção lê **config.enc + key.bin** (ou .env se não houver config criptografada).

**Passos:**

1. Copie `.env.example` para `.env` na **raiz** do projeto (ao lado de `backend/` e `frontend/`).
2. Preencha no `.env`:
   - **SESSION_SECRET** – obrigatório em produção. Gerar com:  
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`  
     Ou use o `Gerar-SESSION_SECRET.bat` (no pacote/instalador).
   - **Credenciais Huawei** – pelo menos uma conta, ex.: `RAMO_AK`, `RAMO_SK`, `ANANIM_AK`, `ANANIM_SK`, etc.
   - Opcionais: `NODE_ENV=production`, `PORT`, `CORS_ORIGIN`, `COOKIE_SECURE`, etc.
3. **Nunca** commite o `.env` (ele está no `.gitignore`).

Se você **não** criar `.env` antes do build, o script avisa: não haverá `config.enc`/`key.bin` no pacote. No servidor será preciso usar `.env` em texto ou gerar config depois e copiar para a pasta do app.

### 2.2 Instalar dependências do backend (automático no script)

O `build-package-iis.ps1` instala dependências e o `pkg` no `backend/` se ainda não existirem. Você pode fazer manualmente:

```powershell
cd backend
npm install
```

---

## 3. Compilar e gerar o exe / instalador

### 3.1 Opção A: Tudo de uma vez (recomendado)

Na **raiz do projeto**, no PowerShell:

```powershell
.\Recompilar-E-Gerar-Exe.ps1
```

Esse script:

1. **Criptografa** o `.env` → gera `config.enc` e `key.bin` na raiz (se existir `.env`).
2. **Monta o pacote IIS**: chama `build-package-iis.ps1` (instala deps, gera o .exe com `pkg`, copia frontend, web.config, scripts para `package-iis` e inclui config.enc/key.bin no pacote).
3. **Compila o instalador** Inno Setup → gera `installer\Output\Huawei-Cloud-Panel-IIS-Setup-1.0.0.exe`.

Requisitos para o passo 3: **Inno Setup 6** instalado (o script procura `ISCC.exe` em Program Files).

### 3.2 Opção B: Passo a passo

**Passo 1 – Pacote IIS (exe + frontend + config):**

```powershell
.\build-package-iis.ps1
```

- Gera `config.enc` e `key.bin` a partir do `.env` (se existir).
- Instala dependências e `pkg` no `backend`.
- Executa `npm run build:exe` no backend → gera `backend\dist\Huawei-Cloud-Panel-API.exe`.
- Gera **`logo.enc`** a partir de `frontend/logo.png` (mesma chave que config.enc) e **`Descriptografar-Logs.exe`** (ferramenta para ler logs criptografados).
- Cria a pasta **`package-iis`** com: `Huawei-Cloud-Panel-API.exe`, `Descriptografar-Logs.exe`, `public/` (frontend), `web.config`, `Setup-IIS.ps1`, `Configurar-IIS.bat`, `Run-IIS-Setup-Now.bat`, `Gerar-SESSION_SECRET.bat`, `logs/`, e (se gerados) `config.enc`, `key.bin` e `logo.enc`.

**Passo 2 – Instalador Inno Setup:**

```powershell
.\installer\compile-installer-iis.ps1
```

- Requer que **`package-iis\Huawei-Cloud-Panel-API.exe`** exista (ou seja, Passo 1 já executado).
- Requer **Inno Setup 6** instalado.
- Gera **`installer\Output\Huawei-Cloud-Panel-IIS-Setup-1.0.0.exe`**.
- Copia `config.enc` e `key.bin` do pacote para **`installer\Output`** (para você copiar manualmente para o servidor após a instalação, se não tiver embutido no instalador).

### 3.3 Arquivos gerados (resumo)

| Onde | O quê |
|------|--------|
| **Raiz** | `config.enc`, `key.bin`, `logo.enc` (se havia `.env` e `frontend/logo.png`; não versionar) |
| **backend\dist\** | `Huawei-Cloud-Panel-API.exe`, `Descriptografar-Logs.exe` |
| **package-iis\** | `.exe` da API, `Descriptografar-Logs.exe`, `public/`, `web.config`, scripts, `config.enc`, `key.bin`, `logo.enc`, `logs/` |
| **installer\Output\** | `Huawei-Cloud-Panel-IIS-Setup-1.0.0.exe`, e (se existirem) `config.enc`, `key.bin`, `logo.enc` |

---

## 4. O que precisa estar instalado para rodar (servidor Windows)

### 4.1 No servidor onde o painel será acessado

| Requisito | Descrição |
|-----------|-----------|
| **Windows Server** ou **Windows 10/11** | 64 bits. |
| **IIS (Internet Information Services)** | Função “Servidor Web (IIS)” com suporte a aplicações. |
| **HttpPlatformHandler** | Módulo do IIS que inicia o processo do .exe e encaminha as requisições. Download: [iis.net – HttpPlatformHandler](https://www.iis.net/downloads/microsoft/httpplatformhandler). |

Não é necessário instalar Node.js no servidor: a API roda como **Huawei-Cloud-Panel-API.exe** (Node empacotado com `pkg`).

### 4.2 Porta e firewall

- O site é criado na **porta 8088** (TCP) por padrão.
- Libere a porta **8088** no firewall do Windows (ou no firewall de rede) se o acesso for externo.

---

## 5. O que fazer antes de rodar no servidor

### 5.1 Instalar o painel

- **Opção A:** Executar o instalador **`Huawei-Cloud-Panel-IIS-Setup-1.0.0.exe`** (em `installer\Output\`) **como Administrador**. Escolha a pasta de instalação (ex.: `C:\Program Files\Huawei Cloud Panel`). Se marcar a tarefa “Configurar site no IIS ao final da instalação”, o script **Setup-IIS.ps1** será executado e criará o site na porta 8088.
- **Opção B:** Copiar manualmente a pasta **`package-iis`** para o servidor e depois executar **Configurar-IIS.bat** (ou **Setup-IIS.ps1**) **como Administrador** para criar o site no IIS.

### 5.2 Configuração (config.enc + key.bin ou .env)

- O .exe procura **config.enc** e **key.bin** na **mesma pasta do executável** (pasta de instalação). Se existirem, a aplicação usa essas credenciais (criptografadas).
- Se o instalador não incluiu config no pacote (por política de segurança), **copie** `config.enc` e `key.bin` de **`installer\Output`** (onde você compilou) para a **pasta do app** no servidor (ao lado do .exe).
- **Alternativa:** na pasta do app, criar um arquivo **`.env`** (pode usar como base o `ENV-EXAMPLE.txt` que vem no pacote), preencher `SESSION_SECRET` (use `Gerar-SESSION_SECRET.bat`) e as credenciais Huawei. Nesse caso o .exe pode rodar sem config.enc/key.bin.

### 5.3 Permissões

- O App Pool do IIS precisa **ler e gravar** na pasta do aplicativo (criação de `users.json`, `agendamentos.json`, `actionLog.json`, `logs/`). O script **Setup-IIS.ps1** / **Configurar-IIS.bat** concede permissão **Modify** para **IIS_IUSRS** na pasta do app e em `logs`. Se instalar manualmente, execute **Configurar-IIS.bat** como Administrador ou ajuste as permissões manualmente.

### 5.4 Primeiro acesso

- Abra no navegador: **http://localhost:8088** (ou **http://&lt;IP-do-servidor&gt;:8088**).
- **Usuário inicial:** `admin`  
- **Senha inicial:** `admin123`  
- Altere a senha após o primeiro login (a política exige 8+ caracteres, letra, número e caractere especial).

---

## 6. Resumo do fluxo completo

```
[Desenvolvimento]
  1. Instalar Node.js 18 e Inno Setup 6.
  2. Na raiz: criar .env (SESSION_SECRET + credenciais Huawei).
  3. Executar: .\Recompilar-E-Gerar-Exe.ps1
  4. Obter: installer\Output\Huawei-Cloud-Panel-IIS-Setup-1.0.0.exe
            installer\Output\config.enc e key.bin (copiar para o servidor depois)

[Servidor]
  5. Ter IIS e HttpPlatformHandler instalados.
  6. Executar o instalador .exe como Administrador (e opcionalmente “Configurar site no IIS”).
  7. Copiar config.enc e key.bin para a pasta do app (se ainda não estiverem).
  8. Se o site não foi criado: executar Configurar-IIS.bat como Administrador.
  9. Acessar http://localhost:8088 e fazer login (admin / admin123); trocar a senha.
```

---

## 7. Solução de problemas

| Problema | O que verificar |
|----------|------------------|
| **Build do .exe falha** | Node 18 instalado? `cd backend && npm install` e `npm run build:exe` manualmente; ver mensagem de erro. |
| **Instalador não compila** | Inno Setup 6 instalado? Caminho em Program Files. Executou antes `.\build-package-iis.ps1`? |
| **config.enc / key.bin não aparecem** | Só são gerados se existir `.env` na raiz ao rodar `build-package-iis.ps1`. Rode `node backend/scripts/encrypt-config.js` na raiz (com .env) e copie os arquivos gerados. |
| **500.19 (section is locked)** | Desbloquear handlers: em PowerShell (Admin), `& "$env:windir\system32\inetsrv\appcmd.exe" unlock config -section:system.webServer/handlers` e o mesmo para `system.webServer/httpPlatform`. Depois executar Configurar-IIS.bat. |
| **502.3 Bad Gateway** | .exe não está subindo: falta config (config.enc+key.bin ou .env com SESSION_SECRET); ou permissões (IIS_IUSRS na pasta do app). Para ver o erro: execute **Descriptografar-Logs.exe** (na pasta do app) para ler `logs\startup-error.log.enc` ou `logs\app.log.enc`, ex.: `Descriptografar-Logs.exe logs\startup-error.log.enc erro.txt` (key.bin deve estar na pasta do app). |
| **Agendamentos não executam / salto na data no log** | O cron roda no servidor a cada minuto e **não depende** do navegador nem de usuário logado. Se houver “salto” (dias sem entradas), o processo esteve parado. **Solução:** no IIS, Application Pool do site, defina **Idle Time-out (minutes) = 0**. Confira no log de ações as entradas “Cron ativo (heartbeat)” a cada 5 min; se faltarem, o processo foi encerrado. |
| **Login não funciona (cookie/sessão)** | Em HTTP (porta 8088 sem HTTPS), use no .env: `COOKIE_SECURE=false`. |
| **Porta 8088 em uso** | Altere a porta no script Setup-IIS.ps1 (parâmetro `-Port`) ou libere a porta no IIS para outro valor e ajuste o acesso no navegador. |

---

## 8. Referência rápida de comandos

| Ação | Comando (PowerShell na raiz) |
|------|------------------------------|
| Compilar tudo e gerar instalador | `.\Recompilar-E-Gerar-Exe.ps1` |
| Só gerar pacote IIS (exe + config) | `.\build-package-iis.ps1` |
| Só compilar instalador | `.\installer\compile-installer-iis.ps1` |
| Criptografar .env manualmente | `cd backend && node scripts/encrypt-config.js` |
| Criptografar logo (logo.png → logo.enc) | `cd backend && node scripts/encrypt-logo.js` (após encrypt-config; key.bin na raiz) |
| Gerar SESSION_SECRET | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Descriptografar logs no servidor | Na pasta do app: `Descriptografar-Logs.exe logs\app.log.enc saida.txt` (ou `logs\startup-error.log.enc`). Sem argumentos o exe mostra instruções. |

Para **rodar sem IIS** (só Node, ex.: desenvolvimento ou Linux), veja **DEPLOY-LINUX.md** ou execute na raiz: `cd backend && npm install && npm start` (painel em http://localhost:5000).
