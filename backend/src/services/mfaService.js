import crypto from 'crypto';
import qrcode from 'qrcode';
import speakeasy from 'speakeasy';

const LOGIN_TTL_MS = 10 * 60 * 1000;
const setupSessions = new Map();
const loginChallenges = new Map();

function cleanupMap(map) {
  const now = Date.now();
  for (const [token, value] of map.entries()) {
    if (!value || value.expiresAt <= now) map.delete(token);
  }
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function createSetupSession(user) {
  cleanupMap(setupSessions);
  const token = randomToken();
  const issuer = process.env.MFA_ISSUER || 'Ananim Manager Painel';
  const safeEmail = String(user?.email || '').trim();
  if (!safeEmail) throw new Error('Usuário sem e-mail para configurar MFA');
  const generated = speakeasy.generateSecret({ name: `${issuer}:${safeEmail}`, issuer, length: 20 });
  const secret = generated.base32;
  const label = generated.name;
  const otpauth = generated.otpauth_url || speakeasy.otpauthURL({ secret, label: safeEmail, issuer, encoding: 'base32' });
  if (!otpauth || typeof otpauth !== 'string') throw new Error('Falha ao gerar URL do QR Code MFA');
  setupSessions.set(token, {
    userId: user.id,
    secret,
    otpauth,
    email: safeEmail,
    label,
    expiresAt: Date.now() + LOGIN_TTL_MS,
  });
  return { token, otpauth, secret, label, expiresIn: Math.floor(LOGIN_TTL_MS / 1000) };
}

export async function getSetupQrDataUrl(setupToken) {
  cleanupMap(setupSessions);
  const session = setupSessions.get(setupToken);
  if (!session) throw new Error('Sessão de configuração MFA inválida ou expirada');
  return qrcode.toDataURL(session.otpauth, { margin: 1, width: 280 });
}

export function confirmSetupSession(setupToken, code) {
  cleanupMap(setupSessions);
  const session = setupSessions.get(setupToken);
  if (!session) return { ok: false, error: 'Sessão de configuração MFA inválida ou expirada' };
  const normalizedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) return { ok: false, error: 'Código MFA inválido' };
  const valid = speakeasy.totp.verify({ token: normalizedCode, secret: session.secret, encoding: 'base32', window: 1, step: 30 });
  if (!valid) return { ok: false, error: 'Código MFA inválido' };
  setupSessions.delete(setupToken);
  return { ok: true, userId: session.userId, secret: session.secret };
}

export function createLoginChallenge(user) {
  cleanupMap(loginChallenges);
  const token = randomToken();
  loginChallenges.set(token, {
    userId: user.id,
    secret: user.mfaSecret,
    attempts: 0,
    expiresAt: Date.now() + LOGIN_TTL_MS,
  });
  return { token, expiresIn: Math.floor(LOGIN_TTL_MS / 1000), delivery: 'Authenticator App (Google/Microsoft)' };
}

export function verifyLoginChallenge(token, code) {
  cleanupMap(loginChallenges);
  const challenge = loginChallenges.get(token);
  if (!challenge) return { ok: false, error: 'Desafio MFA inválido ou expirado' };
  const normalizedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) return { ok: false, error: 'Código MFA inválido' };
  challenge.attempts += 1;
  if (challenge.attempts > 5) {
    loginChallenges.delete(token);
    return { ok: false, error: 'Muitas tentativas de MFA. Faça login novamente.' };
  }
  const valid = speakeasy.totp.verify({ token: normalizedCode, secret: challenge.secret, encoding: 'base32', window: 1, step: 30 });
  if (!valid) return { ok: false, error: 'Código MFA incorreto' };
  loginChallenges.delete(token);
  return { ok: true, userId: challenge.userId };
}
