# Handoff para Agentes — Ananim Manager Painel

> Para uso de IAs em sessões futuras. Atualizado em: 2026-09-02
> Versão: v1.2.71 (+ trabalho em andamento não versionado — ver `docs/MEMORIA_INTERNA.md`)

---

## O que é este projeto

Painel de gerenciamento interno da Ananim para administrar VMs Huawei Cloud, serviços SAP/HANA e backups. Desenvolvido em Node.js/Express (ESM) no backend e React/TypeScript + Vite no frontend. Roda no Windows Server via IIS com HttpPlatformHandler. O backend é empacotado como `.exe` com `pkg`.

**Repositório local:** `C:\Projetos\Ananim_manager_painel`

> **Nota (2026-09-02):** as seções abaixo ("Estrutura", "Estado atual v1.2.54") ficaram desatualizadas em partes — refletem um estado anterior do projeto (algumas referências, como `sync_deploy.sh` e o servidor `192.168.20.43`, não correspondem à arquitetura atual em `backend/src/` + IIS). Para o trabalho mais recente (integração Cloud8/COC, tela `/automacoes`), ver `docs/MEMORIA_INTERNA.md` — é a fonte mais confiável do estado atual.

---

## Estrutura do projeto

```
backend/src/
  index.js                  # Entry point Express
  config/
    extensionBilling.js     # Config de tarifas e SMTP, computeSessionBilling()
  db/
    extensionSessions.js    # CRUD sessions SQLite (extension_sessions)
  routes/
    huawei.js               # Rotas /api/huawei — ECS, billing, email
    cloud8.js                # Rotas /api/cloud8 — config, vms (Playwright), reconciliation
    coc.js                   # Rotas /api/coc — Scheduled O&M nativo Huawei (validado contra conta real em 2026-09-03, ver MEMORIA_INTERNA.md item 9)
    ...
  services/
    emailNotifier.js        # Envio SMTP (notifyOvertimeStart/Close, sendTestEmail)
    scheduleRunner.js       # Monitor em background (VMs fora do horário)
    cloud8Service.js         # Login + leitura Cloud8 (Playwright); worker isolado em prod/IIS
    cocService.js             # Huawei COC — AK/SK assinado (fallback: token IAM domínio), host coc-intl.myhuaweicloud.com, path /v1/schedule/task; list/create/update/enable/disable/delete todos validados contra produção

frontend/src/
  api/client.ts             # Tipos TypeScript + funções fetch da API
  pages/
    TarifaHorasExtras.tsx   # UI de config de tarifas e SMTP
    Usuarios.tsx            # CRUD de usuários + permissões
    ...

installer/
  installer-iis.iss         # Script Inno Setup (versão atual: 1.2.54)
  package-iis/
    config/
      extension-billing.json  # Config padrão do instalador (sem senha SMTP)

docs/
  MEMORIA_INTERNA.md        # Histórico de tarefas — ATUALIZAR ao final de cada sessão
  PROCESSO_HORAS_EXTRAS.md  # Explicação do módulo de horas extras
  HANDOFF_AGENTE.md         # Este arquivo
```

---

## Estado atual (v1.2.54)

### Último trabalho realizado

1. **Arredondamento de horas extras**: mudança de `Math.ceil` (hora cheia) para arredondamento ao intervalo de 30 min mais próximo. Fórmula em `extensionBilling.js:computeSessionBilling()`.

2. **Notificações por e-mail**: ao abrir ou fechar uma sessão de hora extra, o sistema dispara e-mails via SMTP Office 365. Configuração e destinatários gerenciáveis no painel admin.

3. **Fix modal de editar usuário (`Usuarios.tsx`)**: o modal tinha double-scroll, sem header sticky com botão fechar, sem seções visuais claras. Reescrito com:
   - Header fixo "Editar usuário / email" + botão X
   - Seções claramente separadas: Dados básicos, MFA, Permissões, Projetos Huawei, ECS, Serviços SAP, Preferências
   - Max-height no painel de scroll interno, não no modal inteiro
   - Clique fora do modal fecha o modal

