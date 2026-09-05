# Changelog

Todas as alterações relevantes do projeto devem ser documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/), e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/) quando aplicável.

---

## [Unreleased]

---

## [1.2.85] – 2026-09-05

SHA256: `11F851471349AAB24F34439192C86B97813AAAAEB28CF87D1A3DA9F1AC5034FE`

### Corrigido

- **Botão "Suspender" (Cloud8) nunca aparecia para schedules recorrentes** — na prática, praticamente todos os schedules reais do cliente são recorrentes ("(recorrente)"), então o botão só existia na teoria. A restrição existia porque o botão reconstruía o payload do zero (`buildScheduleEventPayload`), hardcodando `rec_type: 0` (não-recorrente) — usar isso num schedule recorrente corromperia a recorrência. Reexaminando o payload real de "Suspender" capturado do Cloud8 (DevTools), descobri que a ação real do Cloud8 NÃO reconstrói o schedule: ela reenvia o registro exato como veio da API, só trocando `status` (→7) e `jsaction` (→"suspend"), preservando os campos `schedule.rec_*` inalterados. Reescrito para reenviar o registro bruto (`Cloud8ScheduleEntry.raw`) em vez de reconstruir — agora "Suspender" funciona em qualquer schedule, recorrente ou não. "Editar" continua restrito a schedules não-recorrentes, já que mudar data/hora de uma recorrência exigiria entender a semântica de `rec_*`, o que segue fora de escopo.

---

## [1.2.84] – 2026-09-05

SHA256: `A2751E9462622C2FC4B70A45E282A52C90F93DB5E2D2757511138232C5CB686`

### Corrigido

- **Botão "Nova prog." (Cloud8) aparecia em qualquer VM real do Cloud8, mesmo em linhas cobertas só por COC ou só por Portal** — a condição não checava a origem, só se a VM existia no inventário do Cloud8. Usuário encontrou isso testando a 1.2.83 (print mostrando "Pausar prog." + "Remover prog." + "Nova prog." juntos numa linha só-COC). Corrigido: "Nova prog." só aparece quando a origem é `cloud8` ou `none` (sem cobertura nenhuma) — nunca em linhas cobertas por COC ou Portal.

---

## [1.2.83] – 2026-09-05

SHA256: `85388B45E5637AD69E8417D65B87DE284B5DB02D4CCAF5B6BB6CAF357A07F90`

### Adicionado

- **Botão "Suspender" para programações do Cloud8** (pausa sem apagar), ao lado de "Editar"/"Remover" — usuário mostrou o menu real do Cloud8 ("Suspender somente este workflow") e depois capturou o payload real via DevTools. Confirmado: é um `updateAction` normal com `status: 7` e `jsaction: "suspend"` — sem endpoint dedicado. **Só disponível pra programações não-recorrentes** (mesma limitação de "Editar" — reconstruir os campos de recorrência não foi validado). "Retomar" (reverter a suspensão) não foi capturado ainda, não implementado.

---

## [1.2.82] – 2026-09-05

SHA256: `3FA96C18602609E3B202B7FE18A204855BE325103CD0FA035C7A8D9286BDA75`

### Adicionado

- **Botão "Remover" para programações do Cloud8** na tela `/automacoes`, ao lado de "Editar" — antes só existia no backend porque o corpo real de `termAction` não estava confirmado. Usuário testou de verdade (criou e apagou várias tarefas reais no Cloud8, confirmou visualmente que sumiram) — corpo vazio confirmado, botão liberado.

---

## [1.2.81] – 2026-09-05

SHA256: `7E948B28C40D29DDD9DABC664E536D20C5235F6FD86519B44354101C0822885`

### Adicionado

- **Criar/alterar programação do Cloud8 direto da tela `/automacoes`** — botão "Nova prog." em qualquer VM real do Cloud8 e "Editar" em programações não-recorrentes existentes, abrindo um formulário (nome, ações Ligar/Desligar/Reiniciar, data/hora em horário de Brasília, e-mail opcional). Atrás de uma permissão granular nova e independente (`cloud8:schedule:manage`, checkbox em Usuários). Formato do payload confirmado contra um teste real (capturado via DevTools) — só cobre execução única, recorrência (semanal etc.) ainda não suportada.
- Backend: `POST/PUT/DELETE /api/cloud8/schedules[/:id]`. **Apagar existe no backend mas não tem botão na tela** — o corpo da chamada real de apagar (`termAction`) nunca foi confirmado (só a URL), então não expus isso como ação até validar de verdade.

---

## [1.2.80] – 2026-09-04

