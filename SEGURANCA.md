# Segurança – Ananim Huawei Painel

Avaliação do nível de segurança atual e recomendações de melhoria.

---

## O que está sendo documentado (auditoria)

Todas as ações sensíveis são registradas no **log de ações** (`actionLog.json`):

| Ação | Documentada | Observação |
|------|-------------|------------|
| Login | Sim | Usuário e horário |
| Login falhou | Sim | E-mail/usuário informado (sem senha) |
| Logout | Sim | Usuário e horário |
| ECS Start / Stop / Restart | Sim | Conta, região, projeto, serverId; detalhes incluem **sucesso** ou **erro** (mensagem) |
| Agendamento criado | Sim | scheduleId, serverId, action, **createdBy** (e-mail de quem criou) |
| Agendamento atualizado | Sim | scheduleId, **modifiedBy** (e-mail de quem alterou) |
| Agendamento excluído | Sim | scheduleId |
| Agendamento executado (cron) | Sim | Usuário "sistema", scheduleId, serverId, accountId |
| Usuário criado | Sim | targetEmail, role |
| Senha resetada | Sim | userId |
| Usuário excluído | Sim | userId |

**Falhas de login** (credencial inválida) são registradas como `login_failed` (apenas o e-mail/usuário informado, sem senha) para ajudar a detectar tentativas de abuso.

---

## Nível de segurança atual

### Pontos positivos

1. **Autenticação:** login por sessão (express-session), cookie httpOnly e sameSite; senhas com bcrypt (salt 10).
2. **Autorização:** rotas de API protegidas por `requireAuth`; usuários e log restritos a `requireAdmin`.
3. **Credenciais:** AK/SK e SESSION_SECRET via variáveis de ambiente (`.env`) ou **config.enc + key.bin** (criptografia AES-256-GCM em produção).
4. **Dados sensíveis em disco:** `users.json` e `agendamentos.json` gravados **criptografados** (AES-256-GCM) quando `SESSION_SECRET` está definido; chave derivada do SESSION_SECRET (SHA-256); ver `backend/utils/secureStore.js`.
5. **Logs de aplicação em produção (exe/IIS):** saída da aplicação e erros de inicialização vão para **arquivos criptografados** (`logs/app.log.enc`, `logs/startup-error.log.enc`) usando a mesma chave que `config.enc` (key.bin); ver `backend/utils/log-encrypt.js`. O **Descriptografar-Logs.exe** (incluído no instalador) permite ler esses logs com key.bin na pasta do app.
6. **Logo:** em produção o logo pode ser armazenado como `logo.enc` (mesma chave que config.enc) e servido via `GET /api/logo` (descriptografado na hora).
7. **Auditoria:** log de ações com usuário, data/hora e detalhes; acesso ao log só para admin.
8. **Sem expor senhas:** hash no backend; reset de senha não grava senha em texto no log.
9. **Frontend:** saída dinâmica escapada com `escapeHtml()` para mitigar XSS (nomes, IDs, detalhes do log, etc.).

### Melhorias já implementadas

1. **SESSION_SECRET em produção:** se `NODE_ENV=production` e `SESSION_SECRET` não estiver definido (ou for o padrão), o servidor não inicia.
2. **Rate limiting no login:** 5 tentativas por IP a cada 5 minutos (`express-rate-limit`), com `keyGenerator` que normaliza o IP (evita erro com IPv6 + porta, ex.: `[::1]:53947`).
3. **Política de senha:** mínimo 8 caracteres, pelo menos uma letra e um número (criação e reset).
4. **CORS em produção:** definindo `CORS_ORIGIN` (ex.: `https://seu-dominio.com`), apenas essas origens são aceitas.
5. **Helmet:** headers de segurança (X-Content-Type-Options, X-Frame-Options, etc.); CSP desabilitado para o painel na mesma origem.
6. **Validação de entrada:** limite de tamanho no body (100kb); e-mail no login e no usuário limitado a 256 caracteres; IDs numéricos validados (`parseInt`, `Number.isNaN`) nas rotas PATCH/DELETE.
7. **Sessão em produção:** `SESSION_MAX_AGE_MS` (padrão 24h) e cookie `secure: true` quando em produção (exceto quando `HTTP_PLATFORM_PORT` ou `COOKIE_SECURE=false` para HTTP no IIS).
8. **Retenção do log:** entradas com mais de 90 dias são removidas ao salvar; máximo de 5000 entradas (`actionLog.js`).
9. **Trust proxy:** em produção, `trust proxy: 1` para rate limit e sessão atrás de reverse proxy.