### Arquivos modificados na v1.2.54

- `backend/src/config/extensionBilling.js` — adicionado `computeSessionBilling`, `smtp`, `alertEmails`
- `backend/src/services/emailNotifier.js` — **novo** — envio SMTP fire-and-forget
- `backend/src/routes/huawei.js` — integrado emailNotifier; 3 novos endpoints SMTP/alertEmails/test-email
- `backend/src/services/scheduleRunner.js` — integrado emailNotifier
- `frontend/src/api/client.ts` — adicionado `SmtpConfig`, métodos de API para SMTP
- `frontend/src/pages/TarifaHorasExtras.tsx` — seção de notificações com UI SMTP
- `frontend/src/pages/Usuarios.tsx` — modal de edição reescrito
- `installer/package-iis/config/extension-billing.json` — config padrão com roundingMinutes:30 e SMTP sem senha
- `installer/installer-iis.iss`, `VERSION`, todos os `package.json` — versão 1.2.54

---

## Regras críticas do projeto

- **NUNCA commitar** `config.json`, tokens, senhas ou chaves — usar `ENC:` + base64
- `config_template.json` usa strings vazias `""` nos campos de credencial
- **Sync git sempre inclui cloud_api**: `bash sync_deploy.sh` (push GitHub + merge no 192.168.20.43)
- Ao concluir qualquer tarefa: atualizar `docs/MEMORIA_INTERNA.md`
- Após mudanças no backend no servidor: `kill -HUP <master_pid>` para reload graceful
- Build do exe: `cd backend && npm run build:exe` (via esbuild + pkg)
- Build do instalador: Inno Setup com `iscc installer/installer-iis.iss`

---

## Conhecimento técnico

### Backend

- Framework: Express 5 (ESM, `"type": "module"`)
- Banco: SQLite via `better-sqlite3` (síncrono)
- Auth: JWT + bcryptjs
- MFA: `otplib` (TOTP) + `qrcode`
- E-mail: `nodemailer ^8.0.1` com STARTTLS (rejectUnauthorized: false para Office 365)
- Empacotamento: `esbuild` bundler → `pkg` → `.exe` Windows x64
- Warning conhecido: `nodemailer` v8 + pkg gera `Cannot resolve 'mod'` — é falso positivo, não afeta runtime

### Frontend

- React 18 + TypeScript + Vite
- Tailwind CSS com classes personalizadas `ananim-*` definidas em `frontend/src/index.css`
- Classes disponíveis: `ananim-card`, `ananim-input`, `ananim-select`, `ananim-label`, `ananim-btn-primary`, `ananim-btn-ghost`, `ananim-text`, `ananim-muted`, `ananim-accent`, `ananim-textSoft`

### Horas extras

- Tabela SQLite: `extension_sessions` (projectKey, serverId, startedAt, endedAt, scheduledStopAt, startedBy, reason)
- Arredondamento: 30 min padrão, configurável por projeto
- Config runtime: `config/extension-billing.json` (não versionado em produção)
- Tarifa: `defaultHourlyRate` global → `projectRates[key]` por projeto
- E-mails: disparados fire-and-forget, falhas logam warning mas não bloqueiam HTTP

---

## Próximos trabalhos conhecidos

