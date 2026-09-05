# Ananim Manager Painel

Painel web interno da Ananim para **operar e faturar infraestrutura de clientes** (Huawei Cloud + SAP Business One/HANA). Versão atual: ver arquivo `VERSION`.

## O que o painel faz

- **Huawei Cloud (ECS):** listagem de contas/projetos/servidores, Start/Stop/Restart manual e **agendado** (cron interno a cada 60s, motor próprio — "Portal"). Contas: RAMO_SISTEMAS, ANANIMCLOUD, RSDONE, MOOVE_RAMOSISTEMAS.
- **Huawei COC (Cloud Operations Center):** integração nativa com o Scheduled O&M da Huawei (`GET/POST/PUT /api/coc/schedules`, `.../enable`, `.../disable`, `DELETE`) — cria, lista, ativa/desativa, altera e remove tarefas de liga/desliga/reinício direto na conta Huawei, fora do cron do Portal. AK/SK assinado (com token IAM de domínio como plano B). Pausar/remover uma tarefa direto da tela de Automações usa permissões granulares próprias (`coc:schedule:toggle`/`coc:schedule:delete`), independentes da permissão ampla `huawei:projects`.
- **Cloud8 (app.cloud8.com.br):** leitura do inventário via Playwright (paginado, "Componentes Atuais") e dos agendamentos via a API JSON interna da própria SPA (`GET /scheduleevents/list`, mesma sessão logada) — nome do agendamento, horário real e recorrência, sem depender de decodificar posição de pixel em calendário. Criar, alterar, suspender e remover agendamento direto pelo painel (`POST/PUT/DELETE /api/cloud8/schedules[/:id]`, `POST .../suspend`), atrás da permissão granular `cloud8:schedule:manage`. "Suspender" e "Remover" funcionam em qualquer agendamento (recorrente ou não — suspender reenvia o registro bruto da API, preservando a recorrência); "Criar"/"Editar" só suportam execução única (não recorrente).
- **Origem das Automações (`/automacoes`):** cruza as VMs reais com Cloud8 × Portal × COC por nome de servidor — mostra quem está cobrindo cada VM, com o horário real do agendamento, o que não tem cobertura nenhuma, e sinaliza conflito quando duas fontes tentam agendar a mesma VM. Os botões de ação (criar/editar/suspender/remover programação) são segregados por origem — só aparecem os da fonte que realmente cobre aquela linha (Cloud8, COC ou Portal). Quando a identidade Huawei da VM é conhecida (via Portal ou COC), tem botões pra ligar/parar/reiniciar direto da tela (mesma autorização por projeto/ECS da Home).
- **SAP Business One / HANA:** gestão de serviços (HANA/SQL/Web) por cliente, start/stop via **SSH** (`ssh2`), ativação de Support User no Control Center via **Playwright/Chromium**.
- **Backups (CBR):** consulta de backups Huawei CBR.
- **Horas extras / Extensão de horário:** sessões de VM fora do horário com **cobrança** (arredondamento configurável, padrão 30 min) e notificação por e-mail (SMTP Office 365).
- **Licenças e Documentos** por cliente (upload até 70 MB).
- **Usuários:** roles `admin` / `operator` / `client`, permissões granulares, **MFA TOTP** (ligado por padrão), reset de MFA por administrador (limpa o TOTP do usuário, próximo login pede um QR code novo), auditoria com geolocalização de IP.

Usado pela equipe interna (admin/operador) e por **clientes finais** (role `client`, home restrita aos projetos vinculados).

## Arquitetura

