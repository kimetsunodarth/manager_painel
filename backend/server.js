/**
 * Backend Huawei Cloud Panel em Node.js (funciona sem Python).
 * Porta 5000 - mesma API que app.py.
 * Quando empacotado com pkg (.exe): usa HTTP_PLATFORM_PORT e config.enc + key.bin (credenciais criptografadas).
 */
const path = require("path");
const fs = require("fs");
const { loadConfig, getKey, decryptBinary } = require("./utils/config-loader");

const isPkg = typeof process.pkg !== "undefined";
const appDir = isPkg ? path.dirname(process.execPath) : path.join(__dirname, "..");
process.env.APP_DATA_DIR = appDir;

const configDir = isPkg ? appDir : path.join(__dirname, "..");
const configResult = loadConfig(configDir);
const logEncrypt = require("./utils/log-encrypt");

function writeStartupError(message, err) {
  logEncrypt.append("startup-error", message + (err ? " " + (err.message || err) : ""));
}

if (configResult.loaded !== "encrypted") {
  const envPath = isPkg ? path.join(appDir, ".env") : path.join(__dirname, "..", ".env");
  require("dotenv").config({ path: envPath });
}

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cron = require("node-cron");
const crypto = require("crypto");
const { getCredentials, getAccountsForApi, getAccountName } = require("./config");
const { listProjects } = require("./huaweiClient");
const { listServers, startServer, stopServer, restartServer } = require("./ecsClient");
const schedules = require("./schedules");
const users = require("./users");
const actionLog = require("./actionLog");
const { appendLine } = require("./utils/encrypted-line-log");

const isProduction = process.env.NODE_ENV === "production";
const defaultSecret = "ananim-huawei-panel-secret";
const sessionSecret = process.env.SESSION_SECRET || defaultSecret;
const logsKey = getKey(appDir) || (isPkg ? getKey(path.dirname(appDir)) : null);

// Em produção, logs em texto (txt/json/jsonl) devem ser criptografados no padrão key.bin/CONFIG_KEY.
// Se não houver chave, encerramos para evitar geração de logs em claro.
if (isProduction && !logsKey) {
  const msg = "Em producao, key.bin (ou CONFIG_KEY) é obrigatório para criptografar logs de texto (requests/action-log). Gere e coloque key.bin na pasta do app (ou defina CONFIG_KEY).";
  console.error(msg);
  process.exit(1);
}

if (isProduction && (!process.env.SESSION_SECRET || sessionSecret === defaultSecret)) {
  const msg = "Em producao defina SESSION_SECRET no .env ou em config.enc (valor forte e unico). Coloque config.enc e key.bin (ou .env) na pasta do .exe.";
  console.error(msg);
  console.error("Sem isso a API nao inicia e o IIS mostra 502.3 Bad Gateway.");
  if (logsKey) writeStartupError("SESSION_SECRET nao definido em producao. Coloque config.enc e key.bin na pasta do exe e reinicie.");
  process.exit(1);
}

// Em produção (exe/IIS), redireciona console para log criptografado (api-stdout.log fica vazio; use Descriptografar-Logs.exe para ler)
if (isPkg && isProduction) {
  function toEncrypted(level) {
    return function (...args) {
      const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
      logEncrypt.append("app", "[" + level + "] " + msg);
    };
  }
  console.log = toEncrypted("INFO");
  console.error = toEncrypted("ERROR");
}

const app = express();
const rawPort = process.env.HTTP_PLATFORM_PORT || process.env.PORT || 5000;
const PORT = parseInt(String(rawPort), 10) || 5000;

if (isProduction) app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
      },
    },
  })
);
app.use(express.json({ limit: "100kb" }));

const corsOrigin = isProduction && process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: corsOrigin, credentials: true }));

const sessionMaxAge = isProduction
  ? (parseInt(process.env.SESSION_MAX_AGE_MS, 10) || 24 * 60 * 60 * 1000)
  : 7 * 24 * 60 * 60 * 1000;

// Cookie Secure: em IIS (HTTP_PLATFORM_PORT) ou com COOKIE_SECURE=false usar secure: false para HTTP
const isIisHttp = !!process.env.HTTP_PLATFORM_PORT;
const cookieSecure = isProduction && !isIisHttp && process.env.COOKIE_SECURE !== "false";
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: "ananim.sid",
    cookie: {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "lax",
      maxAge: sessionMaxAge,
    },
  })
);

