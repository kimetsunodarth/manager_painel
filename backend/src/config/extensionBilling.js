import fs from 'fs';
import path from 'path';
import { getConfigDir } from '../appRoot.js';

const BILLING_FILE = path.join(getConfigDir(), 'extension-billing.json');

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeProjectException(entry) {
  if (entry == null) return null;
  if (typeof entry === 'number') {
    const rate = toPositiveNumber(entry);
    return rate != null ? { hourlyRate: rate, active: true, note: '' } : null;
  }
  if (typeof entry === 'object') {
    const rate = toPositiveNumber(entry.hourlyRate);
    return {
      hourlyRate: rate,
      active: entry.active !== false,
      note: typeof entry.note === 'string' ? entry.note : '',
    };
  }
  return null;
}

function normalizeSmtp(incoming, existing) {
  if (incoming == null) return existing || null;
  return {
    host: typeof incoming.host === 'string' ? incoming.host.trim() : (existing?.host || ''),
    port: toPositiveNumber(incoming.port) ?? existing?.port ?? 587,
    user: typeof incoming.user === 'string' ? incoming.user.trim() : (existing?.user || ''),
    pass: typeof incoming.pass === 'string' && incoming.pass ? incoming.pass : (existing?.pass || ''),
    fromName: typeof incoming.fromName === 'string' ? incoming.fromName.trim() : (existing?.fromName || 'Ananim Manager Painel'),
  };
}

function loadBillingConfig() {
  const envRate = toPositiveNumber(process.env.EXTENSION_HOURLY_RATE_DEFAULT);
  const base = {
    currency: 'BRL',
    defaultHourlyRate: envRate,
    graceMinutes: 0,
    roundingMinutes: 30,
    projectRates: {},
    smtp: null,
    alertEmails: [],
  };

  try {
    if (!fs.existsSync(BILLING_FILE)) return base;
    const parsed = JSON.parse(fs.readFileSync(BILLING_FILE, 'utf8'));

    const rawRates = parsed?.projectRates && typeof parsed.projectRates === 'object' ? parsed.projectRates : {};
    const projectRates = {};
    for (const [k, v] of Object.entries(rawRates)) {
      const norm = normalizeProjectException(v);
      if (norm) projectRates[k] = norm;
    }

    const rawEmails = Array.isArray(parsed?.alertEmails) ? parsed.alertEmails : [];
    const alertEmails = rawEmails.filter((e) => typeof e === 'string' && e.trim());

    return {
      currency: typeof parsed?.currency === 'string' && parsed.currency.trim() ? parsed.currency.trim().toUpperCase() : base.currency,
      defaultHourlyRate: toPositiveNumber(parsed?.defaultHourlyRate) ?? base.defaultHourlyRate,
      graceMinutes: toPositiveNumber(parsed?.graceMinutes) ?? base.graceMinutes,
      roundingMinutes: toPositiveNumber(parsed?.roundingMinutes) ?? base.roundingMinutes,
      projectRates,
      smtp: parsed?.smtp && typeof parsed.smtp === 'object' ? normalizeSmtp(parsed.smtp, null) : null,
      alertEmails,
    };
  } catch (error) {
    console.warn('[extensionBilling] Falha ao carregar extension-billing.json:', error?.message || String(error));
    return base;
  }
}

export function getBillingConfig() {
  return loadBillingConfig();
}

/**
 * Versão segura para respostas de API: nunca expõe a senha SMTP.
 * `passSet` indica ao frontend se há senha salva (enviar pass vazio mantém a atual).
 */
export function sanitizeBillingConfig(config) {
  if (!config || typeof config !== 'object') return config;
  const { smtp, ...rest } = config;
  if (!smtp) return { ...rest, smtp: null };
  const { pass, ...smtpRest } = smtp;
  return { ...rest, smtp: { ...smtpRest, passSet: Boolean(pass) } };
}

export function saveBillingConfig(config) {
  const existing = loadBillingConfig();

  const normalized = {
    currency: typeof config.currency === 'string' && config.currency.trim()
      ? config.currency.trim().toUpperCase()
      : existing.currency,
    defaultHourlyRate: toPositiveNumber(config.defaultHourlyRate) ?? existing.defaultHourlyRate,
    graceMinutes: toPositiveNumber(config.graceMinutes) ?? existing.graceMinutes,
    roundingMinutes: toPositiveNumber(config.roundingMinutes) ?? existing.roundingMinutes,
    projectRates: config.projectRates != null && typeof config.projectRates === 'object'
      ? config.projectRates
      : existing.projectRates,
    smtp: config.smtp !== undefined
      ? normalizeSmtp(config.smtp, existing.smtp)
      : existing.smtp,
    alertEmails: Array.isArray(config.alertEmails)
      ? config.alertEmails.filter((e) => typeof e === 'string' && e.trim())
      : existing.alertEmails,
  };

  const tmpFile = BILLING_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(tmpFile, BILLING_FILE);
  return normalized;
}

export function getExtensionBillingForProject(projectKey) {
  const config = loadBillingConfig();
  const exception = config.projectRates?.[projectKey];

  let hourlyRate = config.defaultHourlyRate;
  if (exception && exception.active !== false && exception.hourlyRate != null) {
    hourlyRate = exception.hourlyRate;
  }

  return {
    currency: config.currency,
    hourlyRate,
    graceMinutes: config.graceMinutes,
    roundingMinutes: config.roundingMinutes,
  };
}

export function formatOvertimeSessionLabel(session) {
  if (session.type === 'cancel_stop' && session.scheduledStopAt) {
    try {
      const hour = new Date(session.scheduledStopAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `Stop programado às ${hour}`;
    } catch {
      return 'Stop programado';
    }
  }
  return 'Ligou VM após o horário';
}

export function computeSessionBilling(session) {
  const billing = getExtensionBillingForProject(session.projectKey);
  const fromAt = session.scheduledStopAt || session.startedAt;
  const currentToAt = session.endedAt || new Date().toISOString();
  const fromMs = Date.parse(fromAt);
  const toMs = Date.parse(currentToAt);
  const actualMinutes = Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs > fromMs
    ? Math.round((toMs - fromMs) / (1000 * 60))
    : 0;
  const actualHours = actualMinutes > 0
    ? Math.round((actualMinutes / 60) * 100) / 100
    : 0;

  let billableHours = 0;
  if (actualMinutes > 0) {
    const graceMinutes = Number.isFinite(Number(billing.graceMinutes)) ? Number(billing.graceMinutes) : 0;
    const chargeableMinutes = Math.max(actualMinutes - Math.max(graceMinutes, 0), 0);
    billableHours = chargeableMinutes > 0 ? Math.ceil(chargeableMinutes / 60) : 0;
  }

  const amountDue = typeof billing.hourlyRate === 'number'
    ? Math.round(billableHours * billing.hourlyRate * 100) / 100
    : null;

  return {
    ...session,
    fromAt,
    toAt: session.endedAt || null,
    currentToAt,
    actualMinutes,
    actualHours,
    billableHours,
    hourlyRate: billing.hourlyRate,
    currency: billing.currency,
    amountDue,
    scheduleLabel: formatOvertimeSessionLabel(session),
    status: session.endedAt ? 'closed' : 'open',
  };
}
