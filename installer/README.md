# Instalador IIS – Ananim Manager Painel

Gera um **instalador Windows (.exe)** com Inno Setup, no mesmo padrão dos projetos **huawei-cloud-panel** e **adds-password-reset**. A API é empacotada em um **único .exe** (pkg); o servidor **não** precisa de Node.js.

**Resumo do projeto:** **[RESUMO-PROJETO.md](../RESUMO-PROJETO.md)** (o que é, o que faz, documentação).

## Pré-requisitos

- **Node.js** e npm (para build do frontend e do backend no seu PC).
- **Inno Setup 6** – [download](https://jrsoftware.org/isdl.php).

No **servidor** onde o app será instalado:

- **IIS** instalado.
- **HttpPlatformHandler** – [download](https://www.iis.net/downloads/microsoft/httpplatformhandler) (obrigatório).
- **Node.js não é necessário** no servidor (a API roda como .exe).

## Passos para gerar o instalador

### 1. Gerar o pacote IIS

Na **raiz do projeto** (Ananim_manager_painel):

```powershell
.\installer\build-package-iis.ps1
```

Isso faz:

- Build do frontend (Vite) → `frontend/dist/`
- Build do backend (esbuild + pkg) → **Ananim-Manager-Painel-API.exe**
- Monta **installer/package-iis/** com: **Ananim-Manager-Painel-API.exe**, **public/** (frontend build), **lib/node_modules/better-sqlite3**, **logs/**, **web.config**, **Setup-IIS.ps1**, **Configurar-IIS.bat**, **CONFIG-README.txt**
- **Não** inclui: config/, data/, node_modules na raiz, iisnode (config e data são criados pelo app na primeira execução)

### 2. Compilar o instalador

```powershell
.\installer\compile-installer-iis.ps1
```

Ou abra **installer\\installer-iis.iss** no Inno Setup e use **Build > Compile**.

O instalador será gerado em **installer\\Output\\Ananim-Manager-Painel-IIS-Setup-*.exe** (a versão no nome vem do script Inno Setup, ex.: 1.0.2).

### Atualização rápida (só exe e frontend)

Após alterar apenas código do backend ou do frontend (sem mudar better-sqlite3 ou config.enc):

```powershell
.\installer\update-package-iis-quick.ps1
.\installer\compile-installer-iis.ps1
```

O script **update-package-iis-quick.ps1** faz build do frontend (vite), build do backend (bundle + exe) e copia o novo **Ananim-Manager-Painel-API.exe** e a pasta **public/** para `installer/package-iis/`. Depois, compile o instalador como acima.

**Resumo para recompilar após alterações no código:**  
`.\installer\update-package-iis-quick.ps1` → `.\installer\compile-installer-iis.ps1` → instalador em **installer/Output/Ananim-Manager-Painel-IIS-Setup-*.exe**.

**Script único (atualização rápida + compilação):**  
`.\installer\build-and-compile-iis.ps1` — executa em sequência `update-package-iis-quick.ps1` e `compile-installer-iis.ps1`.

### 3. Instalar no servidor

1. Copie o **Ananim-Manager-Painel-IIS-Setup-*.exe** (em installer/Output/) para o servidor.
2. Execute **como Administrador**.
3. Escolha a pasta de instalação (ex.: `C:\Program Files\Ananim Manager Painel`) e marque **"Configurar site no IIS ao final da instalação"** (recomendado).
4. **Configuração pós-instalação:** copie **config.enc** e **key.bin** (ou **.encryption_key**) da pasta **backend/** do seu projeto para a **pasta do programa** (onde está o .exe). O app lê JWT_SECRET e demais variáveis do config.enc; **não** use .env em produção para segredos. Para gerar config.enc e key: no projeto, `cd backend` e `npm run gerar-jwt-e-enc` (veja **DOCUMENTACAO.md**).
5. Reinicie o site no IIS (ou o App Pool **AnanimManagerPanel**) se necessário.

**URL:** `http://localhost:8890/` (aplicação e API no mesmo site; a API está em `/api`).

## Estrutura após a instalação

```
C:\Program Files\Ananim Manager Painel\
├── Ananim-Manager-Painel-API.exe   # API (IIS inicia este exe; não abra manualmente)
├── Ananim-Abrir-Painel.exe         # Launcher: abre o painel no navegador (http://localhost:8890/)
├── Ananim-Configurar-IIS.exe       # Launcher: executa Configurar-IIS.bat (criar/atualizar site IIS)
├── public/                         # Frontend (build)
├── lib/
│   └── node_modules/
│       └── better-sqlite3/         # Módulo nativo (obrigatório)
├── logs/                           # api-stdout.log (diagnóstico 502.3)
├── config.enc                      # Você copia (gerado no projeto)
├── key.bin                         # Você copia (ou .encryption_key)
├── web.config
├── Setup-IIS.ps1
├── Configurar-IIS.bat
└── CONFIG-README.txt
```

As pastas **config/** e **data/** são criadas automaticamente na primeira execução.

## O que faz cada exe

| Exe | Função |
|-----|--------|
| **Ananim-Manager-Painel-API.exe** | Executável principal da API. O IIS (HttpPlatformHandler) inicia este exe ao receber requisições no site. Serve a API (`/api`) e o frontend. Não deve ser iniciado manualmente. |
| **Ananim-Abrir-Painel.exe** | Launcher GUI: abre o painel no navegador padrão em `http://localhost:8890/`. Use o atalho do menu Iniciar **"Abrir Painel"** ou este exe após o site estar rodando. |
| **Ananim-Configurar-IIS.exe** | Launcher GUI: executa o **Configurar-IIS.bat** na pasta de instalação (cria ou atualiza o site **ananim-manager-painel** e o App Pool no IIS, porta 8890). Execute **como Administrador** quando precisar (re)configurar o site. |

## Tarefas do instalador

- **Configurar site no IIS** – Cria o site **ananim-manager-painel** na porta **8890**, App Pool **AnanimManagerPanel** e permissões. Se não marcar, execute **Configurar-IIS.bat** como Administrador depois.

## Edição de serviços e criação de cliente (admin)

- **Editar serviços:** na aba **Serviços**, se o usuário for **admin** e houver um cliente selecionado, aparece o link **"Editar serviços deste cliente"**, que leva à página **Clientes** e abre o modal de edição dos serviços (HANA, Web, Windows). O mesmo modal pode ser aberto em **Clientes** pelo link **"Editar serviços"** ao lado de cada cliente. Detalhes: **DOCUMENTACAO.md** (seção 7).
- **Criar cliente no IIS:** ao criar um cliente pela tela Clientes com config.enc na pasta do programa, o backend atualiza automaticamente o config.enc com as credenciais. A resposta inclui **envKeysWritten** (nomes das chaves gravadas); validar na aba Serviços com **"Testar conexão"**. Segurança: **backend/SECURITY.md**.

## Pacote Linux (equivalente ao IIS)

Para gerar um pacote **Linux** (binário + public + lib), equivalente ao do IIS mas para servidor Linux:

- **O build deve ser feito em Linux** (ou WSL2), pois o better-sqlite3 é nativo e o pkg gera binário Linux.
- Na raiz do projeto, no Linux: `chmod +x installer/build-package-linux.sh` e `./installer/build-package-linux.sh`.
- Saída: **installer/package-linux/** (binário `Ananim-Manager-Painel-API`, public/, lib/, logs/).
- No servidor: copie a pasta, coloque config.enc + key e execute `PORT=3001 NODE_ENV=production ./Ananim-Manager-Painel-API`.

Documentação completa: **[LINUX-DEPLOY.md](../LINUX-DEPLOY.md)** (systemd, Nginx, segurança).

## Segurança IIS

O **web.config** (installer/iis/web.config) inclui **requestFiltering** com **hiddenSegments** para bloquear acesso HTTP direto a: `.env`, `.encryption_key`, `config.enc`, `key.bin`, `config`, `data`, `logs`, `lib`, `node_modules`. Mantenha ACL restritas na pasta do site (apenas Administradores + identidade do App Pool). Documentação detalhada: **IIS-DEPLOY.md** (seção Segurança) e **backend/SECURITY.md** (incl. validação e melhorias).

## Troubleshooting

- **502.3 Bad Gateway:** abra **logs\\api-stdout.log** na pasta do programa; o log mostra o erro do exe (ex.: JWT_SECRET ausente). Confirme **config.enc** e **key.bin** (ou .encryption_key) na pasta. Veja **DOCUMENTACAO.md** (raiz do projeto) e **IIS-DEPLOY.md**.