function getReqIp(req) {
  return (req.ip || req.socket?.remoteAddress || "").trim() || "unknown";
}

function makeRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

// Request logging (todas as requisições) em logs/requests.log (linha criptografada estilo ADDS)
app.use((req, res, next) => {
  const requestId = makeRequestId();
  const start = Date.now();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    try {
      const userEmail = req.session && req.session.user ? req.session.user.email : null;
      const payload = {
        t: new Date().toISOString(),
        requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs: Date.now() - start,
        ip: getReqIp(req),
        userAgent: String(req.headers["user-agent"] || ""),
        user: userEmail || null,
      };
      const filePath = path.join(appDir, "logs", "requests.log");
      appendLine(filePath, payload, { appDir, requireKey: isProduction });
    } catch (_) {}
  });
  next();
});

function rateLimitKey(req) {
  let ip = (req.ip || req.socket?.remoteAddress || "").trim();
  const bracketPort = ip.match(/^\[(.+)\]:\d+$/);
  if (bracketPort) return bracketPort[1];
  const ipv4Port = ip.match(/^([^:]+):\d+$/);
  if (ipv4Port) return ipv4Port[1];
  return ip || "unknown";
}

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { error: "Muitas tentativas de login. Tente novamente em 5 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Muitas requisições. Tente novamente em alguns minutos." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
});

const FAILED_LOGIN_MAX = 5;
const FAILED_LOGIN_BLOCK_MS = 15 * 60 * 1000;
const failedLoginAttempts = new Map();

function isAccountBlocked(email) {
  const key = (email || "").trim().toLowerCase();
  if (!key) return false;
  const rec = failedLoginAttempts.get(key);
  if (!rec || !rec.blockedUntil) return false;
  if (Date.now() < rec.blockedUntil) return true;
  failedLoginAttempts.delete(key);
  return false;
}

function recordFailedLogin(email) {
  const key = (email || "").trim().toLowerCase();
  if (!key) return;
  const rec = failedLoginAttempts.get(key) || { count: 0 };
  rec.count += 1;
  if (rec.count >= FAILED_LOGIN_MAX) rec.blockedUntil = Date.now() + FAILED_LOGIN_BLOCK_MS;
  failedLoginAttempts.set(key, rec);
}

function clearFailedLogins(email) {
  const key = (email || "").trim().toLowerCase();
  if (key) failedLoginAttempts.delete(key);
}

function validateString(val, maxLen) {
  const s = typeof val === "string" ? String(val).trim() : "";
  if (maxLen && s.length > maxLen) return s.slice(0, maxLen);
  return s;
}

function validateEcsBody(body) {
  const b = body || {};
  return {
    accountId: validateString(b.accountId, 256),
    region: validateString(b.region, 128),
    projectId: validateString(b.projectId, 128),
    serverId: validateString(b.serverId, 64),
  };
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: "Não autenticado" });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === "admin") return next();
  res.status(403).json({ error: "Acesso negado" });
}

