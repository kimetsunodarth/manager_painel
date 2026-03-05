# Ananim Manager Painel

Painel web para gerenciamento de ambientes **Huawei Cloud** e **SAP B1**: ECS, serviços SAP/HANA, backups (CBR), licenças, documentos e clientes, com controle de usuários e permissões (admin/operador).

**Repositório:** [https://github.com/kimetsunodarth/manager_painel](https://github.com/kimetsunodarth/manager_painel)

**Resumo do projeto (o que é, o que faz, documentação):** **[RESUMO-PROJETO.md](RESUMO-PROJETO.md)**.

## Como acessar o site

1. **Subir o backend** (obrigatório antes do frontend):
   ```bash
   cd backend
   npm install
   npm run dev
   ```
   A API fica em **http://localhost:3001** (ou na próxima porta livre, ex.: 3002, se 3001 estiver em uso).

2. **Subir o frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   O site abre em **http://localhost:5173**.

3. **Abrir no navegador**: acesse **http://localhost:5173**.  
   Se o backend estiver em outra porta (ex.: 3002), rode o frontend com:
   ```bash
   npm run dev:3002
   ```
   para o proxy de `/api` apontar para a porta correta.

4. **Login** (usuário de demonstração):
   - **E-mail:** joao@example.com  
   - **Senha:** admin123  

   (Altere em produção. O primeiro usuário admin é criado automaticamente se não existir nenhum.)

**Resumo:** Site = **http://localhost:5173** | API = **http://localhost:3001** | Login = joao@example.com / admin123

## Funcionalidades

- **Página inicial**: Lista de ambientes com filtros (IP, País, VLAN, Ambiente, Cliente, Parceiro, ERP). Colunas: sincronizado em, bases atuais, add-ons, usuários licenciados, status. Ações: reiniciar ECS, ver detalhes/backups, licenças.
- **Serviços**: Lista de serviços por cliente (HANA, Web, Windows) com ações Executar/Listar. **Testar conexão** SSH; **Ativar Support User** no SAP Control Center (SLD) quando configurado. Exibe última execução e status.
- **Programação** (admin): Agendamentos por VM (**Start**, **Stop** ou **Restart**) em horários definidos. Horário configurável com seletor de tempo ou botões ±15 min. Coluna **Criado / Modificado por** indica quem criou ou editou o agendamento. Cancelar programação para um dia específico (no dia seguinte a programação oficial segue). Diagnóstico de agendamentos (hora do servidor, devidos agora).
- **Extensão de horário** (admin): Consulta de horas a mais por cancelamento da programação do dia ou por ligar a VM após o horário. Cronômetro em tempo real para sessões em andamento.
- **Detalhes / Backups**: Tabela paginada de snapshots/backups do dia (IP do ambiente, Cliente, Parceiro, Nome do Backup, Tamanho). Busca e resultados por página.
- **Licenças SAP**: Quantidade de licenças SAP (CRM, Financials, Logistics, Professional, etc.) e add-on(s) detalhes (gráfico).
- **Documentos**: Lista de documentos cadastrados com data de upload e download.
- **Clientes** (apenas admin): **Adicionar** novo cliente HANA/Control Center (nome, credenciais Jump e HANA, serviços, opcional Control Center, atribuir a operadores) e **Excluir** cliente (remove do registry e arquivos de config). É possível usar um **perfil Huawei existente** (dropdown). O sistema gera os arquivos e devolve snippet para `backend/.env` (no IIS atualiza o config.enc automaticamente). Validar na aba Serviços com **Testar conexão**. Veja [Adicionar cliente (admin)](#adicionar-cliente-admin).
- **Usuários**: Adicionar usuário com permissões; definir ECS permitidos para start/stop/restart. Perfis: admin (acesso total) ou operador (apenas ECS selecionados).

## Configuração: .env e config.enc + chave (igual Huawei Cloud Panel / CBR)

- **Desenvolvimento:** use `backend/.env` (JWT_SECRET, perfis Huawei, SSH, etc.).
- **Produção (recomendado):** use **config.enc** + **.encryption_key** ou **key.bin** na pasta do programa; não deixe .env com segredos.

**Como gerar JWT e os arquivos criptografados:**

```bash
cd backend
npm run gerar-jwt-e-enc
```

Isso gera/atualiza **config.enc** e a chave (**.encryption_key** e **key.bin**); o **JWT_SECRET** é exibido no console e, se faltar, adicionado ao .env. Em produção, copie **config.enc** e **key.bin** (ou .encryption_key) para a pasta de instalação. Documentação completa: **[DOCUMENTACAO.md](DOCUMENTACAO.md)**.

**Acesso à Huawei (mesmo conceito do CBR):**

1. **config.enc + .encryption_key ou key.bin** (recomendado)  
   - Pode copiar `.encryption_key` e `config.enc` do projeto **CBR** para o `backend/` e usar os mesmos perfis.  
   - Ou: `npm run gerar-jwt-e-enc` (gera chave e config.enc a partir do .env); ou `npm run gerar-chave` → edite `.env` com perfis (NOME_ACCESS_KEY, NOME_SECRET_KEY, etc.) → `npm run encrypt-config`.

2. **Fallback .env**  
   - Se não existir `config.enc` (e chave), o backend usa variáveis do `.env`.

**Listagem de projetos Huawei (API real)**  
- A **busca de novos projetos pela API** (botão “Carregar projetos Huawei” na página inicial) está disponível **somente para usuários administradores**. Operadores não veem a seção nem conseguem chamar a API.

## Banco interno (usuários e logs)

Usuários criados e o **log de auditoria** são gravados em um banco SQLite interno (`backend/src/data/ananim.db`). Não é necessário criar usuários a cada login: o primeiro start do backend cria o arquivo e, se não existir nenhum usuário admin, um admin padrão é criado (joao@example.com — **redefina a senha no primeiro acesso**). Para usar outro caminho, defina a variável `DB_PATH` no `.env`.

**Segurança:** medidas de proteção (JWT, CORS, rate limit, validação, Helmet), checklist de produção, **validação de segurança** e **o que pode ser melhorado** estão em **[backend/SECURITY.md](backend/SECURITY.md)**. Ao alterar dependências ou comportamento com impacto em segurança, atualize `backend/SECURITY.md` e `backend/.env.example`.

## Requisitos

- Node.js 18+
- npm ou yarn

## Instalação e execução

### Backend

```bash
cd Ananim_manager_painel/backend
cp .env.example .env
# Edite .env: PORT, JWT_SECRET
# Opção A: copie .encryption_key e config.enc do projeto CBR para este diretório
# Opção B: npm run gerar-chave; edite .env com perfis (NOME_ACCESS_KEY, ...); npm run encrypt-config
npm install
npm run dev
```

API disponível em **http://localhost:3001**.

### Frontend

```bash
cd Ananim_manager_painel/frontend
npm install
npm run dev
```

Interface em **http://localhost:5173**. O Vite faz proxy de `/api` para o backend na porta 3001. **Se o backend subir em outra porta** (ex.: 3002), rode no frontend: `npm run dev:3002` para o proxy apontar para a porta correta.

## Adicionar cliente (admin)

Administradores podem cadastrar novos clientes HANA (e opcionalmente Control Center) pela página **Clientes** (menu lateral, apenas para admin), em **http://localhost:5173/clientes**.

1. Preencha **Nome do cliente**, **Chave** (slug, opcional), credenciais **Jump** (servidor web) e **HANA** (destino). Se o cliente tiver SAP Control Center (SLD), informe **URL base**, **usuário** e **senha**.
2. **Serviços (aba Serviços):** opcionalmente defina os serviços que aparecerão na aba Serviços:
   - **Serviços HANA (VM destino):** uma linha por serviço, formato `id|Nome` (ex.: `serviceLayer|Reiniciar Service Layer`). Se vazio, usa lista padrão.
   - **Serviços Web (Jump):** mesmo formato (ex.: `invent-dfe|Invent DFe`).
   - **Serviços Windows:** mapeamento para clientes Web — uma linha por grupo, formato `id=NomeServ1,NomeServ2` (nomes reais no Windows).
3. **Atribuir a operadores:** marque os usuários (ex.: Edmar) que já devem ver este cliente na aba **Serviços**; o sistema atualiza o `visibleProjects` deles automaticamente.
4. Clique em **Gerar arquivos e snippet .env**.
5. O backend cria os JSONs em `config/hana-clients/`, `config/control-center/` (se informado) e atualiza `dynamic-clients-registry.json`. A resposta exibe um **snippet** para colar no `backend/.env`; **copie e cole**, depois **reinicie o backend** para que as variáveis de ambiente e o novo cliente sejam carregados (em desenvolvimento, o backend passa a reconhecer o cliente sem reinício para regras dinâmicas; as credenciais SSH só ficam disponíveis após reinício ou uso de config.enc). **No IIS** (instalação com .exe), o backend atualiza automaticamente o **config.enc** com as credenciais do novo cliente — não é necessário colar no .env. A resposta inclui **envKeysWritten** (nomes das chaves SSH/Jump gravadas); para validar o acesso, use **Testar conexão** na aba **Serviços**.

**Editar serviços depois:** em **Clientes**, use o link **"Editar serviços"** ao lado de cada cliente; na aba **Serviços** (como admin), o link **"Editar serviços deste cliente"** abre o mesmo modal. Ver **DOCUMENTACAO.md** (seção 7).

As credenciais reais ficam apenas no `.env` (ou config.enc); os JSONs só referenciam nomes de variáveis. Documentação de segurança: [backend/SECURITY.md](backend/SECURITY.md).

## Estrutura do projeto

```
Ananim_manager_painel/
├── backend/
│   ├── src/
│   │   ├── index.js              # Servidor Express
│   │   ├── middleware/auth.js
│   │   ├── config/
│   │   │   ├── configLoader.js    # Carrega config.enc (Fernet) ou .env
│   │   │   ├── hana-clients/      # JSON por cliente HANA (roland, controlla, + dinâmicos)
│   │   │   ├── control-center/    # JSON por cliente Control Center
│   │   │   └── dynamic-clients-registry.json  # Clientes adicionados pela página admin
│   │   ├── routes/               # auth, users, environments, ecs, services, backups, licenses, documents, huawei, adminClients
│   │   ├── services/clientGenerator.js  # Gera JSONs e registry ao adicionar cliente
│   │   └── data/                 # store, environments, backups, licenses, documents (mock)
│   ├── scripts/gerar_chave.js    # Gera .encryption_key (Fernet)
│   ├── scripts/gerar-jwt-e-enc.js # Gera JWT, config.enc e key (recomendado)
│   ├── scripts/encrypt_config.js  # Criptografa .env → config.enc
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api/client.ts         # Cliente API e tipos
│   │   ├── components/Layout.tsx
│   │   └── pages/                # Login, Home, Servicos, DetalhesBackups, Licencas, Documentos, Clientes, Usuarios, Logs
│   ├── index.html
│   └── package.json
├── installer/                    # Build e Inno Setup (package-iis, browsers/ Chromium)
├── installer/iis/                # web.config HttpPlatformHandler e README-IIS.md
├── web.config                   # Configuração IIS (iisnode) – raiz do site
├── Setup-IIS.ps1                # Script para criar site e pool no IIS
├── Configurar-IIS.bat           # Executa Setup-IIS.ps1 como Administrador
├── DOCUMENTACAO.md              # Configuração, scripts, troubleshooting
├── IIS-DEPLOY.md                # Implantação da API no IIS
├── docs/                        # Documentação adicional (erros, segurança)
└── README.md
```

## Módulos SAP (conforme documento)

A lista de serviços exibida na tela **Serviços** deve refletir o documento **Painel de Automação para SAP Business One.docx**. Para deixar somente os módulos do documento:

1. **Editar no código**  
   Ajuste o array em `backend/src/config/sapServices.js` (constante `DEFAULT_SERVICES`): inclua apenas os itens que constam no documento. Cada item tem `id`, `name` e `action` (`listar` ou `executar`).

2. **Ou via variável de ambiente**  
   No `.env` defina `SAP_SERVICES_JSON` com um array JSON dos serviços, por exemplo:
   ```env
   SAP_SERVICES_JSON=[{"id":"lista-backups-offsite","name":"Lista de Backup's Off - Site","action":"listar"},{"id":"reiniciar-banco-hana","name":"Reiniciar Banco Hana","action":"executar"}]
   ```

A tela **Serviços** e o formulário de **Usuários** (permissões de serviços SAP/HANA) passam a usar automaticamente essa lista.

## Comunicação da API com SUSE

Os botões **Executar** da tela Serviços (reiniciar Banco Hana, EDS, Service Layer, SLD) podem rodar comandos no servidor **SUSE** onde o SAP/HANA está instalado. A comunicação é feita por **SSH**.

### O que configurar

1. **Instalar dependência** (no backend):
   ```bash
   cd backend && npm install ssh2
   ```

2. **Variáveis no `.env`** (em `backend/`):

   | Variável | Obrigatório | Descrição |
   |----------|-------------|-----------|
   | `SUSE_HOST` | Sim | IP ou hostname do servidor SUSE |
   | `SUSE_USER` | Sim | Usuário SSH no SUSE |
   | `SUSE_PORT` | Não | Porta SSH (padrão 22) |
   | `SUSE_PRIVATE_KEY_PATH` | Sim* | Caminho absoluto ou relativo à pasta do backend para a chave privada SSH |
   | `SUSE_PASSWORD` | Sim* | Senha do usuário SSH (alternativa à chave) |

   \* Use uma das duas: chave ou senha.

3. **Comando por serviço** (opcional):  
   Se não definir, a API só registra a execução no painel (última execução). Para realmente rodar no SUSE, defina no `.env` uma variável por serviço:

   - Nome: `SUSE_CMD_` + ID do serviço em MAIÚSCULAS com hífen trocado por `_`  
     Ex.: serviço `reiniciar-banco-hana` → `SUSE_CMD_REINICIAR_BANCO_HANA`
   - Valor: comando que será executado no SUSE (ex.: `systemctl restart saphanatimer`).

   Exemplo no `.env`:
   ```env
   SUSE_HOST=192.168.1.10
   SUSE_USER=hanaadmin
   SUSE_PRIVATE_KEY_PATH=./keys/suse_rsa
   SUSE_CMD_REINICIAR_BANCO_HANA=systemctl restart saphanatimer
   SUSE_CMD_REINICIAR_EDS_HANA=systemctl restart sapedstimer
   SUSE_CMD_REINICIAR_SERVICE_LAYER_HANA=systemctl restart saplser
   SUSE_CMD_REINICIAR_SLD_HANA=systemctl restart saplsld
   ```

4. **No servidor SUSE**:  
   - Usuário SSH com permissão para executar os `systemctl` (ou comandos) desejados (ex.: sem senha para os serviços ou uso de sudo configurado).  
   - Chave pública no `~/.ssh/authorized_keys` do usuário, se usar autenticação por chave.

Se `SUSE_HOST` e `SUSE_USER` não estiverem configurados, ao clicar em **Executar** a API apenas registra a execução no painel (última execução e status), sem conectar em nenhum servidor.

## Ambientes SQL Server (validação e restart)

Para ambientes que usam **SQL Server** em vez de HANA, a validação e o restart usam **outra conexão e outros comandos**: o painel conecta no servidor **Windows** (onde o SQL Server está) via **OpenSSH** e executa PowerShell/SC.

### Como conectar e realizar restart em ambientes SQL

1. **No servidor Windows** (onde está o SQL Server):
   - Instale o **OpenSSH Server** (Configurações → Aplicativos → Recursos opcionais → Adicionar OpenSSH Server).
   - Garanta que o usuário de automação tenha permissão para reiniciar o serviço do SQL (ex.: usuário local ou de domínio com direitos de administrador ou permissão no serviço MSSQLSERVER).

2. **No `.env` do backend** (em `backend/`), configure a conexão SSH para o host SQL:

   | Variável | Obrigatório | Descrição |
   |----------|-------------|-----------|
   | `SSH_SQL_HOST` | Sim | IP ou hostname do servidor Windows com SQL Server |
   | `SSH_SQL_USER` | Sim | Usuário (ex.: Administrator ou conta de serviço) |
   | `SSH_SQL_PORT` | Não | Porta SSH (padrão 22) |
   | `SSH_SQL_PRIVATE_KEY_PATH` | Sim* | Caminho da chave privada SSH |
   | `SSH_SQL_PASSWORD` | Sim* | Senha do usuário (alternativa à chave) |

   \* Use uma das duas: chave ou senha.

3. **Comandos opcionais** (padrão: instância padrão `MSSQLSERVER`):
   - `SSH_CMD_SQL_RESTART`: comando para reiniciar o SQL (padrão: `powershell -Command "Restart-Service MSSQLSERVER -Force"`).
   - `SSH_CMD_SQL_STATUS`: comando para verificar status (padrão: `powershell -Command "(Get-Service MSSQLSERVER).Status"`).
   - Para **instância nomeada**, use o nome do serviço (ex.: `MSSQL$MINHAINSTANCIA`) nos comandos ou defina essas variáveis no `.env`.

4. **Na tela Serviços**: o item **Reiniciar SQL Server** aparece na lista. O status **SQL Server** na validação usa a saída do comando de status (Running = ativo). Admin pode executar o restart; operadores só veem o botão se tiverem o serviço `sql-server` em **allowedServiceIds** (configurado em Usuários).

Resumo: **HANA/SUSE** usa `SSH_HOST` + `SSH_USER` e comandos systemd/sapcontrol; **SQL Server** usa `SSH_SQL_HOST` + `SSH_SQL_USER` e comandos PowerShell/SC. Assim você consegue validar e reiniciar tanto ambientes HANA quanto SQL pelo mesmo painel.

## Publicação da API no IIS

A API pode ser publicada no **IIS** com os mesmos métodos dos projetos **huawei-cloud-panel** e **adds-password-reset**:

- **iisnode:** `web.config` na raiz + **Configurar-IIS.bat** (como Administrador). Requer IIS, URL Rewrite e iisnode.
- **HttpPlatformHandler:** copie `installer/iis/web.config` para a raiz e use o mesmo **Setup-IIS.ps1**. Requer apenas HttpPlatformHandler e Node.js.
- **Instalador Inno Setup (.exe):** gera um instalador Windows que instala backend, frontend (e pasta **browsers/** para Ativar Support) e configura o IIS. **Gerar o .exe:** na raiz do projeto execute `.\installer\build-package-iis.ps1` e em seguida `.\installer\compile-installer-iis.ps1` (requer Inno Setup 6). O instalador é gerado em **installer\\Output\\Ananim-Manager-Painel-IIS-Setup-*.exe**. **Após alterações só no código:** `.\installer\update-package-iis-quick.ps1` e depois `.\installer\compile-installer-iis.ps1`. Detalhes: **[installer/README.md](installer/README.md)** e **[DOCUMENTACAO.md](DOCUMENTACAO.md)** (seção 6).

Documentação completa: **[IIS-DEPLOY.md](IIS-DEPLOY.md)** — pré-requisitos, configuração automática, estrutura da pasta, segurança e troubleshooting.

**Linux (equivalente ao pacote IIS):** para rodar no Linux com o mesmo conceito (um binário, sem Node.js no servidor), use **[LINUX-DEPLOY.md](LINUX-DEPLOY.md)**. O pacote deve ser **construído em ambiente Linux** (ou WSL2): `./installer/build-package-linux.sh`. Saída: `installer/package-linux/`.

## Documentação do projeto

- **Resumo (o que é, o que faz, links):** [RESUMO-PROJETO.md](RESUMO-PROJETO.md).
- **Como acessar o site:** este README, seção [Como acessar o site](#como-acessar-o-site).
- **Configuração (.env, config.enc, key, JWT):** [DOCUMENTACAO.md](DOCUMENTACAO.md) — onde ficam os arquivos, scripts (gerar-jwt-e-enc, gerar-chave, encrypt-config), build e instalador.
- **Adicionar cliente (admin):** este README, seção [Adicionar cliente (admin)](#adicionar-cliente-admin).
- **Publicação no IIS:** [IIS-DEPLOY.md](IIS-DEPLOY.md) — HttpPlatformHandler, .exe, config.enc + key, pasta **browsers** (Chromium para Ativar Support), troubleshooting.
- **Publicação no Linux:** [LINUX-DEPLOY.md](LINUX-DEPLOY.md) — pacote binário (build no Linux), systemd, Nginx.
- **Segurança e produção:** [backend/SECURITY.md](backend/SECURITY.md) — JWT, CORS, rate limit, config.enc, checklist, **validação** e **melhorias sugeridas**.
- **Erros comuns e soluções:** [DOCUMENTACAO.md](DOCUMENTACAO.md#8-troubleshooting) (seção 8) e [docs/ERROS-E-TROUBLESHOOTING.md](docs/ERROS-E-TROUBLESHOOTING.md) — SSH após criar cliente, programação ao editar, Playwright/Chromium, API Huawei.
- **Variáveis de ambiente:** [backend/.env.example](backend/.env.example) — referência de todas as opções.
- **Ao alterar** dependências, comportamento de segurança ou variáveis de ambiente, **atualize** `backend/SECURITY.md`, `backend/.env.example` e, se aplicável, `DOCUMENTACAO.md` e este README.

## Próximos passos (integração real)

1. **Backend**: Conectar rotas de ECS e backups à API Huawei (usar SDK ou HTTP como em `cbr`/`huawei_mobile_manager`). Carregar perfis de credenciais de `config.enc` ou arquivo equivalente.
2. **Permissões**: Manter JWT com `allowedEcsIds` e validar nas chamadas ECS.
3. **Snapshots/Backups**: Consumir CBR (ListBackups) por ambiente/recurso e exibir na tela Detalhes.
4. **Licenças SAP**: Integrar com fonte real (SAP B1 ou base de dados) para quantidade de licenças e add-ons.