### Riscos residuais

- **Arquivos no servidor:** `users.json`, `agendamentos.json`, `actionLog.json` e logs (`logs/app.log.enc`, `logs/startup-error.log.enc`) no disco; todos podem estar criptografados; manter permissões restritas no SO.
- **HTTPS:** em produção usar reverse proxy com SSL; o app não força HTTPS sozinho.
- **actionLog.json:** gravado criptografado quando SESSION_SECRET está definido (secureStore).

---

## O que pode ser mudado ou melhorado

### Prioridade alta (recomendado em produção)

1. **HTTPS em produção**  
   Colocar o Node atrás de reverse proxy (Nginx, Caddy, IIS com HTTPS) com SSL e definir `NODE_ENV=production`. Sem HTTPS, credenciais e cookie de sessão trafegam em texto.

2. **Permissões de arquivo no servidor**  
   Restringir leitura de `.env`, `config.enc`, `key.bin`, `users.json`, `agendamentos.json` e `actionLog.json` ao usuário do processo (ex.: `chmod 600` em Linux; no Windows, apenas a conta do App Pool / serviço).

### Prioridade média — implementado

3. **Rate limit global** — 200 requisições por 15 minutos por IP em todas as rotas `/api/*`; login continua com 5/5 min.
4. **Regeneração de sessão no login** — `req.session.regenerate()` é chamado após login bem-sucedido (mitiga session fixation).
5. **Política de senha mais forte** — exige pelo menos um caractere especial (ex.: `!@#$%^&*`) além de letra e número; mínimo 8 caracteres.

### Prioridade baixa — implementado

6. **Content-Security-Policy (CSP)** — Helmet com CSP ativa: `default-src`, `script-src`, `style-src`, `img-src`, `connect-src`, `font-src` em `'self'`.
7. **Bloqueio de conta após N falhas de login** — após 5 falhas consecutivas para o mesmo e-mail, a conta fica bloqueada por 15 minutos (resposta 429); desbloqueio automático após o tempo.
8. **Criptografia do actionLog.json** — `actionLog.json` gravado criptografado quando `SESSION_SECRET` está definido (mesmo `secureStore`).
9. **Validação de tipos nos bodies da API** — helper `validateEcsBody`/`validateString`: parâmetros ECS e agendamentos como string com tamanho máximo (accountId 256, region/projectId 128, serverId 64).

---

## Resumo

| Aspecto | Situação |
|---------|----------|
| Autenticação | OK — rate limit e política de senha implementados |
| Autorização | OK |
| Sessão | OK — SESSION_SECRET obrigatório em prod; 24h em produção; cookie secure quando em HTTPS |
| Credenciais (AK/SK) | OK — .env ou config.enc + key.bin |
| Dados em disco (users, agendamentos, actionLog) | OK — criptografia quando SESSION_SECRET definido |
| Logs de aplicação (app, startup-error) | OK — criptografia com key.bin em produção (exe); Descriptografar-Logs.exe para leitura |
| Logo em produção | OK — opcional logo.enc (mesma chave que config.enc); GET /api/logo |
| Auditoria | OK — log + login_failed |
| Rate limiting | OK — 5/5 min no login; 200/15 min global em /api; keyGenerator para IP |
| Bloqueio de conta | OK — 5 falhas → bloqueio 15 min por e-mail |
| Sessão (fixation) | OK — regenerate no login |
| Política de senha | OK — 8+ caracteres, letra, número e caractere especial |
| CORS | OK — configurável via CORS_ORIGIN em produção |
| Headers (Helmet) | OK — CSP ativa (defaultSrc, scriptSrc, styleSrc, imgSrc, etc. 'self') |
| XSS (frontend) | OK — escapeHtml na saída dinâmica |
| Validação de entrada (API) | OK — limite de body, validateEcsBody (tipos e tamanhos), IDs numéricos |
| Retenção do log | OK — 90 dias, máx. 5000 entradas |

**Conclusão:** o projeto aplicou as melhorias de segurança documentadas. Em produção, é essencial: `NODE_ENV=production`, `SESSION_SECRET` forte, **HTTPS** (reverse proxy) e **permissões de arquivo** restritas.
