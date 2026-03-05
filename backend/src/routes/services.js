import { readFileSync, existsSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Router } from 'express';
import { getAppRoot } from '../appRoot.js';

const backendEnvPath = path.join(getAppRoot(), '.env');
function ensureControlCenterEnv() {
  if (process.env.CONTROL_CENTER_ROLAND_USER && process.env.CONTROL_CENTER_ROLAND_PASSWORD) return;
  if (process.env.CONTROL_CENTER_CONTROLLA_USER && process.env.CONTROL_CENTER_CONTROLLA_PASSWORD) return;
  if (existsSync(backendEnvPath)) dotenv.config({ path: backendEnvPath, override: true });
}
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { getServiceExecution, setServiceExecution, userStore } from '../data/store.js';
import { logAction } from '../middleware/auditLog.js';
import { getServiceList } from '../config/sapServices.js';
import { getSqlClientKey, getSqlClientKeysForUser, getSqlServiceList, getSqlClientDisplayName, getSqlGroupServiceIds, getSqlClientConnectionType } from '../config/sqlClients.js';
import { getHanaClientKey, getHanaClientKeysForUser, getHanaClientDisplayName, getHanaConnectionConfig, getHanaJumpConfig, getHanaProcessListCommand, getHanaServiceList, getHanaWindowsServiceGroup, isHanaClientConfigured } from '../config/hanaClients.js';
import { getControlCenterClientKey, getControlCenterConfig, getControlCenterKeyForHanaKey } from '../config/controlCenterClients.js';
import { getClientCredentials, hasClientCredentials } from '../config/clientCredentials.js';
import { sshExec, sshExecSql, sshExecSqlWithCredentials, sshExecWithConfig, sshExecWithConfigViaJump, getWebConnectionConfigFromCredentials, COMMANDS, HEALTH_COMMANDS, HEALTH_COMMANDS_SQL, getSqlHealthCommand, getSqlHealthGroupCommandBatches, getSqlRestartGroupCommand, isSshConfigured, isSqlConfigured, HANA_GET_PROCESS_LIST_CMD } from '../services/sshService.js';
import { runActivateSupport } from '../services/controlCenterService.js';
import { sendRestartNotification, isEmailConfigured } from '../services/emailService.js';
import { getEnrichedVisibleProjects } from './huawei.js';

const router = Router();
router.use(authMiddleware);

/** Retorna o clientKey SQL efetivo: preferência do usuário > query > ordem dos visibleProjects. */
function getEffectiveSqlClientKey(u, queryClientKey) {
  const allowed = getSqlClientKeysForUser(u);
  if (!allowed.length) return null;
  const preferred = u?.preferredServiceClientKey && allowed.includes(u.preferredServiceClientKey) ? u.preferredServiceClientKey : null;
  if (preferred) return preferred;
  if (queryClientKey && allowed.includes(queryClientKey)) return queryClientKey;
  return getSqlClientKey(u);
}

/** Retorna o clientKey HANA efetivo: preferência do usuário > query > ordem dos visibleProjects. */
function getEffectiveHanaClientKey(u, queryClientKey) {
  const allowed = getHanaClientKeysForUser(u);
  if (!allowed.length) return null;
  const preferred = u?.preferredServiceClientKey && allowed.includes(u.preferredServiceClientKey) ? u.preferredServiceClientKey : null;
  if (preferred) return preferred;
  if (queryClientKey && allowed.includes(queryClientKey)) return queryClientKey;
  return getHanaClientKey(u);
}

/** Monta config de conexão HANA a partir de objeto de credenciais (ex.: clients/<key>/credentials.enc). */
function hanaConnFromCredentials(creds) {
  if (!creds || !creds.SSH_HOST || !creds.SSH_USER) return null;
  const c = {
    host: creds.SSH_HOST,
    port: Number(creds.SSH_PORT || '22'),
    username: creds.SSH_USER,
  };
  if (creds.SSH_PRIVATE_KEY_PATH && existsSync(creds.SSH_PRIVATE_KEY_PATH)) {
    try {
      c.privateKey = readFileSync(creds.SSH_PRIVATE_KEY_PATH, 'utf8');
    } catch {
      return null;
    }
  } else if (creds.SSH_PASSWORD) {
    c.password = creds.SSH_PASSWORD;
  } else return null;
  return c;
}

/** Executa comando SSH no cliente HANA; usa jump host quando configurado (ex.: Roland ROLANDWEB → ROLANDHDB). */
async function execHanaSsh(hanaClientKey, command) {
  const conn = getHanaConnectionConfig(hanaClientKey);
  if (!conn) return Promise.reject(new Error('Configuração do cliente HANA indisponível'));
  const jump = getHanaJumpConfig(hanaClientKey);
  if (jump) return sshExecWithConfigViaJump(jump, conn, command);
  return sshExecWithConfig(conn, command);
}

/** Retorna o clientKey efetivo (SQL ou HANA): preferência do usuário > query > ordem dos visibleProjects. */
function getEffectiveClientKey(u, clientKeyQuery) {
  const sqlKeys = getSqlClientKeysForUser(u);
  const hanaKeys = getHanaClientKeysForUser(u);
  const preferred = u?.preferredServiceClientKey || null;
  if (preferred) {
    if (sqlKeys.includes(preferred)) return { clientKey: preferred, type: 'sql' };
    if (hanaKeys.includes(preferred)) return { clientKey: preferred, type: 'hana' };
  }
  if (clientKeyQuery) {
    if (sqlKeys.includes(clientKeyQuery)) return { clientKey: clientKeyQuery, type: 'sql' };
    if (hanaKeys.includes(clientKeyQuery)) return { clientKey: clientKeyQuery, type: 'hana' };
  }
  if (sqlKeys.length) return { clientKey: getSqlClientKey(u), type: 'sql' };
  if (hanaKeys.length) return { clientKey: getHanaClientKey(u), type: 'hana' };
  return null;
}