SHA256: `ED136C4F875F21DC62A2031720559D63D9BF6914B77A3278514DB0CC4A7BA08`

### Adicionado

- **Botões Ligar/Parar/Reiniciar agora aparecem também para VMs Huawei cobertas só pelo Cloud8** (antes só funcionavam quando a VM também estava no Portal ou no COC). Nova `getEcsUuidIndex()` (`backend/src/services/huawei-ecs.js`) constrói um índice reverso UUID→projeto/perfil varrendo todas as contas Huawei cadastradas (deduplicadas, cache de 30 min) e cruza com o `cloudinstanceid` que o Cloud8 já expõe por servidor (via a mesma API JSON interna da 1.2.79). Validado contra produção: 54 de 74 VMs Huawei do Cloud8 resolvidas com identidade real (as 20 restantes têm credenciais IAM inválidas em contas específicas, problema pré-existente, sem relação com esta mudança).

---

## [1.2.79] – 2026-09-04

SHA256: `0BEDE5E27C2401B23A58C677B7E42C9D9D187B053ABA4F337086716615D49DC`

### Adicionado

- **Coluna "Programação" da tela `/automacoes` agora mostra o horário real do Cloud8**, não só "Cloud8 (sem horário)": a SPA do Cloud8 usa uma API JSON interna por trás da tela de calendário (`GET /scheduleevents/list`, mesma sessão logada) que expõe nome do agendamento, próxima execução real e se é recorrente — descoberta inspecionando o componente ExtJS/Ext Scheduler em produção. Substitui a leitura antiga por DOM (clicar "Automações" → "Servidores" → "Mensal" → contar elementos `.sch-event`, que dependia do `clickResilient` da 1.2.76 pra lidar com a máscara "Processando...") por uma chamada HTTP direta — mais rápida e mais confiável. Validado contra produção: 54 de 75 VMs testadas com agendamento real detectado corretamente (nomes, horários e tipo de ação — ligar/desligar/reiniciar/script).
- **Reset de MFA por administrador**: botão "Reset MFA" na tela Usuários (só visível pra admin) limpa o autenticador de qualquer usuário — no próximo login, a pessoa configura um QR code novo. Útil quando alguém perde o celular/autenticador e não tem mais como gerar o código atual.

### Não implementado nesta versão

- **Criar/alterar/parar programação do Cloud8** — a mesma API interna também expõe `POST /scheduleevents/newAction|updateAction|termAction`, mas uma tentativa de capturar o payload real (teste controlado, nome e VM óbvios de teste) foi bloqueada pelo classificador de segurança do Claude Code. Fica pendente até haver uma forma segura de obter o payload real.

---

## [1.2.78] – 2026-09-04

SHA256: `CBB2CA48F611B59C8D9AC583FDE13CACCD3CC2282FFE6DE8F91529D85CFE9E1`

### Adicionado

- **Ações reais na tela `/automacoes`**: quando a identidade Huawei da VM é conhecida (via Portal ou via uma tarefa do COC — o Cloud8 nunca dá essa informação, pode ser qualquer nuvem), botões **Ligar/Parar/Reiniciar** chamam a mesma rota já usada pela Home (`POST /api/huawei/projects/:projectId/ecs/:serverId/action`), reaproveitando o controle de acesso por projeto/ECS que já existe lá (`visibleProjects`/`allowedHuaweiEcsIds`) — nenhuma permissão nova precisou ser criada pra isso. Para VMs cobertas pelo COC, botões **Pausar programação** e **Remover programação** chamam `coc.disableSchedule`/`coc.deleteSchedule` (remover desativa antes de apagar — a Huawei só permite deletar tarefa desativada).
- **Duas permissões novas, independentes de `huawei:projects`**: `coc:schedule:toggle` (pausar/retomar) e `coc:schedule:delete` (remover) — como nenhum frontend chamava essas rotas do COC antes de existirem botões de verdade, dá pra restringi-las com uma permissão própria sem quebrar ninguém. Checkboxes novos em Usuários (criar e editar usuário, mesmo padrão de `ecs:*`/`huawei:projects`).
- `backend/src/services/cocService.js` (`listCocCoveredHostnames`) agora também extrai `resourceId`/`regionId`/`projectId` de cada instância alvo de uma tarefa do COC (antes só o hostname); `backend/src/routes/cloud8.js` (`/reconciliation`) usa isso — e o `projectId`/`serverId`/`region` que o Portal (`vmScheduleV2`) já guarda por agendamento — pra resolver uma "identidade Huawei" por VM (`vmIdentity`), preferindo o Portal por ser a fonte nativa.
- Nova `invalidateCoverageCache(perfil)` em `cocService.js`, chamada depois de um enable/disable/delete bem-sucedido — sem isso a tela continuaria mostrando o estado antigo da tarefa por até 15 min (TTL do cache de cobertura).