- `build-package-iis.ps1` tem bug no nome do exe (`Huawei-Cloud-Panel-API.exe` em vez do correto) — pacote ainda montado manualmente
- Senha SMTP não é mascarada no GET `/billing-config` — aceitável para ferramenta admin interna, mas pode ser melhorado
- ~~Validar `cocService.js` contra uma conta Huawei real~~ — **feito em 2026-09-03**: list/create/enable/disable/update/delete testados contra as contas reais RAMO_SP_RAMOONE (199 tarefas) e ANANIMCLOUD (176 tarefas, VM de teste real `CLOUDSES03` criada e depois apagada). AK/SK funcionou de primeira, sem precisar do fallback IAM. Dois achados novos por isso: `trigger_time.time_zone` é obrigatório mesmo em `policy:'ONCE'`; e "alterar" é `PUT /v1/schedule/task/:id` com o payload completo (não existe PATCH nessa API) — mas a Huawei recusa editar tarefa ativada e o PUT reativa como efeito colateral, então `updateScheduledTask()` desativa antes e depois. Ver `docs/MEMORIA_INTERNA.md` item 9 para os detalhes completos.
- ~~Falta: incluir o COC no cruzamento da tela `/automacoes`~~ — **feito em 2026-09-03**: `GET /api/cloud8/reconciliation` agora cruza Cloud8 × Portal × COC (as 4 contas-mestre, via `cocService.listCocCoveredHostnames()`, cache de 15 min). `origin` virou `cloud8`/`portal`/`coc`/`conflict`/`none` a partir de um array `sources`. Ver `docs/MEMORIA_INTERNA.md` item 10.
- **Implementar a escrita no Cloud8 (criar/destruir workflow)** — a mecânica do formulário "Novo Workflow" (seletores, campos, botão → pra mover tarefa, retry pela máscara "Processando..." intermitente) está toda mapeada e testada com um Gravar real em `docs/MEMORIA_INTERNA.md`. Falta virar `cloud8Service.createWorkflow()`/rota, mapear o "Destruir" e a aba "Repetições" (recorrência). **Existe um workflow de teste real pendente de remoção manual no Cloud8** (VM HUBSULWEB/AnanimCloud) — confirmar que foi apagado antes de mexer nisso de novo.
- ~~Instalar/validar a 1.2.73~~ — instalada; corrigiu o bug de MFA (401 nas rotas de login disparava reload silencioso antes de mostrar a mensagem real, `client.ts`). O outro fix da 1.2.73 (cachear `process.cwd()` em `getLogCryptoKey`/`getAppRoot`/`getConfigDir`/`getDataDir`) **não era a causa real** do bug do Cloud8 — ver próximo item.
- ~~Instalar/validar a 1.2.74~~ — corrige a causa REAL de "chave de criptografia não encontrada" ao salvar credenciais do Cloud8: **`web.config`'s `hiddenSegments` tem `<add segment="config" />`, e o IIS bloqueia por segmento exato da URL** — `/api/cloud8/config` batia nisso e nunca chegava no Express (404 do próprio IIS, sem log nenhum no `requests.log`). Rota renomeada pra `/api/cloud8/credentials`. **Lição pra debugar bugs parecidos**: se uma rota `/api/*` falha sem erro que faça sentido, decriptar `logs/requests.log` de produção primeiro (mesma chave/esquema dos outros logs) — se o pedido não aparece lá, o bloqueio é do IIS, não do Node; checar `hiddenSegments` no `web.config` por colisão de nome de segmento. Ver `docs/MEMORIA_INTERNA.md` item 12.
- ~~Instalar/validar a 1.2.75~~ — corrige um gap real que o usuário notou: a tela `/automacoes` só listava VMs já cadastradas no Cloud8 — uma VM coberta só pelo Portal e/ou COC ficava invisível. `GET /api/cloud8/reconciliation` agora adiciona essas como linhas órfãs, agrupadas em `Fora do Cloud8 — <perfil>`. Ver `docs/MEMORIA_INTERNA.md` item 13.
- ~~Instalar/validar a 1.2.77~~ — inclui a 1.2.76 (fix `clickResilient` no clique "Mensal") **+ 3 correções**: persistência via `sessionStorage` (dados sobrevivem a F5), fix do toggle de comprimir/expandir (não fazia nada com filtro de busca/origem ativo), e nova coluna "Programação" mostrando o horário real do agendamento quando a cobertura é do COC. Ver `docs/MEMORIA_INTERNA.md` item 15. **Superada pela 1.2.78 no mesmo dia** — instalar direto a 1.2.78 abaixo em vez desta.
- ~~Instalar/validar a 1.2.78~~ — implementou o ponto 4 (parcial): botões Ligar/Parar/Reiniciar VM (reaproveitando a rota de ECS já existente) e Pausar/Remover programação COC (permissões `coc:schedule:toggle`/`coc:schedule:delete`, novas e independentes de `huawei:projects`). Ver `docs/MEMORIA_INTERNA.md` item 16. **Superada pela 1.2.79 no mesmo dia**.
- ~~Instalar/validar a 1.2.79~~ — agendamento real do Cloud8 via API JSON interna (substitui leitura frágil por DOM) + reset de MFA por admin. Ver itens 17-18. **Superada pela 1.2.80 no mesmo dia**.
- ~~Instalar/validar a 1.2.80~~ — agendamento real do Cloud8 via API, reset de MFA por admin, botões Ligar/Parar/Reiniciar via índice UUID→projeto/perfil. Ver itens 17-19. **Superada pela 1.2.81 no mesmo dia**.
- ~~Instalar/validar a 1.2.81~~ — criar/alterar programação do Cloud8 direto de `/automacoes` (item 20), permissão `cloud8:schedule:manage`. Apagar existia só no backend (corpo do `termAction` não confirmado). **Superada pela 1.2.82 no mesmo dia**.
- ~~Instalar/validar a 1.2.82~~ — botão "Remover" liberado (usuário confirmou que apagar funciona de verdade). **Superada pela 1.2.83 no mesmo dia**.
- ~~Instalar/validar a 1.2.83~~ — botão "Suspender" pra programações do Cloud8 (`updateAction` com `status: 7, jsaction: "suspend"`, confirmado). **Superada pela 1.2.84 no mesmo dia**.
- ~~Instalar/validar a 1.2.84~~ — botão "Nova prog." corrigido pra respeitar origem. **Superada pela 1.2.85 no mesmo dia**.
- **Instalar/validar a 1.2.85** — gerada (`installer/Output/Ananim-Manager-Painel-IIS-Setup-1.2.85.exe`, SHA256 `11F851471349AAB24F34439192C86B97813AAAAEB28CF87D1A3DA9F1AC5034FE`). Correção de limitação real que o usuário achou testando a 1.2.84 em produção: botão "Suspender" (Cloud8) nunca aparecia porque TODOS os agendamentos reais do cliente são recorrentes, e o botão estava restrito a `!s.isrecurrent`. Descoberto que o payload real de "Suspender" não reconstrói o schedule (só reenvia o registro bruto com `status`/`jsaction` trocados) — reescrito pra reenviar o registro bruto (`Cloud8ScheduleEntry.raw`) em vez de reconstruir, liberando "Suspender" pra agendamentos recorrentes também. "Editar" continua restrito a não-recorrentes (reconstrói o payload do zero, não suporta recorrência).
- **`data/ananim.db` de dev está desatualizado (parado em maio) em relação à produção** — qualquer investigação de usuários/audit_logs precisa ler o banco de PRODUÇÃO diretamente (`C:\Program Files\Ananim Manager Painel\data\ananim.db`, better-sqlite3 modo `readonly: true` — cuidado com o ABI: esse binário é Node 18, rebuildar pra Node 22 antes de usar em scripts de diagnóstico locais, ver item 11 do MEMORIA_INTERNA).

---

## Credenciais / infraestrutura (referência, não commitar)

- **Servidor produção**: `192.168.20.43` (cloud_api), user `cloud`, porta 22
- **Projeto no servidor**: `/home/cloud/Ananim Health SAP`
- **Dashboard**: `:8002` (gunicorn gevent)
- **SMTP**: `smtp.office365.com:587`, de `no-reply@ananim.com.br`
  - Senha da app: configurada via UI do painel após instalação
  - Destinatário padrão: `rcombinato@ananim.com.br`

---

## Como continuar uma sessão

1. Ler este arquivo e `docs/MEMORIA_INTERNA.md`
2. Verificar estado do git: `git status` e `git log --oneline -5`
3. Se for deploiar: `bash sync_deploy.sh` (inclui push + merge no servidor)
4. Se for reconstruir o exe: `cd backend && npm run build:exe`
5. Se for reconstruir o instalador: Inno Setup com `iscc installer/installer-iis.iss`
6. Ao finalizar: atualizar `docs/MEMORIA_INTERNA.md` com o que foi feito