router.get('/', async (req, res) => {
  try {
    const u = userStore.getById(req.user?.id);
    const clientKeyQuery = (req.query.clientKey && String(req.query.clientKey).trim()) || null;
    const visibleProjects = u ? await getEnrichedVisibleProjects(u) : [];
    const uWithProjects = u ? { ...u, visibleProjects } : u;

    if (u?.role !== 'admin') {
      const sqlKeys = getSqlClientKeysForUser(uWithProjects);
      const hanaKeys = getHanaClientKeysForUser(uWithProjects);
      const effective = getEffectiveClientKey(uWithProjects, clientKeyQuery);
      if (effective) {
        const list = effective.type === 'sql'
          ? getSqlServiceList(effective.clientKey).map((s) => ({ ...s, lastExecution: getServiceExecution(s.id) }))
          : getHanaServiceList(effective.clientKey).map((s) => ({ ...s, lastExecution: getServiceExecution(s.id) }));
        const displayName = effective.type === 'sql'
          ? getSqlClientDisplayName(effective.clientKey)
          : getHanaClientDisplayName(effective.clientKey);
        const serverMap = new Map();
        for (const k of sqlKeys) {
          if (!serverMap.has(k)) serverMap.set(k, { clientKey: k, displayName: getSqlClientDisplayName(k) });
        }
        for (const k of hanaKeys) {
          if (!serverMap.has(k)) serverMap.set(k, { clientKey: k, displayName: getHanaClientDisplayName(k) });
        }
        const servers = Array.from(serverMap.values());
        const payload = { list, mode: effective.type, displayName, clientKey: effective.clientKey };
        if (servers.length > 1) payload.availableServers = servers;
        return res.json(payload);
      }
    }

    if (u?.role !== 'admin' && !getEffectiveClientKey(uWithProjects, clientKeyQuery)) {
      const allowed = u?.allowedServiceIds || [];
      const hasServiceAccess = allowed.length > 0;
      if (!hasServiceAccess) {
        const serviceList = getServiceList();
        const onlyListar = serviceList.filter((s) => s.action === 'listar');
        if (onlyListar.length === 0) return res.status(403).json({ error: 'Sem permissão para acessar serviços' });
      }
    }

    const serviceList = getServiceList();
    let list = serviceList.map((s) => ({
      ...s,
      lastExecution: getServiceExecution(s.id),
    }));
    if (u?.role !== 'admin') {
      const allowed = u?.allowedServiceIds || [];
      if (allowed.length > 0) {
        list = list.filter((s) => s.action === 'listar' || allowed.includes(s.id));
      } else {
        list = list.filter((s) => s.action === 'listar');
      }
    }
    return res.json(list);
  } catch (err) {
    console.error('[services/GET]', err);
    return res.status(500).json({ error: err.message || 'Erro ao carregar lista de serviços' });
  }
});

/** Status da configuração de e-mail (notificações de ações no painel). */
router.get('/email-status', requirePermission('services:*'), (req, res) => {
  return res.json({ configured: isEmailConfigured() });
});

/** Envia um e-mail de teste para validar SMTP (destinatário: EMAIL_TO). */
router.post('/test-email', requirePermission('services:*'), async (req, res) => {
  if (!isEmailConfigured()) {
    return res.status(400).json({ ok: false, error: 'E-mail não configurado. Configure SMTP_HOST (ou SMTP_SERVER), SMTP_USER (ou EMAIL_FROM), SMTP_PASSWORD e EMAIL_TO no .env.' });
  }
  const nodemailer = (await import('nodemailer')).default;
  const host = process.env.SMTP_HOST || process.env.SMTP_SERVER;
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER || process.env.EMAIL_FROM;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM || user;
  const to = process.env.EMAIL_TO || '';
  try {
    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    await transporter.sendMail({
      from,
      to: to.split(',').map((e) => e.trim()).filter(Boolean),
      subject: '[Ananim Manager Painel] Teste de configuração de e-mail',
      html: '<p>Este é um e-mail de teste do painel. A notificação por e-mail está configurada corretamente.</p><p>Data: ' + new Date().toLocaleString('pt-BR') + '</p>',
    });
    return res.json({ ok: true, sent: true, message: 'E-mail de teste enviado com sucesso.' });
  } catch (e) {
    return res.status(502).json({ ok: false, sent: false, error: e.message });
  }
});