### Plano entregue, não implementado nesta versão

- **Alterar uma programação do COC** (mudar horário/alvo) direto da tela — exigiria um formulário completo (mesmos campos do "criar", que hoje só existe validado via script, nunca virou UI); ficou fora do escopo desta rodada.
- **Ações de escrita no Cloud8** (criar/destruir workflow) — mecânica mapeada (ver `docs/MEMORIA_INTERNA.md`), mas o serviço/rota (`cloud8Service.createWorkflow`) ainda não existe.

---

## [1.2.77] – 2026-09-04

SHA256: `67B344A442BE2F5BDCC34070E9F5EA3DBBC82F3DB2D382492D5B0971D6825DA`

### Corrigido

- **Tela "Origem das Automações" perdia todos os dados carregados a cada F5** — `Automacoes.tsx` não tinha nenhuma persistência entre recarregamentos de página. Agora salva o resultado da última consulta (`clients`, `summary`, `totalRowsFound`, `cocErrors`, `maxPages`) em `sessionStorage` (mesmo padrão já usado em `Programacao.tsx`) e restaura ao montar a tela.
- **Botão de comprimir/expandir cliente não fazia nada enquanto um filtro (busca ou origem) estava ativo** — a lógica antiga forçava todo grupo a ficar sempre aberto nesse caso, ignorando o clique. Agora o filtro só pré-expande os clientes que batem com ele no momento em que muda; depois disso o toggle manual funciona normalmente mesmo com filtro ativo.

### Adicionado

- **Coluna "Programação" na tela `/automacoes`** mostrando o detalhe real do agendamento quando a cobertura vem do Huawei COC (job Start/Stop/Restart_ECS + dias da semana/horário ou data única, extraído do `trigger_time` da tarefa) — antes só existia um badge genérico de origem, sem nenhum detalhe de quando a automação roda. Quando a cobertura é só do Cloud8, mostra "Cloud8 (sem horário)" com uma explicação: o Cloud8 só informa que existe agendamento (`hasSchedule`), nunca o dia/hora — essa limitação é da automação de leitura (Playwright), não foi resolvida nesta mudança. `backend/src/services/cocService.js` (`listCocCoveredHostnames`) e `backend/src/routes/cloud8.js` (`/reconciliation`) passaram a propagar `trigger_time`/nome do job por VM coberta pelo COC.

---

## [1.2.76] – 2026-09-04

SHA256: `DA21513E325A02E11676571A6ABD7EEF810326C5434C354F87DAF135D06812C4`

### Corrigido

- **Leitura do Cloud8 travava com `locator.click: Timeout 30000ms exceeded` no botão "Mensal"** (`installer/tools/cloud8-worker.cjs`, `backend/src/services/cloud8Service.js`): a máscara "Processando... Aguarde..." do Cloud8 (já documentada em `docs/MEMORIA_INTERNA.md` pro fluxo de escrita) reaparece periodicamente sobre a grid e intercepta cliques do Playwright — confirmado em produção, `<div class="x-mask">` interceptando repetidamente até estourar os 30s padrão. Nova `clickResilient()` espera a máscara sumir e tenta de novo (até 8x) em vez de deixar o Playwright estourar o timeout numa tentativa só; aplicada nos 4 cliques de navegação de árvore/botão de `readInventory`/`readScheduledNames` (duplicado nos dois arquivos — worker de produção e caminho direto de dev).

---

## [1.2.75] – 2026-09-04

### Corrigido

- **Tela "Origem das Automações" só listava VMs já cadastradas no Cloud8** — uma VM coberta só pelo Portal e/ou pelo Huawei COC, mas nunca registrada no Cloud8, ficava completamente ausente da tela (a lista base partia do inventário do Cloud8, com Portal/COC só marcando presença, nunca adicionando linhas). `GET /api/cloud8/reconciliation` (`backend/src/routes/cloud8.js`) agora adiciona essas VMs como linhas "órfãs", agrupadas em seções `Fora do Cloud8 — <perfil>` (perfil vindo do agendamento do Portal ou da tarefa do COC que a cobre) — nenhuma VM com cobertura real fica mais invisível na tela.

---

## [1.2.74] – 2026-09-04

### Corrigido

