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
| **Serviços** | Lista de serviços por cliente (HANA, Web, Windows). Ações Executar/Listar; **Testar conexão** SSH; **Ativar Support User** (SAP Control Center/SLD) quando configurado. |
| **Monitoramento Externo (v1.2.x)** | **Monitoramento Inteligente**: Sincroniza status de VMs gerenciadas por ferramentas externas (Cloud8) e registra horas extras automaticamente. |
| **Programação** (admin) | Agendamentos por VM (**Start**, **Stop** ou **Restart**) em horários definidos. Controle de execução interna ou monitoramento externo. |
| **Extensão de horário** (admin) | Horas a mais por cancelamento da programação, por ligar VM manualmente ou por atividade detectada pelo **Monitor Externo**. |
| **Detalhes / Backups** | Tabela paginada de snapshots/backups (CBR). Busca e exibição de tamanho. |
| **Licenças SAP** | Quantidade de licenças e add-ons (gráfico). |
| **Logs** | Log de auditoria completo (Who, When, Where). Rastreabilidade total de comandos e sessões. |

---

## Stack técnica

- **Backend:** Node.js (Express), SQLite (usuários e auditoria), JWT, bcrypt, config.enc (Fernet). SSH2 para execução de comandos em SUSE/Windows. Integração com APIs Huawei (IAM, ECS, CBR).
- **Frontend:** React (Vite), TypeScript.
- **Deploy Windows:** Instalador Inno Setup; API empacotada em .exe (pkg); IIS com HttpPlatformHandler.

---

## Segurança (resumo)

- Autenticação **JWT** (secret 32+ caracteres em produção).
- **CORS** restrito em produção.
- **Rate limit** (API e login).
- **config.enc** + chave em produção; **hiddenSegments** no IIS.

---

## Repositório

Código-fonte: **[github.com/kimetsunodarth/manager_painel](https://github.com/kimetsunodarth/manager_painel)**

---

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| **README.md** | Guia rápido, tecnologias, instalação v1.2.14. |
| **RELEASING.md** | Guia de versionamento (SemVer) e release. |
| **Ananim_Cloud_Portal_Documentacao.pdf** | PDF oficial do Portal do Cliente. |
| **DOCUMENTACAO.md** | Detalhes técnicos, scripts, troubleshooting. |
| **IIS-DEPLOY.md** | Guia passo a passo de implantação Windows Server. |
| **walkthrough.md** | Relatório de mudanças por versão. |

---

*Última atualização: 2026-05-13 (v1.2.14). Repositório: [GitHub](https://github.com/kimetsunodarth/manager_painel).*
