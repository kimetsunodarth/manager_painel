# Ananim Manager Agent (Windows) + portal no portais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serviços Windows das VMs dos clientes operados por um agente próprio (HTTPS de saída, liberação pelo admin), e o Manager rodando/atualizado na VM portais.

**Architecture:** Módulo novo `backend/src/agent/` (store SQLite + verificação de assinatura) com três routers: público assinado (`/api/agent/*`), admin (`/api/agent-admin/*`) e cliente (`/api/agent-services/*`). Agente C# (.NET Framework 4.x, `csc`) com chave RSA CNG de máquina não exportável. Frontend: página admin "Servidores" e painel "Serviços do servidor" na página Serviços. Deploy: release versionada em `/opt/ananim/ananim-manager-painel`, systemd + nginx via instalador sudo, atualização por script.

**Tech Stack:** Node 22 ESM, Express, better-sqlite3, `node:crypto`, `node:test`; React/Vite/TS; C# .NET Framework 4.8 (`System.ServiceProcess`, `RSACng`); Ubuntu 22.04, systemd, nginx.

**Spec:** `docs/superpowers/specs/2026-10-21-manager-agente-servicos-design.md`

## Global Constraints

- Assinatura: RSA PKCS#1 v1.5 SHA-256 sobre `"POST\n<path>\n<agentId>\n<timestamp>\n<nonce>\n<sha256hex(body)>"`; timestamp ±300 s; nonce uso único (15 min).
- Chave pública enviada na ativação como JWK `{kty:"RSA", n, e}` (base64url), ≥ 2048 bits.
- Código de ativação: 12 caracteres do alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, formato `XXXX-XXXX-XXXX`, uso único, 1 h, guardado só como SHA-256 (`"mgr:" + normalizado`).
- Ações: `start | stop | restart`. Nome de serviço: `^[A-Za-z0-9_.@\-]{1,256}$`.
- Bloqueados: `AnanimManagerAgent, WinRM, sshd, TermService, EventLog, RpcSs, RpcEptMapper, DcomLaunch, LSM, SamSs, Schedule, CryptSvc` (case-insensitive).
- Tarefa expira em 30 min; lease 5 min; máx. 3 tentativas.
- Catálogo: até 2000 serviços; corpo até 1 MB descomprimido; envelope gzip aceito.
- Porta do backend no portais: `127.0.0.1:5192`; site `ananim-manager.ananim.com.br`.

## Review Focus

- Cliente tenta executar serviço sem grant, de outro projeto ou ação não liberada → 403 (teste na Task 3).
- Agente revogado continua chamando claim → 401 e nada é entregue (Task 2).
- Admin libera um serviço bloqueado (ex.: `WinRM`) → recusado no servidor (Task 3) e no agente (Task 5).
- Mesmo pedido repetido (replay de nonce) → 401 (Task 2).
- Serviço renomeado/ausente na nova descoberta → grants/releases mantidos mas a linha some do painel do cliente até reaparecer (Task 3: `listForUser` só retorna serviços presentes no último catálogo).

---

### Task 1: Store e criptografia do agente

**Files:**
- Create: `backend/src/agent/agentStore.js`, `backend/src/agent/agentCrypto.js`
- Test: `backend/tests/agentStore.test.js`

**Interfaces — Produces:**
- `agentCrypto.js`: `newCode(): string`, `codeHash(code: string): string` (lança se inválido), `verifySignature({jwk, method, path, agentId, timestamp, nonce, body: Buffer, signature: string}): boolean`, `unwrapEnvelope(raw: Buffer): Buffer`, `BLOCKED_SERVICES: Set<string>`, `isBlocked(name): boolean`, `validServiceName(name): boolean`.
- `agentStore.js`: `createAgentStore(db)` → `{ issueCode({projectKey, projectName, ecsId, ecsName, createdBy}) → {code, expiresAt}, activate({code, agentId, jwk, hostname, os, agentVersion}) → agentRow, getAgent(id), listAgents(projectKey?), revoke(id), useNonce(agentId, nonce, now) → bool, saveCatalog(agentId, services[], agentVersion), listServices(agentId), setReleases(agentId, releases[]), getReleases(agentId), setGrants(userId, agentId, serviceNames[]), getGrants(userId), enqueue({agentId, serviceName, action, requestedBy}) → job, claim(agentId, now) → job|null, finish(agentId, jobId, {status, code, message, serviceStatus}), listJobs({agentId?, projectKey?, limit}) }`. Tabelas: `agent_activations, agents, agent_nonces, agent_services, agent_releases, agent_grants, agent_jobs`.

