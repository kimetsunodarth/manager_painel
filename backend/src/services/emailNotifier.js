import nodemailer from 'nodemailer';
import { getBillingConfig } from '../config/extensionBilling.js';

function formatDateBR(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function formatMoney(value, currency = 'BRL') {
  if (value == null) return 'Tarifa não configurada';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  } catch { return `${currency} ${value}`; }
}

function formatHours(h) {
  if (!Number.isFinite(h) || h <= 0) return '0 min';
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
}

function tableRow(label, value, highlight = false) {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#9ca3af;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:${highlight ? '#c4b5fd' : '#f9fafb'};font-size:13px;font-weight:${highlight ? '700' : '400'};">${value}</td>
  </tr>`;
}

function buildEmail(title, emoji, headerColor, rows, footerText) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#111827;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#111827">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#1f2937;border-radius:10px;overflow:hidden;">
      <tr><td style="background:${headerColor};padding:20px 28px;">
        <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${emoji}&nbsp; ${title}</p>
        <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.65);">Ananim Manager Painel — Alertas Automáticos</p>
      </td></tr>
      <tr><td style="padding:24px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      </td></tr>
      <tr><td style="padding:14px 28px;border-top:1px solid #374151;">
        <p style="margin:0;font-size:11px;color:#6b7280;">${footerText}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function startEmailHtml(session) {
  const typeLabel = session.type === 'cancel_stop'
    ? `Cancelou programação (stop previsto: ${formatDateBR(session.scheduledStopAt)})`
    : 'VM ligada após o horário (monitor automático ou ação manual)';
  const who = session.userEmail
    ? `${session.userName || ''} &lt;${session.userEmail}&gt;`
    : (session.userName || 'Sistema automático');

  const rows = [
    tableRow('Tipo', typeLabel),
    tableRow('Projeto / Chave', session.projectKey || '—'),
    tableRow('Servidor', session.serverName || session.serverId || '—'),
    tableRow('Início da hora extra', formatDateBR(session.startedAt)),
    tableRow('Responsável', who),
  ].join('');

  return buildEmail(
    'Hora extra iniciada',
    '⚠️',
    '#b45309',
    rows,
    `Sessão aberta em ${formatDateBR(session.startedAt)} · Ananim Manager Painel`
  );
}

function closeEmailHtml(session) {
  const who = session.userEmail
    ? `${session.userName || ''} &lt;${session.userEmail}&gt;`
    : (session.userName || 'Sistema automático');
  const amountFormatted = session.amountDue != null
    ? formatMoney(session.amountDue, session.currency)
    : 'Tarifa não configurada';

  const rows = [
    tableRow('Projeto / Chave', session.projectKey || '—'),
    tableRow('Servidor', session.serverName || session.serverId || '—'),
    tableRow('Início da hora extra', formatDateBR(session.fromAt || session.startedAt)),
    tableRow('Encerrado em', formatDateBR(session.toAt || session.endedAt || session.currentToAt)),
    tableRow('Duração real', formatHours(session.actualHours)),
    tableRow('Horas cobráveis', formatHours(session.billableHours)),
    tableRow('Tarifa/hora', formatMoney(session.hourlyRate, session.currency)),
    tableRow('Valor a pagar', amountFormatted, true),
    tableRow('Responsável', who),
  ].join('');

  return buildEmail(
    'Hora extra encerrada',
    '✅',
    '#065f46',
    rows,
    `Sessão encerrada em ${formatDateBR(session.toAt || session.currentToAt)} · Ananim Manager Painel`
  );
}

async function sendEmail(subject, html) {
  const config = getBillingConfig();
  const { smtp, alertEmails } = config;

  if (!smtp?.host || !smtp?.user || !smtp?.pass) {
    console.log('[Email] SMTP não configurado — notificação ignorada.');
    return;
  }
  if (!Array.isArray(alertEmails) || alertEmails.length === 0) {
    console.log('[Email] Nenhum destinatário configurado — notificação ignorada.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: false,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: `"${smtp.fromName || 'Ananim Manager Painel'}" <${smtp.user}>`,
    to: alertEmails.join(', '),
    subject,
    html,
  });
  console.log(`[Email] Enviado: "${subject}" → ${alertEmails.join(', ')}`);
}

export function notifyOvertimeStart(session) {
  if (!session) return;
  const html = startEmailHtml(session);
  const label = session.serverName || session.serverId || 'VM';
  sendEmail(`[ALERTA] Hora extra iniciada — ${label}`, html)
    .catch((e) => console.warn('[Email] Falha ao enviar alerta de início:', e.message));
}

export function notifyOvertimeClose(session) {
  if (!session) return;
  const html = closeEmailHtml(session);
  const label = session.serverName || session.serverId || 'VM';
  const amountStr = session.amountDue != null ? ` — ${formatMoney(session.amountDue, session.currency)}` : '';
  sendEmail(`[RELATÓRIO] Hora extra encerrada — ${label}${amountStr}`, html)
    .catch((e) => console.warn('[Email] Falha ao enviar relatório de fechamento:', e.message));
}

export async function sendTestEmail(toEmail) {
  const config = getBillingConfig();
  const { smtp } = config;

  if (!smtp?.host || !smtp?.user || !smtp?.pass) {
    throw new Error('SMTP não configurado. Configure host, user e pass nas notificações.');
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: false,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: { rejectUnauthorized: false },
  });

  const html = buildEmail(
    'Teste de notificação',
    '🧪',
    '#4f46e5',
    tableRow('Status', 'Configuração SMTP funcionando corretamente!', true) +
    tableRow('Remetente', smtp.user) +
    tableRow('Data/hora', formatDateBR(new Date().toISOString())),
    'Este é um email de teste enviado pelo Ananim Manager Painel.'
  );

  await transporter.sendMail({
    from: `"${smtp.fromName || 'Ananim Manager Painel'}" <${smtp.user}>`,
    to: toEmail,
    subject: '[TESTE] Notificação — Ananim Manager Painel',
    html,
  });
}