/** Indica se o usuário tem acesso a um cliente Control Center (Ativar Support). Aceita query clientKey (ex.: roland, roland-web, controlla, controlla-web ou qualquer cliente cadastrado). */
router.get('/control-center-info', requirePermission('services:*'), async (req, res) => {
  const u = userStore.getById(req.user?.id);
  const clientKeyQuery = (req.query.clientKey && String(req.query.clientKey).trim()) || null;
  let controlCenterKey = null;
  if (clientKeyQuery) {
    const ccKey = getControlCenterKeyForHanaKey(clientKeyQuery);
    if (ccKey) {
      const visibleProjects = await getEnrichedVisibleProjects(u);
      const uWithProjects = { ...u, visibleProjects };
      const hanaKeys = getHanaClientKeysForUser(uWithProjects);
      if (hanaKeys.includes(clientKeyQuery)) controlCenterKey = ccKey;
    }
  }
  if (!controlCenterKey) {
    const visibleProjects = await getEnrichedVisibleProjects(u);
    const uWithProjects = { ...u, visibleProjects };
    controlCenterKey = getControlCenterClientKey(uWithProjects);
  }
  if (!controlCenterKey) {
    return res.json({ available: false });
  }
  const config = getControlCenterConfig(controlCenterKey);
  if (!config) {
    return res.json({ available: false });
  }
  // Exibe o botão sempre que o cliente tem config; credenciais são validadas ao clicar em Ativar Support
  return res.json({ available: true, displayName: config.displayName });
});

/** Nome da VM de banco conectada (para exibir no front). Usa visibleProjects enriquecidos para resolver cliente (ex.: ROLANDWEB). */
router.get('/connection-info', requirePermission('services:*'), async (req, res) => {
  const u = userStore.getById(req.user?.id);
  const clientKeyQuery = (req.query.clientKey && String(req.query.clientKey).trim()) || null;
  const visibleProjects = u ? await getEnrichedVisibleProjects(u) : [];
  const uWithProjects = u ? { ...u, visibleProjects } : u;
  const sqlClientKey = getEffectiveSqlClientKey(uWithProjects, clientKeyQuery);
  if (sqlClientKey) {
    const displayName = getSqlClientDisplayName(sqlClientKey);
    const connectionType = getSqlClientConnectionType(sqlClientKey);
    if (hasClientCredentials(sqlClientKey)) {
      const creds = getClientCredentials(sqlClientKey);
      if (connectionType === 'web') {
        const conn = getWebConnectionConfigFromCredentials(creds);
        const vmHost = conn?.host || null;
        const vmDisplayName = creds?.SSH_WEB_DISPLAY_NAME || displayName;
        return res.json({ vmHost, vmDisplayName, configured: !!conn, mode: 'sql', displayName });
      }
      const vmHost = creds?.SSH_SQL_HOST || null;
      const vmDisplayName = creds?.SSH_SQL_DISPLAY_NAME || displayName;
      return res.json({ vmHost, vmDisplayName, configured: !!(creds?.SSH_SQL_HOST && creds?.SSH_SQL_USER && (creds?.SSH_SQL_PASSWORD || creds?.SSH_SQL_PRIVATE_KEY_PATH)), mode: 'sql', displayName });
    }
    const vmHost = process.env.SSH_SQL_HOST || null;
    const vmDisplayName = process.env.SSH_SQL_DISPLAY_NAME || null;
    return res.json({ vmHost, vmDisplayName, configured: isSqlConfigured(), mode: 'sql', displayName });
  }
  const hanaClientKey = getEffectiveHanaClientKey(uWithProjects, clientKeyQuery);
  if (hanaClientKey) {
    const displayName = getHanaClientDisplayName(hanaClientKey);
    if (hasClientCredentials(hanaClientKey)) {
      const creds = getClientCredentials(hanaClientKey);
      const conn = hanaConnFromCredentials(creds);
      return res.json({
        vmHost: conn ? conn.host : null,
        vmDisplayName: displayName,
        configured: !!conn,
        mode: 'hana',
        displayName,
      });
    }
    const conn = getHanaConnectionConfig(hanaClientKey);
    return res.json({
      vmHost: conn ? conn.host : null,
      vmDisplayName: displayName,
      configured: isHanaClientConfigured(hanaClientKey),
      mode: 'hana',
      displayName,
    });
  }
  const vmHost = process.env.SSH_HOST || process.env.SUSE_HOST || null;
  res.json({ vmHost, configured: isSshConfigured() });
});

/** Ativar Support User no SAP Control Center (SLD) — automação Playwright. */
router.post('/activate-support', requirePermission('services:*'), async (req, res) => {
  const u = userStore.getById(req.user?.id);
  const clientKeyBody = (req.body?.clientKey && String(req.body.clientKey).trim()) || (req.query?.clientKey && String(req.query.clientKey).trim()) || null;
  let clientKey = null;
  if (clientKeyBody) {
    const ccKey = getControlCenterKeyForHanaKey(clientKeyBody);
    if (ccKey) {
      const visibleProjects = await getEnrichedVisibleProjects(u);
      const uWithProjects = { ...u, visibleProjects };
      const hanaKeys = getHanaClientKeysForUser(uWithProjects);
      if (hanaKeys.includes(clientKeyBody)) clientKey = ccKey;
    }
  }
  if (!clientKey) {
    const visibleProjects = await getEnrichedVisibleProjects(u);
    const uWithProjects = { ...u, visibleProjects };
    clientKey = getControlCenterClientKey(uWithProjects);
  }
  if (!clientKey) {
    return res.status(400).json({ ok: false, error: 'Cliente atual não possui configuração de Control Center' });
  }
  const config = getControlCenterConfig(clientKey);
  if (!config) {
    return res.status(400).json({ ok: false, error: 'Configuração do Control Center não encontrada' });
  }
  // Sempre recarregar .env para ter as credenciais do cliente (ex.: Controlla) atualizadas
  if (existsSync(backendEnvPath)) dotenv.config({ path: backendEnvPath, override: true });
  const username = process.env[config.envUserKey];
  const password = process.env[config.envPasswordKey];
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Credenciais do Control Center não configuradas no servidor. Configure ' + config.envUserKey + ' e ' + config.envPasswordKey + ' no .env.' });
  }
  try {
    const result = await runActivateSupport({
      baseUrl: config.baseUrl,
      username,
      password,
      headless: true,
    });
    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.error });
    }
    logAction(req, 'Ativar Support (Control Center)', { clientKey: config.displayName });
    return res.json({ ok: true, message: result.message });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message || 'Erro ao executar Ativar Support' });
  }
});