```
Ananim_manager_painel/
├── backend/                # API Node.js (Express 5, ESM)
│   └── src/
│       ├── index.js        # Bootstrap, middlewares, cron (scheduleRunner a cada 60s)
│       ├── routes/         # /api/auth, /users, /ecs, /services, /huawei, /backups,
│       │                   # /licenses, /documents, /audit-logs, /admin, /health,
│       │                   # /coc (Scheduled O&M Huawei), /cloud8 (config, vms, reconciliation)
│       ├── services/       # huawei-ecs/iam/cbr, huawei-signer (AK/SK), sshService,
│       │                   # controlCenterService (Playwright), scheduleRunner,
│       │                   # emailNotifier, geoSecurity, mfaService,
│       │                   # cocService (Scheduled O&M), cloud8Service (Playwright + API JSON interna)
│       ├── config/         # configLoader (config.enc/key.bin — Fernet),
│       │                   # extensionBilling, hanaClients, clients/<cliente>/,
│       │                   # cloud8Config (credenciais do usuário de serviço Cloud8)
│       ├── db/database.js  # SQLite (better-sqlite3, WAL) — users, audit_logs,
│       │                   # extension_sessions
│       └── data/           # ananim.db (runtime, não versionado) + stores
├── frontend/               # React 18 + TypeScript + Vite + Tailwind
│   └── src/
│       ├── api/client.ts   # Cliente REST centralizado (cookie HttpOnly + credentials)
│       └── pages/          # Home, Programacao, Servicos, Usuarios, Clientes,
│                           # ExtensaoHorario, HorasExtrasCliente, TarifaHorasExtras,
│                           # Licencas, Documentos, Logs, DetalhesBackups, Login,
│                           # Automacoes (reconciliação Cloud8 x Portal x COC)
├── installer/              # Empacotamento IIS (Inno Setup) e Linux
├── docs/                   # HANDOFF_AGENTE.md, MEMORIA_INTERNA.md (contexto vivo),
│                           # PROCESSO_HORAS_EXTRAS.md, ERROS-E-TROUBLESHOOTING.md
└── VERSION                 # Versão atual (sincronizada com package.json)
```

> **Nota:** os arquivos `backend/*.js` soltos (server.js, config.js, users.js etc.) são **legado da v1.0** e não são usados. O código de produção está em `backend/src/`.

## Executar em desenvolvimento

```bash
# Backend (porta 3001 por padrão)
cd backend
npm install
npm run dev

# Frontend (Vite, proxy para a API)
cd frontend
npm install
npm run dev
```

Configuração via `backend/.env` (copiar de `backend/.env.example`) ou, em produção, `config.enc` + `key.bin` (gerados pelo fluxo de release — ver `docs/HANDOFF_AGENTE.md`).

## Build e deploy (produção)

Alvo primário: **Windows Server + IIS** (HttpPlatformHandler), backend empacotado como `.exe`:

```bash
npm run build          # frontend + backend exe (esbuild + pkg) + pacote + instalador Inno Setup
```

- `Setup-IIS.ps1` cria App Pool/site e permissões (`IIS_IUSRS` em `data/`, `logs/`).
- **Obrigatório:** App Pool **Idle Time-out = 0** — sem isso o cron de agendamentos para.
- Backend escuta apenas `127.0.0.1` sob IIS; `web.config` bloqueia acesso HTTP a `.env`, `config.enc`, `key.bin`, `data/`, `logs/`.
- Linux: `DEPLOY-LINUX.md` (Node + systemd + Nginx).

Problemas conhecidos e soluções: `docs/ERROS-E-TROUBLESHOOTING.md`.

## Segurança (resumo)

- JWT em cookie **HttpOnly + SameSite=strict**; senhas bcrypt; **MFA TOTP** por padrão.
- Rate limit global (200/15 min) e de login (5/15 min); bloqueio de conta após 5 falhas.
- Segredos cifrados em `config.enc`/`credentials.enc` (Fernet); nunca versionar `.env`, `key.bin`, `users.json`, `*.db`.
- A API **nunca retorna a senha SMTP** (`smtp.passSet` indica se há senha salva).
- Pendências conhecidas (CSP desativada, admin padrão automático) documentadas em `backend/SECURITY.md` §17.

Detalhes: `SEGURANCA.md` e `backend/SECURITY.md`.

## Documentação

| Arquivo | Conteúdo |
| --- | --- |
| `CHANGELOG.md` | Registro de alterações — **obrigatório atualizar a cada mudança** |
| `docs/HANDOFF_AGENTE.md` | Build, release, servidores, contexto operacional atual |
| `docs/MEMORIA_INTERNA.md` | Histórico de tarefas e pendências |
| `docs/ERROS-E-TROUBLESHOOTING.md` | Erros conhecidos e correções |
| `INSTALACAO.md` / `IIS-DEPLOY.md` | Instalação Windows/IIS |
| `DEPLOY-LINUX.md` | Instalação Linux |

## Licença

Uso interno Ananim.
