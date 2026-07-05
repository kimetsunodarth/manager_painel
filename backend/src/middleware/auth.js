import path from 'path';
import jwt from 'jsonwebtoken';
import { userStore } from '../data/store.js';

const isProduction = process.env.NODE_ENV === 'production';
const ALLOW_BEARER_AUTH = String(process.env.SECURITY_ALLOW_BEARER_AUTH || 'false').toLowerCase() === 'true';

// Expiração curta + renovação deslizante: usuário ativo nunca é deslogado (o cookie é
// renovado a cada request quando passa da metade da validade); navegador fechado expira
// em até JWT_EXPIRES_IN mesmo que o navegador restaure o cookie de sessão ao reabrir.
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

/** Converte JWT_EXPIRES_IN (ex.: 1h, 30m, 7d) para ms. */
export function parseJwtExpiryToMs() {
  let maxAge = 60 * 60 * 1000;
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

/** Opções do cookie de auth (httpOnly, sameSite strict; maxAge só com SECURITY_SESSION_COOKIE_PERSIST=true). */
export function getCookieOptions(req, maxAge) {
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
  let token = null;

  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (ALLOW_BEARER_AUTH && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
  }

  if (!token) {
    return res.status(401).json({ error: 'Token não informado' });
  }
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);
    req.user = decoded;

    // Renovação deslizante: quando passou da metade da validade, re-emite o cookie
    // (só quando o token veio de cookie; Bearer é responsabilidade do chamador).
    if (req.cookies && req.cookies.token && typeof decoded.exp === 'number') {
      const totalMs = parseJwtExpiryToMs();
      const remainingMs = decoded.exp * 1000 - Date.now();
      if (remainingMs > 0 && remainingMs < totalMs / 2) {
        const { iat, exp, ...payload } = decoded;
        const fresh = jwt.sign(payload, secret, { expiresIn: JWT_EXPIRES_IN });
        res.cookie('token', fresh, getCookieOptions(req, totalMs));
      }
    }
    next();
  } catch (e) {
    console.error('[auth] Token validation error:', e && e.message);
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
