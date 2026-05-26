# Ananim Huawei Painel

Painel para **Agendamentos ECS Huawei**: login por usuário/senha, contas AK/SK (RAMO_SISTEMAS, ANANIMCLOUD, RSDONE, MOOVE_RAMOSISTEMAS), listagem de projetos e ECS, Start/Stop manual e **agendamentos** (réplica Cloud8) por horário e dias da semana. Inclui gestão de usuários, **log de ações** (auditoria) e campos de pesquisa em ECS e Agendamentos.

## Estrutura

```
huawei-cloud-panel/
├── backend/                 # API Node.js (Express)
│   ├── server.js            # Servidor, rotas, auth, cron, rate limit, helmet
│   ├── config.js            # Contas e regiões (AK/SK via .env)
│   ├── users.js             # Usuários e senhas (bcrypt, política de senha, users.json)
│   ├── actionLog.js         # Log de ações com retenção 90 dias (actionLog.json)
│   ├── schedules.js         # Agendamentos (agendamentos.json)
│   ├── huaweiClient.js      # IAM – listagem de projetos
│   ├── huaweiSigner.js      # Assinatura de requisições
│   ├── ecsClient.js         # ECS – listar, start, stop, restart
│   ├── decrypt-logs.js      # CLI para descriptografar logs (gera Descriptografar-Logs.exe)
│   ├── utils/
│   │   ├── config-loader.js # Carrega config.enc + key.bin; decryptBinary para logo
│   │   ├── secureStore.js   # Criptografia de users/agendamentos/actionLog
│   │   └── log-encrypt.js   # Logs em arquivo criptografado (app.log.enc, startup-error.log.enc)
│   └── package.json
├── frontend/
│   ├── index.html           # Tela de login (tema escuro, logo via /api/logo) + painel
│   ├── logo.png             # Logo Ananim (dev); em prod pode ser logo.enc servido por GET /api/logo
│   ├── style.css
│   └── app.js
├── .env                     # Não versionar – AK/SK, SESSION_SECRET
├── .env.example
├── .gitignore
├── README.md
├── RESUMO-DO-PROJETO.md     # Resumo: o que é, o que faz, como funciona (este projeto)
├── CHANGELOG.md             # Registro de todas as atualizações (obrigatório documentar aqui)
├── INSTALACAO.md            # Guia de instalação (compilar, exe, instalador, servidor)
├── SEGURANCA.md             # Segurança e melhorias implementadas
├── COMO-RODAR.md            # Instruções de execução
├── IIS-DEPLOY.md            # Implantação no IIS (iisnode + segurança)
├── web.config               # Configuração IIS/iisnode (produção)
├── Setup-IIS.ps1            # Script de configuração IIS (pool, site, permissões)
├── Setup-IIS.bat            # Executa Setup-IIS.ps1 como administrador
└── Gerar-Setup-IIS-Exe.ps1  # Gera Setup-IIS.exe a partir do .ps1 (ps2exe)
```

## Configuração

1. **Copie** `.env.example` para `.env` e preencha:
   - Credenciais Huawei: `RAMO_AK`, `RAMO_SK`, `ANANIM_AK`, `ANANIM_SK`, `RSDONE_AK`, `RSDONE_SK`, `MOOVE_AK`, `MOOVE_SK`.
   - **Em produção:** defina `NODE_ENV=production` e `SESSION_SECRET` (valor forte; o servidor não inicia sem ele). Opcional: `CORS_ORIGIN`, `SESSION_MAX_AGE_MS`.
2. **Nunca** commite `.env`. As chaves AK/SK e o segredo de sessão são sensíveis.
3. **Senhas de usuários:** mínimo 8 caracteres, com pelo menos uma letra, um número e um caractere especial (criação e reset).

## Contas e regiões

| Conta              | Regiões           | Variáveis .env |
|--------------------|-------------------|----------------|
| RAMO_SISTEMAS      | São Paulo, Santiago | RAMO_AK, RAMO_SK |
| ANANIMCLOUD        | São Paulo         | ANANIM_AK, ANANIM_SK |
| RSDONE             | Santiago          | RSDONE_AK, RSDONE_SK |
| MOOVE_RAMOSISTEMAS | São Paulo         | MOOVE_AK, MOOVE_SK |

