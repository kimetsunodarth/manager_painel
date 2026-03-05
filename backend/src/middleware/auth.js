import path from 'path';
import jwt from 'jsonwebtoken';
import { userStore } from '../data/store.js';

const isProduction = process.env.NODE_ENV === 'production';

/** Lê JWT_SECRET em tempo de execução (evita falha no load do módulo antes do config.enc). */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (isProduction && (!secret || secret.length < 32)) {
    const dir = process.cwd();
    throw new Error(
      'Em produção é obrigatório definir JWT_SECRET com pelo menos 32 caracteres.\n' +
      'Opção 1 – config.enc + .encryption_key (ou key.bin): coloque JWT_SECRET no conteúdo criptografado (igual Huawei Cloud Panel).\n' +
      'Opção 2 – .env na pasta do programa:\n  ' + path.join(dir, '.env') + '\n' +
      '  JWT_SECRET=uma_chave_secreta_com_pelo_menos_32_caracteres_aleatorios\n' +
      'Para gerar config.enc: no projeto rode npm run gerar-jwt-e-enc (veja README).'
    );
  }
  return secret || 'dev-secret-change-in-production';
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não informado' });
  }
  const token = authHeader.slice(7);
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (e) {
    if (e.message && e.message.includes('JWT_SECRET')) {
      return res.status(503).json({ error: 'Configuração inválida: JWT_SECRET ausente. Configure config.enc ou .env na pasta do programa.' });
    }
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

/** Exige que o usuário seja admin. Usado para alterações em Licenças e Documentos. */
export function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  return res.status(403).json({ error: 'Apenas administradores podem alterar estes dados' });
}

/** Verifica se o usuário tem permissão. Para services:*, também permite quem tem visão do cliente (visibleProjects ou allowedServiceIds). */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user?.role === 'admin') return next();
    if (req.user?.permissions?.includes(permission)) return next();
    if (permission === 'services:*') {
      const u = req.user?.id ? userStore.getById(req.user.id) : null;
      const hasVisibility = u && (
        (Array.isArray(u.visibleProjects) && u.visibleProjects.length > 0) ||
        (Array.isArray(u.allowedServiceIds) && u.allowedServiceIds.length > 0)
      );
      if (hasVisibility) return next();
    }
    return res.status(403).json({ error: 'Sem permissão para esta ação' });
  };
}

export { getJwtSecret as JWT_SECRET };
