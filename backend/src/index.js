// Exe (pkg): procurar better-sqlite3 em lib/node_modules antes de qualquer require
import './bootstrap-pkg.js';
// Carregar config.enc/.env e preencher process.env ANTES de importar rotas (auth usa JWT_SECRET no load)
import './bootstrap-config.js';

import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { getAppRoot } from './appRoot.js';

try {
  console.log('[Ananim] Iniciando... v=%s cwd=%s HTTP_PLATFORM_PORT=%s PORT=%s', APP_VERSION, process.cwd(), process.env.HTTP_PLATFORM_PORT, process.env.PORT);
} catch (e) {
  console.error('[Ananim] Erro ao logar inicio:', e && e.message);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('[Ananim] JWT_SECRET ausente ou curto (< 32). Defina em config.enc (ou .env). Cwd=', process.cwd());
}

// Exe: criar config/ (e subpastas) e data/ na primeira execucao (o instalador cria; mas caso nao exista, tenta criar)
if (typeof process.pkg !== 'undefined') {
  const cwd = process.cwd();
  for (const dir of ['config', 'config/clients', 'config/hana-clients', 'config/sql-clients', 'config/control-center', 'data']) {
    const full = join(cwd, dir);
    if (!existsSync(full)) {
      try { mkdirSync(full, { recursive: true }); } catch (e) {
        console.warn('[Ananim] Nao foi possivel criar pasta', full, '- verifique permissoes do App Pool IIS:', e.message);
      }
    }
  }
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { initDb } from './db/database.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import environmentsRoutes from './routes/environments.js';
import ecsRoutes from './routes/ecs.js';
import servicesRoutes from './routes/services.js';
import backupsRoutes from './routes/backups.js';
import licensesRoutes from './routes/licenses.js';
import documentsRoutes from './routes/documents.js';
import huaweiRoutes from './routes/huawei.js';
import auditLogRoutes from './routes/auditLog.js';
import adminClientsRoutes from './routes/adminClients.js';
import { runDue, monitorStatus } from './services/scheduleRunner.js';
import { extractIp } from './utils/validation.js';
import { APP_VERSION } from './version.js';

initDb();

// Cron: a cada minuto executa agendamentos VM (Start/Stop por ECS); usa hora LOCAL do servidor
const scheduleNow = new Date();
console.log('[Schedule] Hora do servidor (local):', scheduleNow.toLocaleString('pt-BR'), '— agendamentos usam esta hora.');

// Execução inicial
runDue().catch((e) => console.error('[Schedule]', e?.message || e));
monitorStatus().catch((e) => console.error('[Monitor]', e?.message || e));

setInterval(() => {
  runDue().catch((e) => console.error('[Schedule]', e?.message || e));
  monitorStatus().catch((e) => console.error('[Monitor]', e?.message || e));
}, 60 * 1000);

const app = express();
// IIS (HttpPlatformHandler/iisnode) atua como reverse proxy e envia X-Forwarded-For.
// Precisamos confiar no proxy local para rate limit e logs de IP funcionarem.
const isIis = !!(process.env.HTTP_PLATFORM_PORT || process.env.IISNODE_VERSION);
if (isIis) {
  // Confiar apenas em loopback (IIS -> app escuta em 127.0.0.1)
  app.set('trust proxy', 'loopback');
}
// IIS: iisnode define PORT; HttpPlatformHandler define HTTP_PLATFORM_PORT
const rawPort = process.env.PORT || process.env.HTTP_PLATFORM_PORT || 3001;
const PORT = parseInt(String(rawPort), 10) || 3001;
const isProduction = process.env.NODE_ENV === 'production';

app.use(helmet({ contentSecurityPolicy: false }));
const corsOrigin = process.env.FRONTEND_ORIGIN;
const corsOrigins = corsOrigin ? corsOrigin.split(',').map((o) => o.trim()).filter(Boolean) : [];
// Em producao: usa FRONTEND_ORIGIN obrigatoriamente; se ausente, bloqueia todas origens cross-origin.
// Em desenvolvimento: permite qualquer origem (true).
let allowOrigin;
if (isProduction) {
  if (corsOrigins.length) {
    allowOrigin = corsOrigins;
  } else {
    console.error('[Ananim] AVISO DE SEGURANÇA: FRONTEND_ORIGIN não definido em produção. Todas as requisições cross-origin serão bloqueadas. Defina FRONTEND_ORIGIN no config.enc ou .env.');
    allowOrigin = false;
  }
} else {
  allowOrigin = true;
}
app.use(cors({
  origin: allowOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '512kb' }));
app.use(cookieParser());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 200,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
  keyGenerator: (req) => extractIp(req),
});
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/environments', environmentsRoutes);
app.use('/api/ecs', ecsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/backups', backupsRoutes);
app.use('/api/licenses', licensesRoutes);
// Override body size limit for document uploads (base64 encoding adds ~33% overhead)
app.use('/api/documents', express.json({ limit: '70mb' }));
app.use('/api/documents', documentsRoutes);
app.use('/api/huawei', huaweiRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/admin', adminClientsRoutes);

app.get('/api/health', (_, res) => res.json({ ok: true, version: APP_VERSION }));

// Servir frontend (public): .exe usa cwd/public; IIS (HTTP_PLATFORM_PORT) idem; dev usa raiz do projeto (sem __dirname para evitar erro no bundle pkg)
// Em IIS apontando para a pasta do projeto: se public/ não existir, usar frontend/dist (build do frontend na raiz)
let publicDir = (typeof process.pkg !== 'undefined' || (process.env.HTTP_PLATFORM_PORT && existsSync(join(process.cwd(), 'public'))))
  ? join(process.cwd(), 'public')
  : join(getAppRoot(), '..', 'public');
if (!existsSync(publicDir) && process.env.HTTP_PLATFORM_PORT) {
  const fallback = join(process.cwd(), 'frontend', 'dist');
  if (existsSync(join(fallback, 'index.html'))) publicDir = fallback;
}
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^(?!\/api).*/, (req, res, next) => {
    res.sendFile(join(publicDir, 'index.html'), (err) => { if (err) next(err); });
  });
}