Regiões: São Paulo = `sa-brazil-1`, Santiago = `la-south-2`.  
**MOOVE_RAMOSISTEMAS:** exibido apenas o projeto com ID configurado em `backend/server.js` (variável `mooveProjectId`). Não é aplicada a blocklist de regiões para essa conta.

## Executar

### Backend (Node.js)

```bash
cd backend
npm install
npm start
```

API e painel em **http://localhost:5000**. O frontend é servido na raiz; **use sempre essa URL** (não abra `index.html` por file://) para login e sessão funcionarem.

### Acesso inicial

- **Usuário:** `admin`  
- **Senha:** `admin123`  

Criado automaticamente na primeira subida. Altere a senha em **Usuários → Resetar senha** (visível só para admin).

## Funcionalidades

- **Tela de login:** tema escuro alinhado ao painel, logo Ananim no centro, campos E-mail e Senha, botão Entrar. Sessão com cookie `ananim.sid` (httpOnly, sameSite; 7 dias em desenvolvimento, 24h em produção se não definir `SESSION_MAX_AGE_MS`).
- **Contas:** listagem das 4 contas; ao clicar, lista projetos (filtros por região e por conta; MOOVE apenas projeto configurado por ID) com **campo de pesquisa** por nome ou ID do projeto e botão **Atualizar projetos** para buscar projetos novos na nuvem.
- **Projetos → ECS:** lista ECS com **campo de pesquisa** (nome ou ID); ações Start, Stop, **Restart**, Agendar Start, Agendar Stop, **Agendar Restart**.
- **Agendamentos:** CRUD por conta/região/projeto/servidor, horário e dias; ações **Start, Stop e Restart**; **campo de pesquisa** (servidor, projeto, conta, start/stop/restart, horário); execução automática a cada minuto (cron). Cada agendamento guarda **criado por** e **última alteração por** (e-mail do usuário), exibidos na lista e no log.
- **Usuários (admin):** criar usuário, resetar senha (incluindo admin), excluir (exceto admin). Senhas hasheadas com bcrypt em `users.json`.
- **Log de ações (admin):** todas as ações registradas em `actionLog.json`; visualização em **Log de ações** no menu (tabela com Data/Hora, Usuário, Ação, Detalhes); **Exportar** para .txt. Para ECS Start/Stop/Restart, os detalhes indicam **sucesso** ou **erro** (mensagem). Para agendamento criado/atualizado, indicam **criado por** e **alterado por** (e-mail). Tentativas de login falhas registradas como `login_failed`.

## Endpoints da API (resumo)

| Método | Rota | Autenticação | Descrição |
|--------|------|--------------|-----------|
| POST | `/api/auth/login` | Não | Login (email, password); rate limit 5/5min por IP |
| GET | `/api/auth/me` | Não | Retorna usuário da sessão ou 401 |
| POST | `/api/auth/logout` | Não | Encerra sessão |
| GET | `/api/accounts` | Sim | Lista contas |
| POST | `/api/projects` | Sim | Lista projetos (body: accountId, region) |
| POST | `/api/ecs/servers` | Sim | Lista ECS (accountId, region, projectId) |
| POST | `/api/ecs/start` | Sim | Start ECS |
| POST | `/api/ecs/stop` | Sim | Stop ECS |
| POST | `/api/ecs/restart` | Sim | Restart ECS (soft reboot) |
| GET/POST/PATCH/DELETE | `/api/schedules/*` | Sim | CRUD agendamentos |
| GET/POST/PATCH/DELETE | `/api/users/*` | Admin | Gestão de usuários |
| GET | `/api/action-log` | Admin | Últimas entradas do log (?limit=200) |
| GET | `/api/logo` | Não | Logo do painel (logo.enc descriptografado ou logo.png) |
| GET | `/api/health` | Não | Health/ping (keep-alive) |

## Arquivos de dados e logs (backend)

