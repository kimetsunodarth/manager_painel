/**
 * Envia alertas por e-mail (Office 365 / SMTP) quando uma ação crítica é executada.
 * Conforme documento Painel de Automação para SAP Business One.
 * Aceita SMTP_HOST ou SMTP_SERVER; SMTP_PASS ou SMTP_PASSWORD.
 */

import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST || process.env.SMTP_SERVER;
const port = Number(process.env.SMTP_PORT || '587');
const user = process.env.SMTP_USER || process.env.EMAIL_FROM;
const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
const from = process.env.EMAIL_FROM || user;
const to = process.env.EMAIL_TO || '';

/** Indica se o envio de e-mail está configurado (obrigatório para validar ações no painel). */
export function isEmailConfigured() {
  const u = process.env.SMTP_USER || process.env.EMAIL_FROM;
  const p = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const h = process.env.SMTP_HOST || process.env.SMTP_SERVER;
  const t = process.env.EMAIL_TO || '';
  return !!(h && u && p && t);
}

function getTransporter() {
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * Envia notificação de restart (sucesso ou falha).
 * @param {string} target - Nome do serviço (ex.: hana, serviceLayer)
 * @param {boolean} success
 * @param {string} details - stdout/stderr ou mensagem de erro
 * @param {string} performedBy - Nome/e-mail do usuário que executou
 * @param {{ clientDisplayName?: string, vmName?: string }} [context] - Cliente e VM para título e corpo do e-mail
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
export async function sendRestartNotification(target, success, details, performedBy, context = {}) {
  const transporter = getTransporter();
  if (!transporter || !to) {
    if (isEmailConfigured()) {
      console.warn('E-mail: transporter ou destinatário indisponível na hora do envio.');
    } else {
      console.warn('E-mail não configurado (SMTP_* e EMAIL_TO). Configure para receber notificações de ações no painel.');
    }
    return { sent: false, error: 'E-mail não configurado' };
  }

  const { clientDisplayName, vmName } = context;
  const statusColor = success ? '#28a745' : '#dc3545';
  const statusText = success ? 'SUCESSO' : 'FALHA';
  const titleSuffix = [clientDisplayName, vmName].filter(Boolean).length
    ? ` — ${[clientDisplayName, vmName].filter(Boolean).join(' / ')}`
    : '';

  const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ccc;">
  <h2 style="color: ${statusColor};">Restart: ${statusText}</h2>
  <p><strong>Serviço:</strong> ${target}</p>
  ${clientDisplayName ? `<p><strong>Cliente:</strong> ${clientDisplayName}</p>` : ''}
  ${vmName ? `<p><strong>VM:</strong> ${vmName}</p>` : ''}
  <p><strong>Usuário:</strong> ${performedBy}</p>
  <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
</div>`;

  const subject = `[Ananim Manager Painel] Restart ${target}: ${statusText}${titleSuffix}`;

  try {
    const info = await transporter.sendMail({
      from,
      to: to.split(',').map((e) => e.trim()).filter(Boolean),
      subject,
      html,
    });
    console.log('E-mail de notificação enviado:', info.messageId || 'ok');
    return { sent: true };
  } catch (e) {
    console.error('Falha ao enviar e-mail de notificação:', e.message);
    return { sent: false, error: e.message };
  }
}
