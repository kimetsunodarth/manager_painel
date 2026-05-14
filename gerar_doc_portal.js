#!/usr/bin/env node
// Gerador de documentação PDF — Ananim Cloud Portal
// Usa puppeteer (já instalado) para renderizar HTML → PDF

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

function getBrowserLauncher() {
  // Preferir Playwright (já baixado no projeto para o instalador IIS).
  try {
    const pw = require(path.join(__dirname, 'installer', 'playwright-runtime', 'node_modules', 'playwright'));
    if (pw?.chromium) return { kind: 'playwright', chromium: pw.chromium };
  } catch (_) {}

  // Fallback: puppeteer (se estiver instalado no ambiente).
  try {
    const p = require('puppeteer');
    if (p?.launch) return { kind: 'puppeteer', puppeteer: p };
  } catch (_) {}

  throw new Error(
    'Nenhum navegador headless encontrado. Use ./installer/build-package-iis.ps1 (gera playwright-runtime) ou instale puppeteer.'
  );
}

const OUT = path.join(__dirname, 'Ananim_Cloud_Portal_Documentacao.pdf');
const VERSION_FILE = path.join(__dirname, 'VERSION');
const LOGO_MARK = path.join(__dirname, 'Logos Ananim', 'logo Ananim_Prancheta 1 cópia 14.png');
const TODAY = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
const TODAY_SHORT = new Date().toLocaleDateString('pt-BR');

function readVersion() {
  try {
    const v = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    return /^\d+\.\d+\.\d+$/.test(v) ? v : '';
  } catch {
    return '';
  }
}

