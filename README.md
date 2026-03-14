# Ananim Manager Painel v1.2.0

> Orquestração Enterprise para Huawei Cloud e Ecossistema SAP Business One.

![Versão](https://img.shields.io/badge/version-1.2.0-blue.svg)
![Status](https://img.shields.io/badge/status-stable-green.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)

O **Ananim Manager Painel** é uma solução avançada de cockpit centralizado para o gerenciamento de infraestrutura Huawei Cloud (ECS, CBR) e serviços SAP Business One (Service Layer, HANA, SLD). Projetado para alta performance e segurança, ele elimina a necessidade de múltiplas consoles, oferecendo uma interface unificada e segura.

## 🚀 Novidades da v1.2.0: Monitoramento Externo

A versão **1.2.0** traz o revolucionário **Monitoramento Externo Inteligente**, permitindo integração com ferramentas terceiras (ex: Cloud8) sem conflitos de comando.

- **Monitoramento Passivo**: O sistema detecta se a VM foi ligada externamente e sincroniza o status em tempo real.
- **Auto-Cálculo de Extra Hours**: Registro automático de horas extras quando o sistema detecta atividade fora do horário programado.
- **Sessões de Monitor**: Histórico detalhado de atividade detectada pelo monitorador do sistema.

## ✨ Funcionalidades Principais

- **Cockpit Unificado**: Gerenciamento integrado de Elastic Cloud Servers (ECS).
- **SAP Control Center Automation**: Ativação resiliente de Support Users via automação Playwright.
- **Isolamento de Projetos**: Controle granular de visibilidade de ECS por operador.
- **Agendamento Inteligente**: Programação por VM ou Projeto com suporte a cancelamento diário.
- **Monitoramento CBR**: Visibilidade completa de backups e políticas de proteção.
- **Auditoria 360°**: Logs detalhados de IP, usuário e ação para compliance total.

## 🛠️ Stack Tecnológico

- **Backend**: Node.js 20+ (Express / SQLite / Playwright)
- **Frontend**: React 18 / TypeScript / Vite / TailwindCSS
- **Segurança**: JWT, Helmet, Rate Limiting & AES Encryption
- **Deployment**: Pacote otimizado para IIS (Windows) com Inno Setup

## 📦 Instalação (Windows / IIS)

1. Baixe o instalador mais recente: `Ananim-Manager-Painel-IIS-Setup-1.2.0.exe`.
2. Execute o instalador e siga as instruções.
3. Use o utilitário **Ananim-Configurar-IIS.exe** incluído para configurar automaticamente o site no IIS.
4. Acesse via navegador no endereço configurado.

## 📄 Documentação

Para detalhes técnicos e guias de implantação, consulte:
- [Guia de Implantação IIS](IIS-DEPLOY.md)
- [Documentação Técnica Completa](DOCUMENTACAO.md)
- [Relatório de Release v1.2.0](walkthrough.md)

---
*Developed by Ananim Team & Antigravity AI*