- **`GET/PATCH /api/cloud8/config` nunca chegava no backend — IIS bloqueava antes do Express ver a requisição.** `web.config` tem `requestFiltering > hiddenSegments` com `<add segment="config" />`, pensado pra proteger a pasta `config/` da instalação — mas o IIS casa por **segmento exato da URL**, não pelo path inteiro, e `/api/cloud8/config` tem "config" como terceiro segmento. Resultado: 404 do próprio IIS antes de qualquer coisa nossa rodar — o pedido nem aparecia no `requests.log` (que registra tudo, inclusive outros 400 da mesma tela), e o frontend só via uma resposta sem JSON de erro, caindo no fallback genérico "Erro na requisição". As duas tentativas de fix da 1.2.73 (cachear `process.cwd()`) eram sobre um sintoma que parecia bater, mas a causa real era essa — só apareceu depois de decriptar `requests.log`/`api-stdout.log` de produção e comparar com outras rotas do mesmo card que funcionavam (`/reconciliation`, sem "config" no path). **Rota renomeada para `/api/cloud8/credentials`** (`backend/src/routes/cloud8.js`, `frontend/src/api/client.ts`) — mantém o `hiddenSegments` intacto (ainda protege `config/` de verdade) em vez de afrouxar a regra. Nenhuma outra rota do projeto tem "config" como segmento exato.

---

## [1.2.73] – 2026-09-04

> Inclui o conteúdo da 1.2.72 (COC, Cloud8, tela `/automacoes`) — versão de vida curta em produção, substituída no mesmo dia pelos dois fixes abaixo.

### Adicionado

- **Huawei COC (Cloud Operations Center) — Scheduled O&M, validado contra conta real de produção:** rotas `GET/POST/PUT /api/coc/schedules[/:taskId]` (+ `POST .../enable`, `POST .../disable`, `DELETE .../:taskId`) e `GET /api/coc/jobs` (`backend/src/routes/coc.js`, `backend/src/services/cocService.js`). Host fixo `coc-intl.myhuaweicloud.com` (o host regional `coc.{region}...` roteia para o COC da China e retorna vazio); path `/v1/schedule/task`; **auth com fallback duplo** — AK/SK assinado primeiro (funcionou de primeira contra as contas RAMO_SP_RAMOONE e ANANIMCLOUD — 199 e 176 tarefas reais listadas), com token IAM por domínio como plano B em 401/403 (não precisou até agora). `createScheduledTask()` clona os campos internos do runbook (`job_uuid`/`execute_atomic_tasks`/`version_uuid`) de uma tarefa existente da mesma ação (confirmado byte-a-byte contra uma tarefa real), resolve o projeto-raiz da região via IAM `/v3/projects`, monta `target_instances` (string JSON dupla) e desativa a tarefa logo após criar (ela nasce ativada). `updateScheduledTask()` (novo) usa `PUT /v1/schedule/task/:id` com o payload completo — confirmado que a API não tem PATCH; a Huawei recusa editar uma tarefa ativada e o PUT reativa como efeito colateral, então o código desativa antes e depois. `trigger_time.time_zone` é obrigatório mesmo em execução única (`policy:'ONCE'`). Runbooks COMMUNAL com UUID fixo: `Start_ECS`/`Stop_ECS`/`Restart_ECS`. Trata o erro de quota `COC.00014138` (limite de 200 tarefas/conta). Teste real: criadas e depois apagadas duas tarefas de teste na VM `CLOUDSES03` (conta ANANIMCLOUD) — conta ficou limpa.
- **Cloud8 (app.cloud8.com.br) — credenciais de serviço:** rota `GET/PATCH /api/cloud8/config` (`backend/src/routes/cloud8.js`, `backend/src/config/cloud8Config.js`) para admin salvar usuário/senha do Cloud8, cifrados em disco (AES-256-GCM, mesma chave de log). Campo na aba Programação (admin) para inserir as credenciais.
- **Cloud8 — leitura de inventário por cliente (v2):** `GET /api/cloud8/vms` (`backend/src/services/cloud8Service.js`, `installer/tools/cloud8-worker.cjs`) lê ao vivo, via Playwright, a tela **Componentes Atuais → Servidores** (tabela paginada, ~750 recursos, 25/página) em vez do calendário de Automações — bem mais rápida (sem hover por linha) e traz cliente/provedor, nome, tipo, região e IPs direto das colunas. `hasSchedule` continua vindo do calendário Automações → Servidores (view "Mensal", igual antes), agora correlacionado por nome em vez de hover. Resposta vem agrupada por cliente (`clients: [{ provider, vms }]`). Não há status ligado/desligado confiável em nenhuma das duas telas — não incluído nesta versão.
- **Tela "Origem das Automações" (`/automacoes`, admin):** `frontend/src/pages/Automacoes.tsx` + `GET /api/cloud8/reconciliation` (`backend/src/routes/cloud8.js`). Cada cliente do Cloud8 em uma seção expansível com suas VMs, cruzadas com as programações nativas do Portal (`vmScheduleV2.listSchedules()`) **e agora também com as tarefas HABILITADAS do Huawei COC** (`cocService.listCocCoveredHostnames()`, uma consulta por conta-mestre — RAMO_SISTEMAS/MOOVE/RSDONE/ANANIMCLOUD, via `getDiscoveryAccounts()`) — classifica cada VM em `cloud8` / `portal` / `coc` / `conflict` (2+ fontes) / `none` (sem cobertura). A consulta ao COC busca o detalhe de cada tarefa habilitada (a listagem não traz o alvo) com concorrência limitada (8 em paralelo) e cache em memória de 15 min — ~9s a frio por conta (176 tarefas → 291 hostnames, testado contra ANANIMCLOUD real), instantâneo depois; falha numa conta não derruba as outras (`Promise.allSettled`, aviso na tela se alguma conta falhar). Item novo no menu lateral (ícone Radar).
- **Cloud8 — mapeamento do fluxo de escrita (criar workflow)**: mecânica completa do formulário "Novo Workflow" mapeada e **testada com um Gravar real** (autorizado pelo usuário, VM `HUBSULWEB`/AnanimCloud, ação Desligar, data 31/12/2030 — nunca deveria executar antes de ser destruído manualmente). Ainda não implementado como serviço/rota (`cloud8Service.createWorkflow` não existe ainda) — só a automação exploratória confirmou que é viável e documentou os seletores. Detalhes completos em `docs/MEMORIA_INTERNA.md`.