function readLogoDataUri() {
  try {
    const buf = fs.readFileSync(LOGO_MARK);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

// ── Paleta de cores ──────────────────────────────────────────────────────────
const C = {
  bg:      '#050913',
  card:    '#0d1b2e',
  cyan:    '#00C8E0',
  cyanDk:  '#0891b2',
  white:   '#ffffff',
  gray50:  '#f8fafc',
  gray100: '#f1f5f9',
  gray200: '#e2e8f0',
  gray400: '#94a3b8',
  gray600: '#475569',
  gray700: '#374151',
  gray900: '#0f0f1a',
  green:   '#16a34a',
  orange:  '#d97706',
  red:     '#dc2626',
};

// ── HTML do documento ────────────────────────────────────────────────────────
function buildHtml() {
  const version = readVersion();
  const logoDataUri = readLogoDataUri();
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Ananim Cloud Portal — Documentação</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: ${C.gray900};
    background: #fff;
    line-height: 1.6;
  }

  /* ── Capa ────────────────────────────────────────────────────── */
  .cover {
    width: 210mm;
    height: 297mm;
    background: ${C.bg};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    page-break-after: always;
    position: relative;
    overflow: hidden;
  }
  .cover-grid {
    position: absolute; inset: 0;
    background-image: repeating-linear-gradient(0deg, transparent, transparent 49px, rgba(0,200,224,0.04) 50px),
                      repeating-linear-gradient(90deg, transparent, transparent 49px, rgba(0,200,224,0.04) 50px);
  }
  .cover-band {
    position: absolute;
    left: 0; right: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 40%;
    background: ${C.card};
  }
  .cover-content { position: relative; z-index: 1; text-align: center; }
  .cover-logo {
    width: 80px; height: 80px;
    background: ${C.cyan};
    border-radius: 20px;
    margin: 0 auto 24px;
    display: flex; align-items: center; justify-content: center;
    font-size: 32px; font-weight: 900; color: ${C.bg};
    letter-spacing: -1px;
    overflow: hidden;
  }
  .cover-logo img { width: 100%; height: 100%; object-fit: cover; }
  .cover-title { font-size: 42px; font-weight: 900; color: #fff; letter-spacing: -1px; }
  .cover-title span { color: ${C.cyan}; }
  .cover-subtitle { font-size: 16px; color: ${C.cyan}; margin-top: 8px; letter-spacing: 3px; text-transform: uppercase; }
  .cover-desc { font-size: 13px; color: #4d7fa8; margin-top: 16px; }
  .cover-date { font-size: 12px; color: ${C.cyan}; margin-top: 12px; }
  .cover-version { font-size: 11px; color: #4d7fa8; margin-top: 6px; letter-spacing: 1px; }
  .cover-footer {
    position: absolute; bottom: 24px; left: 0; right: 0;
    text-align: center; font-size: 9px; color: #1e3a5f; letter-spacing: 1px;
  }
  .cover-line {
    width: 160mm; height: 1.5px; background: ${C.cyan};
    margin: 16px auto;
  }

  /* ── Páginas internas ────────────────────────────────────────── */
  .page {
    padding: 20mm 18mm 18mm;
    page-break-after: always;
  }
  .page:last-child { page-break-after: avoid; }

  /* Header / Footer */
  @page {
    size: A4;
    margin: 22mm 15mm 15mm;
    @top-left { content: ""; }
  }

  /* ── Sumário ─────────────────────────────────────────────────── */
  .toc-title { font-size: 22px; font-weight: 900; color: ${C.cyan}; border-bottom: 2px solid ${C.cyan}; padding-bottom: 8px; margin-bottom: 16px; }
  .toc-item { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dotted ${C.gray200}; font-size: 11px; }
  .toc-item .num { color: ${C.cyan}; font-weight: 700; margin-right: 8px; }
  .toc-item .pg  { color: ${C.gray400}; font-weight: 600; }
  .toc-section { margin-top: 12px; padding-top: 6px; border-top: 1px solid ${C.gray200}; }
  .toc-section-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: ${C.gray400}; margin-bottom: 4px; }

  /* ── Seções ──────────────────────────────────────────────────── */
  .section-header {
    background: ${C.bg};
    color: #fff;
    padding: 10px 16px;
    border-radius: 8px 8px 0 0;
    border-left: 4px solid ${C.cyan};
    margin-top: 20px;
  }
  .section-header h2 { font-size: 16px; font-weight: 900; color: ${C.cyan}; }
  .section-header .section-num { font-size: 11px; color: #4d7fa8; }
  .section-body { padding: 12px 0; }

  h3 { font-size: 13px; font-weight: 700; color: ${C.cyanDk}; margin: 16px 0 6px; }
  h4 { font-size: 11px; font-weight: 700; color: ${C.gray700}; margin: 10px 0 4px; }

  p { margin-bottom: 6px; }
  li { margin-bottom: 3px; }
  ul, ol { padding-left: 18px; margin-bottom: 8px; }

  /* ── Info boxes ──────────────────────────────────────────────── */
  .info-box {
    background: #e0f7ff;
    border: 1.5px solid ${C.cyan};
    border-radius: 6px;
    padding: 10px 14px;
    margin: 8px 0;
    font-size: 10px;
  }
  .warn-box {
    background: #fff7ed;
    border: 1.5px solid ${C.orange};
    border-radius: 6px;
    padding: 10px 14px;
    margin: 8px 0;
    font-size: 10px;
  }
  .new-badge {
    display: inline-block;
    background: ${C.cyan};
    color: ${C.bg};
    font-size: 8px;
    font-weight: 900;
    padding: 1px 6px;
    border-radius: 10px;
    letter-spacing: 1px;
    vertical-align: middle;
    margin-left: 6px;
  }

  /* ── Tabelas ─────────────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 10px; }
  th {
    background: ${C.bg};
    color: #fff;
    padding: 7px 10px;
    text-align: left;
    font-size: 9px;
    font-weight: 700;
    border-bottom: 2px solid ${C.cyan};
  }
  td { padding: 6px 10px; border-bottom: 1px solid ${C.gray200}; vertical-align: top; }
  tr:nth-child(even) td { background: ${C.gray50}; }

  /* ── Code ────────────────────────────────────────────────────── */
  code, .code-block {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9px;
    background: ${C.card};
    color: ${C.cyan};
    border-radius: 4px;
  }
  code { padding: 1px 4px; }
  .code-block {
    display: block;
    padding: 8px 12px;
    margin: 6px 0;
    white-space: pre-wrap;
    word-break: break-all;
  }

  /* ── Module cards ────────────────────────────────────────────── */
  .module-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
  .module-card {
    border: 1px solid ${C.gray200};
    border-radius: 8px;
    padding: 10px 12px;
    background: ${C.gray50};
  }
  .module-card .icon { font-size: 18px; margin-bottom: 4px; }
  .module-card .name { font-size: 11px; font-weight: 700; color: ${C.gray900}; }
  .module-card .desc { font-size: 9px; color: ${C.gray600}; margin-top: 3px; }
  .module-card .role-badge {
    display: inline-block;
    font-size: 8px;
    padding: 1px 5px;
    border-radius: 4px;
    margin-top: 4px;
    font-weight: 700;
  }
  .role-admin  { background: #fee2e2; color: #991b1b; }
  .role-super  { background: #fef3c7; color: #92400e; }
  .role-all    { background: #d1fae5; color: #065f46; }

  /* ── Assinatura block preview ────────────────────────────────── */
  .sig-preview {
    border: 1px solid ${C.gray200};
    border-radius: 6px;
    overflow: hidden;
    margin: 8px 0;
  }
  .sig-preview-hdr {
    background: ${C.bg};
    color: ${C.cyan};
    font-size: 9px;
    font-weight: 700;
    padding: 5px 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .sig-row {
    display: flex;
    border-bottom: 1px solid ${C.gray200};
  }
  .sig-row:last-child { border-bottom: none; }
  .sig-left { flex: 1; padding: 8px 10px; }
  .sig-right {
    width: 45%;
    padding: 8px 10px;
    text-align: center;
    border-left: 1px solid ${C.gray200};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
  }
  .sig-name-cursive {
    font-family: 'Brush Script MT', cursive;
    font-size: 20px;
    color: #0d1b2a;
    padding-bottom: 4px;
    border-bottom: 1.5px solid #0d1b2a;
    font-style: italic;
  }
  .sig-line { width: 100%; border-bottom: 1px solid ${C.gray400}; height: 24px; }

  /* ── Audit trail ─────────────────────────────────────────────── */
  .audit-row td:first-child { font-size: 8px; color: ${C.gray400}; font-family: monospace; }
  .audit-tipo { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 8px; font-weight: 700; }
  .tipo-criou     { background: #dbeafe; color: #1e40af; }
  .tipo-visualizou{ background: #fef3c7; color: #92400e; }
  .tipo-assinou   { background: #d1fae5; color: #065f46; }
  .tipo-recusou   { background: #fee2e2; color: #991b1b; }

  /* ── Endpoint pill ───────────────────────────────────────────── */
  .endpoint { display: flex; gap: 6px; align-items: baseline; margin: 4px 0; }
  .method {
    font-size: 8px; font-weight: 900; font-family: monospace;
    padding: 2px 6px; border-radius: 4px; min-width: 42px; text-align: center;
  }
  .get    { background: #d1fae5; color: #065f46; }
  .post   { background: #dbeafe; color: #1e40af; }
  .put    { background: #fef3c7; color: #92400e; }
  .delete { background: #fee2e2; color: #991b1b; }
  .endpoint .path { font-family: monospace; font-size: 9px; color: ${C.cyanDk}; }
  .endpoint .desc { font-size: 9px; color: ${C.gray600}; }

  /* ── QR mockup ───────────────────────────────────────────────── */
  .qr-box {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    border: 1.5px solid ${C.cyan};
    border-radius: 8px;
    padding: 10px;
    background: #fff;
  }
  .qr-pixels {
    width: 64px; height: 64px;
    background-image: repeating-linear-gradient(0deg, #eee 0px, #eee 4px, transparent 4px, transparent 8px),
                      repeating-linear-gradient(90deg, #eee 0px, #eee 4px, transparent 4px, transparent 8px);
    background-color: #fff;
    border: 2px solid ${C.bg};
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }
  .qr-pixel-blk {
    position: absolute;
    background: ${C.bg};
    border-radius: 1px;
  }
  .qr-label { font-size: 8px; color: ${C.gray400}; margin-top: 5px; letter-spacing: 1px; }

  /* ── Page break helpers ──────────────────────────────────────── */
  .pb { page-break-after: always; }
  .no-break { page-break-inside: avoid; }

  /* ── Two-column layout ───────────────────────────────────────── */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
</style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════════════ CAPA -->
<div class="cover">
  <div class="cover-grid"></div>
  <div class="cover-band"></div>
  <div class="cover-content">
    <div class="cover-logo">${logoDataUri ? `<img src="${logoDataUri}" alt="Ananim">` : 'AN'}</div>
    <div class="cover-title">Ananim <span>Cloud</span></div>
    <div class="cover-subtitle">Portal do Cliente</div>
    <div class="cover-line"></div>
    <div class="cover-desc">Documentação Técnica do Portal</div>
    <div class="cover-date">${TODAY} (${TODAY_SHORT})</div>
    ${version ? `<div class="cover-version">Versão do projeto: v${version}</div>` : ''}
  </div>
  <div class="cover-footer">ANANIM • HUAWEI CLOUD • SAP BUSINESS ONE</div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ SUMÁRIO -->
<div class="page">
  <div class="toc-title">Sumário</div>

  <div class="toc-section">
    <div class="toc-section-label">Introdução</div>
    <div class="toc-item"><span><span class="num">1.</span>Visão Geral do Portal</span><span class="pg">3</span></div>
    <div class="toc-item"><span><span class="num">2.</span>Arquitetura e Tecnologias</span><span class="pg">4</span></div>
    <div class="toc-item"><span><span class="num">3.</span>Autenticação, Sessões e MFA</span><span class="pg">5</span></div>
    <div class="toc-item"><span><span class="num">4.</span>Controle de Acesso — Perfis e Abas</span><span class="pg">6</span></div>
  </div>

  <div class="toc-section">
    <div class="toc-section-label">Módulos do Portal</div>
    <div class="toc-item"><span><span class="num">5.</span>Dashboard</span><span class="pg">7</span></div>
    <div class="toc-item"><span><span class="num">6.</span>Servidores (ECS)</span><span class="pg">7</span></div>
    <div class="toc-item"><span><span class="num">7.</span>Projetos</span><span class="pg">8</span></div>
    <div class="toc-item"><span><span class="num">8.</span>Recursos Cloud</span><span class="pg">8</span></div>
    <div class="toc-item"><span><span class="num">9.</span>CBR — Cloud Backup &amp; Recovery</span><span class="pg">8</span></div>
    <div class="toc-item"><span><span class="num">10.</span>Inventário de Servidores</span><span class="pg">9</span></div>
    <div class="toc-item"><span><span class="num">11.</span>Incidents (Chamados)</span><span class="pg">9</span></div>
    <div class="toc-item"><span><span class="num">12.</span>Extensão de Horas</span><span class="pg">9</span></div>
    <div class="toc-item"><span><span class="num">13.</span>Quotas</span><span class="pg">10</span></div>
    <div class="toc-item"><span><span class="num">14.</span>SAP B1 — Matriz de Compatibilidade <span class="new-badge">NOVO</span></span><span class="pg">10</span></div>
    <div class="toc-item"><span><span class="num">15.</span>Alertas</span><span class="pg">11</span></div>
    <div class="toc-item"><span><span class="num">16.</span>Economia e Otimização</span><span class="pg">11</span></div>
    <div class="toc-item"><span><span class="num">17.</span>Ferramentas Cloud (Tools)</span><span class="pg">12</span></div>
    <div class="toc-item"><span><span class="num">18.</span>ECS Validation</span><span class="pg">13</span></div>
    <div class="toc-item"><span><span class="num">19.</span>Clientes Demetra</span><span class="pg">13</span></div>
    <div class="toc-item"><span><span class="num">20.</span>SSL Validation</span><span class="pg">13</span></div>
    <div class="toc-item"><span><span class="num">21.</span>Assinaturas Digitais <span class="new-badge">NOVO</span></span><span class="pg">14</span></div>
  </div>

  <div class="toc-section">
    <div class="toc-section-label">Referência Técnica</div>
    <div class="toc-item"><span><span class="num">22.</span>API Reference — Assinaturas</span><span class="pg">18</span></div>
    <div class="toc-item"><span><span class="num">23.</span>Segurança e Hardening</span><span class="pg">20</span></div>
    <div class="toc-item"><span><span class="num">24.</span>Configuração e Deploy</span><span class="pg">21</span></div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 1. VISÃO GERAL -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seção 1</div>
    <h2>Visão Geral do Portal</h2>
  </div>
  <div class="section-body">
    <div class="info-box">
      O <strong>Ananim Cloud Portal</strong> é uma plataforma web de gestão de nuvem desenvolvida
      pela Ananim. Oferece controle financeiro (FinOps), inventário, backup, operações de
      manutenção, assinaturas digitais e ferramentas avançadas para ambientes Huawei Cloud,
      tudo em uma interface única, segura e auditável.
    </div>

    <h3>Principais Funcionalidades</h3>
    <div class="module-grid">
      <div class="module-card">
        <div class="name">FinOps &amp; Custos</div>
        <div class="desc">Visualização de gastos por conta, projeto, serviço, tag e período. Análise de economia e otimização de recursos.</div>
      </div>
      <div class="module-card">
        <div class="name">Inventário &amp; Recursos</div>
        <div class="desc">Listagem completa de ECS, EIP, EVS, VPN, OBS, SGS com detecção de recursos ociosos.</div>
      </div>
      <div class="module-card">
        <div class="name">Backup / CBR</div>
        <div class="desc">Gestão de vaults, políticas de backup, remoção de backups órfãos e monitoramento de jobs.</div>
      </div>
      <div class="module-card">
        <div class="name">Quotas &amp; Alertas</div>
        <div class="desc">Monitoramento de limites de recursos por projeto com alertas configuráveis por email.</div>
      </div>
      <div class="module-card">
        <div class="name">Ferramentas Cloud</div>
        <div class="desc">Redimensionamento de VMs, migração de disco, gerenciamento de tags, OBS e VPN.</div>
      </div>
      <div class="module-card">
        <div class="name">Assinaturas Digitais</div>
        <div class="desc">Criação, envio e coleta de assinaturas digitais com trilha de auditoria, QR Code e PDF assinado.</div>
        <span class="new-badge">NOVO</span>
      </div>
      <div class="module-card">
        <div class="name">SAP B1 Matrix</div>
        <div class="desc">Compatibilidade SAP B1 com SQL Server, HANA, Crystal Reports e Fix Packs atualizados.</div>
        <span class="new-badge">NOVO</span>
      </div>
      <div class="module-card">
        <div class="name">Auditoria Completa</div>
        <div class="desc">Logs de todas as ações, acesso por IP, MFA por seção sensível, trilhas imutáveis.</div>
      </div>
    </div>

    <h3>Tecnologias</h3>
    <table>
      <tr><th>Camada</th><th>Tecnologia</th><th>Detalhes</th></tr>
      <tr><td>Backend</td><td>Node.js + Express 4</td><td>API REST, archivos JSON como banco de dados, scrypt para senhas</td></tr>
      <tr><td>Frontend</td><td>React 18 + TypeScript + Vite</td><td>SPA, TailwindCSS, componentes funcionais com hooks</td></tr>
      <tr><td>PDF</td><td>Puppeteer (Chromium)</td><td>Renderização HTML → PDF para documentos e relatórios</td></tr>
      <tr><td>QR Code</td><td>qrcode npm</td><td>Geração de QR SVG/PNG para verificação de documentos</td></tr>
      <tr><td>Proxy Reverso</td><td>Caddy 2</td><td>TLS automático, reverse proxy HTTPS → localhost:5052</td></tr>
      <tr><td>Email</td><td>Nodemailer + Office 365 SMTP</td><td>Notificações de assinatura, links de convite, PDF anexado</td></tr>
      <tr><td>MFA</td><td>speakeasy (TOTP)</td><td>2FA para login e seções de ferramentas sensíveis</td></tr>
      <tr><td>Crypto</td><td>Node.js crypto (built-in)</td><td>scrypt para senhas, SHA-256 para hash de documentos</td></tr>
    </table>

    <h3>URLs de Acesso</h3>
    <table>
      <tr><th>Domínio</th><th>Porta</th><th>Finalidade</th></tr>
      <tr><td><code>cloudweb.ananim.com.br</code></td><td>443 / 8443</td><td>Acesso principal ao portal (interno)</td></tr>
      <tr><td><code>autentic.ananim.com.br</code></td><td>443 / 8443</td><td>Assinaturas públicas e verificação de documentos</td></tr>
    </table>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 2. ARQUITETURA -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seção 2</div>
    <h2>Arquitetura e Tecnologias</h2>
  </div>
  <div class="section-body">
    <h3>Fluxo de Requisição</h3>
    <div class="code-block">Browser → HTTPS → Caddy (TLS) → localhost:5052 (Express)
       ↓
Express Middleware:
  1. CORS (origens permitidas)
  2. Security Headers (CSP, HSTS, X-Frame-Options...)
  3. Cookie Auth (requireAuth)
  4. Tab Access Control (tabRules — first-match)
  5. Tools MFA (para /api/tools/* exceto exceções)
  6. Route Handler
       ↓
JSON Storage (data/*.json) ← writeJSON / readJSON</div>

    <h3>Armazenamento de Dados</h3>
    <table>
      <tr><th>Arquivo</th><th>Conteúdo</th></tr>
      <tr><td><code>data/users.json</code></td><td>Usuários, senhas (scrypt), role, MFA secret, status</td></tr>
      <tr><td><code>data/assinaturas.json</code></td><td>Documentos de assinatura, signatários, HTML, trilha de auditoria</td></tr>
      <tr><td><code>data/pdfs/</code></td><td>PDFs assinados gerados por Puppeteer (<code>{id}.pdf</code>)</td></tr>
      <tr><td><code>data/incidents.json</code></td><td>Chamados de suporte e ocorrências</td></tr>
      <tr><td><code>data/inventory_servers.json</code></td><td>Inventário de servidores</td></tr>
      <tr><td><code>data/certificados_ssl.json</code></td><td>Certificados SSL monitorados</td></tr>
      <tr><td><code>data/profiles.json</code></td><td>Perfis de acesso e abas permitidas por role</td></tr>
      <tr><td><code>data/audit_logs.json</code></td><td>Log de auditoria geral (até 2.000 entradas)</td></tr>
      <tr><td><code>data/smtp_config.json</code></td><td>Configuração SMTP (host, porta, usuário, senha, baseUrl)</td></tr>
    </table>

    <h3>Estrutura de Diretórios</h3>
    <div class="code-block">ananim-backend/
├── server.js          ← Backend Express (único arquivo)
├── data/              ← JSON storage (chmod 600)
│   ├── assinaturas.json
│   ├── pdfs/          ← PDFs gerados
│   └── ...
├── client/            ← React + TypeScript + Vite
│   └── src/
│       └── components/
│           ├── tools/
│           │   ├── AssinaturasTab.tsx
│           │   ├── AssinaturasDocView.tsx
│           │   └── SapB1Tab.tsx
│           └── ...
├── gerar_doc_portal.js ← Este script
└── dist/              ← Build de produção (servido pelo Express)</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 3. AUTENTICAÇÃO -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seção 3</div>
    <h2>Autenticação, Sessões e MFA</h2>
  </div>
  <div class="section-body">
    <h3>Fluxo de Login</h3>
    <div class="info-box">
      O login segue duas etapas: <strong>(1) senha</strong> validada com scrypt + timing-safe compare,
      e <strong>(2) MFA opcional</strong> via TOTP (RFC 6238). Após autenticação bem-sucedida,
      um token de sessão é gravado num cookie <code>HttpOnly; Secure; SameSite=Strict</code>.
    </div>

    <h3>Tokens e Cookies</h3>
    <table>
      <tr><th>Parâmetro</th><th>Valor</th></tr>
      <tr><td>Cookie</td><td><code>ananim_session</code> — HttpOnly, Secure, SameSite=Strict</td></tr>
      <tr><td>Expiração</td><td>7 dias (renovado automaticamente a cada requisição autenticada)</td></tr>
      <tr><td>Formato do token</td><td>64 bytes hex aleatórios (<code>crypto.randomBytes(64)</code>)</td></tr>
      <tr><td>Hash armazenado</td><td>SHA-256 do token bruto (proteção contra roubo de DB)</td></tr>
    </table>

    <h3>MFA — Dois Fatores</h3>
    <table>
      <tr><th>Nível</th><th>Quando é exigido</th><th>Exceções</th></tr>
      <tr><td>Login</td><td>Se <code>mfa_enabled = true</code> no usuário</td><td>Usuários sem MFA configurado</td></tr>
      <tr><td>Tools MFA</td><td>Acesso a <code>/api/tools/*</code></td><td><code>/api/tools/sapb1</code>, <code>/api/tools/ecs-validation</code></td></tr>
    </table>

    <h3>Segurança de Senhas</h3>
    <div class="code-block">// Armazenamento
scrypt$&lt;salt-hex&gt;$&lt;derived-64-bytes-hex&gt;

// Verificação com timing-safe compare
crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(stored))</div>

    <div class="warn-box">
      Senhas legadas em SHA-256 puro são automaticamente migradas para scrypt na
      primeira autenticação bem-sucedida.
    </div>

    <h3>Proteções de Sessão</h3>
    <ul>
      <li><strong>Rate limiting</strong>: 10 tentativas/min por IP, bloqueio progressivo</li>
      <li><strong>Lockout automático</strong>: conta bloqueada após N falhas consecutivas</li>
      <li><strong>Logout</strong>: token removido do servidor, cookie expirado imediatamente</li>
      <li><strong>Token rotation</strong>: novo token gerado a cada sessão</li>
    </ul>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 4. CONTROLE DE ACESSO -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seção 4</div>
    <h2>Controle de Acesso — Perfis e Abas</h2>
  </div>
  <div class="section-body">
    <h3>Perfis Padrão</h3>
    <table>
      <tr><th>Role</th><th>Nome</th><th>Abas Acessíveis</th></tr>
      <tr><td><code>admin</code></td><td>Admin</td><td>Todas as abas incluindo Config e Assinaturas</td></tr>
      <tr><td><code>user</code></td><td>Operacional</td><td>Todas exceto Config e Assinaturas</td></tr>
      <tr><td><code>super</code></td><td>Super Poderes</td><td>Todas exceto Config</td></tr>
      <tr><td><code>inventory</code></td><td>Analista</td><td>inventario, incident, extensao, alertas</td></tr>
    </table>

    <h3>Tab Rules (Middleware)</h3>
    <div class="info-box">
      O middleware de controle de acesso usa um array <code>tabRules</code> de objetos <code>{prefixes, tab}</code>.
      A regra é <strong>first-match</strong>: o primeiro prefixo que corresponde ao <code>req.path</code>
      define a aba exigida. Se o perfil do usuário não inclui a aba, retorna <code>403</code>.
    </div>

    <table>
      <tr><th>Prefixo de API</th><th>Aba exigida</th></tr>
      <tr><td><code>/api/tools/sapb1</code></td><td><code>sap</code> <em>(verificado antes de /api/tools)</em></td></tr>
      <tr><td><code>/api/tools/*</code></td><td><code>tools</code></td></tr>
      <tr><td><code>/api/assinaturas/*</code></td><td><code>assinaturas</code></td></tr>
      <tr><td><code>/api/incidents/*</code></td><td><code>incident</code></td></tr>
      <tr><td><code>/api/inventario/*</code></td><td><code>inventario</code></td></tr>
      <tr><td><code>/api/ssl/*</code></td><td><code>sslvalidation</code></td></tr>
      <tr><td><code>/api/clientes-demetra/*</code></td><td><code>clientesdemetra</code></td></tr>
      <tr><td><code>/api/ecs-validation/*</code></td><td><code>ecsvalidation</code></td></tr>
    </table>

    <h3>Todas as Abas do Portal</h3>
    <div class="three-col">
      <div class="module-card"><div class="name">dashboard</div></div>
      <div class="module-card"><div class="name">servidores</div></div>
      <div class="module-card"><div class="name">projetos</div></div>
      <div class="module-card"><div class="name">recursos</div></div>
      <div class="module-card"><div class="name">cbr</div></div>
      <div class="module-card"><div class="name">inventario</div></div>
      <div class="module-card"><div class="name">incident</div></div>
      <div class="module-card"><div class="name">extensao</div></div>
      <div class="module-card"><div class="name">quotas</div></div>
      <div class="module-card"><div class="name">sap</div></div>
      <div class="module-card"><div class="name">alertas</div></div>
      <div class="module-card"><div class="name">economia</div></div>
      <div class="module-card"><div class="name">tools</div></div>
      <div class="module-card"><div class="name">export</div></div>
      <div class="module-card"><div class="name">config</div><span class="role-badge role-admin">admin only</span></div>
      <div class="module-card"><div class="name">ecsvalidation</div></div>
      <div class="module-card"><div class="name">clientesdemetra</div></div>
      <div class="module-card"><div class="name">sslvalidation</div></div>
      <div class="module-card"><div class="name">assinaturas</div><span class="role-badge role-super">admin+super</span></div>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 5-13. MÓDULOS -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seções 5–13</div>
    <h2>Módulos do Portal — Visão Geral</h2>
  </div>
  <div class="section-body">

    <h3>5. Dashboard</h3>
    <p>Painel com KPIs consolidados: total de VMs, custos do período, alertas ativos, backups recentes e atividade recente. Dados carregados ao vivo via API; atualização automática configurável.</p>

    <h3>6. Servidores (ECS)</h3>
    <p>Lista todos os servidores ECS das contas gerenciadas: nome, flavor, estado (ACTIVE/SHUTOFF), IP, projeto e conta. Suporta busca, filtro por estado/conta e exportação CSV.</p>

    <h3>7. Projetos</h3>
    <p>Visão de projetos Huawei Cloud com custos acumulados, número de recursos e taxa de ocupação. Permite exclusão de projetos do relatório (excluídos ficam em lista separada).</p>

    <h3>8. Recursos Cloud</h3>
    <p>Inventário detalhado de: EIPs (IPs elásticos), EVS (volumes), Security Groups, OBS Buckets e NAT Gateways. Indicadores de recursos ociosos (EIP livre, volume não anexado).</p>

    <h3>9. CBR — Cloud Backup &amp; Recovery</h3>
    <p>Gestão de vaults e políticas de backup. Exibe jobs recentes, taxa de sucesso, uso de armazenamento e backups órfãos. Permite remoção de backups expirados diretamente pelo portal.</p>

    <h3>10. Inventário de Servidores</h3>
    <p>Cadastro detalhado de servidores (IP, OS, ambiente, responsável, SLA). Histórico de mudanças auditado. Campos customizáveis por cliente. Exportação para CSV/Excel.</p>

    <h3>11. Incidents (Chamados)</h3>
    <p>Registro e acompanhamento de incidentes e chamados de suporte. Campos: título, severidade, status, responsável, data de abertura/resolução, SLA. Notificações por email.</p>

    <h3>12. Extensão de Horas</h3>
    <p>Controle de horas extras e extensão de SLA. Registro de pedidos com aprovação, motivo, solicitante e horas solicitadas. Histórico completo exportável.</p>

    <h3>13. Quotas</h3>
    <p>Monitoramento de cotas de recursos Huawei Cloud por projeto: ECS, EVS, VPC, EIP, SG. Alertas configuráveis quando a ocupação ultrapassa thresholds definidos (% de uso).</p>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 14. SAP B1 -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seção 14</div>
    <h2>SAP B1 — Matriz de Compatibilidade <span class="new-badge">NOVO</span></h2>
  </div>
  <div class="section-body">
    <div class="info-box">
      Ferramenta de consulta rápida para verificar compatibilidade entre versões do
      <strong>SAP Business One</strong>, SQL Server, SAP HANA, Crystal Reports,
      Fix Packs e Hot Fixes. Dados mantidos no backend e atualizados centralmente.
    </div>

    <h3>Funcionalidades</h3>
    <ul>
      <li><strong>Versões suportadas</strong>: tabela de versões SAP B1 × SQL Server (até 9 versões SQL)</li>
      <li><strong>HANA</strong>: versões HANA com plataformas suportadas, tipo de licença e status de suporte</li>
      <li><strong>Crystal Reports</strong>: versões compatíveis por release SAP B1</li>
      <li><strong>Fix Packs &amp; Hot Fixes</strong>: últimas atualizações disponíveis por versão</li>
      <li><strong>HANA Revisions</strong>: releases de revisão HANA por versão</li>
      <li><strong>Downloads</strong>: links para downloads oficiais SAP (SAP Support Portal)</li>
      <li><strong>Novidades</strong>: feed de atualizações e comunicados SAP recentes</li>
    </ul>

    <h3>Acesso e Permissões</h3>
    <table>
      <tr><th>Endpoint</th><th>Aba exigida</th><th>MFA</th></tr>
      <tr><td><code>GET /api/tools/sapb1/matrix</code></td><td><code>sap</code></td><td>Não</td></tr>
      <tr><td><code>GET /api/tools/sapb1/news</code></td><td><code>sap</code></td><td>Não</td></tr>
    </table>

    <div class="warn-box">
      A aba <code>sap</code> é verificada <strong>antes</strong> da regra geral <code>tools</code>,
      pois está listada primeiro em <code>tabRules</code>. Isso permite que perfis sem acesso a
      <code>tools</code> (como <code>inventory</code>) acessem a matriz SAP se tiverem a aba <code>sap</code>.
      Além disso, <code>/api/tools/sapb1</code> está na lista de exceções do Tools MFA —
      não requer desbloqueio por TOTP.
    </div>

    <h3>Estrutura de Dados</h3>
    <div class="code-block">SAP_B1_MATRIX = {
  sql_versions: [{ versao, descricao, suporte }],   // 9 versões SQL Server
  hana_versions: [{ versao, plataformas, tipo, suporte }],
  crystal_compat: { "10.0": "Crystal 2020 SP5", ... },
  fp_hotfixes: { "10.0": { fp: "FP2405", hf: "HF01" }, ... },
  hana_revisions: { "2.0 SPS07": { rev: "Rev 76", data: "..." } },
  downloads: [{ nome, url, descricao }],
  links: [{ titulo, url }]
}

SAP_B1_NEWS = [{ data, titulo, descricao, tipo }]</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 15-20. MAIS MÓDULOS -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seções 15–20</div>
    <h2>Módulos — Alertas, Economia, Tools, Validações</h2>
  </div>
  <div class="section-body">

    <h3>15. Alertas</h3>
    <p>Central de alertas configuráveis: quotas de recursos, expiração de certificados SSL, backups com falha. Notificações por email automáticas com intervalo e thresholds configuráveis.</p>

    <h3>16. Economia e Otimização</h3>
    <p>Análise de oportunidades de economia: VMs subdimensionadas, EIPs livres, volumes não anexados, backups desnecessários. Estimativa de economia mensal e histórico de ações tomadas.</p>

    <h3>17. Ferramentas Cloud (Tools)</h3>
    <p>Ferramentas avançadas que <strong>requerem MFA</strong> (TOTP desbloqueado por sessão):</p>
    <table>
      <tr><th>Ferramenta</th><th>Descrição</th></tr>
      <tr><td>Resize VM</td><td>Redimensionamento de flavor ECS com lista de flavors disponíveis</td></tr>
      <tr><td>Change Disk</td><td>Migração de tipo de disco EVS (SAS → SSD, etc)</td></tr>
      <tr><td>Tags</td><td>Gerenciamento de tags em lote (import/export CSV)</td></tr>
      <tr><td>OBS Manager</td><td>Gerenciamento de buckets e objetos Object Storage</td></tr>
      <tr><td>VPN Manager</td><td>VPN Gateways, Customer Gateways e Conexões IPSec</td></tr>
      <tr><td>Manutenção</td><td>Limpeza de EIPs livres, volumes soltos, SGs, backups órfãos</td></tr>
    </table>

    <h3>18. ECS Validation</h3>
    <p>Validação de configurações ECS contra políticas internas: naming convention, tags obrigatórias, backup policy, security groups. Relatório de conformidade com severidade por item.</p>

    <h3>19. Clientes Demetra</h3>
    <p>Gestão de clientes do sistema Demetra: cadastro, status de integração, configurações de sincronização e histórico de eventos. Acesso restrito à aba <code>clientesdemetra</code>.</p>

    <h3>20. SSL Validation</h3>
    <p>Monitoramento de certificados SSL: data de expiração, emissor, SANs, status de revogação. Alertas automáticos por email N dias antes da expiração (threshold configurável).</p>

    <div class="info-box">
      <strong>Config (Admin)</strong>: Aba exclusiva para perfil <code>admin</code>. Permite gerenciar usuários,
      perfis de acesso, configurações SMTP, chave Claude AI, descontos e impostos Huawei Cloud.
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 21. ASSINATURAS -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seção 21</div>
    <h2>Assinaturas Digitais <span class="new-badge">NOVO</span></h2>
  </div>
  <div class="section-body">
    <div class="info-box">
      O módulo de Assinaturas Digitais permite criar, enviar e coletar assinaturas em documentos
      HTML com trilha de auditoria completa, verificação via QR Code e geração de PDF assinado.
      Inspirado em plataformas como Autentique e DocuSign, adaptado ao ambiente Ananim Cloud.
    </div>

    <h3>Fluxo Completo</h3>
    <div class="code-block">1. Operador cria documento (template ou HTML livre) + define signatários
   ↓
2. Sistema gera token único por signatário + envia email com link /assinar/:token
   ↓
3. Signatário acessa a URL pública (sem autenticação)
   → Visualiza o documento completo com bloco de assinaturas
   → Evento "visualizou" registrado na trilha de auditoria (IP, UA, geo)
   ↓
4. Signatário preenche dados (nome, CPF, email, data nasc.) e assina ou recusa
   → Geolocalização capturada (melhor esforço, timeout 3s)
   → Evento "assinou" ou "recusou" registrado na trilha
   ↓
5. Quando todos assinam:
   → PDF gerado via Puppeteer (doc + bloco + página de auditoria)
   → PDF enviado por email para TODOS os signatários
   → Status do documento muda para "assinado"</div>

    <h3>Bloco de Assinaturas no Documento</h3>
    <p>Cada documento recebe um bloco de assinaturas ao final. O bloco é atualizado a cada assinatura:</p>
    <div class="sig-preview">
      <div class="sig-preview-hdr">Assinaturas Digitais — Ananim Cloud</div>
      <div class="sig-row">
        <div class="sig-left">
          <strong style="font-size:11px">Ana Lima</strong>
          <div style="font-size:9px;color:#64748b">ANANIM · ana@ananim.com.br</div>
          <div style="font-size:9px;color:#64748b">CPF: 123.456.789-00</div>
          <div style="font-size:9px;color:#16a34a;font-weight:700">✓ Assinado em 13/05/2026 09:41</div>
        </div>
        <div class="sig-right">
          <div class="sig-name-cursive">Ana Lima</div>
          <div style="font-size:8px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-top:4px">Assinatura Digital</div>
        </div>
      </div>
      <div class="sig-row">
        <div class="sig-left">
          <strong style="font-size:11px">Carlos Souza</strong>
          <div style="font-size:9px;color:#64748b">Cliente / Empresa · carlos@empresa.com</div>
          <div style="font-size:9px;color:#94a3b8">Aguardando assinatura</div>
        </div>
        <div class="sig-right">
          <div class="sig-line"></div>
          <div style="font-size:8px;color:#94a3b8;margin-top:4px">Assinatura</div>
        </div>
      </div>
    </div>

    <h3>Hash SHA-256 e Identificador</h3>
    <table>
      <tr><th>Campo</th><th>Descrição</th><th>Como é calculado</th></tr>
      <tr>
        <td>Hash SHA-256</td>
        <td>Impressão digital do conteúdo do documento</td>
        <td>SHA-256 do HTML original (sem o bloco de assinaturas) — calculado no browser via <code>crypto.subtle.digest</code></td>
      </tr>
      <tr>
        <td>Identificador</td>
        <td>ID único imutável do documento para verificação</td>
        <td>48 bytes hex aleatórios gerados no servidor (<code>crypto.randomBytes(24).toString('hex')</code>)</td>
      </tr>
    </table>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 21 cont. - AUDITORIA -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seção 21 — Continuação</div>
    <h2>Assinaturas — Trilha de Auditoria e Verificação</h2>
  </div>
  <div class="section-body">

    <h3>Trilha de Auditoria</h3>
    <p>Cada documento possui um array <code>audit_trail</code> com todos os eventos:</p>
    <table class="audit-row">
      <tr><th>Timestamp</th><th>Tipo</th><th>Ator</th><th>Dados Capturados</th></tr>
      <tr>
        <td><code>2026-05-13T09:00:00Z</code></td>
        <td><span class="audit-tipo tipo-criou">criou</span></td>
        <td>admin@ananim.com.br</td>
        <td>IP, porta</td>
      </tr>
      <tr>
        <td><code>2026-05-13T09:41:15Z</code></td>
        <td><span class="audit-tipo tipo-visualizou">visualizou</span></td>
        <td>ana@ananim.com.br</td>
        <td>IP, porta, browser, OS, arquitetura, renderEngine</td>
      </tr>
      <tr>
        <td><code>2026-05-13T09:42:08Z</code></td>
        <td><span class="audit-tipo tipo-assinou">assinou</span></td>
        <td>ana@ananim.com.br</td>
        <td>IP, porta, browser, OS, arch, geo (lat/lng/precisão)</td>
      </tr>
      <tr>
        <td><code>2026-05-13T10:15:33Z</code></td>
        <td><span class="audit-tipo tipo-recusou">recusou</span></td>
        <td>carlos@empresa.com</td>
        <td>IP, porta, browser, OS, arch, geo</td>
      </tr>
    </table>

    <h3>Detalhes Técnicos da Captura</h3>
    <div class="two-col">
      <div>
        <h4>User-Agent Parsing</h4>
        <ul>
          <li><code>browser</code>: Chrome, Firefox, Safari, Edge...</li>
          <li><code>os</code>: Windows, macOS, Linux, Android, iOS</li>
          <li><code>arch</code>: x86_64, arm64, x86</li>
          <li><code>renderEngine</code>: Blink, Gecko, WebKit</li>
        </ul>
      </div>
      <div>
        <h4>Geolocalização (melhor esforço)</h4>
        <ul>
          <li>Capturada via <code>navigator.geolocation</code></li>
          <li>Timeout de 3 segundos</li>
          <li>Precisão categorizada: 100m / 1km+ / 5km+</li>
          <li>Falha silenciosa — não bloqueia assinatura</li>
        </ul>
      </div>
    </div>

    <h3>Página de Verificação Pública</h3>
    <div class="info-box">
      Cada documento assinado recebe uma URL pública de verificação:<br>
      <code>https://autentic.ananim.com.br/verificar/&lt;identificador&gt;</code><br><br>
      A página exibe: status do documento, dados de todos os signatários com data/hora de assinatura,
      trilha de auditoria completa e um QR Code para acesso rápido.
      <strong>Não requer autenticação.</strong>
    </div>

    <h3>QR Code de Verificação</h3>
    <div class="two-col" style="align-items:start">
      <div>
        <p>Gerado no servidor com o pacote <code>qrcode</code> em formato SVG.
        Embutido diretamente no PDF assinado (página de auditoria) e exibido
        na visualização do documento no portal.</p>
        <p>A URL codificada no QR segue o padrão:</p>
        <div class="code-block">https://autentic.ananim.com.br
  /verificar/{identificador-48hex}</div>
        <p>O <code>baseUrl</code> é lido de <code>data/smtp_config.json</code>,
        com fallback para <code>https://cloudweb.ananim.com.br:8443</code>.</p>
      </div>
      <div style="text-align:center;padding-top:8px">
        <div class="qr-box">
          <div class="qr-pixels">
            <div class="qr-pixel-blk" style="left:0;top:0;width:16px;height:16px"></div>
            <div class="qr-pixel-blk" style="right:0;top:0;width:16px;height:16px"></div>
            <div class="qr-pixel-blk" style="left:0;bottom:0;width:16px;height:16px"></div>
            <div class="qr-pixel-blk" style="left:24px;top:8px;width:4px;height:4px"></div>
            <div class="qr-pixel-blk" style="left:36px;top:20px;width:8px;height:4px"></div>
            <div class="qr-pixel-blk" style="left:48px;top:8px;width:4px;height:12px"></div>
          </div>
          <div class="qr-label">QR DE VERIFICAÇÃO</div>
        </div>
      </div>
    </div>

    <h3>Menu Opções no Documento</h3>
    <p>Na visualização do documento, o botão <strong>Opções</strong> oferece três ações:</p>
    <table>
      <tr><th>Opção</th><th>Descrição</th><th>Disponibilidade</th></tr>
      <tr><td>PDF assinado</td><td>Download do PDF gerado pelo Puppeteer com bloco + auditoria</td><td>Apenas quando status = <code>assinado</code></td></tr>
      <tr><td>PDF selado</td><td>Imprime o documento atual do browser com bloco atualizado</td><td>Sempre</td></tr>
      <tr><td>Arquivo original</td><td>Imprime o documento sem o bloco de assinaturas</td><td>Sempre</td></tr>
    </table>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 21 cont. - PDF -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seção 21 — Continuação</div>
    <h2>Assinaturas — PDF Assinado e Email Final</h2>
  </div>
  <div class="section-body">

    <h3>Geração do PDF</h3>
    <div class="info-box">
      O PDF é gerado automaticamente ao término de <strong>todas</strong> as assinaturas,
      de forma assíncrona (fire-and-forget), sem bloquear a resposta HTTP ao signatário.
    </div>

    <p>O PDF contém três seções:</p>
    <ol>
      <li><strong>Conteúdo do documento</strong>: HTML original renderizado</li>
      <li><strong>Bloco de assinaturas</strong>: tabela com todos os signatários, assinaturas cursivas e datas</li>
      <li><strong>Página de auditoria</strong>: QR Code, informações do documento e trilha completa</li>
    </ol>

    <div class="code-block">// Localização no servidor
data/pdfs/{document-id}.pdf

// Endpoint de download (autenticado)
GET /api/assinaturas/{id}/pdf

// Endpoint de download (público via token de signatário)
GET /api/public/pdf/{token}</div>

    <h3>Email Final para Todos os Signatários</h3>
    <p>Quando o documento fica totalmente assinado, todos os signatários recebem:</p>
    <ul>
      <li>Email com assunto <em>"[Ananim] Documento assinado por todos: {nome}"</em></li>
      <li>Tabela com todos os signatários, papéis e datas de assinatura</li>
      <li>PDF assinado em anexo (se gerado com sucesso)</li>
    </ul>

    <h3>Papéis dos Signatários</h3>
    <table>
      <tr><th>Role</th><th>Label exibido</th><th>Uso típico</th></tr>
      <tr><td><code>ananim</code></td><td>ANANIM</td><td>Representante Ananim</td></tr>
      <tr><td><code>cliente</code></td><td>Cliente / Empresa</td><td>Representante do cliente</td></tr>
      <tr><td><code>testemunha</code></td><td>Testemunha</td><td>Testemunha do contrato</td></tr>
    </table>

    <h3>Status do Documento</h3>
    <table>
      <tr><th>Status</th><th>Significado</th><th>Cor</th></tr>
      <tr><td><code>aguardando</code></td><td>Algum signatário ainda não assinou</td><td>Amarelo</td></tr>
      <tr><td><code>assinado</code></td><td>Todos assinaram</td><td>Verde</td></tr>
      <tr><td><code>recusado</code></td><td>Pelo menos um signatário recusou</td><td>Vermelho</td></tr>
    </table>

    <h3>Geolocalização na Página de Assinatura</h3>
    <div class="code-block">// Captura antes do submit (melhor esforço)
navigator.geolocation.getCurrentPosition(
  pos => { lat = pos.coords.latitude; lng = pos.coords.longitude;
           precision = accuracy > 5000 ? '5km+' : accuracy > 1000 ? '1km+' : '100m'; },
  () => {},   // falha silenciosa
  { timeout: 3000, maximumAge: 60000 }
);
// lat, lng, precision enviados no body do POST /api/public/assinar/:token</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 22. API REFERENCE -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seção 22</div>
    <h2>API Reference — Assinaturas</h2>
  </div>
  <div class="section-body">

    <h3>Endpoints Autenticados</h3>
    <table>
      <tr><th>Método</th><th>Endpoint</th><th>Descrição</th></tr>
      <tr>
        <td><span class="method get">GET</span></td>
        <td><code>/api/assinaturas</code></td>
        <td>Lista todos os documentos do usuário autenticado (admin vê todos)</td>
      </tr>
      <tr>
        <td><span class="method post">POST</span></td>
        <td><code>/api/assinaturas</code></td>
        <td>Cria novo documento; body: <code>{nome, template_id?, documento_html?, signatarios[]}</code></td>
      </tr>
      <tr>
        <td><span class="method get">GET</span></td>
        <td><code>/api/assinaturas/:id</code></td>
        <td>Retorna documento completo com signatários e trilha de auditoria</td>
      </tr>
      <tr>
        <td><span class="method delete">DELETE</span></td>
        <td><code>/api/assinaturas/:id</code></td>
        <td>Remove documento (apenas admin ou criador)</td>
      </tr>
      <tr>
        <td><span class="method post">POST</span></td>
        <td><code>/api/assinaturas/:id/assinar</code></td>
        <td>Assina como usuário autenticado (role ananim)</td>
      </tr>
      <tr>
        <td><span class="method post">POST</span></td>
        <td><code>/api/assinaturas/:id/lembrete/:sigIdx</code></td>
        <td>Reenvia email de convite para signatário específico</td>
      </tr>
      <tr>
        <td><span class="method get">GET</span></td>
        <td><code>/api/assinaturas/:id/pdf</code></td>
        <td>Download do PDF assinado (requer status <code>assinado</code>)</td>
      </tr>
      <tr>
        <td><span class="method get">GET</span></td>
        <td><code>/api/assinaturas/templates</code></td>
        <td>Lista templates disponíveis</td>
      </tr>
      <tr>
        <td><span class="method post">POST</span></td>
        <td><code>/api/assinaturas/templates</code></td>
        <td>Cria novo template</td>
      </tr>
    </table>

    <h3>Endpoints Públicos (sem autenticação)</h3>
    <table>
      <tr><th>Método</th><th>Endpoint</th><th>Descrição</th></tr>
      <tr>
        <td><span class="method get">GET</span></td>
        <td><code>/api/public/assinar/:token</code></td>
        <td>Retorna dados do documento pelo token do signatário (registra visualização)</td>
      </tr>
      <tr>
        <td><span class="method post">POST</span></td>
        <td><code>/api/public/assinar/:token</code></td>
        <td>Submete assinatura; body: <code>{nome, cpf, email, data_nascimento, lat?, lng?, precision?}</code></td>
      </tr>
      <tr>
        <td><span class="method get">GET</span></td>
        <td><code>/api/public/pdf/:token</code></td>
        <td>Download do PDF assinado pelo token do signatário</td>
      </tr>
      <tr>
        <td><span class="method get">GET</span></td>
        <td><code>/assinar/:token</code></td>
        <td>Página HTML pública de assinatura (renderizada pelo servidor)</td>
      </tr>
      <tr>
        <td><span class="method get">GET</span></td>
        <td><code>/verificar/:identificador</code></td>
        <td>Página HTML pública de verificação com QR Code e trilha de auditoria</td>
      </tr>
    </table>

    <h3>Estrutura do Documento (JSON)</h3>
    <div class="code-block">{
  "id": 1778695470808,
  "identificador": "a3f2c8...48-chars-hex...",
  "nome": "Contrato de Prestação de Serviços",
  "status": "aguardando" | "assinado" | "recusado",
  "criado_em": "2026-05-13T09:00:00.000Z",
  "criado_por": "admin",
  "documento_html": "...",          // HTML com bloco de assinaturas embutido
  "pdf_path": "data/pdfs/1778695470808.pdf",  // após geração
  "signatarios": [{
    "nome": "Ana Lima",
    "email": "ana@ananim.com.br",
    "cpf": "123.456.789-00",
    "role": "ananim" | "cliente" | "testemunha",
    "status": "aguardando" | "assinado" | "recusado",
    "token": "64-chars-hex",        // token longo (email)
    "short": "8-chars-hex",         // token curto (URL)
    "assinado_em": "2026-05-13T09:42:08.000Z",
    "sign_ip": "192.168.1.1",
    "browser": "Chrome 124",
    "os": "Windows",
    "lat": -23.5505,
    "lng": -46.6333,
    "precision": "100m"
  }],
  "audit_trail": [{
    "ts": "2026-05-13T09:00:00.000Z",
    "tipo": "criou" | "visualizou" | "assinou" | "recusou",
    "nome": "Ana Lima",
    "email": "ana@ananim.com.br",
    "ip": "192.168.1.1",
    "port": "54321",
    "browser": "Chrome 124",
    "os": "Windows",
    "arch": "x86_64",
    "renderEngine": "Blink",
    "lat": -23.5505,
    "lng": -46.6333,
    "precision": "100m"
  }]
}</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 23. SEGURANÇA -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seção 23</div>
    <h2>Segurança e Hardening</h2>
  </div>
  <div class="section-body">

    <h3>Security Headers</h3>
    <p>Todos as respostas HTTP incluem os seguintes headers de segurança:</p>
    <table>
      <tr><th>Header</th><th>Valor</th></tr>
      <tr><td><code>X-Frame-Options</code></td><td><code>DENY</code></td></tr>
      <tr><td><code>X-Content-Type-Options</code></td><td><code>nosniff</code></td></tr>
      <tr><td><code>Referrer-Policy</code></td><td><code>strict-origin-when-cross-origin</code></td></tr>
      <tr><td><code>Cross-Origin-Opener-Policy</code></td><td><code>same-origin</code></td></tr>
      <tr><td><code>Cross-Origin-Resource-Policy</code></td><td><code>same-origin</code></td></tr>
      <tr><td><code>Permissions-Policy</code></td><td><code>camera=(), microphone=(), geolocation=()</code></td></tr>
      <tr><td><code>Content-Security-Policy</code></td><td>default-src 'self'; script-src 'self' 'unsafe-inline'; ...</td></tr>
      <tr><td><code>Strict-Transport-Security</code></td><td><code>max-age=31536000; includeSubDomains; preload</code> (HTTPS only)</td></tr>
    </table>

    <h3>Permissões de Arquivos</h3>
    <p>Todos os arquivos JSON em <code>data/</code> recebem <code>chmod 600</code> após escrita,
    garantindo acesso exclusivo ao processo Node.js.</p>

    <h3>Proteções em Produção</h3>
    <ul>
      <li><strong>CORS</strong>: origens explicitamente autorizadas; <code>credentials: true</code></li>
      <li><strong>Rate limiting</strong>: por IP em endpoints de autenticação e MFA</li>
      <li><strong>Sanitização HTML</strong>: documentos de assinatura passam por sanitize-html antes de persistir</li>
      <li><strong>Tokens imprevisíveis</strong>: todos os tokens gerados com <code>crypto.randomBytes</code></li>
      <li><strong>Sem X-Powered-By</strong>: header removido para não expor stack tecnológico</li>
      <li><strong>Trust Proxy</strong>: <code>app.set('trust proxy', 1)</code> para IPs corretos via Caddy</li>
    </ul>

    <h3>Caddy — TLS e Proxy</h3>
    <div class="code-block"># Caddyfile
cloudweb.ananim.com.br {
  tls "/path/ananim.com.br.crt" "/path/ananim.com.br.key"
  reverse_proxy localhost:5052
}

autentic.ananim.com.br {
  tls "/path/ananim.com.br.crt" "/path/ananim.com.br.key"
  reverse_proxy localhost:5052
}</div>

    <h3>Auditoria de Ações</h3>
    <p>Ações administrativas e destrutivas são registradas em <code>data/audit_logs.json</code>
    com até 2.000 entradas (LIFO). Cada entrada contém timestamp, usuário, role, IP e detalhes
    da ação. O log é acessível via <code>GET /api/audit-logs</code> (admin only).</p>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ 24. DEPLOY -->
<div class="page">
  <div class="section-header">
    <div class="section-num">Seção 24</div>
    <h2>Configuração e Deploy</h2>
  </div>
  <div class="section-body">

    <h3>Variáveis de Ambiente</h3>
    <table>
      <tr><th>Variável</th><th>Padrão</th><th>Descrição</th></tr>
      <tr><td><code>SESSION_COOKIE_NAME</code></td><td><code>ananim_session</code></td><td>Nome do cookie de sessão</td></tr>
      <tr><td><code>ALLOWED_ORIGINS</code></td><td>—</td><td>Origens CORS adicionais (separadas por vírgula)</td></tr>
      <tr><td><code>CLAUDE_API_KEY</code></td><td>—</td><td>Chave da API Claude (IA)</td></tr>
      <tr><td><code>PORT</code></td><td><code>5052</code></td><td>Porta HTTP do servidor Express</td></tr>
    </table>

    <h3>Configuração SMTP</h3>
    <div class="code-block">// data/smtp_config.json
{
  "host": "smtp.office365.com",
  "port": 587,
  "user": "no-reply@ananim.com.br",
  "pass": "...",
  "baseUrl": "https://autentic.ananim.com.br:5053"
}</div>

    <div class="info-box">
      O campo <code>baseUrl</code> é usado para construir a URL de verificação dos documentos
      de assinatura (<code>/verificar/:identificador</code>). Deve apontar para o domínio
      acessível pelos signatários externos.
    </div>

    <h3>Inicialização do Servidor</h3>
    <div class="code-block">cd c:\\Projetos\\ananim-backend

# Instalar dependências (uma vez)
npm install

# Build do frontend
cd client && npm run build && cd ..

# Iniciar servidor
node server.js</div>

    <h3>Dependências Principais</h3>
    <table>
      <tr><th>Pacote</th><th>Versão</th><th>Uso</th></tr>
      <tr><td>express</td><td>4.x</td><td>Framework HTTP</td></tr>
      <tr><td>puppeteer</td><td>latest</td><td>Geração de PDF (Chromium headless)</td></tr>
      <tr><td>qrcode</td><td>latest</td><td>Geração de QR Code SVG/PNG</td></tr>
      <tr><td>nodemailer</td><td>latest</td><td>Envio de emails SMTP</td></tr>
      <tr><td>speakeasy</td><td>latest</td><td>TOTP/MFA (RFC 6238)</td></tr>
      <tr><td>sanitize-html</td><td>latest</td><td>Sanitização de HTML em documentos</td></tr>
      <tr><td>multer</td><td>latest</td><td>Upload de arquivos (avatares, docs)</td></tr>
      <tr><td>mammoth</td><td>latest</td><td>Conversão .docx → HTML para templates</td></tr>
      <tr><td>cookie</td><td>latest</td><td>Parse de cookies</td></tr>
    </table>

    <h3>Geração desta Documentação</h3>
    <div class="code-block"># Requer puppeteer instalado
node gerar_doc_portal.js
# → Gera: Ananim_Cloud_Portal_Documentacao.pdf</div>

    <div style="margin-top: 32px; padding: 16px; background: ${C.bg}; border-radius: 8px; text-align: center;">
      <div style="color: ${C.cyan}; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700;">Ananim Cloud Portal</div>
      <div style="color: #4d7fa8; font-size: 9px; margin-top: 4px;">Documentação Técnica — v2.0 — ${TODAY_SHORT}</div>
      <div style="color: #1e3a5f; font-size: 8px; margin-top: 8px;">Confidencial — Uso Interno</div>
    </div>
  </div>
</div>

</body>
</html>`;
}

// ── Gerar PDF ────────────────────────────────────────────────────────────────
async function generate() {
  console.log('[Doc] Iniciando geração do PDF...');
  const launcher = getBrowserLauncher();
  const browser =
    launcher.kind === 'playwright'
      ? await launcher.chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
      : await launcher.puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
  try {
    const page =
      launcher.kind === 'playwright'
        ? await (await browser.newContext()).newPage()
        : await browser.newPage();
    const html = buildHtml();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    if (launcher.kind === 'playwright') {
      await page.pdf({
        path: OUT,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `
        <div style="font-family:Arial,sans-serif;font-size:8px;width:100%;padding:4px 15mm;
                    background:#050913;color:#4d7fa8;border-bottom:1px solid #00C8E0;
                    display:flex;justify-content:space-between;align-items:center;box-sizing:border-box">
          <span style="color:#fff;font-weight:700">Ananim <span style="color:#00C8E0">Cloud</span> Portal</span>
          <span>Documentação Técnica — v2.0</span>
        </div>`,
        footerTemplate: `
        <div style="font-family:Arial,sans-serif;font-size:7px;width:100%;padding:3px 15mm;
                    background:#050913;color:#4d7fa8;border-top:1px solid #00C8E0;
                    display:flex;justify-content:space-between;align-items:center;box-sizing:border-box">
          <span>Confidencial — Uso Interno</span>
          <span style="color:#00C8E0">Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>`,
        margin: { top: '22mm', bottom: '16mm', left: '0', right: '0' },
      });
    } else {
      await page.pdf({
      path: OUT,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-family:Arial,sans-serif;font-size:8px;width:100%;padding:4px 15mm;
                    background:#050913;color:#4d7fa8;border-bottom:1px solid #00C8E0;
                    display:flex;justify-content:space-between;align-items:center;box-sizing:border-box">
          <span style="color:#fff;font-weight:700">Ananim <span style="color:#00C8E0">Cloud</span> Portal</span>
          <span>Documentação Técnica — v2.0</span>
        </div>`,
      footerTemplate: `
        <div style="font-family:Arial,sans-serif;font-size:7px;width:100%;padding:3px 15mm;
                    background:#050913;color:#4d7fa8;border-top:1px solid #00C8E0;
                    display:flex;justify-content:space-between;align-items:center;box-sizing:border-box">
          <span>Confidencial — Uso Interno</span>
          <span style="color:#00C8E0">Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>`,
      margin: { top: '22mm', bottom: '16mm', left: '0', right: '0' },
      });
    }
    console.log(`[Doc] PDF gerado com sucesso: ${OUT}`);
  } finally {
    await browser.close();
  }
}

generate().catch(err => {
  console.error('[Doc] Erro ao gerar PDF:', err.message);
  process.exit(1);
});