- `users.json` – usuários e hash de senha (não versionar em produção). Quando `SESSION_SECRET` está definido, o arquivo é gravado criptografado.
- `actionLog.json` – log de ações; retenção 90 dias (não versionar; em `.gitignore`). Quando `SESSION_SECRET` está definido, o arquivo é gravado criptografado.
- `agendamentos.json` – agendamentos (em `.gitignore`). Quando `SESSION_SECRET` está definido, o arquivo é gravado criptografado.
- **Logs em produção (exe/IIS):** `logs/app.log.enc` e `logs/startup-error.log.enc` (criptografados com key.bin). Para ler: use **Descriptografar-Logs.exe** (na pasta do app), ex.: `Descriptografar-Logs.exe logs\app.log.enc saida.txt`. O exe mostra instruções ao ser executado sem argumentos.

## Segurança

Consulte **SEGURANCA.md** para nível de segurança atual, melhorias implementadas (rate limit, política de senha, helmet, CORS, etc.) e recomendações restantes.

## Documentação adicional

**Ao alterar o projeto,** atualize sempre: **CHANGELOG.md** (toda alteração relevante), e quando fizer sentido **README.md**, **INSTALACAO.md**, **SEGURANCA.md** e **RESUMO-DO-PROJETO.md**.

- **RESUMO-DO-PROJETO.md** – **resumo do projeto:** o que é, o que faz, como funciona, principais arquivos e formas de rodar.
- **INSTALACAO.md** – **guia completo de instalação:** o que precisa para compilar, gerar o .exe e o instalador; o que instalar no servidor (IIS, HttpPlatformHandler); o que fazer antes e depois; solução de problemas.
- **CHANGELOG.md** – **registro de todas as atualizações do projeto.** Toda alteração relevante (funcionalidade, correção, configuração, instalação) deve ser documentada neste arquivo.
- **COMO-RODAR.md** – passos para executar o painel (Node ou Python).
- **IIS-DEPLOY.md** – implantação no **IIS** com iisnode e padrões de segurança (HTTPS, App Pool, permissões, web.config).
- **GERAR-EXE-IIS.md** – como gerar o **executável para Windows** (Setup-Ananim-Panel.exe) e o **binário para Linux** (setup-ananim-panel) com `npm run build`; alternativas (Setup-IIS.bat, ps2exe).
- **DEPLOY-LINUX.md** – instalação e execução no Linux (Node.js, systemd, Nginx).
- **.env.example** – variáveis de ambiente e comentários para produção.

## Modificações e melhorias (resumo)

- **Login:** tela com tema escuro alinhado ao painel, logo Ananim, sessão e cookie seguros.
- **Segurança:** rate limit no login (5/5 min) e global na API (200/15 min), bloqueio de conta 15 min após 5 falhas no mesmo e-mail, política de senha (8+ caracteres, letra, número e caractere especial), SESSION_SECRET obrigatório em produção, regeneração de sessão no login, CORS configurável, Helmet com CSP, validação de entrada (validateEcsBody), criptografia de users/agendamentos/actionLog quando SESSION_SECRET definido, retenção do log 90 dias, trust proxy.
- **Usuários:** reset de senha também para admin; log de todas as ações (incluindo login_failed).
- **Log de ações:** visualização (tabela com Data/Hora, Usuário, Ação, Detalhes), sucesso/erro para ECS Start/Stop/Restart, criado por/alterado por para agendamentos, botão Exportar (.txt), apenas admin.
- **Pesquisa:** campo de pesquisa na lista de ECS (por nome ou ID) e na lista de Agendamentos (servidor, projeto, conta, ação, horário).
- **MOOVE_RAMOSISTEMAS:** filtro por ID do projeto configurável no backend; sem blocklist de regiões para essa conta.
- **IIS:** suporte a implantação no IIS com HttpPlatformHandler (`web.config`), escuta em 127.0.0.1 sob IIS, documentação em **IIS-DEPLOY.md** (HTTPS, App Pool, permissões, segurança).
- **Logo criptografado:** em produção o logo pode ser armazenado como `logo.enc` (mesma chave que config.enc); servido via `GET /api/logo`. Script `backend/scripts/encrypt-logo.js` gera logo.enc a partir de logo.png.
- **Logs criptografados:** em produção (exe) todo log da aplicação e erros de inicialização vão para `logs/app.log.enc` e `logs/startup-error.log.enc`. **Descriptografar-Logs.exe** (incluído no instalador) permite ler esses arquivos usando key.bin; ao clicar sem argumentos, exibe instruções de uso.

## Licença

Uso interno.
