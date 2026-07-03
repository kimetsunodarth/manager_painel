# Handoff para Agentes — Ananim Manager Painel

> Para uso de IAs em sessões futuras. Atualizado em: 2026-06-11
> Versão: v1.2.54

---

## O que é este projeto

Painel de gerenciamento interno da Ananim para administrar VMs Huawei Cloud, serviços SAP/HANA e backups. Desenvolvido em Node.js/Express (ESM) no backend e React/TypeScript + Vite no frontend. Roda no Windows Server via IIS com HttpPlatformHandler. O backend é empacotado como `.exe` com `pkg`.

**Repositório local:** `C:\Projetos\Ananim_manager_painel`

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
    ...
  services/
    emailNotifier.js        # Envio SMTP (notifyOvertimeStart/Close, sendTestEmail)
    scheduleRunner.js       # Monitor em background (VMs fora do horário)

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
