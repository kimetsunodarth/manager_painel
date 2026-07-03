import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userStore } from '../data/store.js';
import { JWT_SECRET as getJwtSecret, authMiddleware } from '../middleware/auth.js';
import { appendLog } from '../data/auditLog.js';
import { extractIp } from '../utils/validation.js';
import { confirmSetupSession, createLoginChallenge, createSetupSession, getSetupQrDataUrl, verifyLoginChallenge } from '../services/mfaService.js';

const router = Router();
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
const MFA_REQUIRED = String(process.env.MFA_REQUIRED || 'false').toLowerCase() === 'true';
const LOGIN_LOCK_MAX_ATTEMPTS = Number(process.env.LOGIN_LOCK_MAX_ATTEMPTS || 5);
const LOGIN_LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);

function parseJwtExpiryToMs() {
  let maxAge = 12 * 60 * 60 * 1000;
  const match = String(JWT_EXPIRES_IN).match(/^(\d+)([dhms])$/);
  if (!match) return maxAge;
  const val = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'd') maxAge = val * 24 * 60 * 60 * 1000;
  else if (unit === 'h') maxAge = val * 60 * 60 * 1000;
  else if (unit === 'm') maxAge = val * 60 * 1000;
  else if (unit === 's') maxAge = val * 1000;
  return maxAge;
}

function getCookieOptions(req, maxAge) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const isHttps = req.secure || forwardedProto.includes('https');
  const host = String(req.headers.host || '').toLowerCase();
  const isLocalhost = host.includes('localhost') || host.startsWith('127.0.0.1');
  const options = {
    httpOnly: true,
    secure: isHttps && !isLocalhost,
    sameSite: 'strict',
  };
  if (typeof maxAge === 'number' && String(process.env.SECURITY_SESSION_COOKIE_PERSIST || 'false').toLowerCase() === 'true') {
    options.maxAge = maxAge;
  }
  return options;
}

function buildAuditContext(req, action, details = {}) {
  return {
    userId: details.userId ?? null,
    userName: details.userName ?? '',
    userEmail: details.userEmail ?? '',
    action,
    details,
    ipAddress: extractIp(req),
    userAgent: req.headers['user-agent'],
    countryCode: req.securityContext?.geo?.countryCode || null,
    countryName: req.securityContext?.geo?.countryName || null,
    regionName: req.securityContext?.geo?.regionName || null,
    cityName: req.securityContext?.geo?.cityName || null,
    createdAt: new Date().toISOString(),
  };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.LOGIN_RATE_LIMIT_MAX ? Number(process.env.LOGIN_RATE_LIMIT_MAX) : 5,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => extractIp(req),
});

const meLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => extractIp(req),
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const loginStr = typeof email === 'string' ? email.trim() : '';
    const passwordStr = typeof password === 'string' ? password : '';
    if (!loginStr || !passwordStr) {
      return res.status(400).json({ error: 'Usuário/e-mail e senha são obrigatórios' });
    }
    if (loginStr.length > 255) {
      return res.status(400).json({ error: 'Usuário/e-mail em formato inválido' });
    }
    if (passwordStr.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }
    const user = userStore.findByLogin(loginStr);
    if (!user) {
      appendLog(buildAuditContext(req, 'login_failed', {
        login: loginStr,
        reason: 'user_not_found',
      }));
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
      appendLog(buildAuditContext(req, 'login_locked', {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        lockedUntil: user.lockedUntil,
      }));
      return res.status(429).json({ error: `Conta temporariamente bloqueada até ${new Date(user.lockedUntil).toLocaleString('pt-BR')}` });
    }
    const ok = await bcrypt.compare(passwordStr, user.passwordHash);
    if (!ok) {
      const updated = userStore.registerFailedLogin(user.id, {
        maxAttempts: LOGIN_LOCK_MAX_ATTEMPTS,
        lockMinutes: LOGIN_LOCK_MINUTES,
      });
      appendLog(buildAuditContext(req, 'login_failed', {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        reason: updated?.lockedUntil ? 'account_locked' : 'invalid_password',
        failedLoginAttempts: updated?.failedLoginAttempts ?? (user.failedLoginAttempts || 0) + 1,
        lockedUntil: updated?.lockedUntil || null,
      }));
      if (updated?.lockedUntil) {
        return res.status(429).json({ error: `Conta bloqueada por ${LOGIN_LOCK_MINUTES} minutos após múltiplas falhas.` });
      }
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    userStore.clearFailedLogins(user.id);
    const shouldRequireMfa = MFA_REQUIRED || user.mfaEnabled === true;
    if (shouldRequireMfa) {
      if (!user.mfaSecret) {
        const setup = createSetupSession(user);
        const qrDataUrl = await getSetupQrDataUrl(setup.token);
        return res.json({
          ok: true,
          mfaSetupRequired: true,
          setupToken: setup.token,
          qrDataUrl,
          manualKey: setup.secret,
          expiresIn: setup.expiresIn,
        });
      }
      const challenge = createLoginChallenge(user);
      appendLog({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        action: 'MFA challenge requested',
        details: { role: user.role },
        ipAddress: extractIp(req),
        userAgent: req.headers['user-agent'],
        countryCode: req.securityContext?.geo?.countryCode || null,
        countryName: req.securityContext?.geo?.countryName || null,
        regionName: req.securityContext?.geo?.regionName || null,
        cityName: req.securityContext?.geo?.cityName || null,
        createdAt: new Date().toISOString(),
      });
      return res.json({
        ok: true,
        mfaRequired: true,
        challengeToken: challenge.token,
        delivery: challenge.delivery,
        expiresIn: challenge.expiresIn,
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, permissions: user.permissions, allowedEcsIds: user.allowedEcsIds },
      getJwtSecret(),
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie('token', token, getCookieOptions(req, parseJwtExpiryToMs()));

    appendLog({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      action: 'Login',
      details: { role: user.role, mfa: false },
      ipAddress: extractIp(req),
      userAgent: req.headers['user-agent'],
      countryCode: req.securityContext?.geo?.countryCode || null,
      countryName: req.securityContext?.geo?.countryName || null,
      regionName: req.securityContext?.geo?.regionName || null,
      cityName: req.securityContext?.geo?.cityName || null,
      createdAt: new Date().toISOString(),
    });
    userStore.markSuccessfulLogin(user.id);
    res.json({ ok: true, mfaRequired: false, user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions, allowedEcsIds: user.allowedEcsIds, visibleProjects: user.visibleProjects || [], allowedHuaweiEcsIds: user.allowedHuaweiEcsIds || {}, allowedServiceIds: user.allowedServiceIds || [] } });
  } catch (e) {
    console.error('[auth] login error:', e?.message || e);
    if (e.message && e.message.includes('JWT_SECRET')) {
      console.error('[auth] JWT_SECRET config error:', e.message);
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

router.post('/mfa/setup/verify', loginLimiter, async (req, res) => {
  try {
    const { setupToken, code } = req.body || {};
    if (!setupToken || !code) return res.status(400).json({ error: 'Token e código MFA são obrigatórios' });
    const confirmed = confirmSetupSession(String(setupToken), String(code));
    if (!confirmed.ok) return res.status(401).json({ error: confirmed.error || 'Falha ao ativar MFA' });
    const user = userStore.findById(String(confirmed.userId));
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    userStore.update(user.id, { mfaEnabled: true, mfaSecret: confirmed.secret });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, permissions: user.permissions, allowedEcsIds: user.allowedEcsIds },
      getJwtSecret(),
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.cookie('token', token, getCookieOptions(req, parseJwtExpiryToMs()));
    appendLog({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      action: 'MFA configurado',
      details: { role: user.role },
      ipAddress: extractIp(req),
      userAgent: req.headers['user-agent'],
      countryCode: req.securityContext?.geo?.countryCode || null,
      countryName: req.securityContext?.geo?.countryName || null,
      regionName: req.securityContext?.geo?.regionName || null,
      cityName: req.securityContext?.geo?.cityName || null,
      createdAt: new Date().toISOString(),
    });
    userStore.markSuccessfulLogin(user.id);
    return res.json({
      ok: true,
      mfaRequired: false,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions, allowedEcsIds: user.allowedEcsIds, visibleProjects: user.visibleProjects || [], allowedHuaweiEcsIds: user.allowedHuaweiEcsIds || {}, allowedServiceIds: user.allowedServiceIds || [] },
    });
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao configurar MFA. Tente novamente.' });
  }
});

router.post('/login/mfa', loginLimiter, async (req, res) => {
  try {
    const { challengeToken, code } = req.body || {};
    if (!challengeToken || !code) return res.status(400).json({ error: 'Token e código MFA são obrigatórios' });
    const verified = verifyLoginChallenge(String(challengeToken), String(code));
    if (!verified.ok) return res.status(401).json({ error: verified.error || 'MFA inválido' });
    const user = userStore.getById(String(verified.userId));
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, permissions: user.permissions, allowedEcsIds: user.allowedEcsIds },
      getJwtSecret(),
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.cookie('token', token, getCookieOptions(req, parseJwtExpiryToMs()));
    appendLog({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      action: 'Login',
      details: { role: user.role, mfa: true },
      ipAddress: extractIp(req),
      userAgent: req.headers['user-agent'],
      countryCode: req.securityContext?.geo?.countryCode || null,
      countryName: req.securityContext?.geo?.countryName || null,
      regionName: req.securityContext?.geo?.regionName || null,
      cityName: req.securityContext?.geo?.cityName || null,
      createdAt: new Date().toISOString(),
    });
    userStore.markSuccessfulLogin(user.id);
    return res.json({
      ok: true,
      mfaRequired: false,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions, allowedEcsIds: user.allowedEcsIds, visibleProjects: user.visibleProjects || [], allowedHuaweiEcsIds: user.allowedHuaweiEcsIds || {}, allowedServiceIds: user.allowedServiceIds || [] },
    });
  } catch (e) {
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', getCookieOptions(req));
  res.json({ ok: true, message: 'Logout realizado com sucesso' });
});

router.get('/me', meLimiter, authMiddleware, (req, res) => {
  const user = userStore.getById(req.user.id);
  if (!user) {
    return res.status(403).json({ error: 'Usuário não encontrado ou desativado' });
  }
  res.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      allowedEcsIds: user.allowedEcsIds,
      visibleProjects: user.visibleProjects || [],
      allowedHuaweiEcsIds: user.allowedHuaweiEcsIds || {},
      allowedServiceIds: user.allowedServiceIds || [],
    },
  });
});

export default router;