### Corrigido

- **Cloud8 — paginação travava em "Próxima Página" com `Timeout 30000ms exceeded`** (`cloud8Service.js`, `cloud8-worker.cjs`): o seletor mirava o ícone interno do botão (`.x-tbar-page-next`), não o link `.x-btn` clicável — o Playwright interpretava o próprio container da toolbar como bloqueando o clique (falso positivo comum do ExtJS quando se clica em elemento aninhado sem área efetiva). Corrigido para `a.x-btn[data-qtip="Próxima Página"]`. Confirmado: 250 VMs (10 páginas) lidas em ~42s sem erro.
- **Login/MFA — erro de código incorreto ficava invisível, parecia "não acontece nada"** (`frontend/src/api/client.ts`): `auth.login`/`auth.verifyMfaSetup`/`auth.verifyMfa` não passavam `skipGlobalErrorHandler` — qualquer 401 dessas rotas (ex.: "Código MFA incorreto", que a API sempre respondeu com 401) disparava o handler global de sessão expirada (`localStorage.removeItem` + `window.location.href = '/login'`, reload completo da página) antes do formulário conseguir mostrar a mensagem real. Descoberto durante a validação da 1.2.72 (usuário admin sem conseguir logar); as três chamadas de auth pré-sessão agora pulam o handler global, mesmo padrão já usado por `/auth/me` no `PrivateRoute`.
- **`getLogCryptoKey()`/`getAppRoot()`/`getConfigDir()`/`getDataDir()` recalculavam `process.cwd()` a cada chamada** (`backend/src/utils/logCryptoKey.js`, `backend/src/appRoot.js`) — diferente de `configLoader.js`, que cacheia `WORK_DIR` uma vez no carregamento do módulo. Sintoma real observado: `PATCH /api/cloud8/config` (salvar credenciais do Cloud8) respondeu "chave de criptografia não encontrada" num processo que, momentos antes e depois, provou (3 formas diferentes) enxergar `.encryption_key` normalmente — não foi possível confirmar a causa exata do porquê o `cwd` teria mudado no meio da vida do processo, mas cachear no carregamento do módulo (mesmo padrão do `configLoader.js`) elimina a classe inteira do problema, com ou sem a causa raiz identificada. Mensagem de erro também passou a incluir o `cwd` atual, para facilitar diagnóstico se acontecer de novo.

---

## [1.2.71] – 2026-07-04

### Adicionado

