'use strict';
const path = require('path');
const fs   = require('fs');

const DATA_DIR   = path.join(__dirname, 'data');
const PDFS_DIR   = path.join(DATA_DIR, 'pdfs');
const ASSINATURAS_FILE = path.join(DATA_DIR, 'assinaturas.json');

if (!fs.existsSync(PDFS_DIR)) fs.mkdirSync(PDFS_DIR, { recursive: true });

function getSmtpConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'smtp_config.json'), 'utf8')); } catch { return {}; }
}

function buildSignatureBlock(signatarios) {
  const roleLabel = r => r === 'ananim' ? 'ANANIM' : r === 'cliente' ? 'Cliente / Empresa' : 'Testemunha';
  const fmt = d => d ? new Date(d).toLocaleString('pt-BR') : '';
  const rows = signatarios.map(s => `
    <tr>
      <td style="padding:14px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;width:55%">
        <div style="font-size:13px;font-weight:700;color:#0f0f1a">${s.nome || s.email}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${roleLabel(s.role)} · ${s.email}</div>
        ${s.cpf ? `<div style="font-size:11px;color:#64748b">CPF: ${s.cpf}</div>` : ''}
        <div style="font-size:11px;margin-top:4px;${s.status === 'assinado' ? 'color:#16a34a;font-weight:600' : 'color:#94a3b8'}">
          ${s.status === 'assinado' ? `✓ Assinado em ${fmt(s.assinado_em)}` : s.status === 'recusado' ? '✗ Recusado' : 'Aguardando assinatura'}
        </div>
      </td>
      <td style="padding:14px 12px;border-bottom:1px solid #e2e8f0;text-align:center;vertical-align:bottom;width:45%">
        ${s.status === 'assinado'
          ? `<div style="font-family:'Brush Script MT','Comic Sans MS',cursive;font-size:30px;color:#0d1b2a;font-style:italic;padding-bottom:6px;border-bottom:1.5px solid #0d1b2a">${s.nome || s.email.split('@')[0]}</div><div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-top:4px">Assinatura Digital</div>`
          : `<div style="border-bottom:1px solid #94a3b8;height:36px"></div><div style="font-size:10px;color:#94a3b8;margin-top:4px">Assinatura</div>`}
      </td>
    </tr>`).join('');
  return `\n<!-- ASSINATURAS_BLOCK_START -->\n<div style="margin-top:48px;padding-top:28px;border-top:2px solid #1a1a2e;page-break-inside:avoid"><p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700;margin:0 0 12px">Assinaturas Digitais — Ananim Cloud</p><table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0"><thead><tr style="background:#f8fafc"><th style="padding:8px 12px;font-size:11px;color:#374151;font-weight:700;text-align:left;border-bottom:1px solid #e2e8f0">Signatário</th><th style="padding:8px 12px;font-size:11px;color:#374151;font-weight:700;text-align:center;border-bottom:1px solid #e2e8f0">Assinatura</th></tr></thead><tbody>${rows}</tbody></table><p style="font-size:10px;color:#94a3b8;margin-top:10px">Documento gerenciado via Ananim Cloud · Assinaturas rastreadas com token único e registro de data/hora.</p></div>\n<!-- ASSINATURAS_BLOCK_END -->\n`;
}

function updateSignatureBlock(html, signatarios) {
  const block = buildSignatureBlock(signatarios);
  const updated = html.replace(/\n?<!-- ASSINATURAS_BLOCK_START -->[\s\S]*?<!-- ASSINATURAS_BLOCK_END -->\n?/, block);
  return updated === html ? html + block : updated;
}

async function buildAuditPage(doc) {
  const QRCode = require('qrcode');
  const smtpCfg = getSmtpConfig();
  const baseUrl = smtpCfg?.baseUrl || 'https://cloudweb.ananim.com.br:8443';
  const verifyUrl = doc.identificador ? `${baseUrl}/verificar/${doc.identificador}` : '';
  let qrSvg = '';
  if (verifyUrl) {
    try { qrSvg = await QRCode.toString(verifyUrl, { type: 'svg', margin: 1, width: 160, color: { dark: '#000', light: '#fff' } }); } catch {}
  }
  const fmt = d => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const roleLabel = r => r === 'ananim' ? 'ANANIM' : r === 'cliente' ? 'Cliente' : 'Testemunha';
  const sigCursive = s => s.status === 'assinado'
    ? `<div style="font-family:'Brush Script MT','Comic Sans MS',cursive;font-size:32px;color:#0d1b2a;line-height:1;padding-bottom:4px">${s.nome || s.email.split('@')[0]}</div>`
    : `<div style="height:36px"></div>`;

  const sigBlocks = doc.signatarios.filter(s => s.status === 'assinado').map(s => `
    <div style="flex:1;min-width:160px;text-align:center;padding:0 16px">
      ${sigCursive(s)}
      <div style="border-bottom:1.5px solid #334155;margin-bottom:6px"></div>
      <div style="font-size:11px;font-weight:700;color:#334155">${s.nome || s.email.split('@')[0]}</div>
      ${s.cpf ? `<div style="font-size:10px;color:#64748b">${s.cpf}</div>` : ''}
      <div style="font-size:10px;color:#64748b">${roleLabel(s.role)}</div>
    </div>`).join('');

  const auditRows = (doc.audit_trail || []).map(e => {
    const detalhes = [
      e.ip && e.port ? `IP: ${e.ip}:${e.port}` : e.ip || '',
      e.browser || '', e.os || '',
      e.arch ? `Arch: ${e.arch}` : '',
      e.precision ? `Precisão: ${e.precision}` : '',
    ].filter(Boolean).join(' · ');
    return `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px 0;font-size:10px;color:#64748b;white-space:nowrap;vertical-align:top;width:120px">${fmt(e.ts)}</td>
      <td style="padding:8px 12px;font-size:11px;color:#0f172a;vertical-align:top">
        <strong>${e.nome || e.email}</strong> ${e.tipo}
        ${e.email ? `<span style="font-size:10px;color:#94a3b8"> (${e.email})</span>` : ''}
      </td>
      <td style="padding:8px 0;font-size:9px;color:#94a3b8;vertical-align:top">${detalhes}</td>
    </tr>`;
  }).join('');

  const signed = doc.signatarios.filter(s => s.status === 'assinado').length;
  const total  = doc.signatarios.length;

  return `
<div style="page-break-before:always;font-family:Arial,Helvetica,sans-serif;padding:28px 36px;color:#1e293b">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f0f1a;padding-bottom:14px;margin-bottom:20px">
    <div>
      <div style="font-size:22px;font-weight:900;color:#0f0f1a;letter-spacing:3px">ANANIM</div>
      <div style="font-size:10px;color:#64748b;margin-top:2px">Autenticação eletrônica por ananim.com.br</div>
    </div>
    <div style="text-align:right;font-size:10px;color:#64748b">
      <div><strong>Identificador:</strong> ${doc.identificador || '—'}</div>
      <div>${new Date().toLocaleString('pt-BR')}</div>
    </div>
  </div>
  <h2 style="font-size:17px;font-weight:700;color:#0f172a;text-align:center;margin:0 0 20px">Relatório de auditoria e validação de assinaturas eletrônicas</h2>
  <div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:24px">
    <div style="flex-shrink:0;text-align:center">
      <div style="width:150px;height:150px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center">
        ${qrSvg || '<div style="font-size:9px;color:#94a3b8;padding:8px;text-align:center">QR Code indisponível</div>'}
      </div>
      ${verifyUrl ? `<div style="font-size:8px;color:#94a3b8;margin-top:4px">Escanear para verificar</div>` : ''}
    </div>
    <div style="flex:1">
      <div style="font-size:12px;color:#16a34a;font-weight:600;margin-bottom:8px">✓ Assinaturas concluídas: ${signed} de ${total}</div>
      ${verifyUrl ? `<div style="font-size:10px;color:#0ea5e9;font-family:monospace;word-break:break-all;margin-bottom:10px">${verifyUrl}</div>` : ''}
      <div style="font-size:10px;color:#64748b">⚖ Assinaturas eletrônicas conforme Lei nº 14.063/2020</div>
    </div>
  </div>
  ${sigBlocks ? `<div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-bottom:20px">
    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Assinaturas presentes no documento</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap">${sigBlocks}</div>
  </div>` : ''}
  ${auditRows ? `<div style="border-top:1px solid #e2e8f0;padding-top:16px">
    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Trilha de auditoria</div>
    <table style="width:100%;border-collapse:collapse">${auditRows}</table>
  </div>` : '<div style="border-top:1px solid #e2e8f0;padding-top:12px;font-size:10px;color:#94a3b8;font-style:italic">Documento anterior ao sistema de auditoria — eventos não registrados.</div>'}
  <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:10px;font-size:9px;color:#94a3b8;text-align:center">
    Documento: ${doc.nome} · Ananim Cloud
  </div>
</div>`;
}

async function run() {
  const puppeteer = require('puppeteer');
  const docs = JSON.parse(fs.readFileSync(ASSINATURAS_FILE, 'utf8'));
  const targets = docs.filter(d => d.status === 'assinado' && !d.pdf_path);
  console.log(`Documentos assinados sem PDF: ${targets.length}`);
  if (targets.length === 0) { console.log('Nada a fazer.'); return; }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  let ok = 0, fail = 0;
  for (const doc of targets) {
    try {
      const htmlComBloco = doc.documento_html
        ? updateSignatureBlock(doc.documento_html, doc.signatarios)
        : '<p>(Documento sem conteúdo HTML)</p>';
      const auditPage = await buildAuditPage(doc).catch(() => '');
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:28px 36px;color:#1a1a2e;font-size:13px;line-height:1.65}
        table{border-collapse:collapse;width:100%}td,th{border:1px solid #d1d5db;padding:6px 10px;font-size:12px}
        th{background:#f8fafc;font-weight:600}h1{font-size:20px;margin:0 0 12px}p{margin:5px 0}
        @page{margin:15mm 12mm}
      </style></head><body>${htmlComBloco}${auditPage}</body></html>`;

      const pdfPath = path.join(PDFS_DIR, `${doc.id}.pdf`);
      const page = await browser.newPage();
      await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
      await page.close();

      const idx = docs.findIndex(d => d.id === doc.id);
      docs[idx].pdf_path = pdfPath;
      ok++;
      console.log(`  ✓ [${ok}] ${doc.id} — ${doc.nome.slice(0, 50)}`);
    } catch (e) {
      fail++;
      console.error(`  ✗ ${doc.id} — ${e.message}`);
    }
  }

  await browser.close();
  fs.writeFileSync(ASSINATURAS_FILE, JSON.stringify(docs, null, 2));
  console.log(`\nConcluído: ${ok} PDFs gerados, ${fail} erros.`);
}

run().catch(e => { console.error(e.message); process.exit(1); });
