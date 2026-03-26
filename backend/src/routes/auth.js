import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userStore } from '../data/store.js';
import { JWT_SECRET as getJwtSecret, authMiddleware } from '../middleware/auth.js';
import { appendLog } from '../data/auditLog.js';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.LOGIN_RATE_LIMIT_MAX ? Number(process.env.LOGIN_RATE_LIMIT_MAX) : 5,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    let ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    if (typeof ip === 'string') {
      ip = ip.split(',')[0].trim();
      if (ip.includes(']:')) ip = ip.replace(/^\[(.*)\]:\d+$/, '$1');
      else if (ip.split(':').length === 2 && !ip.includes(']')) ip = ip.split(':')[0];
    }
    return ip;
  },
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const emailStr = typeof email === 'string' ? email.trim() : '';
    const passwordStr = typeof password === 'string' ? password : '';
    if (!emailStr || !passwordStr) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }
    if (emailStr.length > 255) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    if (!EMAIL_REGEX.test(emailStr)) {
      return res.status(400).json({ error: 'E-mail em formato inválido' });
    }
    if (passwordStr.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }
    const user = userStore.findByEmail(emailStr);
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const ok = await bcrypt.compare(passwordStr, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    appendLog({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      action: 'Login',
      details: { role: user.role },
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      createdAt: new Date().toISOString(),
    });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, permissions: user.permissions, allowedEcsIds: user.allowedEcsIds },
      getJwtSecret(),
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    // Parse JWT_EXPIRES_IN (e.g. '7d', '24h') to milliseconds for cookie maxAge
    let maxAge = 7 * 24 * 60 * 60 * 1000; // default 7 days
    if (typeof JWT_EXPIRES_IN === 'string') {
      const match = JWT_EXPIRES_IN.match(/^(\d+)([dhms])$/);
      if (match) {
        const val = parseInt(match[1], 10);
        const unit = match[2];
        if (unit === 'd') maxAge = val * 24 * 60 * 60 * 1000;
        else if (unit === 'h') maxAge = val * 60 * 60 * 1000;
        else if (unit === 'm') maxAge = val * 60 * 1000;
        else if (unit === 's') maxAge = val * 1000;
      }
    }

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge,
    });

    res.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions, allowedEcsIds: user.allowedEcsIds, visibleProjects: user.visibleProjects || [], allowedHuaweiEcsIds: user.allowedHuaweiEcsIds || {}, allowedServiceIds: user.allowedServiceIds || [] },
    });
  } catch (e) {
    if (e.message && e.message.includes('JWT_SECRET')) {
      console.error('[auth] JWT_SECRET config error:', e.message);
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ ok: true, message: 'Logout realizado com sucesso' });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = userStore.getById(req.user.id);
  if (!user) {
    return res.status(401).json({ error: 'Usuário não encontrado' });
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