- **Segurança — sessão de navegador:** fechar o navegador agora exige credenciais ao reabrir. Duas camadas: (1) frontend marca a sessão em `sessionStorage` + BroadcastChannel (`utils/browserSession.ts`) — aba nova adota sessão de aba já logada (multi-abas não desloga), mas navegador reaberto sem aba logada descarta o cookie via `/auth/logout`; (2) backend com renovação deslizante do JWT no `authMiddleware` — cookie re-emitido quando passa da metade da validade, então usuário ativo não é deslogado, e sessão de navegador restaurada expira em até `JWT_EXPIRES_IN` sem atividade.

### Alterado

- **`JWT_EXPIRES_IN` padrão: 12h → 1h** (com renovação deslizante; configurável via env/config.enc).
- **Dependências:** nodemailer 8 → 9.0.3 (GHSA-p6gq-j5cr-w38f), form-data e vite (7.3.6) atualizados — `npm audit` zerado em backend e frontend.

---

## [1.2.70] – 2026-07-04

### Corrigido

- **Segurança — senha SMTP:** a API de billing (`/api/huawei/billing-config*`) não retorna mais `smtp.pass`; respostas passam por `sanitizeBillingConfig` e expõem apenas `smtp.passSet`. No frontend, o campo de senha inicia vazio e enviar vazio mantém a senha atual.

### Alterado

- **Higiene do repositório:** `backend/users.json` (hashes/e-mails reais), `db_temp.db`, screenshots de debug e `tsconfig.tsbuildinfo` removidos do versionamento; `.gitignore` ampliado (dados runtime, scripts de investigação locais).
- **README.md** reescrito para refletir a arquitetura real (`backend/src/` Express 5 + `frontend/src/` React/TS); estrutura antiga (server.js, app.js) marcada como legado.

### Removido

- **Backend legado v1.0:** `backend/*.js` soltos (server, config, users, actionLog, schedules, ecsClient, huaweiClient, huaweiSigner), `backend/utils/` legado e protótipo Python (`app.py`, `config.py`, `huawei_client.py`, `huawei_signer.py`, `requirements.txt`). Código de produção vive em `backend/src/`.
- **Duplicatas na raiz:** `Setup-IIS-v2.ps1`, `Configurar-IIS-v2.bat`, `RESUMO-PROJETO.md`, `LINUX-DEPLOY.md`, scripts de build antigos (`build-exe.js`, `installer.js`, `installer-iis.js`, `build-package-iis.ps1` — canônicos em `installer/`), `installer-iis-tmp.iss`, `installer/iis-v2/`.
- **Dependências npm acidentais** no backend: `e`, `install`, `npx`, `chromium` (standalone; Playwright traz o próprio Chromium).

---

## [1.2.69] – 2026-07-03

Consolidação do trabalho de 1.0.0 até 1.2.69 (as versões intermediárias não foram registradas individualmente neste arquivo; detalhes em `docs/MEMORIA_INTERNA.md` e `docs/HANDOFF_AGENTE.md`).

### Adicionado

- **Módulo SAP B1/HANA:** gestão de serviços por cliente (HANA/SQL/Web), start/stop via SSH (`ssh2`), Support User no Control Center via Playwright/Chromium; clientes em `backend/src/config/clients/` e `hana-clients/`.
- **Horas extras / Extensão de horário:** sessões de VM fora do horário com cobrança (`extensionBilling`, arredondamento 30 min), tabela `extension_sessions`, páginas `ExtensaoHorario`, `HorasExtrasCliente` e `TarifaHorasExtras`.
- **Notificações por e-mail:** `emailNotifier`/`emailService` (SMTP Office 365), e-mails de alerta e e-mail de teste.
- **MFA TOTP:** setup por QR code (otplib/speakeasy), ligado por padrão para novos usuários.
- **Geo-segurança (opcional):** camada `geoSecurity` de bloqueio por geolocalização (`SECURITY_GEO_ENABLED`).
- **Auditoria com geolocalização:** IP, user agent e país/região/cidade em `audit_logs`.
- **Backups CBR, Licenças e Documentos** por cliente (upload até 70 MB).
- **Role `client`:** home restrita aos projetos vinculados com autoload de conta/projeto.
- **Migração do backend para `backend/src/`** (Express 5 ESM modular) e do frontend para React 18 + TypeScript + Vite + Tailwind; SQLite via better-sqlite3 (WAL).
- **Logo criptografado:** armazenamento do logo em `logo.enc` (mesma chave que config.enc/key.bin); servido via `GET /api/logo`; script `backend/scripts/encrypt-logo.js`; frontend passa a usar `/api/logo` em vez de `logo.png`.
- **Logs criptografados:** em produção (exe/IIS) toda saída da aplicação e erros de inicialização vão para `logs/app.log.enc` e `logs/startup-error.log.enc` (módulo `utils/log-encrypt.js`); chave = key.bin; formato append-only por bloco (4 bytes length + iv + tag + ciphertext).
- **Descriptografar-Logs.exe:** ferramenta (CLI) para ler logs criptografados; entrada `backend/decrypt-logs.js`, build com `npm run build:decrypt-logs`; incluída no pacote IIS e no instalador Inno; ao ser executada sem argumentos, exibe instruções de uso e aguarda Enter (evita janela fechar ao clicar).
- **Projetos – Atualizar:** botão "Atualizar projetos" na tela de projetos para buscar novamente a lista de projetos na nuvem (útil quando novos projetos são criados).
- **Diagnóstico 502.3:** erros de inicialização gravados em `logs/startup-error.log.enc` (ou .log se não houver key); documentação para usar Descriptografar-Logs.exe para ler e diagnosticar.
- **Tela de login com personagem:** personagem (mascote) animado no topo do card; segue o mouse (olha na direção do cursor); ao focar ou digitar no campo senha, o personagem tapa os olhos (braços sobre os olhos). Implementação em HTML/CSS e JS no frontend.