/** Teste de conexão SSH. Usa projetos enriquecidos para resolver cliente. Aceita body.clientKey (ex.: roland, roland-web). */
router.post('/test-connection', requirePermission('services:*'), async (req, res) => {
  const u = userStore.getById(req.user?.id);
  const clientKeyBody = (req.body?.clientKey && String(req.body.clientKey).trim()) || null;
  const visibleProjects = u ? await getEnrichedVisibleProjects(u) : [];
  const uWithProjects = u ? { ...u, visibleProjects } : u;
  const sqlClientKey = getEffectiveSqlClientKey(uWithProjects, clientKeyBody);
  if (sqlClientKey) {
    const connectionType = getSqlClientConnectionType(sqlClientKey);
    if (hasClientCredentials(sqlClientKey)) {
      const creds = getClientCredentials(sqlClientKey);
      if (connectionType === 'web') {
        const conn = getWebConnectionConfigFromCredentials(creds);
        if (!conn) {
          return res.status(400).json({ ok: false, error: 'Credenciais SSH Web do cliente incompletas (SSH_WEB_HOST, SSH_WEB_USER e senha ou chave)' });
        }
        try {
          const result = await sshExecWithConfig(conn, 'echo OK');
          if (result.code === 0 && result.stdout.trim() === 'OK') {
            return res.json({ ok: true, message: 'Conexão SSH estabelecida com sucesso.' });
          }
          return res.status(502).json({ ok: false, error: result.stderr || `Código ${result.code}` });
        } catch (e) {
          return res.status(502).json({ ok: false, error: e.message });
        }
      }
      if (!creds?.SSH_SQL_HOST || !creds?.SSH_SQL_USER) {
        return res.status(400).json({ ok: false, error: 'Credenciais SQL do cliente incompletas' });
      }
      try {
        const result = await sshExecSqlWithCredentials(creds, 'echo OK');
        if (result.code === 0 && result.stdout.trim() === 'OK') {
          return res.json({ ok: true, message: 'Conexão SSH estabelecida com sucesso.' });
        }
        return res.status(502).json({ ok: false, error: result.stderr || `Código ${result.code}` });
      } catch (e) {
        return res.status(502).json({ ok: false, error: e.message });
      }
    }
    if (connectionType === 'web') {
      return res.status(400).json({ ok: false, error: 'Servidor Web requer credentials.enc do cliente com SSH_WEB_*' });
    }
    if (!isSqlConfigured()) {
      return res.status(400).json({ ok: false, error: 'SSH SQL não configurado no servidor' });
    }
    try {
      const result = await sshExecSql('echo OK');
      if (result.code === 0 && result.stdout.trim() === 'OK') {
        return res.json({ ok: true, message: 'Conexão SSH estabelecida com sucesso.' });
      }
      return res.status(502).json({ ok: false, error: result.stderr || `Código ${result.code}` });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e.message });
    }
  }
  const hanaClientKey = getEffectiveHanaClientKey(uWithProjects, clientKeyBody);
  if (hanaClientKey) {
    const useJump = getHanaJumpConfig(hanaClientKey);
    const conn = hasClientCredentials(hanaClientKey)
      ? hanaConnFromCredentials(getClientCredentials(hanaClientKey))
      : getHanaConnectionConfig(hanaClientKey);
    if (!conn) {
      return res.status(400).json({ ok: false, error: 'SSH do cliente HANA não configurado (env ou credentials do cliente)' });
    }
    try {
      const result = useJump
        ? await execHanaSsh(hanaClientKey, 'echo OK')
        : await sshExecWithConfig(conn, 'echo OK');
      if (result.code === 0 && result.stdout.trim() === 'OK') {
        return res.json({ ok: true, message: 'Conexão SSH estabelecida com sucesso.' });
      }
      return res.status(502).json({ ok: false, error: result.stderr || `Código ${result.code}` });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e.message });
    }
  }
  if (!isSshConfigured()) {
    return res.status(400).json({ ok: false, error: 'SSH não configurado no servidor' });
  }
  try {
    const result = await sshExec('echo OK');
    if (result.code === 0 && result.stdout.trim() === 'OK') {
      return res.json({ ok: true, message: 'Conexão SSH estabelecida com sucesso.' });
    }
    return res.status(502).json({ ok: false, error: result.stderr || `Código ${result.code}` });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
});

/**
 * Parse da saída do sapcontrol GetProcessList.
 * Aceita tab, vírgula (CSV) ou espaços; ignora linhas de cabeçalho (GetProcessList, OK, name description...).
 */
