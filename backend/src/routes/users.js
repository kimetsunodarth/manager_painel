import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { userStore } from '../data/store.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { EMAIL_REGEX, isValidEmail } from '../utils/validation.js';

const router = Router();
router.use(authMiddleware);
const ROLES = ['admin', 'operator', 'client'];
const MAX_NAME = 200;
const MAX_EMAIL = 255;

function validateRole(role) {
  return typeof role === 'string' && ROLES.includes(role);
}

router.get('/', requirePermission('users:*'), (_, res) => {
  res.json(userStore.getAll());
});

router.get('/:id', requirePermission('users:*'), (req, res) => {
  const u = userStore.getById(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(u);
});

router.post('/', requirePermission('users:*'), async (req, res) => {
  try {
    const { name, email, password, role, permissions, allowedEcsIds, visibleProjects, allowedHuaweiEcsIds, allowedServiceIds } = req.body || {};
    const nameStr = typeof name === 'string' ? name.trim() : '';
    const emailStr = typeof email === 'string' ? email.trim() : '';
    const passwordStr = typeof password === 'string' ? password : '';
    if (!nameStr || !emailStr || !passwordStr) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    }
    if (nameStr.length > MAX_NAME) {
      return res.status(400).json({ error: `Nome deve ter no máximo ${MAX_NAME} caracteres` });
    }
    if (!isValidEmail(emailStr, MAX_EMAIL)) {
      return res.status(400).json({ error: 'E-mail em formato inválido' });
    }
    if (passwordStr.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }
    if (role !== undefined && !validateRole(role)) {
      return res.status(400).json({ error: 'Perfil deve ser admin, operator ou client' });
    }
    if (userStore.findByEmail(emailStr)) {
      return res.status(400).json({ error: 'E-mail já cadastrado' });
    }
    const passwordHash = await bcrypt.hash(passwordStr, 10);
    const user = userStore.create({
      name: nameStr,
      email: emailStr,
      passwordHash,
      role: validateRole(role) ? role : 'operator',
      permissions: Array.isArray(permissions) ? permissions : ['backups:list'],
      allowedEcsIds: Array.isArray(allowedEcsIds) ? allowedEcsIds : [],
      visibleProjects: Array.isArray(visibleProjects) ? visibleProjects : [],
      allowedHuaweiEcsIds: allowedHuaweiEcsIds != null && typeof allowedHuaweiEcsIds === 'object' && !Array.isArray(allowedHuaweiEcsIds) ? allowedHuaweiEcsIds : {},
      allowedServiceIds: Array.isArray(allowedServiceIds) ? allowedServiceIds : [],
    });
    logAction(req, 'Usuário criado', { userId: user.id, email: user.email, role: user.role });
    res.status(201).json(user);
  } catch (e) {
    res.status(500).json({ error: 'Erro interno ao criar usuário.' });
  }
});

router.patch('/:id', requirePermission('users:*'), async (req, res) => {
  const { name, email, role, permissions, allowedEcsIds, visibleProjects, allowedHuaweiEcsIds, allowedServiceIds, preferredServiceClientKey, password } = req.body || {};
  const existing = userStore.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Usuário não encontrado' });
  const data = {};
  if (name !== undefined) {
    const nameStr = typeof name === 'string' ? name.trim() : '';
    if (nameStr.length > MAX_NAME) return res.status(400).json({ error: `Nome deve ter no máximo ${MAX_NAME} caracteres` });
    data.name = nameStr;
  }
  if (email !== undefined) {
    if (!isValidEmail(typeof email === 'string' ? email.trim() : '', MAX_EMAIL)) return res.status(400).json({ error: 'E-mail em formato inválido' });
    const emailStr = typeof email === 'string' ? email.trim() : '';
    if (userStore.findByEmail(emailStr) && userStore.findByEmail(emailStr).id !== req.params.id) {
      return res.status(400).json({ error: 'E-mail já cadastrado' });
    }
    data.email = emailStr;
  }
  if (role !== undefined) {
    if (!validateRole(role)) return res.status(400).json({ error: 'Perfil deve ser admin, operator ou client' });
    data.role = role;
  }
  if (permissions !== undefined) data.permissions = Array.isArray(permissions) ? permissions : existing.permissions;
  if (allowedEcsIds !== undefined) data.allowedEcsIds = Array.isArray(allowedEcsIds) ? allowedEcsIds : [];
  if (visibleProjects !== undefined) data.visibleProjects = Array.isArray(visibleProjects) ? visibleProjects : [];
  if (allowedHuaweiEcsIds !== undefined) data.allowedHuaweiEcsIds = allowedHuaweiEcsIds != null && typeof allowedHuaweiEcsIds === 'object' && !Array.isArray(allowedHuaweiEcsIds) ? allowedHuaweiEcsIds : {};
  if (allowedServiceIds !== undefined) data.allowedServiceIds = Array.isArray(allowedServiceIds) ? allowedServiceIds : [];
  if (preferredServiceClientKey !== undefined) data.preferredServiceClientKey = preferredServiceClientKey == null || preferredServiceClientKey === '' ? null : String(preferredServiceClientKey).trim();
  if (password !== undefined && typeof password === 'string' && password.length >= 6) {
    data.passwordHash = await bcrypt.hash(password, 10);
    userStore.setPassword(req.params.id, data.passwordHash);
  }
  const updated = userStore.update(req.params.id, data);
  const actions = [];
  if (name !== undefined) actions.push('nome alterado');
  if (email !== undefined) actions.push('email alterado');
  if (role !== undefined) actions.push('perfil alterado');
  if (permissions !== undefined) actions.push('permissões alteradas');
  if (allowedEcsIds !== undefined) actions.push('ECS permitidos alterados');
  if (visibleProjects !== undefined) actions.push('projetos visíveis alterados');
  if (allowedHuaweiEcsIds !== undefined) actions.push('ECS Huawei por projeto alterados');
  if (allowedServiceIds !== undefined) actions.push('serviços SAP/HANA alterados');
  if (preferredServiceClientKey !== undefined) actions.push('cliente preferido (Serviços) alterado');
  if (password && password.length >= 6) actions.push('senha redefinida');
  if (actions.length) logAction(req, 'Usuário atualizado', { targetUserId: req.params.id, targetEmail: existing.email, alterações: actions.join(', ') });
  res.json(updated);
});

router.delete('/:id', requirePermission('users:*'), (req, res) => {
  const existing = userStore.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Usuário não encontrado' });
  const deleted = userStore.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Usuário não encontrado' });
  logAction(req, 'Usuário removido', { userId: existing.id, email: existing.email });
  res.json({ ok: true, message: 'Usuário removido' });
});

router.post('/:id/reset-password', requirePermission('users:*'), async (req, res) => {
  const { newPassword } = req.body || {};
  const pwd = typeof newPassword === 'string' ? newPassword : '';
  if (pwd.length < 6) {
    return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres' });
  }
  const existing = userStore.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Usuário não encontrado' });
  const passwordHash = await bcrypt.hash(pwd, 10);
  userStore.setPassword(req.params.id, passwordHash);
  logAction(req, 'Senha redefinida', { targetUserId: req.params.id, targetEmail: existing.email });
  res.json({ ok: true, message: 'Senha alterada com sucesso' });
});

export default router;
