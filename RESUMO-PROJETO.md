# Resumo do projeto — Ananim Manager Painel

Visão geral do que é o projeto, o que faz e onde encontrar detalhes.

---

## O que é

**Ananim Manager Painel** é um **painel web** para gerenciamento de ambientes **Huawei Cloud** e **SAP Business One**: ECS, serviços SAP/HANA, backups (CBR), licenças, documentos e clientes. Inclui controle de **usuários e permissões** (admin e operador) e integração com **IIS** no Windows e pacote para **Linux**.

---

## Objetivo

- Centralizar a **visão e as ações** sobre ambientes (IP, país, VLAN, cliente, parceiro, ERP).
- Permitir **reiniciar ECS**, executar **serviços** (Banco HANA, EDS, Service Layer, SLD, backups off-site, etc.) via SSH (Jump + HANA ou SQL/Web).
- Listar **backups/snapshots** (API CBR da Huawei) e **licenças SAP**.
- Gerenciar **clientes** (HANA, Control Center) e **usuários** (perfis admin/operador, ECS e serviços permitidos).
- Rodar em **produção** como API única (backend + frontend) atrás de **IIS** (Windows) ou como **binário** no Linux, com configuração sensível em **config.enc** (criptografado).

---

## O que faz (principais funcionalidades)

| Área | Descrição |
|------|------------|
| **Página inicial** | Lista de ambientes com filtros (IP, país, VLAN, cliente, parceiro, ERP). Ações: reiniciar ECS, ver detalhes/backups, licenças. |
| **Serviços** | Lista de serviços por cliente (HANA, Web, Windows). Ações Executar/Listar; **Testar conexão** SSH; **Ativar Support User** (SAP Control Center/SLD) quando configurado (requer Playwright/Chromium; no instalador IIS: pasta **browsers/**). |
| **Programação** (admin) | Agendamentos por VM (**Start**, **Stop** ou **Restart**) em horários definidos. Horário com seletor de tempo e ±15 min. Coluna Criado/Modificado por. Cancelar programação por dia (só afeta o dia). Diagnóstico de agendamentos. |
| **Extensão de horário** (admin) | Horas a mais por cancelamento da programação do dia ou por ligar VM após horário. Listagem com filtros e cronômetro em tempo real. |
| **Detalhes / Backups** | Tabela paginada de snapshots/backups (CBR). Busca e exibição de tamanho. |
| **Licenças SAP** | Quantidade de licenças e add-ons (gráfico). |
| **Documentos** | Lista de documentos com upload e download (admin). |
| **Clientes** (admin) | **Adicionar** e **Excluir** clientes HANA/Control Center (nome, credenciais Jump e HANA, serviços, atribuição a operadores). Uso de perfil Huawei existente. No IIS, config.enc atualizado automaticamente. Edição de serviços por cliente. Após criar: reiniciar backend (dev) ou site (IIS) para SSH. |
| **Usuários** | Criação e edição de usuários; perfis admin ou operador; permissões por ECS e serviços. |
| **Logs** | Log de auditoria (login, alterações em usuários, **quem ligou/desligou/restart VM** e em qual projeto/VM, agendamentos executados pelo sistema com “criado por”, erros, etc.). Resumo legível (VM e projeto) + JSON completo com botão copiar. |

---

## Stack técnica

- **Backend:** Node.js (Express), SQLite (usuários e auditoria), JWT, bcrypt, config.enc (Fernet). SSH2 para execução de comandos em SUSE/Windows. Integração com APIs Huawei (IAM, ECS, CBR).
- **Frontend:** React (Vite), TypeScript.
- **Deploy Windows:** Instalador Inno Setup; API empacotada em .exe (pkg); IIS com HttpPlatformHandler; exe GUI (Abrir Painel, Configurar IIS).
- **Deploy Linux:** Pacote com binário (pkg) + public + lib; systemd e Nginx opcionais.

---

## Segurança (resumo)

- Autenticação **JWT** (secret 32+ caracteres em produção).
- **CORS** restrito em produção (FRONTEND_ORIGIN).
- **Rate limit** (API e login).
- **Helmet** para headers de segurança.
- Senhas com **bcrypt**; **nunca** retornadas nem logadas.
- Rotas admin protegidas (**requireAdmin**); criação de clientes retorna apenas **nomes** de chaves (envKeysWritten), não valores.
- **config.enc** + chave em produção; **hiddenSegments** no IIS para config.enc, key.bin, config, data, logs.

Detalhes e melhorias sugeridas: **backend/SECURITY.md**.

---

## Repositório

Código-fonte: **[github.com/kimetsunodarth/manager_painel](https://github.com/kimetsunodarth/manager_painel)**

---

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| **README.md** | Como rodar (backend/frontend), funcionalidades, adicionar cliente, configuração .env/config.enc, estrutura, deploy IIS. |
| **DOCUMENTACAO.md** | Configuração (config.enc, chave), scripts (gerar-jwt-e-enc, fix-maxmohr), build e instalador IIS, edição de serviços, programação e extensão de horário, backup CBR, troubleshooting. |
| **docs/ERROS-E-TROUBLESHOOTING.md** | Erros comuns e soluções: SSH após criar cliente, programação ao editar, Playwright/Chromium (Ativar Support), API Huawei, 502.3, build PowerShell. |
| **backend/SECURITY.md** | Segurança: JWT, CORS, rate limit, validação, rotas admin, auditoria, extensão de horário, IIS, checklist produção, **validação** e **o que pode ser melhorado**. |
| **IIS-DEPLOY.md** | Implantação no IIS: pré-requisitos, instalador .exe, pasta browsers (Chromium), configuração automática, segurança (web.config, ACL), troubleshooting. |
| **LINUX-DEPLOY.md** | Pacote Linux (equivalente ao IIS): build no Linux, systemd, Nginx. |
| **installer/README.md** | Geração do instalador (build-package-iis, compile-installer-iis), exe GUI, edição de serviços, segurança. |
| **installer/gui-launchers/README.md** | O que faz cada launcher (Abrir Painel, Configurar IIS) e compilação manual. |

---

## Como começar

1. **Desenvolvimento:** `cd backend && npm install && npm run dev`; em outro terminal `cd frontend && npm install && npm run dev`. Acesse http://localhost:5173 (login: joao@example.com / admin123).
2. **Produção Windows:** Gere o instalador com `.\installer\build-package-iis.ps1` e `.\installer\compile-installer-iis.ps1`. O .exe é gerado em **installer\\Output\\Ananim-Manager-Painel-IIS-Setup-*.exe**. Instale no servidor; copie config.enc e key para a pasta do programa; use **Ananim-Configurar-IIS.exe** ou Configurar-IIS.bat para criar o site no IIS.
3. **Produção Linux:** No Linux, rode `./installer/build-package-linux.sh`; copie **installer/package-linux/** para o servidor; execute com `PORT=3001 NODE_ENV=production ./Ananim-Manager-Painel-API`. Ver **LINUX-DEPLOY.md**.

---

*Última atualização: 2026-03-05. Repositório: [GitHub](https://github.com/kimetsunodarth/manager_painel).*
