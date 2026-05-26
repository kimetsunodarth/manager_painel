# Resumo do projeto – Huawei Cloud Panel

## O que é

**Huawei Cloud Panel** (Ananim Huawei Painel) é um **painel web** para gerenciar **máquinas virtuais (ECS)** na **Huawei Cloud**. Permite fazer **login** com usuário e senha, escolher **contas** (credenciais AK/SK), listar **projetos** e **servidores ECS**, e executar **Start**, **Stop** e **Restart** manualmente ou por **agendamento** (horário e dias da semana).

O projeto é usado internamente para operar e agendar ECS de várias contas (RAMO_SISTEMAS, ANANIMCLOUD, RSDONE, MOOVE_RAMOSISTEMAS) em um único lugar, com auditoria (log de ações) e gestão de usuários.

---

## O que faz (funcionalidades principais)

| Área | O que faz |
|------|-----------|
| **Login** | Tela de login com e-mail/senha; sessão com cookie seguro; bloqueio temporário após 5 falhas no mesmo e-mail. |
| **Contas** | Lista as 4 contas Huawei configuradas; ao clicar, lista os **projetos** da conta (com pesquisa por nome/ID) e botão **Atualizar projetos** para buscar projetos novos na nuvem. |
| **Projetos e ECS** | Por projeto: lista servidores ECS com pesquisa; botões **Start**, **Stop**, **Restart**; e **Agendar Start/Stop/Restart** (abre o formulário de agendamento). |
| **Agendamentos** | CRUD de agendamentos: conta, região, projeto, servidor, ação (Start/Stop/Restart), horário, dias da semana; execução **automática a cada minuto** (cron no servidor); pesquisa na lista; exibição de criado por / alterado por. |
| **Usuários** | (Admin) Criar usuário, resetar senha (incluindo admin), excluir usuário; senhas com política (8+ caracteres, letra, número e caractere especial). |
| **Log de ações** | (Admin) Ver todas as ações (login, logout, ECS, agendamentos, usuários); exportar para .txt; dados criptografados em disco quando em produção. |

---

## Como funciona (arquitetura resumida)

```
[Navegador]  →  http://localhost:8088 (IIS) ou :5000 (Node)
                    ↓
[IIS HttpPlatformHandler]  →  Huawei-Cloud-Panel-API.exe (Node empacotado com pkg)
                    ↓
[Express]  →  API REST (/api/auth, /api/accounts, /api/projects, /api/ecs, /api/schedules, /api/users, /api/action-log, /api/logo, /api/health)
                    ↓
[Arquivos]  config.enc + key.bin (credenciais), users.json, actionLog.json, agendamentos (todos criptografados em prod quando SESSION_SECRET definido)
[Logs]      logs/app.log.enc, logs/startup-error.log.enc (criptografados com key.bin)
[Huawei]    IAM (projetos) e ECS (listar, start, stop, restart) via APIs da Huawei com AK/SK
```

- **Frontend:** HTML/CSS/JS estático (login + painel), servido pela mesma aplicação.
- **Backend:** Node.js (Express); em produção no Windows pode rodar como **.exe** (pkg) atrás do **IIS** (porta 8088).
- **Dados sensíveis:** credenciais em **config.enc** + **key.bin** (criptografia AES-256-GCM); usuários, agendamentos e log de ações em JSON criptografado (secureStore) quando `SESSION_SECRET` está definido.
- **Logs em produção:** saída da aplicação e erros de inicialização vão para **logs criptografados** (app.log.enc, startup-error.log.enc). Para ler: usar **Descriptografar-Logs.exe** (usa key.bin da pasta do app).

---

## Principais arquivos e pastas

| Onde | O quê |
|------|--------|
| **backend/** | API Node.js: server.js, config.js (contas/regiões), users.js, actionLog.js, schedules.js, huaweiClient.js, ecsClient.js, utils/config-loader.js, utils/secureStore.js, utils/log-encrypt.js, decrypt-logs.js (CLI para descriptografar logs). |
| **frontend/** | index.html, app.js, style.css, logo.png (no build pode ser substituído por logo.enc servido via GET /api/logo). |
| **Raiz** | .env (não versionar), build-package-iis.ps1, Recompilar-E-Gerar-Exe.ps1. |
| **installer/** | Inno Setup (installer-iis.iss); gera Huawei-Cloud-Panel-IIS-Setup-1.0.0.exe. |
| **package-iis/** | Saída do build: .exe da API, Descriptografar-Logs.exe, public/, web.config, config.enc, key.bin, logo.enc, scripts (Configurar-IIS.bat, etc.), logs/. |

---

## Formas de rodar

1. **Desenvolvimento:** `cd backend && npm start` → painel em http://localhost:5000.
2. **Produção Windows (IIS):** instalar o instalador Inno; site na porta 8088; config.enc e key.bin na pasta do app.
3. **Linux:** Node.js + systemd + Nginx (ver DEPLOY-LINUX.md).

---

## Documentação de referência

| Documento | Conteúdo |
|-----------|----------|
| **README.md** | Visão geral, estrutura, configuração, contas, como executar, funcionalidades, endpoints, segurança. |
| **RESUMO-DO-PROJETO.md** | Este arquivo: o que é, o que faz, como funciona, principais arquivos, formas de rodar. |
| **INSTALACAO.md** | Guia de instalação: compilar, gerar .exe e instalador, requisitos no servidor, passos antes/depois, solução de problemas. |
| **SEGURANCA.md** | Segurança: auditoria, criptografia, rate limit, política de senha, bloqueio de conta, CSP, validação. |
| **CHANGELOG.md** | Registro de todas as alterações do projeto (obrigatório documentar aqui). |
| **CONFIG-README.txt** | (No pacote/instalador) Instruções de configuração no servidor, logs criptografados, uso do Descriptografar-Logs.exe. |

---

## Resumo em uma frase

**Huawei Cloud Panel** é um painel web para listar projetos e ECS da Huawei Cloud, executar Start/Stop/Restart manual ou agendado, com login por usuário/senha, várias contas (AK/SK), log de ações e dados/credenciais protegidos por criptografia em produção.