- [ ] Step 1: testes `node:test` com DB `:memory:`: código uso único e expirado; `activate` duas vezes com o mesmo código falha; `useNonce` repetido → false; `claim` devolve a tarefa mais antiga pendente e respeita lease/tentativas; `finish` só para tarefa `claimed` do próprio agente; `saveCatalog` substitui a lista; assinatura gerada com `crypto.generateKeyPairSync('rsa',{modulusLength:2048})` verifica e corpo alterado falha; `unwrapEnvelope` rejeita > 1 MB e gzip corrompido.
- [ ] Step 2: rodar `node --test backend/tests/agentStore.test.js` → FAIL.
- [ ] Step 3: implementar (SQL em `CREATE TABLE IF NOT EXISTS`, chamado em `createAgentStore`).
- [ ] Step 4: rodar → PASS. Step 5: commit.

### Task 2: Rotas públicas assinadas (`/api/agent`)

**Files:** Create `backend/src/routes/agent.js`; Modify `backend/src/index.js` (montar antes do `apiLimiter`, `express.raw({type:'application/json', limit:'1mb'})`); Test `backend/tests/agentRoutes.test.js`.

**Interfaces — Consumes:** Task 1. **Produces:** `createAgentRouter(store)`; endpoints `POST /activate {code, agentId, publicKey: jwk, hostname, os, agentVersion}` → 201 `{agentId, projectName, ecsName}` | 403 `invalid_or_expired_code` | 429 após 20 falhas/10 min; `POST /claim {}` → 200 `{job|null, blocked:[...]}`; `POST /result {jobId, status: done|failed, code, message, serviceStatus}`; `POST /catalog {services:[{name, displayName, status, startType}], agentVersion}` (envelope aceito). Assinatura em headers `X-Agent-Id, X-Timestamp, X-Nonce, X-Signature`.

- [ ] Step 1: testes com app Express + `fetch` (servidor efêmero): ativação, claim com assinatura válida, replay → 401, revogado → 401, catálogo em envelope gzip aceito e serviços bloqueados descartados.
- [ ] Steps 2–5: FAIL → implementar → PASS → commit.

### Task 3: Rotas admin e cliente

**Files:** Create `backend/src/routes/agentAdmin.js`, `backend/src/routes/agentServices.js`; Modify `backend/src/index.js`; Test `backend/tests/agentAccess.test.js`.

**Interfaces — Produces:** admin (`requireAdmin`): `POST /api/agent-admin/activations {projectKey, projectName, ecsId, ecsName}`, `GET /api/agent-admin/agents?projectKey=`, `GET /api/agent-admin/agents/:id` (serviços + releases + grants por usuário), `PUT /api/agent-admin/agents/:id/releases [{serviceName, label, actions[]}]` (recusa bloqueados/ações inválidas), `PUT /api/agent-admin/agents/:id/grants {userId, services[]}` (usuário precisa ter o projeto em `visibleProjects`), `POST /api/agent-admin/agents/:id/revoke`, `GET /api/agent-admin/jobs?agentId=`. Cliente (`authMiddleware`): `GET /api/agent-services` → `[{agentId, ecsName, projectKey, services:[{serviceName, label, status, actions[], lastJob}]}]` (admin vê todos); `POST /api/agent-services/jobs {agentId, serviceName, action}` → 201; `GET /api/agent-services/jobs?agentId=`. Funções puras exportadas para teste: `canUserAct(user, agent, releases, grants, serviceName, action) → boolean`.

