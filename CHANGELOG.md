# Changelog

Todas as alterações relevantes do projeto devem ser documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/), e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/) quando aplicável.

---

## [Unreleased]

### Adicionado

- **Logo criptografado:** armazenamento do logo em `logo.enc` (mesma chave que config.enc/key.bin); servido via `GET /api/logo`; script `backend/scripts/encrypt-logo.js`; frontend passa a usar `/api/logo` em vez de `logo.png`.
- **Logs criptografados:** em produção (exe/IIS) toda saída da aplicação e erros de inicialização vão para `logs/app.log.enc` e `logs/startup-error.log.enc` (módulo `utils/log-encrypt.js`); chave = key.bin; formato append-only por bloco (4 bytes length + iv + tag + ciphertext).
- **Descriptografar-Logs.exe:** ferramenta (CLI) para ler logs criptografados; entrada `backend/decrypt-logs.js`, build com `npm run build:decrypt-logs`; incluída no pacote IIS e no instalador Inno; ao ser executada sem argumentos, exibe instruções de uso e aguarda Enter (evita janela fechar ao clicar).
- **Projetos – Atualizar:** botão "Atualizar projetos" na tela de projetos para buscar novamente a lista de projetos na nuvem (útil quando novos projetos são criados).
- **Diagnóstico 502.3:** erros de inicialização gravados em `logs/startup-error.log.enc` (ou .log se não houver key); documentação para usar Descriptografar-Logs.exe para ler e diagnosticar.
- **Tela de login com personagem:** personagem (mascote) animado no topo do card; segue o mouse (olha na direção do cursor); ao focar ou digitar no campo senha, o personagem tapa os olhos (braços sobre os olhos). Implementação em HTML/CSS e JS no frontend.

### Alterado

- **Cron de agendamentos:** registro de **schedule_heartbeat** a cada 5 minutos (quando não há agendamentos devidos), formando um trail contínuo no log; evita “salto na data” e comprova que o processo estava ativo. Keep-alive interno reduzido para 60s.
- **IIS:** mensagem no arranque lembrando de definir App Pool Idle Time-out = 0; CONFIG-README e INSTALACAO reforçam que o cron não depende do navegador e que Idle Time-out = 0 é obrigatório para agendamentos contínuos.

### Documentação

- **RESUMO-DO-PROJETO.md:** novo documento com resumo do projeto (o que é, o que faz, como funciona, principais arquivos, formas de rodar).
- **README.md:** estrutura atualizada (log-encrypt.js, decrypt-logs.js, config-loader com decryptBinary); endpoint GET /api/logo e GET /api/health; logs criptografados e uso do Descriptografar-Logs.exe; botão Atualizar projetos; referência a RESUMO-DO-PROJETO.md.
- **INSTALACAO.md:** logo.enc e Descriptografar-Logs.exe nos artefatos gerados; 502.3 – uso do Descriptografar-Logs.exe para ler startup-error.log.enc; comandos encrypt-logo e descriptografar logs.
- **SEGURANCA.md:** logs de aplicação criptografados (app.log.enc, startup-error.log.enc), logo.enc e GET /api/logo; tabela resumo atualizada.

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