// No IIS (iisnode ou HttpPlatformHandler) usar porta do ambiente e escutar só em 127.0.0.1
const listenHost = isIis ? '127.0.0.1' : '0.0.0.0';
const BASE_PORT = Number(PORT) || 3001;
const MAX_PORT = Math.min(BASE_PORT + 20, 3025);

function tryListen(port, host) {
  const server = app.listen(port, host, () => {
    console.log(`Ananim Manager Painel API rodando em http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    if (isIis) console.log('(Modo IIS: requisições apenas via servidor web)');
    if (!isIis && port !== BASE_PORT) {
      console.log(`(Porta ${BASE_PORT} em uso. No frontend rode: set VITE_API_PORT=${port} && npm run dev)`);
    }
  });
  server.on('error', (err) => {
    if (!isIis && err.code === 'EADDRINUSE' && port < MAX_PORT) {
      server.close(() => {
        console.warn(`Porta ${port} em uso, tentando ${port + 1}...`);
        tryListen(port + 1, host);
      });
    } else {
      console.error('');
      console.error('Nenhuma porta livre entre %s e %s. Encerre processos que usam essas portas:', BASE_PORT, MAX_PORT);
      console.error('  netstat -ano | findstr :3001');
      console.error('  taskkill /F /PID <numero_do_PID>');
      console.error('Ou feche outros terminais onde o backend estava rodando.');
      process.exit(1);
    }
  });
}

try {
  tryListen(BASE_PORT, listenHost);
} catch (err) {
  console.error('[Ananim] Erro ao iniciar servidor:', err && err.message);
  if (err && err.stack) console.error(err.stack);
  process.exit(1);
}

process.on('uncaughtException', (err) => {
  console.error('[Ananim] uncaughtException:', err && err.message);
  if (err && err.stack) console.error(err.stack);
});
process.on('unhandledRejection', (reason, p) => {
  console.error('[Ananim] unhandledRejection:', reason, p);
});
