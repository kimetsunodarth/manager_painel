# Segurança — Ananim Manager Painel (Backend)

Este documento descreve as medidas de segurança implementadas e as recomendações para uso em produção.

---

## 1. Autenticação e JWT

- **JWT_SECRET obrigatório em produção**  
  Com `NODE_ENV=production`, o servidor só inicia se `JWT_SECRET` tiver **pelo menos 32 caracteres**. Ele pode vir de **config.enc** (descriptografado na inicialização) ou do **.env**. Em produção recomenda-se usar **config.enc + .encryption_key ou key.bin** (igual Huawei Cloud Panel / CBR); veja **DOCUMENTACAO.md**.

- **Expiração configurável**  
  A expiração do token é definida por `JWT_EXPIRES_IN` no `.env` (ex.: `7d`, `24h`, `1h`). Padrão: `7d`.

- **Senhas**  
  Senhas de usuário são armazenadas com **bcrypt** (salt, 10 rounds). Nunca são logadas nem retornadas nas respostas da API.

---

## 2. CORS

- **Desenvolvimento**  
  Qualquer origem é aceita (`origin: true`), para facilitar o uso com frontend em outra porta.

- **Produção**  
  Com `NODE_ENV=production` e `FRONTEND_ORIGIN` definido, apenas as origens listadas são aceitas. Exemplo no `.env`:
  ```env
  FRONTEND_ORIGIN=https://painel.seudominio.com.br
  ```
  Várias origens: separar por vírgula (ex.: `https://app.dominio.com,https://painel.dominio.com`).

---

## 3. Headers de segurança (Helmet)