function parseHanaProcessList(stdout) {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const processes = [];
  const statusValues = ['GREEN', 'YELLOW', 'RED', 'GRAY'];
  for (const line of lines) {
    if (line === 'GetProcessList' || line === 'OK' || line.toLowerCase().startsWith('name')) continue;
    let name, description, dispstatus, textstatus, starttime, elapsedtime, pid;
    const byComma = line.split(',').map((p) => (p || '').trim());
    if (byComma.length >= 7 && statusValues.includes(byComma[2])) {
      [name, description, dispstatus, textstatus, starttime, elapsedtime, pid] = byComma;
    } else {
      const byTab = line.split(/\t/);
      if (byTab.length >= 7) {
        [name, description, dispstatus, textstatus, starttime, elapsedtime, pid] = byTab.map((p) => (p || '').trim());
      } else {
        const parts = line.split(/\s+/);
        const idx = parts.findIndex((p) => statusValues.includes(p));
        if (idx < 0 || idx + 5 > parts.length) continue;
        name = parts[0] || '';
        description = parts.slice(1, idx).join(' ').trim();
        dispstatus = parts[idx];
        textstatus = parts[idx + 1] || '';
        starttime = parts[idx + 2] || '';
        elapsedtime = parts[idx + 3] || '';
        pid = parts[idx + 4] || '';
      }
    }
    if (!dispstatus || !statusValues.includes(dispstatus)) continue;
    const isUp = dispstatus === 'GREEN' && textstatus === 'Running';
    processes.push({
      name,
      description,
      dispstatus,
      textstatus,
      starttime,
      elapsedtime,
      pid,
      status: isUp ? 'up' : 'down',
    });
  }
  return processes;
}

const HANA_DEFAULT_GET_PROCESS_LIST = 'sudo su - ndbadm -c "/usr/sap/NDB/HDB00/exe/sapcontrol -nr 00 -function GetProcessList"';

/** Lista processos HANA (GetProcessList). Clientes SQL: não aplicável. Clientes HANA: usa VM do cliente. */
router.get('/hana-processes', requirePermission('services:*'), async (req, res) => {
  const u = userStore.getById(req.user?.id);
  const clientKeyQuery = (req.query.clientKey && String(req.query.clientKey).trim()) || null;
  if (getEffectiveSqlClientKey(u, clientKeyQuery)) {
    return res.json({ processes: [], error: 'Não aplicável para ambiente SQL.' });
  }
  const hanaClientKey = getEffectiveHanaClientKey(u, clientKeyQuery);
  if (hanaClientKey) {
    const cmd = getHanaProcessListCommand(hanaClientKey) || HANA_DEFAULT_GET_PROCESS_LIST;
    if (!cmd) {
      return res.json({ processes: [], error: 'SSH do cliente HANA não configurado' });
    }
    if (hasClientCredentials(hanaClientKey)) {
      const creds = getClientCredentials(hanaClientKey);
      const conn = hanaConnFromCredentials(creds);
      if (!conn) return res.json({ processes: [], error: 'SSH do cliente HANA não configurado' });
      try {
        const { stdout, code, stderr } = await sshExecWithConfig(conn, cmd);
        const processes = parseHanaProcessList(stdout);
        if (processes.length > 0) return res.json({ processes });
        if (code !== 0) {
          const msg = [stderr, stdout].filter(Boolean).join(' ').trim() || 'Falha ao obter lista de processos';
          return res.json({ processes: [], error: msg });
        }
        return res.json({ processes: [] });
      } catch (e) {
        return res.json({ processes: [], error: e.message || 'Erro ao executar comando' });
      }
    }
    try {
      const { stdout, code, stderr } = await execHanaSsh(hanaClientKey, cmd);
      const processes = parseHanaProcessList(stdout);
      if (processes.length > 0) return res.json({ processes });
      if (code !== 0) {
        const msg = [stderr, stdout].filter(Boolean).join(' ').trim() || 'Falha ao obter lista de processos';
        return res.json({ processes: [], error: msg });
      }
      return res.json({ processes: [] });
    } catch (e) {
      return res.json({ processes: [], error: e.message || 'Erro ao executar comando no servidor' });
    }
  }
  if (!isSshConfigured()) {
    return res.json({ processes: [], error: 'SSH não configurado' });
  }
  try {
    const { stdout, code, stderr } = await sshExec(HANA_GET_PROCESS_LIST_CMD);
    const processes = parseHanaProcessList(stdout);
    if (processes.length > 0) {
      return res.json({ processes });
    }
    if (code !== 0) {
      const msg = [stderr, stdout].filter(Boolean).join(' ').trim() || 'Falha ao obter lista de processos';
      return res.json({ processes: [], error: msg });
    }
    if (stdout.length > 0) {
      return res.json({ processes: [], error: 'Nenhum processo reconhecido na saída. Verifique SSH_HANA_SAPCONTROL no .env.' });
    }
    return res.json({ processes: [] });
  } catch (e) {
    return res.json({ processes: [], error: e.message || 'Erro ao executar comando no servidor' });
  }
});