### Alterado

- **Home do cliente:** ao logar e abrir a página inicial, o painel passa a selecionar automaticamente a conta/projeto vinculado em `visibleProjects` e carregar a lista de ECS sem exigir clique manual em `Carregar`.
- **Sessão do frontend:** `PrivateRoute` passa a sincronizar o `localStorage` com o retorno mais atual de `GET /auth/me`, mantendo `visibleProjects` e permissões em linha com o backend após refresh.
- **Cron de agendamentos:** registro de **schedule_heartbeat** a cada 5 minutos (quando não há agendamentos devidos), formando um trail contínuo no log; evita “salto na data” e comprova que o processo estava ativo. Keep-alive interno reduzido para 60s.
- **IIS:** mensagem no arranque lembrando de definir App Pool Idle Time-out = 0; CONFIG-README e INSTALACAO reforçam que o cron não depende do navegador e que Idle Time-out = 0 é obrigatório para agendamentos contínuos.

### Corrigido

- **Editar usuário:** o modal em `frontend/src/pages/Usuarios.tsx` volta a renderizar corretamente com largura maior, áreas internas organizadas em seções visuais e rolagem única no conteúdo.
- **Editar usuário (ajuste final):** corrigido o encolhimento do modal por largura implícita do card e por falta de layout flex no formulário; agora o diálogo ocupa a largura prevista, mantém header/footer estáveis e exibe o conteúdo completo.
- **Editar usuário (full-screen):** o fluxo de edição agora abre em tela cheia, renderizado via `portal` no `document.body`, seguindo o padrão visual do painel e evitando qualquer recorte pelo layout da página.

### Documentação

- **RESUMO-DO-PROJETO.md:** novo documento com resumo do projeto (o que é, o que faz, como funciona, principais arquivos, formas de rodar).
- **README.md:** estrutura atualizada (log-encrypt.js, decrypt-logs.js, config-loader com decryptBinary); endpoint GET /api/logo e GET /api/health; logs criptografados e uso do Descriptografar-Logs.exe; botão Atualizar projetos; referência a RESUMO-DO-PROJETO.md.
- **INSTALACAO.md:** logo.enc e Descriptografar-Logs.exe nos artefatos gerados; 502.3 – uso do Descriptografar-Logs.exe para ler startup-error.log.enc; comandos encrypt-logo e descriptografar logs.
- **SEGURANCA.md:** logs de aplicação criptografados (app.log.enc, startup-error.log.enc), logo.enc e GET /api/logo; tabela resumo atualizada.
- **docs/MEMORIA_INTERNA.md:** registro da correção do modal de edição de usuário e do carregamento automático do projeto vinculado para clientes.

---

## [1.0.0] – 2026-02-09

### Adicionado

