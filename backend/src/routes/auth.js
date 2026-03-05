import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userStore } from '../data/store.js';
import { JWT_SECRET as getJwtSecret } from '../middleware/auth.js';
import { appendLog } from '../data/auditLog.js';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.LOGIN_RATE_LIMIT_MAX ? Number(process.env.LOGIN_RATE_LIMIT_MAX) : 10,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
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
      createdAt: new Date().toISOString(),
    });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, permissions: user.permissions, allowedEcsIds: user.allowedEcsIds },
      getJwtSecret(),
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions, allowedEcsIds: user.allowedEcsIds, visibleProjects: user.visibleProjects || [], allowedHuaweiEcsIds: user.allowedHuaweiEcsIds || {}, allowedServiceIds: user.allowedServiceIds || [] },
    });
  } catch (e) {
    if (e.message && e.message.includes('JWT_SECRET')) {
      return res.status(503).json({ error: 'Configuração inválida: JWT_SECRET ausente. Configure config.enc ou .env na pasta do programa.' });
    }
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

export default router;