/** Health check: HANA (SUSE) ou serviços Windows por cliente SQL/Web (lista dinâmica). */
router.get('/health', requirePermission('services:*'), async (req, res) => {
  const u = userStore.getById(req.user?.id);
  const clientKeyQuery = (req.query.clientKey && String(req.query.clientKey).trim()) || null;
  const visibleProjects = u ? await getEnrichedVisibleProjects(u) : [];
  const uWithProjects = u ? { ...u, visibleProjects } : u;
  const sqlClientKey = getEffectiveSqlClientKey(uWithProjects, clientKeyQuery);
  const results = {};

  if (sqlClientKey) {
    const groups = getSqlServiceList(sqlClientKey);
    const connectionType = getSqlClientConnectionType(sqlClientKey);
    const useClientCreds = hasClientCredentials(sqlClientKey);
    const creds = useClientCreds ? getClientCredentials(sqlClientKey) : null;
    const isWeb = connectionType === 'web';
    if (isWeb && (!creds || !getWebConnectionConfigFromCredentials(creds))) {
      if (isWeb && !creds) console.warn('[services/health] Servidor web: credentials.enc não encontrado ou inválido para', sqlClientKey);
      else if (isWeb) console.warn('[services/health] Servidor web: SSH_WEB_HOST/SSH_WEB_USER/senha ausentes em credentials.enc para', sqlClientKey);
      for (const g of groups) results[g.id] = 'unconfigured';
      return res.json(results);
    }
    if (!isWeb && !useClientCreds && !isSqlConfigured()) {
      for (const g of groups) results[g.id] = 'unconfigured';
      return res.json(results);
    }
    const webConn = isWeb && creds ? getWebConnectionConfigFromCredentials(creds) : null;
    for (const g of groups) {
      const serviceIds = getSqlGroupServiceIds(sqlClientKey, g.id);
      let anyRunning = false;
      if (serviceIds.length === 0) {
        results[g.id] = 'unconfigured';
        continue;
      }
      if (webConn) {
        const batches = getSqlHealthGroupCommandBatches(serviceIds);
        try {
          for (const cmd of batches) {
            const out = await sshExecWithConfig(webConn, cmd);
            if ((out.stdout || '').toLowerCase().includes('running')) anyRunning = true;
          }
        } catch (err) {
          console.warn('[services/health] SSH servidor web falhou:', sqlClientKey, g.id, err.message);
          results[g.id] = 'error';
          continue;
        }
      } else {
        for (const sid of serviceIds) {
          try {
            const cmd = getSqlHealthCommand(sid);
            const out = useClientCreds && creds
              ? await sshExecSqlWithCredentials(creds, cmd)
              : await sshExecSql(cmd);
            if ((out.stdout || '').toLowerCase().includes('running')) anyRunning = true;
          } catch {
            // ignora falha de um serviço
          }
        }
      }
      results[g.id] = anyRunning ? 'active' : 'inactive';
    }
    return res.json(results);
  }

  const hanaClientKey = getEffectiveHanaClientKey(uWithProjects, clientKeyQuery);
  if (hanaClientKey) {
    const serviceList = getHanaServiceList(hanaClientKey);
    const windowsGroupIds = serviceList.filter((s) => getHanaWindowsServiceGroup(hanaClientKey, s.id)).map((s) => s.id);
    if (windowsGroupIds.length > 0) {
      const conn = getHanaConnectionConfig(hanaClientKey);
      if (!conn) {
        for (const id of windowsGroupIds) results[id] = 'unconfigured';
        return res.json(results);
      }
      const groupPromises = windowsGroupIds.map(async (gid) => {
        const names = getHanaWindowsServiceGroup(hanaClientKey, gid);
        if (!names?.length) return { gid, status: 'unconfigured' };
        const batches = getSqlHealthGroupCommandBatches(names);
        if (!batches.length) return { gid, status: 'inactive' };
        try {
          let anyRunning = false;
          for (const cmd of batches) {
            const out = await sshExecWithConfig(conn, cmd);
            if ((out && (out.stdout || '')).toLowerCase().includes('running')) anyRunning = true;
          }
          return { gid, status: anyRunning ? 'active' : 'inactive' };
        } catch (err) {
          console.warn('[services/health] HANA Windows', hanaClientKey, gid, err.message);
          return { gid, status: 'error' };
        }
      });
      const groupResults = await Promise.all(groupPromises);
      for (const { gid, status } of groupResults) results[gid] = status;
      return res.json(results);
    }
    const useCreds = hasClientCredentials(hanaClientKey);
    const conn = useCreds ? hanaConnFromCredentials(getClientCredentials(hanaClientKey)) : getHanaConnectionConfig(hanaClientKey);
    if (!conn) {
      results.hana = 'unconfigured';
      results.serviceLayer = 'unconfigured';
      results.sld = 'unconfigured';
      results.authentication = 'unconfigured';
      return res.json(results);
    }
    try {
      const entries = Object.entries(HEALTH_COMMANDS);
      const settled = await Promise.allSettled(
        entries.map(([key, cmd]) =>
          (useCreds ? sshExecWithConfig(conn, cmd) : execHanaSsh(hanaClientKey, cmd)).then((out) => ({ key, out }))
        )
      );
      entries.forEach(([key], i) => {
        const s = settled[i];
        if (s.status === 'fulfilled') {
          const stdout = (s.value.out && s.value.out.stdout != null) ? String(s.value.out.stdout) : '';
          const isActive = key === 'hana'
            ? stdout.toLowerCase().includes('hdbnameserver') || stdout.toLowerCase().includes('nameserver')
            : (stdout.trim() === 'active');
          results[key] = isActive ? 'active' : 'inactive';
        } else {
          console.warn('[services/health] HANA', hanaClientKey, key, s.reason?.message || s.reason);
          results[key] = 'error';
        }
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
    return res.json(results);
  }

  if (isSshConfigured()) {
    try {
      for (const [key, cmd] of Object.entries(HEALTH_COMMANDS)) {
        try {
          const { stdout } = await sshExec(cmd);
          const isActive = key === 'hana' ? stdout.includes('hdbnameserver') : (stdout.trim() === 'active');
          results[key] = isActive ? 'active' : 'inactive';
        } catch {
          results[key] = 'error';
        }
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  } else {
    results.hana = 'unconfigured';
    results.serviceLayer = 'unconfigured';
    results.sld = 'unconfigured';
    results.authentication = 'unconfigured';
  }
  if (isSqlConfigured()) {
    for (const [key, cmd] of Object.entries(HEALTH_COMMANDS_SQL)) {
      try {
        const { stdout } = await sshExecSql(cmd);
        const isActive = (stdout || '').toLowerCase().includes('running');
        results[key] = isActive ? 'active' : 'inactive';
      } catch {
        results[key] = 'error';
      }
    }
  } else {
    results['sql-server'] = 'unconfigured';
  }
  res.json(results);
});

router.get('/options', requirePermission('users:*'), (req, res) => {
  const serviceList = getServiceList();
  const executable = serviceList.filter((s) => s.action === 'executar').map((s) => ({ id: s.id, name: s.name }));
  res.json(executable);
});

router.post('/:serviceId/execute', requirePermission('services:*'), async (req, res) => {
  const { serviceId } = req.params;
  const u = userStore.getById(req.user?.id);
  const clientKeyBody = (req.body?.clientKey && String(req.body.clientKey).trim()) || null;
  const visibleProjects = u ? await getEnrichedVisibleProjects(u) : [];
  const uWithProjects = u ? { ...u, visibleProjects } : u;
  const sqlClientKey = getEffectiveSqlClientKey(uWithProjects, clientKeyBody);
  const hanaClientKey = getEffectiveHanaClientKey(uWithProjects, clientKeyBody);
  let serviceList = getServiceList();
  if (sqlClientKey) {
    const sqlList = getSqlServiceList(sqlClientKey);
    if (sqlList.some((x) => x.id === serviceId)) serviceList = sqlList;
  }
  if (hanaClientKey && !sqlClientKey) {
    const hanaList = getHanaServiceList(hanaClientKey);
    if (hanaList.some((x) => x.id === serviceId)) serviceList = hanaList;
  }
  const s = serviceList.find((x) => x.id === serviceId);
  if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });
  if (u?.role !== 'admin' && s.action === 'executar') {
    const allowed = u?.allowedServiceIds || [];
    const sqlAllowed = sqlClientKey && getSqlServiceList(sqlClientKey).some((x) => x.id === serviceId);
    const hanaAllowed = hanaClientKey && getHanaServiceList(hanaClientKey).some((x) => x.id === serviceId);
    if (!sqlAllowed && !hanaAllowed && !allowed.includes(serviceId)) {
      return res.status(403).json({ error: 'Sem permissão para executar este serviço SAP/HANA' });
    }
  }
  const isSqlGroup = sqlClientKey && getSqlGroupServiceIds(sqlClientKey, serviceId).length > 0;
  const isHanaService = COMMANDS[serviceId];
  const hanaWindowsGroupNames = hanaClientKey ? getHanaWindowsServiceGroup(hanaClientKey, serviceId) : null;
  const isHanaWindowsGroup = Array.isArray(hanaWindowsGroupNames) && hanaWindowsGroupNames.length > 0;
  const sqlConnectionType = sqlClientKey ? getSqlClientConnectionType(sqlClientKey) : 'sql';
  const isSqlWeb = isSqlGroup && sqlConnectionType === 'web';
  if (s.action === 'executar' && (isHanaService || isSqlGroup || isHanaWindowsGroup)) {
    const sqlUsesClientCreds = isSqlGroup && hasClientCredentials(sqlClientKey);
    if (isSqlGroup && !isSqlWeb && !sqlUsesClientCreds && !isSqlConfigured()) {
      return res.status(400).json({ error: 'SSH SQL não configurado. Configure SSH_SQL no .env ou credentials.enc do cliente.' });
    }
    if (isSqlWeb && (!sqlUsesClientCreds || !getWebConnectionConfigFromCredentials(getClientCredentials(sqlClientKey)))) {
      return res.status(400).json({ error: 'Servidor Web requer credentials.enc do cliente com SSH_WEB_HOST, SSH_WEB_USER e senha ou chave.' });
    }
    if ((isHanaService || isHanaWindowsGroup) && !sqlClientKey) {
      const hanaUsesClientCreds = hanaClientKey && hasClientCredentials(hanaClientKey);
      if (hanaClientKey) {
        if (!hanaUsesClientCreds && !isHanaClientConfigured(hanaClientKey)) {
          return res.status(400).json({ error: 'SSH do cliente HANA não configurado. Configure credentials.enc do cliente ou variáveis env.' });
        }
      } else if (!isSshConfigured() && !isHanaWindowsGroup) {
        return res.status(400).json({ error: 'SSH não configurado. Configure SSH_HOST e SSH_USER no .env.' });
      }
    }
    const performedBy = u ? `${u.name} (${u.email})` : req.user?.email || 'N/A';
    try {
      const start = Date.now();
      let result;
      if (isSqlGroup) {
        const serviceIds = getSqlGroupServiceIds(sqlClientKey, serviceId);
        const cmd = getSqlRestartGroupCommand(serviceIds);
        if (!cmd) return res.status(400).json({ error: 'Grupo sem serviços configurados' });
        const creds = sqlUsesClientCreds ? getClientCredentials(sqlClientKey) : null;
        if (isSqlWeb && creds) {
          const webConn = getWebConnectionConfigFromCredentials(creds);
          if (webConn) result = await sshExecWithConfig(webConn, cmd);
          else result = { code: 1, stdout: '', stderr: 'Configuração SSH Web indisponível' };
        } else {
          result = creds ? await sshExecSqlWithCredentials(creds, cmd) : await sshExecSql(cmd);
        }
      } else if (isHanaWindowsGroup && hanaClientKey) {
        const cmd = getSqlRestartGroupCommand(hanaWindowsGroupNames);
        if (!cmd) return res.status(400).json({ error: 'Grupo de serviços Windows sem nomes configurados' });
        const conn = getHanaConnectionConfig(hanaClientKey);
        if (!conn) return res.status(400).json({ error: 'SSH do cliente (ROLANDWEB) não configurado' });
        result = await sshExecWithConfig(conn, cmd);
      } else if (isHanaService && hanaClientKey) {
        if (hasClientCredentials(hanaClientKey)) {
          const conn = hanaConnFromCredentials(getClientCredentials(hanaClientKey));
          if (!conn) return res.status(400).json({ error: 'Configuração do cliente HANA indisponível' });
          result = await sshExecWithConfig(conn, COMMANDS[serviceId]);
        } else {
          result = await execHanaSsh(hanaClientKey, COMMANDS[serviceId]);
        }
      } else {
        result = await sshExec(COMMANDS[serviceId]);
      }
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const success = result.code === 0;
      const output = success ? result.stdout : result.stderr;
      let emailContext = {};
      if (isSqlGroup && sqlClientKey) {
        emailContext.clientDisplayName = getSqlClientDisplayName(sqlClientKey);
        const creds = sqlUsesClientCreds ? getClientCredentials(sqlClientKey) : null;
        if (isSqlWeb && creds) {
          emailContext.vmName = creds?.SSH_WEB_DISPLAY_NAME || creds?.SSH_WEB_HOST || 'Servidor Web';
        } else {
          emailContext.vmName = creds?.SSH_SQL_DISPLAY_NAME || creds?.SSH_SQL_HOST || process.env.SSH_SQL_DISPLAY_NAME || process.env.SSH_SQL_HOST || 'VM SQL';
        }
      } else if (hanaClientKey) {
        emailContext.clientDisplayName = getHanaClientDisplayName(hanaClientKey);
        const conn = hasClientCredentials(hanaClientKey)
          ? hanaConnFromCredentials(getClientCredentials(hanaClientKey))
          : getHanaConnectionConfig(hanaClientKey);
        emailContext.vmName = conn?.host || process.env.SSH_HOST || process.env.SUSE_HOST || 'VM SUSE';
      } else {
        emailContext.vmName = process.env.SSH_HOST || process.env.SUSE_HOST || 'VM padrão';
      }
      sendRestartNotification(serviceId, success, output, performedBy, emailContext);
      if (!success) {
        return res.status(502).json({
          error: result.stderr || 'Comando retornou código não zero',
          lastExecution: getServiceExecution(serviceId),
        });
      }
      setServiceExecution(serviceId, 'Success');
      logAction(req, 'service_restart', { serviceId, serviceName: s.name, duration: `${duration}s` });
      return res.json({
        ok: true,
        success: true,
        message: `Reiniciado em ${duration}s`,
        details: result.stdout,
        serviceId,
        lastExecution: getServiceExecution(serviceId),
      });
    } catch (e) {
      let emailContext = {};
      if (isSqlGroup && sqlClientKey) {
        emailContext.clientDisplayName = getSqlClientDisplayName(sqlClientKey);
        const creds = sqlUsesClientCreds ? getClientCredentials(sqlClientKey) : null;
        emailContext.vmName = creds?.SSH_SQL_DISPLAY_NAME || creds?.SSH_SQL_HOST || process.env.SSH_SQL_DISPLAY_NAME || process.env.SSH_SQL_HOST || 'VM SQL';
      } else if (hanaClientKey) {
        emailContext.clientDisplayName = getHanaClientDisplayName(hanaClientKey);
        const conn = hasClientCredentials(hanaClientKey) ? hanaConnFromCredentials(getClientCredentials(hanaClientKey)) : getHanaConnectionConfig(hanaClientKey);
        emailContext.vmName = conn?.host || process.env.SSH_HOST || process.env.SUSE_HOST || 'VM SUSE';
      } else {
        emailContext.vmName = process.env.SSH_HOST || process.env.SUSE_HOST || 'VM padrão';
      }
      sendRestartNotification(serviceId, false, e.message, performedBy, emailContext);
      return res.status(502).json({
        error: e.message || (isSqlGroup ? 'Erro ao executar no servidor SQL' : 'Erro ao executar no SUSE'),
        lastExecution: getServiceExecution(serviceId),
      });
    }
  }
  if (s.action === 'listar') {
    setServiceExecution(serviceId, 'Success');
    logAction(req, 'service_list', { serviceId, serviceName: s.name });
  } else if (s.action === 'executar' && !COMMANDS[serviceId] && !isSqlGroup) {
    setServiceExecution(serviceId, 'Success');
    logAction(req, 'service_execute', { serviceId, serviceName: s.name });
  }
  res.json({ ok: true, message: 'Execução iniciada', serviceId, lastExecution: getServiceExecution(serviceId) });
});

export default router;