- **Projetos:** campo de pesquisa na seção Projetos (ao clicar em uma conta), filtrando por nome ou ID do projeto, no mesmo estilo de Agendamentos e ECS.
- **ECS – Restart:** ação Restart para servidores ECS (botão na tabela quando status ACTIVE); endpoint `POST /api/ecs/restart` e `restartServer` no backend (API Nova `reboot` tipo SOFT).
- **Agendamentos – Restart:** opção "Restart" no formulário de agendamento (Novo/Editar); execução automática do restart no horário agendado; botão "Agendar Restart" na tabela de ECS; pesquisa de agendamentos inclui "restart".
- **Criptografia de dados sensíveis:** `users.json` e `agendamentos.json` passam a ser gravados criptografados (AES-256-GCM) quando `SESSION_SECRET` está definido; módulo `backend/utils/secureStore.js`; leitura compatível com arquivos legados em texto.
- **Instalação no Linux:** documentação completa em `DEPLOY-LINUX.md` (Node.js em Debian/Ubuntu, RHEL/Fedora, openSUSE/SUSE, Arch; systemd, Nginx, firewall); `DEPLOY-SUSE.md` referencia o guia geral.
- **Changelog:** este arquivo para registrar todas as atualizações do projeto.
- **Segurança:** rate limit global (200 req/15 min em `/api/*`), regeneração de sessão no login, bloqueio de conta por 15 min após 5 falhas de login no mesmo e-mail, política de senha com caractere especial obrigatório, criptografia de `actionLog.json` (secureStore), validação de tipos/tamanhos nos bodies da API (validateEcsBody), CSP ativa no Helmet.
- **Log de ações:** ECS Start/Stop/Restart passam a registrar nos detalhes **sucesso** ou **erro** (mensagem); agendamento criado/atualizado registra **criado por** e **alterado por** (e-mail do usuário).
- **Agendamentos:** cada agendamento armazena **createdBy** (quem criou) e **lastModifiedBy** (último usuário que alterou); exibição na lista e no log de ações.

### Alterado

- **Tabela ECS – Ações:** coluna Ações com largura mínima 420px e `flex-wrap` para evitar corte de botões; botões com tamanho uniforme (min-width 5.5rem); tabela min-width 920px.
- **Tela Novo agendamento:** ao abrir o formulário (Novo ou Editar), a lista de agendamentos existentes, o campo de pesquisa e o botão "Novo agendamento" ficam ocultos; ao fechar (Cancelar ou após salvar), a lista volta a ser exibida.
- **Instalador IIS:** execução do `Setup-IIS.ps1` diretamente pelo instalador usando caminho completo do PowerShell (`{sys}\WindowsPowerShell\v1.0\powershell.exe`), sem `-NoExit`, para conclusão automática da instalação.
- **Rate limit (login):** `keyGenerator` customizado para normalizar `req.ip` (remoção de porta em formatos como `[::1]:53947`), evitando `ERR_ERL_INVALID_IP_ADDRESS` do express-rate-limit.
- **Instalador – arquivos:** removidos `ENV-EXAMPLE.txt` e `CONFIG-README.txt` do pacote de instalação; removido atalho "Configuração" do menu Iniciar.
- **.env.example / ENV-EXAMPLE:** comentário de que `SESSION_SECRET` também é usado para criptografar `users.json`, `agendamentos.json` e `actionLog.json`; nota sobre política de senha (caractere especial).

### Corrigido

- **Rate limit:** erro `ValidationError: An invalid 'request.ip' ([::1]:53947) was detected` ao fazer login em localhost (IPv6 com porta), resolvido com `keyGenerator` que extrai apenas o endereço IP.

### Documentação

- **DEPLOY-LINUX.md:** guia de instalação no Linux (requisitos, Node em várias distros, estrutura do projeto, .env, npm start, systemd, Nginx, firewall).
- **DEPLOY-SUSE.md:** referência ao DEPLOY-LINUX.md e instalação do Node via zypper no SUSE.
- **CHANGELOG.md:** registro de todas as atualizações; política de documentar toda alteração neste arquivo.
- **INSTALACAO.md:** guia de instalação (requisitos para compilar, gerar exe e instalador; o que instalar no servidor; passos antes/depois; solução de problemas).
- **README.md, SEGURANCA.md:** revisados para refletir log com sucesso/erro (ECS), createdBy/lastModifiedBy (agendamentos), política de senha com caractere especial, criptografia de actionLog, estrutura backend (utils/secureStore, config-loader).

---

## Como documentar atualizações

- **Toda** alteração relevante (nova funcionalidade, mudança de comportamento, correção, alteração de configuração ou de instalação) deve ser registrada aqui.
- Use as seções **Adicionado**, **Alterado**, **Corrigido**, **Removido** e **Documentação**.
- Inclua data no cabeçalho da versão (`[X.Y.Z] – AAAA-MM-DD`).
- Para versões ainda não publicadas, use `[Unreleased]` no topo.

Exemplo:

```markdown
## [Unreleased]

### Adicionado
- Nova opção X no menu Y.

### Corrigido
- Erro ao salvar quando o campo Z estava vazio.
```

---

[1.0.0]: https://github.com/.../releases/tag/v1.0.0