app.use("/api", apiLimiter);

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const raw = req.body || {};
  const email = (typeof raw.email === "string" ? raw.email : "").trim().slice(0, 256);
  const password = typeof raw.password === "string" ? raw.password : "";
  try {
    if (isAccountBlocked(email)) {
      return res.status(429).json({
        error: "Conta temporariamente bloqueada devido a várias tentativas de login. Tente novamente em 15 minutos.",
      });
    }
    const user = await users.verify(email, password);
    if (!user) {
      recordFailedLogin(email);
      actionLog.append(email || "?", "login_failed", {});
      return res.status(401).json({ error: "E-mail ou senha incorretos" });
    }
    clearFailedLogins(email);
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Erro ao criar sessão" });
      req.session.user = user;
      req.session.save((err2) => {
        if (err2) return res.status(500).json({ error: "Erro ao criar sessão" });
        actionLog.append(user.email, "login", {});
        res.json(user);
      });
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.get("/api/auth/me", (req, res) => {
  if (req.session && req.session.user) return res.json(req.session.user);
  res.status(401).json({ error: "Não autenticado" });
});

app.post("/api/auth/logout", (req, res) => {
  const email = req.session && req.session.user ? req.session.user.email : null;
  req.session.destroy(() => {});
  if (email) actionLog.append(email, "logout", {});
  res.json({ ok: true });
});

app.get("/api/users", requireAuth, requireAdmin, (req, res) => {
  try {
    res.json(users.list());
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const created = await users.create(req.body || {});
    actionLog.append(req.session.user.email, "user_create", { targetEmail: created.email, role: created.role });
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

app.patch("/api/users/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
  try {
    await users.resetPassword(id, (req.body || {}).newPassword);
    actionLog.append(req.session.user.email, "user_reset_password", { userId: id });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
  try {
    users.remove(id);
    actionLog.append(req.session.user.email, "user_delete", { userId: id });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

app.get("/api/action-log", requireAuth, requireAdmin, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    res.json(actionLog.getRecent(limit));
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.use("/api/accounts", requireAuth);
app.use("/api/projects", requireAuth);
app.use("/api/ecs", requireAuth);
app.use("/api/schedules", requireAuth);

app.get("/api/accounts", (req, res) => {
  res.json(getAccountsForApi());
});

app.post("/api/projects", async (req, res) => {
  const accountId = (req.body && req.body.accountId) || "";
  const region = (req.body && req.body.region) || "";
  if (!accountId.trim()) {
    return res.status(400).json({ error: "accountId é obrigatório" });
  }
  const creds = getCredentials(accountId.trim());
  if (!creds) {
    return res.status(400).json({ error: "Conta não encontrada ou credenciais não configuradas" });
  }
  try {
    const result = await listProjects(creds.ak, creds.sk);
    let projects = Array.isArray(result.projects) ? result.projects : (Array.isArray(result) ? result : []);
    var isMoove = (accountId.trim().toLowerCase() === "moove_ramosistemas");
    if (region.trim() && !isMoove) {
      const r = region.trim().toLowerCase();
      projects = projects.filter(function (p) {
        const pid = (p.parent_id || "").toLowerCase();
        const name = (p.name || "").toLowerCase();
        const id = (p.id || "").toLowerCase();
        return pid === r || name.indexOf(r) >= 0 || id.indexOf(r) >= 0;
      });
      if (projects.length === 0) {
        projects = Array.isArray(result.projects) ? result.projects : (Array.isArray(result) ? result : []);
      }
    }
    // MOOVE_RAMOSISTEMAS: exibir apenas o projeto identificado por ID (ou por nome se ID não bater)
    var mooveProjectId = "079fd9f3ab8026fe2fcbc00192167cda";
    function normId(id) { return (id || "").toLowerCase().replace(/-/g, ""); }
    if (isMoove) {
      var wantIdNorm = normId(mooveProjectId);
      var byId = projects.filter(function (p) {
        return normId(p.id) === wantIdNorm;
      });
      projects = byId.length > 0 ? byId : projects.filter(function (p) {
        const name = (p.name || "").toLowerCase();
        return (
          name.indexOf("la-sao") >= 0 ||
          name.indexOf("la_sao") >= 0 ||
          name.indexOf("sao paulo") >= 0 ||
          name.indexOf("são paulo") >= 0 ||
          name.indexOf("paulo1") >= 0 ||
          (name.indexOf("la") >= 0 && name.indexOf("paulo") >= 0)
        );
      });
      if (projects.length === 0) {
        // Fallback: mostrar todos os projetos (evitar "nenhum projeto") para o usuário identificar
        projects = Array.isArray(result.projects) ? result.projects : (Array.isArray(result) ? result : []);
      }
      // MOOVE: não aplicar blocklist de regiões para não remover o projeto desejado
    } else {
      var regionOnlyBlocklist = [
        "sa-brazil-1", "la-south-2", "ap-southeast-1", "ap-southeast-3", "af-north-1", "cn-southwest-2",
        "me-east-1", "cn-south-1", "cn-east-4", "cn-north-1", "cn-north-2", "cn-north-4", "ap-southeast-2",
        "la-north-1", "eu-west-0", "eu-central-1", "af-south-1"
      ];
      projects = projects.filter(function (p) {
        const name = (p.name || "").trim();
        if (!name) return false;
        return regionOnlyBlocklist.indexOf(name.toLowerCase()) < 0;
      });
    }
    res.json({ projects });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

// ECS (estilo Cloud8): listar servidores, start, stop
app.post("/api/ecs/servers", async (req, res) => {
  const { accountId, region, projectId, serverId } = validateEcsBody(req.body);
  if (!accountId || !region || !projectId) {
    return res.status(400).json({ error: "accountId, region e projectId são obrigatórios" });
  }
  const creds = getCredentials(accountId);
  if (!creds) {
    return res.status(400).json({ error: "Conta não encontrada ou credenciais não configuradas" });
  }
  try {
    const result = await listServers(creds.ak, creds.sk, region, projectId);
    let servers = result.servers || result.server || [];
    if (!Array.isArray(servers)) servers = [];
    servers = servers.map(function (s) {
      const raw = s.server || s;
      const id = raw.id || raw.uuid || "";
      const name = raw.name || "";
      let status = (raw.status || raw["OS-EXT-STS:vm_state"] || "").toUpperCase();
      if (status === "RUNNING" || status === "ACTIVE") status = "ACTIVE";
      if (status === "STOPPED" || status === "SHUTOFF") status = "SHUTOFF";
      return { id, name, status: status || "UNKNOWN" };
    });
    res.json({ servers });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});

app.post("/api/ecs/start", async (req, res) => {
  const { accountId, region, projectId, serverId } = validateEcsBody(req.body);
  if (!accountId || !region || !projectId || !serverId) {
    return res.status(400).json({ error: "accountId, region, projectId e serverId são obrigatórios" });
  }
  const creds = getCredentials(accountId);
  if (!creds) {
    return res.status(400).json({ error: "Conta não encontrada ou credenciais não configuradas" });
  }
  const user = req.session && req.session.user ? req.session.user.email : null;
  try {
    await startServer(creds.ak, creds.sk, region, projectId, serverId);
    actionLog.append(user, "ecs_start", { accountId, accountName: getAccountName(accountId), region, projectId, serverId, success: true });
    res.json({ ok: true, message: "Comando de start enviado" });
  } catch (e) {
    actionLog.append(user, "ecs_start", { accountId, accountName: getAccountName(accountId), region, projectId, serverId, success: false, error: e.message || String(e) });
    res.status(502).json({ error: e.message || String(e) });
  }
});

app.post("/api/ecs/stop", async (req, res) => {
  const { accountId, region, projectId, serverId } = validateEcsBody(req.body);
  if (!accountId || !region || !projectId || !serverId) {
    return res.status(400).json({ error: "accountId, region, projectId e serverId são obrigatórios" });
  }
  const creds = getCredentials(accountId);
  if (!creds) {
    return res.status(400).json({ error: "Conta não encontrada ou credenciais não configuradas" });
  }
  const user = req.session && req.session.user ? req.session.user.email : null;
  try {
    await stopServer(creds.ak, creds.sk, region, projectId, serverId);
    actionLog.append(user, "ecs_stop", { accountId, accountName: getAccountName(accountId), region, projectId, serverId, success: true });
    res.json({ ok: true, message: "Comando de stop enviado" });
  } catch (e) {
    actionLog.append(user, "ecs_stop", { accountId, accountName: getAccountName(accountId), region, projectId, serverId, success: false, error: e.message || String(e) });
    res.status(502).json({ error: e.message || String(e) });
  }
});

app.post("/api/ecs/restart", async (req, res) => {
  const { accountId, region, projectId, serverId } = validateEcsBody(req.body);
  if (!accountId || !region || !projectId || !serverId) {
    return res.status(400).json({ error: "accountId, region, projectId e serverId são obrigatórios" });
  }
  const creds = getCredentials(accountId);
  if (!creds) {
    return res.status(400).json({ error: "Conta não encontrada ou credenciais não configuradas" });
  }
  const user = req.session && req.session.user ? req.session.user.email : null;
  try {
    await restartServer(creds.ak, creds.sk, region, projectId, serverId);
    actionLog.append(user, "ecs_restart", { accountId, accountName: getAccountName(accountId), region, projectId, serverId, success: true });
    res.json({ ok: true, message: "Comando de restart enviado" });
  } catch (e) {
    actionLog.append(user, "ecs_restart", { accountId, accountName: getAccountName(accountId), region, projectId, serverId, success: false, error: e.message || String(e) });
    res.status(502).json({ error: e.message || String(e) });
  }
});

// ——— Agendamentos (réplica Cloud8) ———
app.get("/api/schedules", (req, res) => {
  try {
    res.json(schedules.list());
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.post("/api/schedules", (req, res) => {
  const body = req.body || {};
  const { accountId, region, projectId, serverId } = validateEcsBody(body);
  if (!accountId || !region || !projectId || !serverId) {
    return res.status(400).json({ error: "accountId, region, projectId e serverId são obrigatórios" });
  }
  const user = req.session && req.session.user ? req.session.user.email : null;
  const scheduleBody = { ...body, accountId, region, projectId, serverId, createdBy: user };
  try {
    const schedule = schedules.add(scheduleBody);
    actionLog.append(user, "schedule_create", { scheduleId: schedule.id, accountId, accountName: getAccountName(accountId), serverId, action: body.action, createdBy: user });
    res.status(201).json(schedule);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.patch("/api/schedules/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
  const user = req.session && req.session.user ? req.session.user.email : null;
  const updateBody = { ...(req.body || {}), modifiedBy: user };
  try {
    const updated = schedules.update(id, updateBody);
    if (!updated) return res.status(404).json({ error: "Agendamento não encontrado" });
    actionLog.append(user, "schedule_update", { scheduleId: id, modifiedBy: user });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.delete("/api/schedules/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "ID inválido" });
  try {
    const removed = schedules.remove(id);
    if (!removed) return res.status(404).json({ error: "Agendamento não encontrado" });
    const user = req.session && req.session.user ? req.session.user.email : null;
    actionLog.append(user, "schedule_delete", {
      scheduleId: id,
      serverId: removed.serverId,
      serverName: removed.serverName,
      accountId: removed.accountId,
      accountName: getAccountName(removed.accountId),
      region: removed.region,
      projectId: removed.projectId,
      createdBy: removed.createdBy || null,
      modifiedBy: removed.lastModifiedBy || null,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// Cron: a cada minuto verifica e executa agendamentos devidos (roda no servidor, não depende do navegador)
cron.schedule("* * * * *", () => {
  schedules.runDue().catch((e) => console.error("[Cron schedules]", e));
});

// Health/ping: para monitoramento e keep-alive (evita IIS/app pool encerrar o processo por “inatividade”)
app.get("/api/health", (req, res) => {
  const now = new Date();
  res.status(200).json({
    ok: true,
    cron: "active",
    serverTime: now.toISOString(),
    serverTimeLocal: now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  });
});

// Logo criptografado: serve logo.enc descriptografado (mesma chave que config.enc). Fallback: logo.png em dev.
const LOGO_ENC = "logo.enc";
app.get("/api/logo", (req, res) => {
  const encPath = path.join(appDir, LOGO_ENC);
  if (fs.existsSync(encPath)) {
    const key = getKey(appDir);
    if (key) {
      try {
        const enc = fs.readFileSync(encPath);
        const buf = decryptBinary(enc, key);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.send(buf);
        return;
      } catch (e) {
        console.error("Erro ao descriptografar logo:", e.message);
      }
    }
  }
  const frontendDirForLogo = isPkg && process.env.NODE_ENV === "production"
    ? path.join(appDir, "public")
    : path.join(__dirname, "..", "frontend");
  const logoPng = path.join(frontendDirForLogo, "logo.png");
  if (fs.existsSync(logoPng)) {
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(logoPng);
    return;
  }
  res.status(404).send("Logo não encontrado");
});

// Documentação da API (opcional)
app.get("/api", (req, res) => {
  res.json({
    service: "Ananim Huawei Painel API",
    docs: "README.md e SEGURANCA.md na raiz do projeto",
    endpoints: {
      "POST /api/auth/login": "Login (email, password); rate limit 5/5min por IP",
      "GET /api/auth/me": "Usuário da sessão ou 401",
      "POST /api/auth/logout": "Encerra sessão",
      "GET /api/accounts": "Lista contas (requer auth)",
      "POST /api/projects": 'Body: { accountId, region } — Lista projetos IAM',
      "POST /api/ecs/servers": 'Body: { accountId, region, projectId } — Lista ECS',
      "POST /api/ecs/start": "Inicia ECS (accountId, region, projectId, serverId)",
      "POST /api/ecs/stop": "Para ECS",
      "GET /api/schedules": "Lista agendamentos",
      "POST /api/schedules": "Cria agendamento",
      "PATCH /api/schedules/:id": "Atualiza agendamento",
      "DELETE /api/schedules/:id": "Remove agendamento",
      "GET /api/users": "Lista usuários (admin)",
      "POST /api/users": "Cria usuário (admin)",
      "PATCH /api/users/:id/reset-password": "Reset senha (admin)",
      "DELETE /api/users/:id": "Exclui usuário (admin)",
      "GET /api/action-log": "Log de ações (admin); ?limit=200",
      "GET /api/health": "Health/ping (keep-alive); não requer auth",
      "GET /api/logo": "Logo do painel (logo.enc descriptografado ou logo.png); não requer auth",
      "POST /api/coc/schedules": "Criar agendamento no Huawei COC usando AK/SK"
    },
  });
});

// ==========================================
// ROTA COC (Huawei Cloud Operations Center)
// ==========================================
app.post("/api/coc/schedules", requireAuth, async (req, res) => {
  const { signRequest } = require("./huaweiSigner");
  const fetch = require("node-fetch");
  const body = req.body || {};
  const { accountId, region, task_name, enterprise_project_id, execute_strategy, job_config, risk_level } = body;

  if (!accountId || !region || !task_name || !job_config) {
    return res.status(400).json({ error: "accountId, region, task_name, job_config sao obrigatorios" });
  }

  const creds = getCredentials(accountId);
  if (!creds) {
    return res.status(400).json({ error: "Conta nao encontrada ou credenciais nao configuradas" });
  }

  try {
    const url = `https://coc.${region}.myhuaweicloud.com/v1/jobs/scheduled-tasks`;
    
    const payload = {
      task_name,
      enterprise_project_id: enterprise_project_id || "0",
      description: "Agendamento criado via Ananim Huawei Painel (Automacao)",
      execute_strategy,
      job_config,
      iam_agency: "ServiceAgencyForCOC",
      risk_level: risk_level || "MEDIUM"
    };

    const bodyStr = JSON.stringify(payload);
    const bodyBuffer = Buffer.from(bodyStr, "utf8");
    const headers = signRequest("POST", url, bodyBuffer, creds.ak, creds.sk);

    const cocRes = await fetch(url, {
      method: "POST",
      headers,
      body: bodyStr,
    });

    if (!cocRes.ok) {
      const text = await cocRes.text();
      throw new Error(text || `HTTP ${cocRes.status}`);
    }

    const data = await cocRes.json();
    const user = req.session && req.session.user ? req.session.user.email : null;
    actionLog.append(user, "coc_schedule_create", { accountId, region, task_name, success: true });
    
    res.status(201).json({ success: true, data });
  } catch (e) {
    console.error("Erro no COC:", e);
    const user = req.session && req.session.user ? req.session.user.email : null;
    actionLog.append(user, "coc_schedule_create", { accountId, region, task_name, success: false, error: e.message || String(e) });
    res.status(502).json({ error: e.message || String(e) });
  }
});

// Servir o painel (frontend): em pkg/produção usa pasta "public" ao lado do exe; senão frontend/
const frontendDir = isPkg && process.env.NODE_ENV === "production"
  ? path.join(appDir, "public")
  : path.join(__dirname, "..", "frontend");
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.get("/", (req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });
}

// Só abrir a porta depois do admin estar criado (evita login antes do usuário existir)
// No IIS (HttpPlatformHandler ou iisnode) usar 127.0.0.1 para aceitar apenas tráfego do IIS
const listenHost = (process.env.HTTP_PLATFORM_PORT || process.env.IISNODE_VERSION) ? "127.0.0.1" : "0.0.0.0";
const http = require("http");

users.ensureAdmin().then(() => {
  app.listen(PORT, listenHost, () => {
    console.log("Painel e API em http://" + (listenHost === "0.0.0.0" ? "localhost" : listenHost) + ":" + PORT);
    if (isPkg) {
      console.log("Modo: IIS/produção (exe). Cron de agendamentos roda a cada minuto (não depende do navegador).");
      console.log("Para o processo não ser encerrado: no IIS, Application Pool do site, defina Idle Time-out (minutes) = 0.");
    }

    // Keep-alive: self-ping a cada 60s para o processo não ser encerrado por "inatividade" (IIS App Pool)
    if (process.env.DISABLE_KEEP_ALIVE_PING === "1") return;
    const keepAliveMs = Math.max(45000, parseInt(process.env.KEEP_ALIVE_INTERVAL_MS, 10) || 60000);
    setInterval(() => {
      const url = "http://127.0.0.1:" + PORT + "/api/health";
      http.get(url, (res) => { res.resume(); }).on("error", () => {});
    }, keepAliveMs);
  });
}).catch((e) => {
  console.error("Erro ao criar usuário admin:", e);
  writeStartupError("Erro ao criar/ler usuario admin (users.json). Verifique permissoes da pasta do app (IIS precisa gravar).", e);
  process.exit(1);
});