O middleware **Helmet** está ativo e define headers como:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection`
- Outros headers de endurecimento recomendados

A **Content-Security-Policy** está desativada (`contentSecurityPolicy: false`) para evitar quebrar o frontend; pode ser habilitada e ajustada depois conforme necessidade.

---

## 4. Rate limiting

- **API em geral**  
  Limite de **200 requisições por IP a cada 15 minutos** (valor padrão). Configurável via `RATE_LIMIT_MAX` no `.env`.  
  A rota `GET /api/health` **não** é contabilizada (para health checks de load balancer).

- **Login**  
  Limite de **10 tentativas de login por IP a cada 15 minutos** (padrão). Configurável via `LOGIN_RATE_LIMIT_MAX`.  
  Reduz risco de brute force e abuso na tela de login.

---

## 5. Validação de entrada

- **Login**  
  - E-mail obrigatório, formato válido e tamanho máximo 255 caracteres.  
  - Senha obrigatória e com no mínimo 6 caracteres.  
  - Resposta genérica em caso de falha: “Credenciais inválidas” (sem revelar se o e-mail existe ou não).

- **Usuários (criação e edição)**  
  - Nome: obrigatório, trim, máximo 200 caracteres.  
  - E-mail: formato válido, máximo 255 caracteres, unicidade verificada.  
  - Perfil (`role`): apenas `admin` ou `operator`.  
  - Senha (quando informada): mínimo 6 caracteres.  
  - Listas/objetos (permissions, allowedEcsIds, visibleProjects, etc.) validados como array/objeto esperado.

- **Clientes (POST /api/admin/clients)**  
  - Apenas usuários com `role === 'admin'` (middleware `requireAdmin`).  
  - Nome e chave (slug) validados; chave deve ser `[a-z0-9-]+`.  
  - Jump e HANA: host, usuário e senha obrigatórios.  
  - Control Center opcional; se URL informada, usuário e senha obrigatórios.  
  - Opcionais: **huaweiPerfil** e **huaweiProjectId** — quando informados, o cliente usa o perfil Huawei já existente no config (não cria novo); apenas identificadores, sem credenciais.  
  - **Em desenvolvimento:** a API gera os JSONs de config e retorna um **snippet** para colar no `.env`; as credenciais trafegam na requisição e na resposta (snippet) — usar **HTTPS** e ambiente confiável.  
  - **No IIS (produção):** se existirem `config.enc` e chave na pasta do programa, o backend **mescla** o snippet em config.enc (Fernet); as credenciais não ficam em .env.  
  - A resposta inclui **envKeysWritten** (lista apenas dos **nomes** das chaves gravadas, ex.: SSH_HANA_XXX_JUMP_HOST); **nunca** são retornados valores de senha além do snippet que o admin deve colar. Validar acesso: aba Serviços → Testar conexão.

- **Redução de vazamento de informação**  
  Em erros internos (500), a API retorna mensagem genérica (“Erro interno…”) sem expor detalhes do servidor.

---

## 6. Banco de dados e auditoria

- **SQL**  
  Uso de **prepared statements** (placeholders) em todas as consultas ao SQLite, evitando injeção de SQL.

- **Respostas**  
  As rotas de usuário **nunca** retornam `passwordHash`. Apenas os campos necessários para o frontend são enviados.

- **Auditoria**  
  Login, criação/edição/remoção de usuários e outras ações sensíveis são registradas no log de auditoria (tabela `audit_logs`). A coluna **detalhes** pode conter JSON com dados operacionais (ex.: projectId, region, action em erros de agendamento); **nunca** inclui senhas ou tokens. A tela Logs exibe o JSON completo com opção de copiar.

- **Extensão de horário**  
  A tabela `extension_sessions` armazena apenas dados de sessão (cliente, VM, datas, duração, tipo: cancelamento do dia ou start manual). Nenhum segredo é armazenado; apenas identificadores e horários para relatório e cobrança.

---

## 7. Admin padrão e primeiro acesso

- O usuário admin padrão (criado na primeira execução) **não** tem mais a senha exibida em log.  
- A mensagem de log indica apenas que o usuário foi criado e que a senha deve ser **redefinida no primeiro acesso**.  
- Em produção, o ideal é **alterar a senha do admin** logo após o primeiro login e, se possível, desativar ou restringir a criação automática desse usuário.

---

## 8. Limite de tamanho do body

- O body das requisições JSON está limitado a **512 KB** (`express.json({ limit: '512kb' })`), reduzindo risco de ataques com payloads muito grandes.

---

## 9. Checklist para produção

- [ ] Definir `NODE_ENV=production`.
- [ ] Definir `JWT_SECRET` no `.env` com **pelo menos 32 caracteres** (valor aleatório e forte).
- [ ] Ajustar `JWT_EXPIRES_IN` se quiser tokens mais curtos (ex.: `1d` ou `24h`).
- [ ] Definir `FRONTEND_ORIGIN` com a(s) URL(s) do frontend.
- [ ] Ajustar `RATE_LIMIT_MAX` e `LOGIN_RATE_LIMIT_MAX` se necessário.
- [ ] Servir a API atrás de **HTTPS** (reverse proxy com TLS, ex.: Nginx, Traefik).
- [ ] Redefinir a senha do usuário admin padrão no primeiro acesso.
- [ ] Manter o `.env` fora do controle de versão e com permissões restritas no servidor.
- [ ] Rodar `npm audit` e corrigir vulnerabilidades críticas/altas nas dependências.

---

## 10. Token no frontend (localStorage)

O frontend armazena o token JWT em **localStorage**. Isso é prático, mas em caso de **XSS** (script malicioso na página) o token pode ser lido.

**Recomendações:**

- Manter o frontend atualizado e sem vulnerabilidades conhecidas (dependências, sanitização de entrada).
- No futuro, considerar armazenar o token em **cookie HttpOnly** (definido pelo backend) para que o JavaScript não tenha acesso; o cookie seria enviado automaticamente nas requisições.

---

## 11. Dependências de segurança

- **helmet** — headers de segurança HTTP.  
- **express-rate-limit** — limite de requisições por IP.  
- **bcryptjs** — hash de senhas.  
- **jsonwebtoken** — emissão e verificação de JWT.  
- **nodemailer** (v8.x) — envio de e-mails (notificações de restart, teste de SMTP). Atualizado para 8.x para corrigir vulnerabilidades (GHSA-mm7p-fcc7-pg87, GHSA-rcmh-qjqh-p98v). O transporte SMTP usa as configurações padrão de TLS do Node; não é usado SSLv3.

Execute periodicamente:

```bash
npm audit
npm audit fix
```

e atualize dependências conforme a política do projeto. **Ao alterar dependências ou comportamento de segurança, atualize este documento e o .env.example.**

---

## 12. Rotas administrativas

- **GET/POST /api/admin/clients** — apenas administradores (`requireAdmin`). Listagem de clientes (registry + chaves HANA/Control Center) e criação de novo cliente (gera JSONs em `config/hana-clients/`, `config/control-center/` e atualiza `dynamic-clients-registry.json`). O body aceita opcionalmente:
  - **assignToUserIds:** array de IDs de usuários; o cliente é adicionado ao `visibleProjects` deles para já aparecer na aba Serviços.
  - **hanaServices / webServices:** texto no formato "id|Nome" por linha, para definir os serviços (HANA e Web) que aparecem na aba Serviços.
  - **windowsServiceGroupsText:** texto no formato "id=Nome1,Nome2" por linha, mapeamento de grupos web para nomes de serviços Windows.
  - **huaweiPerfil** e **huaweiProjectId:** ao criar cliente a partir de um perfil Huawei existente, evita criar novo perfil; apenas nomes/IDs, sem credenciais.
  - No **IIS**, se config.enc existir, o snippet é mesclado automaticamente (não colar no .env). A resposta inclui **envKeysWritten** (nomes das chaves SSH/Jump gravadas) e **configEncUpdated** (true quando config.enc foi atualizado). Credenciais nunca são retornadas além do snippet; validar na aba Serviços com "Testar conexão". Ver README e DOCUMENTACAO.md.

## 13. Segurança na implantação IIS

- **web.config:** o arquivo `installer/iis/web.config` usa **requestFiltering > hiddenSegments** para bloquear acesso HTTP direto a: `.env`, **`.encryption_key`**, **`config.enc`**, **`key.bin`**, `config`, `data`, `logs`, `lib`, `node_modules`. Assim, mesmo com handler repassando todas as requisições ao .exe, o IIS não entrega esses caminhos como recurso estático.
- **Credenciais na pasta do programa:** em produção use **config.enc + .encryption_key** (ou key.bin) na raiz da pasta de instalação; **não** deixe .env com segredos. A chave e o config.enc são sensíveis: restrição de ACL (apenas Administradores e identidade do App Pool) na pasta do site.
- **App Pool:** o .exe roda sob a identidade do App Pool (ex.: IIS AppPool\AnanimManagerPanel). O Setup-IIS.ps1 concede Modify a IIS_IUSRS para o app criar data/, logs e ananim.db; o restante da pasta deve ter permissões restritas.
- **Listen 127.0.0.1:** sob IIS, o backend escuta apenas em 127.0.0.1; tráfego externo passa pelo IIS. Documentação de deploy: **IIS-DEPLOY.md** e **installer/README.md**.

## 14. Última validação

- **Data:** 2026-02-12  
- **Backend:** JWT em produção, Helmet, CORS, rate limit (API + login), validação de entrada (login, usuários, admin/clients com serviços, assignToUserIds, huaweiPerfil/huaweiProjectId), senha do admin não em log, body 512 KB, prepared statements, auditoria, rotas admin protegidas, `.env` no .gitignore. Resposta de criação de cliente: envKeysWritten só com **nomes** de chaves; credenciais apenas no snippet (e no config.enc quando IIS).  
- **IIS:** web.config com hiddenSegments para .encryption_key, config.enc, key.bin, config, data, logs, lib; merge automático do snippet em config.enc ao criar cliente; documentação de segurança IIS em SECURITY.md e IIS-DEPLOY.md.  
- **Pendente em produção:** NODE_ENV=production, JWT_SECRET 32+ caracteres (config.enc ou .env), FRONTEND_ORIGIN, HTTPS via proxy. Ver **DOCUMENTACAO.md** para config.enc + key.

**Ao alterar rotas, credenciais ou fluxo de admin, atualizar este documento e validar que nenhum valor sensível é logado ou exposto na resposta (apenas nomes de chaves quando aplicável).**

---

## 15. Validação de segurança (checklist)

| Área | Verificado |
|------|------------|
| **Autenticação** | JWT com secret 32+ em produção; bcrypt para senhas; token não expõe dados sensíveis. |
| **Rotas** | Admin (clientes, documentos, licenças) protegidas com `requireAdmin`; usuários com `requirePermission('users:*')`; GET /users e GET /users/:id usam `userStore.getById`/getAll que **não** retornam `passwordHash`. |
| **Credenciais** | Senhas e SSH só em .env/config.enc/credentials.enc; envKeysWritten retorna apenas nomes de chaves; snippet de cliente trafega em HTTPS em produção. |
| **Entrada** | Login, usuários e clientes validados (tipo, tamanho, formato); chave do cliente `[a-z0-9-]+`; body limit 512 KB. |
| **SQL** | Prepared statements (placeholders) em todo acesso ao SQLite; sem concatenação de entrada em SQL. |
| **Resposta** | Erros 500 genéricos; nenhuma rota retorna passwordHash ou valores de senha além do snippet (admin). |
| **Arquivos** | .env, config.enc, .encryption_key, key.bin no .gitignore; clients/*/.env no .gitignore. |
| **IIS** | hiddenSegments bloqueia acesso HTTP a config.enc, key.bin, config, data, logs, lib. |

---

## 16. O que pode ser melhorado

- **Token no frontend:** hoje o JWT fica em **localStorage**; em caso de XSS o token pode ser roubado. **Melhoria:** considerar cookie **HttpOnly** + **Secure** definido pelo backend (e CORS credentials), para o JavaScript não ter acesso ao token.
- **Content-Security-Policy:** está desativada para não quebrar o frontend. **Melhoria:** habilitar CSP restritiva e ajustar frontend (inline scripts, fontes) conforme necessário.
- **Auditoria:** ações sensíveis são registradas em `audit_logs`; **melhoria:** incluir IP e user-agent nas entradas e garantir rotação/arquivamento de logs em produção.
- **HTTPS:** em produção a API deve ser servida apenas via HTTPS (reverse proxy). **Melhoria:** documentar e, se possível, redirecionar HTTP → HTTPS no proxy.
- **Dependências:** executar `npm audit` periodicamente e corrigir vulnerabilidades críticas/altas; **melhoria:** integrar no CI (ex.: falhar build se houver críticas).
- **Admin padrão:** o primeiro usuário admin é criado com senha fixa em desenvolvimento; **melhoria:** em produção desativar criação automática ou exigir variável de ambiente para habilitar.
- **Rate limit por usuário:** hoje o rate limit é por IP; **melhoria:** considerar limite por usuário autenticado para rotas sensíveis (ex.: criação de clientes).
