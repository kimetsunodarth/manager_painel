# Gerar executáveis do instalador (Windows e Linux)

O projeto oferece um **instalador unificado** que gera um executável para **Windows** (.exe, configura IIS) e outro para **Linux** (binário, configura Node e systemd).

---

## Opção principal: um exe para Windows e um para Linux (pkg)

Gera dois arquivos em uma vez: **Setup-Ananim-Panel.exe** (Windows) e **setup-ananim-panel** (Linux).

### 1. Gerar os executáveis

Na **pasta raiz do projeto** (onde estão `installer.js`, `package.json`, `Setup-IIS.ps1`):

```bash
npm install
npm run build
```

Ou, para gerar só um deles:

```bash
npm run build:win    # só Setup-Ananim-Panel.exe
npm run build:linux  # só setup-ananim-panel
```

Os arquivos são criados na pasta **dist/**:

- **dist/Setup-Ananim-Panel.exe** – Windows  
- **dist/setup-ananim-panel** – Linux  

### 2. Usar no Windows

1. Copie a **pasta completa do projeto** para o servidor (ex.: `C:\inetpub\ananim-panel`).
2. Copie **Setup-Ananim-Panel.exe** para **dentro dessa pasta** (raiz do projeto).
3. **Clique com o botão direito** em **Setup-Ananim-Panel.exe** → **Executar como administrador**.

O exe configura o IIS (pool, site, permissões) e roda `npm install` no backend. O script **Setup-IIS.ps1** vai embutido no exe; não é preciso tê-lo solto na pasta.

### 3. Usar no Linux

1. Copie a pasta do projeto para o servidor.
2. Coloque **setup-ananim-panel** na **raiz da pasta do projeto**.
3. Dê permissão e execute:

```bash
chmod +x setup-ananim-panel
./setup-ananim-panel
```

Ou, para instalar em outra pasta:

```bash
./setup-ananim-panel /caminho/para/pasta/do/projeto
```

O instalador executa `npm install --production` no backend, cria `.env` a partir de `.env.example` se não existir, e gera o arquivo **ananim-panel.service** (systemd). Depois é só configurar o serviço conforme as mensagens na tela.

---

## Resumo por plataforma

| Plataforma | Executável              | O que faz |
|-----------|-------------------------|-----------|
| **Windows** | Setup-Ananim-Panel.exe | Configura IIS (pool, site, permissões), npm install no backend. **Executar como Administrador.** |
| **Linux**   | setup-ananim-panel     | npm install no backend, cria .env se precisar, gera ananim-panel.service (systemd). |

---

## Outras formas (apenas Windows)

Se quiser **só** no Windows, sem usar o build com pkg:

- **Setup-IIS.bat** – Executar como administrador na pasta do projeto (não gera exe).
- **ps2exe** – Gerar um .exe a partir do PowerShell: use o script **Gerar-Setup-IIS-Exe.ps1** (veja abaixo).
- **Bat to Exe** – Converter **Setup-IIS.bat** com um conversor (ex.: F2KO) e marcar “Run as administrator”.

### Gerar só Setup-IIS.exe com ps2exe

No PowerShell (como Administrador):

```powershell
Install-Module -Name ps2exe -Scope CurrentUser -Force
cd "C:\caminho\para\huawei-cloud-panel"
.\Gerar-Setup-IIS-Exe.ps1
```

Será gerado **Setup-IIS.exe** na mesma pasta. Execute como administrador na pasta do projeto.

---

## Requisitos para o build (pkg)

- **Node.js** 18 (ou compatível) instalado.
- Na raiz do projeto: `npm install` (instala o `pkg` como dependência de desenvolvimento).

Para o **Windows**: no servidor é preciso ter **IIS**, **URL Rewrite** e **iisnode** instalados. Veja **IIS-DEPLOY.md**.

---

## API como .exe no IIS (HttpPlatformHandler)

Conceito igual ao projeto **adds-password-reset**: a API é compilada em um único **.exe** (sem expor código-fonte) e o IIS usa **HttpPlatformHandler** para iniciar esse processo. Não é necessário Node.js nem iisnode no servidor.

### 1. Gerar o pacote

Na **pasta raiz do projeto**:

```powershell
.\build-package-iis.ps1
```

Isso gera a pasta **package-iis/** com:

- **Huawei-Cloud-Panel-API.exe** – API empacotada (pkg)
- **public/** – frontend estático (index.html, app.js, style.css, etc.)
- **web.config** – configuração IIS (HttpPlatformHandler)
- **Setup-IIS.ps1** e **Configurar-IIS.bat** – scripts para criar o site no IIS
- **logs/** – pasta para logs do processo
- **CONFIG-README.txt** – instruções de configuração

### 2. Gerar o instalador .exe (Inno Setup)

Para gerar um **instalador Windows** (.exe) que instala a pasta e configura o IIS (como no projeto adds-password-reset):

1. Tenha o **Inno Setup 6** instalado: [https://jrsoftware.org/isdl.php](https://jrsoftware.org/isdl.php)
2. Com o pacote já gerado (passo 1), execute na **raiz do projeto**:
   ```powershell
   .\installer\compile-installer-iis.ps1
   ```
3. O instalador será criado em **installer/Output/Huawei-Cloud-Panel-IIS-Setup-1.0.0.exe**.

O instalador permite escolher: configurar o site no IIS (porta 8088) e instalar o HttpPlatformHandler. Após a instalação, coloque **config.enc** e **key.bin** na pasta do app (ex.: `C:\Program Files\Huawei Cloud Panel`).

### 3. Credenciais (ocultas e criptografadas)

**Recomendado:** use **config.enc** + **key.bin** para que nada fique em texto no servidor.

1. Na máquina de desenvolvimento (onde está o `.env`), gere os arquivos criptografados:
   ```bash
   cd backend
   npm run encrypt-config
   ```
   Isso gera `config.enc` e `key.bin` no backend. Copie **ambos** para a pasta do app no servidor (ao lado do .exe). A API carrega as variáveis descriptografando em memória; não deixe `.env` em texto no servidor.

**Alternativa (menos segura):** coloque um arquivo `.env` na pasta do app com `NODE_ENV=production`, `SESSION_SECRET` e credenciais. Em produção prefira config.enc.

### 4. No servidor

1. Copie a pasta **package-iis** inteira para o servidor (ex.: `C:\Program Files\Huawei Cloud Panel`).
2. Coloque **config.enc** e **key.bin** (ou .env) na mesma pasta do .exe.
3. **Clique com o botão direito** em **Configurar-IIS.bat** → **Executar como administrador**.

O script cria o site **huawei-cloud-panel** na porta **8088** e atualiza o `web.config` com o caminho absoluto do exe.

### 5. Requisitos no servidor

- **IIS** instalado.
- **HttpPlatformHandler** ([download](https://www.iis.net/downloads/microsoft/httpplatformhandler)).
- Não é necessário Node.js nem iisnode.

### 6. Resumo

| Item | Modo iisnode (atual) | Modo exe (novo) |
|------|----------------------|-----------------|
| Código no servidor | Código-fonte (backend/, frontend/) | Apenas .exe + public/ + web.config |
| Node.js no servidor | Necessário | Não necessário |
| Módulo IIS | iisnode + URL Rewrite | HttpPlatformHandler |
| Porta padrão | 80 (configurável) | 8088 |
