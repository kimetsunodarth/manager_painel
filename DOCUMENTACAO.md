# Documentação — Ananim Manager Painel (v1.2.31)

Este documento reúne configuração, scripts, localização de arquivos e deploy (desenvolvimento e produção).

**Repositório:** [GitHub — kimetsunodarth/manager_painel](https://github.com/kimetsunodarth/manager_painel).  
**Visão geral do projeto (o que é, o que faz, documentação):** **[RESUMO-PROJETO.md](RESUMO-PROJETO.md)**.  
**Segurança (validação e melhorias):** **backend/SECURITY.md**.

---

## 0. Mudanças recentes (UI / Fluxo)

### Home — Projetos Huawei

- A Home exibe somente:
  - **Descobrir Projetos Automaticamente** (apenas admin)
  - **Barra Conta / Projeto / Carregar** para selecionar um projeto e listar ECS do projeto.
- A listagem/tabela completa de projetos e botões de “limpar/listar fonte” foram removidos da Home para simplificar o fluxo.
- Em projetos muito grandes (ex.: **Grupo Moove**), a API limita a lista retornada para evitar travar o painel:
  - sem filtro: retorna apenas os primeiros servidores (sem cálculo de discos),
  - com filtro (campo “Filtrar por cliente / nome”): a API aplica o filtro durante a paginação e retorna mais rápido.

### Clientes — melhorias de usabilidade

- **Busca** por nome ou `clientKey` na lista de “Clientes cadastrados”.
- Campo **clientKey** (slug) com:
  - sugestão automática a partir do Nome do cliente,
  - normalização (minúsculas + hífens),
  - aviso de duplicidade antes de enviar.
- Após criar o cliente, botão **“Testar conexão agora”** (atalho para validar SSH/JUMP via API, sem sair da tela).

## 1. Configuração: .env vs config.enc + chave

A aplicação aceita duas formas de configuração (mesmo conceito do **Huawei Cloud Panel** e **CBR**):

| Modo | Uso | Arquivos |
|------|-----|----------|
| **.env** | Desenvolvimento (pasta `backend/`) | `backend/.env` |
| **config.enc + chave** | Produção (recomendado; sem .env em texto plano) | `config.enc` + `.encryption_key` **ou** `key.bin` |

### Prioridade de carregamento

1. Se existirem **config.enc** e **.encryption_key** (ou **key.bin**) na pasta do programa, o backend descriptografa o conteúdo e preenche `process.env` (incluindo `JWT_SECRET`, perfis Huawei, SSH, etc.).
2. Caso contrário, usa o **.env** (carregado pelo dotenv).

Em produção (IIS / .exe), use **apenas config.enc + chave** na pasta de instalação; não deixe `.env` com segredos.

### Compatibilidade com FinOps (chaves globais)

Para reaproveitar o mesmo arquivo de credenciais usado no projeto **FinOps**, o backend também aceita as chaves globais abaixo (opcional, para os perfis master):

- `MOOVE_AK` / `MOOVE_SK` (perfil `MOOVE_SP_PRINCIPAL`)
- `RAMO_AK` / `RAMO_SK` (perfil `RAMO_SP_RAMOONE`)
- `ANANIM_AK` / `ANANIM_SK` (perfil `ANANIMCLOUD_MASTER`)
- `RSDONE_AK` / `RSDONE_SK` (perfil `RSDONE_CH_ZHOUSE`)

`*_REGION` e `*_PROJECT_ID` também são aceitos, mas **PROJECT_ID não é obrigatório para listar projetos IAM** (o painel resolve os projetos via IAM).

---

## 2. Onde ficam os arquivos de configuração

### No projeto (desenvolvimento)

| Arquivo | Caminho | Descrição |
|---------|---------|-----------|
| **.env** | `Ananim_manager_painel/backend/.env` | Variáveis em texto (não versionar). |
| **config.enc** | `Ananim_manager_painel/backend/config.enc` | Conteúdo do .env criptografado (Fernet). |
| **.encryption_key** | `Ananim_manager_painel/backend/.encryption_key` | Chave Fernet para descriptografar config.enc. |
| **key.bin** | `Ananim_manager_painel/backend/key.bin` | Cópia da mesma chave (opcional; app aceita .encryption_key ou key.bin). |

### Na instalação (produção)

Na pasta do programa (ex.: `C:\Program Files\Ananim Manager Painel\`):

- Coloque **config.enc** e **key.bin** (ou **.encryption_key**) na **raiz** dessa pasta (junto do .exe).
- **Não** use .env em produção para segredos; o app lê tudo do config.enc.

---

## 3. Como gerar JWT e os arquivos config.enc + chave

### Script único (recomendado): `gerar-jwt-e-enc`

No **backend** do projeto:

```bash
cd Ananim_manager_painel/backend
npm run gerar-jwt-e-enc
```

O script:

1. **Gera** um `JWT_SECRET` aleatório (32+ caracteres) e **exibe no console** (para você copiar no .env do projeto, se quiser).
2. Se o `.env` **não** tiver `JWT_SECRET`, **adiciona** essa linha ao `.env`.
3. Se **não** existir `.encryption_key`, **gera** a chave Fernet e grava em **.encryption_key** e **key.bin**.
4. **Lê** o `.env`, **criptografa** com Fernet e grava em **config.enc**.

Assim você obtém, no próprio backend:

- **JWT** para uso no .env (desenvolvimento) e já incluído no conteúdo que vai para config.enc.
- **config.enc** = .env criptografado (para copiar para produção).
- **.encryption_key** e **key.bin** = mesma chave (use um dos dois na instalação).

### Scripts alternativos (passo a passo)

| Comando | O que faz |
|--------|-----------|
| `npm run gerar-chave` | Gera apenas `.encryption_key` (Fernet). |
| `npm run encrypt-config` | Lê o `.env` e gera/atualiza **config.enc** (exige .encryption_key existente). |

**Fluxo manual:**  
1) `npm run gerar-chave` → cria `.encryption_key`.  
2) Edite o `.env` (JWT_SECRET, perfis Huawei, SSH, etc.).  
3) `npm run encrypt-config` → gera config.enc.

---

## 4. Variáveis obrigatórias em produção

- **JWT_SECRET** — pelo menos **32 caracteres**. Pode estar no conteúdo criptografado do config.enc (recomendado) ou no .env.
- **NODE_ENV=production** — definido no web.config (IIS) ou no .env/config.enc.

As demais variáveis (perfis Huawei, SSH, SMTP, etc.) dependem do uso; veja **backend/.env.example**.

---

## 5. Estrutura do projeto (resumo)

```
Ananim_manager_painel/
├── backend/
│   ├── .env                 # Desenvolvimento (não versionar)
│   ├── config.enc           # Produção: .env criptografado
│   ├── .encryption_key      # Chave Fernet (ou key.bin)
│   ├── key.bin              # Cópia da chave (opcional)
│   ├── src/
│   │   ├── index.js
│   │   ├── config/
│   │   │   ├── configLoader.js   # Carrega config.enc ou .env
│   │   │   ├── hana-clients/
│   │   │   ├── sql-clients/
│   │   │   └── control-center/
│   │   ├── routes/
│   │   └── data/            # ananim.db (SQLite)
│   ├── scripts/
│   │   ├── gerar_chave.js
│   │   ├── gerar-jwt-e-enc.js
│   │   └── encrypt_config.js
│   └── package.json
├── frontend/
├── installer/               # Build e Inno Setup
│   ├── build-package-iis.ps1
│   ├── compile-installer-iis.ps1
│   ├── package-iis/         # Pacote (exe, public, lib, logs)
│   └── Output/              # Ananim-Manager-Painel-IIS-Setup-1.0.0.exe
├── VERSION                   # Fonte única da versão (SemVer)
├── RELEASING.md              # Fluxo de versionamento/release
├── Ananim_Cloud_Portal_Documentacao.pdf  # PDF oficial do portal
├── gerar_doc_portal.js       # Gera o PDF acima (HTML→PDF)
├── gerar_doc.py              # Gerador PDF (ReportLab) - referência/alternativa
├── gerar_pdfs_retroativo.js  # PDFs retroativos (assinaturas/auditoria)
├── DOCUMENTACAO.md          # Este arquivo
├── README.md
├── IIS-DEPLOY.md
└── Setup-IIS.ps1
```

---

## 6. Build e instalador (produção IIS)

## 6.1 Versionamento (SemVer) e Release

O projeto usa `VERSION` como **fonte única** (SemVer `X.Y.Z`). Para atualizar:

```bash
node scripts/bump-version.mjs patch
# ou
node scripts/set-version.mjs 1.2.15
```

Isso sincroniza `backend/package.json`, `frontend/package.json` e `installer/installer-iis.iss`.
Detalhes: `RELEASING.md`.

### Gerar pacote e instalador

Na **raiz** do projeto:

```powershell
.\installer\build-package-iis.ps1
.\installer\compile-installer-iis.ps1
```

- **build-package-iis.ps1:** build do frontend, build do backend (bundle + .exe), instala Chromium em **browsers/** e monta `installer/package-iis/` com **exe**, **public/**, **lib/** (better-sqlite3), **browsers/**, **logs/**, **web.config**, scripts. **Não** inclui config, data, node_modules na raiz.
- **compile-installer-iis.ps1:** compila o Inno Setup; gera o instalador em **installer/Output/Ananim-Manager-Painel-IIS-Setup-*.exe** (o número da versão vem do script Inno Setup, ex.: 1.0.2).

**Atualização rápida (só exe e frontend):** após alterar apenas backend ou frontend, use:

```powershell
.\installer\update-package-iis-quick.ps1
.\installer\compile-installer-iis.ps1
```

O primeiro script faz build do frontend (Vite), build do backend (bundle + exe) e copia **Ananim-Manager-Painel-API.exe**, **public/** e **browsers/** para `installer/package-iis/`. O segundo gera o instalador em **installer/Output/**. Não refaz o rebuild do better-sqlite3 nem o config.enc.

---

## 8. Documentação em PDF (Portal)

- PDF oficial: `Ananim_Cloud_Portal_Documentacao.pdf`
- Regerar PDF:

```bash
node gerar_doc_portal.js
```

O gerador usa o logo em `Logos Ananim/` e lê a versão do projeto em `VERSION`.

### Estrutura após instalação (IIS)

```
C:\Program Files\Ananim Manager Painel\
├── Ananim-Manager-Painel-API.exe   # API (IIS inicia; nao abrir manualmente)
├── Ananim-Abrir-Painel.exe        # Launcher: abre o painel no navegador (http://localhost:8890/)
├── Ananim-Configurar-IIS.exe      # Launcher: executa Configurar-IIS.bat (criar/atualizar site IIS)
├── public/                         # Frontend (build)
├── lib/
│   └── node_modules/
│       └── better-sqlite3/         # Módulo nativo (obrigatório)
├── logs/                           # api-stdout.log (erros/início do exe)
├── browsers/                       # Chromium (Playwright) para Ativar Support User (vem do build)
├── config.enc                      # Você copia (conteúdo criptografado)
├── key.bin                         # Você copia (ou .encryption_key)
├── web.config
├── Setup-IIS.ps1
├── Configurar-IIS.bat
└── CONFIG-README.txt
```

As pastas **config/** e **data/** são **criadas automaticamente** na primeira execução do .exe (não vêm no instalador). A pasta **browsers/** é gerada pelo **build-package-iis.ps1** (ou **update-package-iis-quick.ps1**) para o recurso **Ativar Support User** (Control Center/SLD).

### Configuração pós-instalação

1. Copie **config.enc** e **key.bin** (ou **.encryption_key**) da pasta `backend/` do projeto para a pasta do programa.
2. Execute **Configurar-IIS.bat** como **Administrador** (cria site na porta 8890).
3. Acesse **http://localhost:8890/**.

Não é necessário **Node.js** no servidor: a API roda como **.exe** (pkg).

### Criação de cliente no IIS (config.enc automático)

Quando a API está rodando no IIS (ou como .exe na pasta de instalação), **ao criar um novo cliente** pela tela **Clientes** o backend detecta a presença de **config.enc** e **.encryption_key** (ou **key.bin**) na pasta do programa e **atualiza automaticamente** o config.enc com as credenciais do novo cliente. Não é necessário colar snippet no .env (no IIS não se usa .env). A tela exibe a mensagem: *"config.enc atualizado na pasta do programa (IIS). Credenciais já estão disponíveis."*

### Confirmar que SSH e Jump foram salvos

Após criar o cliente, a resposta da API inclui **envKeysWritten** — lista dos **nomes** das chaves gravadas no config (ex.: `SSH_HANA_MAXMOHR_JUMP_HOST`). Isso confirma que as credenciais SSH/Jump foram persistidas (no .env em desenvolvimento ou no config.enc no IIS). Para **validar** o acesso: na aba **Serviços**, selecione o cliente e use **"Testar conexão"**. Segurança: a API nunca retorna valores de senha; apenas os nomes das chaves em `envKeysWritten`. Ver **backend/SECURITY.md**.

### Usar perfil Huawei existente ao criar cliente

Na tela Clientes, ao criar um novo cliente é possível escolher **"Usar perfil de cliente existente"** e selecionar um perfil Huawei já carregado (ex.: MAXMOHR). O backend usa esse perfil em vez de criar um novo; opcionalmente pode-se escolher a **ECS para o nome do cliente**. Isso evita duplicar perfis no config. Se um cliente foi criado com perfil incorreto (ex.: maxmohr com perfil novo em vez de MAXMOHR), use o script **fix-maxmohr-perfil** (ver seção de scripts abaixo).

---

## 7. Edição de serviços do cliente

Os serviços exibidos na aba **Serviços** (HANA, Web, Windows) vêm dos arquivos em `backend/src/config/hana-clients/<clientKey>.json` e `<clientKey>-web.json`. É possível **editar** esses serviços em dois lugares:

| Onde | Como |
|------|------|
| **Clientes** | Na lista "Clientes cadastrados", cada cliente tem o link **"Editar serviços"**. Ao clicar, abre um modal com três áreas de texto (HANA, Web, Windows); edite e salve. |
| **Serviços** | Com um cliente selecionado no seletor (modo SQL/HANA), o link **"Editar serviços deste cliente"** (visível só para **admin**) leva à página Clientes e abre o mesmo modal para o cliente atual. |

**Formato no modal:**

- **Serviços HANA (VM destino):** uma linha por serviço: `id|Nome` (ex.: `serviceLayer|Reiniciar Service Layer`).
- **Serviços Web (Jump):** mesmo formato: `id|Nome`.
- **Serviços Windows:** uma linha por grupo: `id=Nome1,Nome2` (vírgula ou ponto-e-vírgula entre nomes).

Após salvar, a API atualiza os JSONs em `config/hana-clients/` e a aba Serviços passa a exibir a nova lista na próxima vez que o operador selecionar esse cliente.

---

## 8. Troubleshooting

Lista resumida. **Guia detalhado de erros e soluções:** **[docs/ERROS-E-TROUBLESHOOTING.md](docs/ERROS-E-TROUBLESHOOTING.md)**.

| Problema | O que verificar |
|----------|------------------|
| **Backend inacessível** | O frontend não consegue falar com a API. **Em desenvolvimento:** (1) Suba o backend primeiro: `cd backend && npm run dev` (porta 3001). (2) Se o backend estiver em outra porta (ex.: 3002), rode o frontend com `npm run dev:3002` (ou defina `VITE_API_PORT=3002`). (3) Confirme que não há firewall bloqueando. **No IIS (localhost:8890):** verifique se o site está iniciado no IIS e se config.enc + chave estão na pasta do programa; veja **logs\api-stdout.log** em caso de 502.3. |
| **SSH / Testar conexão após criar cliente** | Em desenvolvimento: credenciais vão para o `.env` — **reinicie o backend** após colar o snippet para as variáveis serem carregadas. No IIS: o backend atualiza o config.enc; **reinicie o site** no IIS para recarregar. Ver **docs/ERROS-E-TROUBLESHOOTING.md** (item 1). |
| **Playwright / Ativar Support User** | **Ativar Support User** (Control Center/SLD) usa Playwright e **Chromium**. No backend em desenvolvimento: `npm install playwright` (ou `npx playwright install chromium`) e reinicie. **No instalador IIS:** o build instala o Chromium em **browsers/** e copia para `package-iis/browsers`; o .exe usa `PLAYWRIGHT_BROWSERS_PATH` apontando para a pasta **browsers** na pasta do programa. Se faltar essa pasta na instalação, o recurso não funciona — refaça o build ou copie **browsers** de `installer/package-iis/` para a pasta de instalação. Erro comum: "Executable doesn't exist". Ver **docs/ERROS-E-TROUBLESHOOTING.md** (item 5). |
| **Programação deixa de funcionar ao editar** | O frontend deve enviar `projectKey`, `projectId`, `region` e `perfil` na edição do agendamento; o backend já está ajustado para não sobrescrever com vazios. Ver **docs/ERROS-E-TROUBLESHOOTING.md** (item 2). |
| **502.3 Bad Gateway** | Abra **logs\api-stdout.log** na pasta do programa: lá aparece o erro do exe (ex.: JWT_SECRET ausente, better-sqlite3 não encontrado). Confirme **config.enc** e **key.bin** (ou .encryption_key) na pasta. Ver **docs/ERROS-E-TROUBLESHOOTING.md** (item 8). |
| **JWT_SECRET obrigatório** | Em produção, o app exige JWT_SECRET com 32+ caracteres. Use **config.enc** com JWT_SECRET dentro (rode `npm run gerar-jwt-e-enc` no backend e copie config.enc + key para o servidor). |
| **Onde estão config e key?** | No projeto: `backend/config.enc`, `backend/.encryption_key`, `backend/key.bin`. Na instalação: na **raiz** da pasta do programa (junto do .exe). |

---

## 9. Programação (agendamentos) e Extensão de horário

- **Programação (admin):** Agendamentos por VM (Start/Stop em horários definidos), por projeto/região. Os dados ficam em `backend/src/config/vmScheduleV2.js` (arquivo JSON). Ao **editar** um agendamento, o frontend envia `projectKey`, `projectId`, `region` e `perfil` para o backend não perder o vínculo com o projeto. **Cancelar programação** é por data (apenas o dia selecionado); o dia seguinte segue com a programação normal.
- **Extensão de horário (admin):** Registro de horas a mais quando (1) o usuário cancela a programação do dia (stop não é executado no horário) ou (2) a VM é ligada manualmente após o horário de start. Os dados ficam em `backend/src/data/extension_sessions` (SQLite, tabela `extension_sessions`). A página **Extensão de horário** lista sessões com filtros e exibe cronômetro em tempo real para sessões em andamento. API: `GET /api/huawei/extension-sessions`.

---

## 10. Referência rápida de scripts (backend)

| Script | Comando | Descrição |
|--------|---------|-----------|
| Gerar chave | `npm run gerar-chave` | Cria `.encryption_key`. |
| JWT + config.enc + key | `npm run gerar-jwt-e-enc` | Gera JWT, atualiza .env se precisar, gera/atualiza config.enc e key. |
| Criptografar .env | `npm run encrypt-config` | Lê .env e gera config.enc (exige .encryption_key). |
| Ajustar perfil maxmohr | `node scripts/fix-maxmohr-perfil.js` | Ajusta o registry (perfilPattern) e visibleProjects para usar o perfil Huawei **MAXMOHR** já existente. Executar na pasta `backend/` quando o cliente maxmohr foi criado com perfil incorreto. |

Documentação de segurança (incl. validação e o que pode ser melhorado): **backend/SECURITY.md**.  
Erros comuns e soluções detalhadas: **docs/ERROS-E-TROUBLESHOOTING.md**.  
Deploy IIS detalhado: **IIS-DEPLOY.md**.  
Deploy Linux (binário equivalente ao pacote IIS): **LINUX-DEPLOY.md**.  
Resumo do projeto: **RESUMO-PROJETO.md**.

---

## 11. Backup (CBR) e tamanho

A listagem de backups usa a API CBR da Huawei. O tamanho pode vir em GB; valores inferiores a 1e6 são tratados como GB e convertidos para bytes na exibição. O backup listado é apenas consulta à API (não inclui configuração SSH); SSH é usado na aba Serviços para Testar conexão e ações nos serviços.