- [ ] Step 1: testes de `canUserAct` e de `listForUser`: sem grant → false; ação não liberada → false; projeto fora de `visibleProjects` → false; admin → true; serviço ausente do catálogo não aparece.
- [ ] Steps 2–5: FAIL → implementar → PASS → commit. Auditoria via `logAction(req, 'agent_service_job', {...})` como `services.js`.

### Task 4: Frontend — Servidores (admin) e Serviços do servidor (cliente)

**Files:** Create `frontend/src/pages/Servidores.tsx`, `frontend/src/components/AgentServicesPanel.tsx`, `frontend/src/api/agent.ts`; Modify `frontend/src/App.tsx` (rota `servidores`), `frontend/src/components/Layout.tsx` (item "Servidores", `adminOnly`), `frontend/src/pages/Servicos.tsx` (renderiza `<AgentServicesPanel/>` no topo).

- [ ] Servidores: escolher projeto (mesma barra Conta/Projeto da Home), gerar código para uma ECS, lista de agentes (online < 2 min), tabela de serviços com checkboxes Iniciar/Parar/Reiniciar e rótulo do botão, salvar; aba "Acesso" com os usuários `client` do projeto e os serviços liberados para cada um; tarefas recentes.
- [ ] Painel do cliente: cards por servidor com botões das ações liberadas, status e última execução, polling a cada 5 s enquanto houver tarefa pendente, confirmação antes de parar.
- [ ] `npx tsc --noEmit` e `npm run build` no frontend sem erros; commit.

### Task 5: Agente Windows `AnanimManagerAgent.exe`

**Files:** Create `agent/windows/{Program.cs, Common.cs, Agent.cs, Service.cs, MainForm.cs, app.manifest, build.ps1}`; Test `agent/windows/tests/protocol.test.mjs` (simula o agente contra o backend para validar o formato) — o exe em si é verificado por compilação.

- [ ] Chave: `CngKey.Create(RSA, "AnanimManagerAgent", MachineKey, ExportPolicy=None, 2048)`; envia JWK; assina com `RSACng`.
- [ ] Config DPAPI LocalMachine em `%ProgramData%\AnanimManagerAgent\config.dat` (`apiBaseUrl, agentId, allowPatterns[]`); ACL só SYSTEM/Administradores; log com rotação 2 MB.
- [ ] Serviço `AnanimManagerAgent` (LocalSystem): claim a cada 30 s; catálogo ao iniciar, a cada 6 h e após cada tarefa; `ServiceController` start/stop/restart com timeout 120 s; recusa bloqueados e o que não casar com `allowPatterns` (vazio = tudo liberável pelo painel).
- [ ] Sem `Expect: 100-continue`; catálogo em envelope gzip; mensagens de 403 do WAF com Request ID.
- [ ] GUI: endereço, código + Ativar, status, Instalar/atualizar, Abrir log; abrir versão nova com o serviço instalado atualiza sozinho (`Build.Of`).
- [ ] `build.ps1` compila sem erros; commit.

### Task 6: Portal no portais (Linux)

**Files:** Create `deploy/portais/instalar-manager.sh` (sudo, uma vez: usuário de serviço, systemd `ananim-manager-painel.service` em `127.0.0.1:5192`, site nginx `ananim-manager.ananim.com.br` com o gate WAF e cert em `/etc/nginx/qa-certs/`, sudoers só para `systemctl restart ananim-manager-painel`), `deploy/portais/atualizar-manager.sh` (no VM: `releases/<ts>` → `npm ci --omit=dev` → `current` → restart → health), `scripts/publicar-portais.py` (no Windows: build do frontend, empacota backend+public sem segredos, envia e roda o atualizador), `deploy/portais/LEIAME.md`.

- [ ] Publicar a primeira release em `/opt/ananim/ananim-manager-painel` e validar `GET /api/health` local na VM (processo temporário, sem sudo).
- [ ] Documentar os 3 passos do usuário: rodar o instalador, DNS, copiar `config.enc` + chave; commit.
