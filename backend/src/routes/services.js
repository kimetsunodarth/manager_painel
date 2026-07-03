import { readFileSync, existsSync } from 'fs';
import { Router } from 'express';

import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { getServiceExecution, setServiceExecution, userStore } from '../data/store.js';
import { logAction } from '../middleware/auditLog.js';
import { getServiceList } from '../config/sapServices.js';
import { getSqlClientKey, getSqlClientKeysForUser, getSqlServiceList, getSqlClientDisplayName, getSqlGroupServiceIds, getSqlClientConnectionType } from '../config/sqlClients.js';
import { getHanaClientKey, getHanaClientKeysForUser, getHanaClientDisplayName, getHanaConnectionConfig, getHanaJumpConfig, getHanaProcessListCommand, getHanaServiceList, getHanaServiceUnitName, getHanaWindowsServiceGroup, isHanaClientConfigured } from '../config/hanaClients.js';
import { getClientCredentials, hasClientCredentials } from '../config/clientCredentials.js';
import { sshExec, sshExecSql, sshExecSqlWithCredentials, sshExecWithConfig, sshExecWithConfigViaJump, getWebConnectionConfigFromCredentials, COMMANDS, HEALTH_COMMANDS, HEALTH_COMMANDS_SQL, getSqlHealthCommand, getSqlHealthGroupCommandBatches, getSqlRestartGroupCommand, isSshConfigured, isSqlConfigured, HANA_GET_PROCESS_LIST_CMD } from '../services/sshService.js';
import { sendRestartNotification, isEmailConfigured } from '../services/emailService.js';
import { getEnrichedVisibleProjects } from './huawei.js';
import { normalizeAllowedServiceIds, normalizeServiceId } from '../utils/servicePermissions.js';

const router = Router();
router.use(authMiddleware);

/** Retorna o clientKey SQL efetivo: query > preferência do usuário > ordem dos visibleProjects. */
function getEffectiveSqlClientKey(u, queryClientKey) {
  const allowed = getSqlClientKeysForUser(u);
  if (!allowed.length) return null;
  
  // 1) Prioridade para o que o usuário explicitamente selecionou no dropdown (query)
  if (queryClientKey && allowed.includes(queryClientKey)) return queryClientKey;
  
  // 2) Segunda prioridade para a preferência do usuário (se não for admin ignorando via query)
  const preferred = u?.preferredServiceClientKey && allowed.includes(u.preferredServiceClientKey) ? u.preferredServiceClientKey : null;
  if (preferred) return preferred;
  
  // 3) Fallback para o primeiro disponível
  return getSqlClientKey(u);
}

/** Retorna o clientKey HANA efetivo: query > preferência do usuário > ordem dos visibleProjects. */
function getEffectiveHanaClientKey(u, queryClientKey) {
  const allowed = getHanaClientKeysForUser(u);
  if (!allowed.length) return null;
  
  // 1) Prioridade para o que o usuário explicitamente selecionou no dropdown (query)
  if (queryClientKey && allowed.includes(queryClientKey)) return queryClientKey;
  
  // 2) Segunda prioridade para a preferência do usuário (se não for admin ignorando via query)
  const preferred = u?.preferredServiceClientKey && allowed.includes(u.preferredServiceClientKey) ? u.preferredServiceClientKey : null;
  if (preferred) return preferred;
  
  // 3) Fallback para o primeiro disponível
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

/** Retorna o clientKey efetivo (SQL ou HANA): query > preferência do usuário > ordem dos visibleProjects. */
function getEffectiveClientKey(u, clientKeyQuery) {
  const sqlKeys = getSqlClientKeysForUser(u);
  const hanaKeys = getHanaClientKeysForUser(u);

  // 1) Prioridade para o que o usuário explicitamente selecionou no dropdown (URL query)
  if (clientKeyQuery) {
    if (sqlKeys.includes(clientKeyQuery)) return { clientKey: clientKeyQuery, type: 'sql' };
    if (hanaKeys.includes(clientKeyQuery)) return { clientKey: clientKeyQuery, type: 'hana' };
  }

  // 2) Segunda prioridade para a preferência do usuário
  const preferred = u?.preferredServiceClientKey || null;
  if (preferred) {
    if (sqlKeys.includes(preferred)) return { clientKey: preferred, type: 'sql' };
    if (hanaKeys.includes(preferred)) return { clientKey: preferred, type: 'hana' };
  }

  // 3) Fallback para disponiveis
  if (sqlKeys.length) return { clientKey: getSqlClientKey(u), type: 'sql' };
  if (hanaKeys.length) return { clientKey: getHanaClientKey(u), type: 'hana' };
  return null;
}

function getServerKind(clientKey, fallbackType = null) {
  if (String(clientKey || '').toLowerCase().endsWith('-web')) return 'web';
  if (fallbackType === 'hana') return 'hana';
  return 'database';
}

function formatServerLabel(displayName, kind) {
  const clean = String(displayName || '').trim();
  if (!clean) return kind === 'web' ? 'Servidor Web' : kind === 'hana' ? 'Banco / HANA' : 'Banco';
  const suffix = kind === 'web' ? 'Servidor Web' : 'Banco / HANA';
  return `${clean} • ${suffix}`;
}

const DEFAULT_HANA_SERVICE_UNITS = {
  serviceLayer: (process.env.SSH_SERVICE_LAYER || 'b1s').trim(),
  sld: (process.env.SSH_SERVICE_SLD || 'sapb1servertools.service').trim(),
  authentication: (process.env.SSH_SERVICE_AUTHENTICATION || 'sapb1servertools-authentication.service').trim(),
};

function escapeBashSingle(value) {
  return String(value || '').replace(/'/g, `'\\''`);
}

function getHanaServiceUnitCandidates(clientKey, serviceId) {
  const configured = getHanaServiceUnitName(clientKey, serviceId);
  const base = (configured || DEFAULT_HANA_SERVICE_UNITS[serviceId] || '').trim();
  if (!base) return [];
  const candidates = [base];
  if (base.endsWith('.service')) candidates.push(base.replace(/\.service$/i, ''));
  else candidates.push(`${base}.service`);
  return [...new Set(candidates.filter(Boolean))];
}

function getHanaPreferredServiceUnit(clientKey, serviceId) {
  const configured = getHanaServiceUnitName(clientKey, serviceId);
  const base = (configured || DEFAULT_HANA_SERVICE_UNITS[serviceId] || '').trim();
  return base || null;
}

function buildHanaHealthCommand(clientKey, serviceId) {
  if (serviceId === 'hana') return `sudo su - ndbadm -c "HDB info"`;
  const preferredUnit = getHanaPreferredServiceUnit(clientKey, serviceId);
  if (preferredUnit) {
    return `sudo systemctl is-active '${escapeBashSingle(preferredUnit)}'`;
  }
  const candidates = getHanaServiceUnitCandidates(clientKey, serviceId);
  if (!candidates.length) return null;
  const quoted = candidates.map((candidate) => `'${escapeBashSingle(candidate)}'`).join(' ');
  return `sudo bash -lc 'for svc in ${quoted}; do if systemctl status "$svc" >/dev/null 2>&1; then systemctl is-active "$svc"; exit $?; fi; done; echo not-found; exit 0'`;
}

function buildHanaRestartCommand(clientKey, serviceId) {
  if (serviceId === 'hana') return `sudo su - ndbadm -c "HDB restart"`;
  if (serviceId === 'all') {
    const layer = buildHanaRestartCommand(clientKey, 'serviceLayer');
    const sld = buildHanaRestartCommand(clientKey, 'sld');
    const auth = buildHanaRestartCommand(clientKey, 'authentication');
    return [buildHanaRestartCommand(clientKey, 'hana'), layer, sld, auth].filter(Boolean).join(' && ');
  }
  const preferredUnit = getHanaPreferredServiceUnit(clientKey, serviceId);
  if (preferredUnit) {
    return `sudo systemctl restart '${escapeBashSingle(preferredUnit)}'`;
  }
  const candidates = getHanaServiceUnitCandidates(clientKey, serviceId);
  if (!candidates.length) return null;
  const quoted = candidates.map((candidate) => `'${escapeBashSingle(candidate)}'`).join(' ');
  return `sudo bash -lc 'for svc in ${quoted}; do if systemctl status "$svc" >/dev/null 2>&1; then systemctl restart "$svc"; exit $?; fi; done; echo "service-unit-not-found"; exit 1'`;
}

function getScopedProjectFromRequest(source) {
  const projectId = source?.projectId ? String(source.projectId).trim() : '';
  const projectName = source?.projectName ? String(source.projectName).trim() : '';
  const perfil = source?.perfil ? String(source.perfil).trim() : '';
  const region = source?.region ? String(source.region).trim() : '';
  const displayPerfil = source?.displayPerfil ? String(source.displayPerfil).trim() : '';
  if (!projectId && !projectName && !perfil) return null;
  return {
    id: projectId || '',
    name: projectName || projectId || '',
    perfil: perfil || null,
    region: region || null,
    displayPerfil: displayPerfil || null,
  };
}

async function getRequestScopedUser(u, req, source = req.query) {
  const visibleProjects = u ? await getEnrichedVisibleProjects(u) : [];
  const scopedProject = getScopedProjectFromRequest(source);
  if (!u) return u;
  if (!scopedProject) return { ...u, visibleProjects };
  return { ...u, visibleProjects: [scopedProject] };
}

router.get('/', async (req, res) => {
  try {
    const u = userStore.getById(req.user?.id);
    const clientKeyQuery = (req.query.clientKey && String(req.query.clientKey).trim()) || null;
    const uWithProjects = await getRequestScopedUser(u, req, req.query);

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
      const selectedServerKind = getServerKind(effective.clientKey, effective.type);
      const preferredKey = u?.preferredServiceClientKey;
      const servers = [];

      for (const k of sqlKeys) {
        if (u?.role !== 'admin' && preferredKey && k !== preferredKey && !k.startsWith(preferredKey)) continue;
        const dn = getSqlClientDisplayName(k);
        servers.push({ clientKey: k, displayName: dn, kind: getServerKind(k, 'sql') });
      }
      for (const k of hanaKeys) {
        if (u?.role !== 'admin' && preferredKey && k !== preferredKey && !k.startsWith(preferredKey)) continue;
        const dn = getHanaClientDisplayName(k);
        servers.push({ clientKey: k, displayName: dn, kind: getServerKind(k, 'hana') });
      }

      const labeledServers = servers.map((s) => ({
        ...s,
        displayName: formatServerLabel(s.displayName, s.kind),
      }));
      const payload = {
        list,
        mode: effective.type,
        displayName,
        clientKey: effective.clientKey,
        selectedServerLabel: formatServerLabel(displayName, selectedServerKind),
        selectedServerKind,
      };
      if (labeledServers.length > 1) payload.availableServers = labeledServers;
      return res.json(payload);
    }

    if (u?.role !== 'admin' && !getEffectiveClientKey(uWithProjects, clientKeyQuery)) {
      const allowed = normalizeAllowedServiceIds(u?.allowedServiceIds);
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
      const allowed = normalizeAllowedServiceIds(u?.allowedServiceIds);
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
    console.error('[test-email] SMTP error:', e.message);
    return res.status(502).json({ ok: false, sent: false, error: 'Serviço de e-mail temporariamente indisponível' });
  }
});


/** Nome da VM de banco conectada (para exibir no front). Usa visibleProjects enriquecidos para resolver cliente (ex.: ROLANDWEB). */
router.get('/connection-info', requirePermission('services:*'), async (req, res) => {
  const u = userStore.getById(req.user?.id);
  const clientKeyQuery = (req.query.clientKey && String(req.query.clientKey).trim()) || null;
  const uWithProjects = await getRequestScopedUser(u, req, req.query);
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
      let vmDisplayName = creds?.SSH_SQL_DISPLAY_NAME || displayName;
      
      // Ajuste específico ROLAND conforme pedido do usuário (Point 1)
      if (sqlClientKey === 'roland' && !creds?.SSH_SQL_DISPLAY_NAME) vmDisplayName = 'ROLANDHD';
      if (sqlClientKey === 'roland-web' && !creds?.SSH_SQL_DISPLAY_NAME) vmDisplayName = 'ROLANDWEB';

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


/** Teste de conexão SSH. Usa projetos enriquecidos para resolver cliente. Aceita body.clientKey (ex.: roland, roland-web). */
router.post('/test-connection', requirePermission('services:*'), async (req, res) => {
  const u = userStore.getById(req.user?.id);
  const clientKeyBody = (req.body?.clientKey && String(req.body.clientKey).trim()) || null;
  const uWithProjects = await getRequestScopedUser(u, req, req.body);
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
  const uWithProjects = await getRequestScopedUser(u, req, req.query);
  if (getEffectiveSqlClientKey(uWithProjects, clientKeyQuery)) {
    return res.json({ processes: [], error: 'Não aplicável para ambiente SQL.' });
  }
  const hanaClientKey = getEffectiveHanaClientKey(uWithProjects, clientKeyQuery);
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
  const uWithProjects = await getRequestScopedUser(u, req, req.query);
  const sqlClientKey = getEffectiveSqlClientKey(uWithProjects, clientKeyQuery);
  const results = {};

  if (sqlClientKey) {
    const groups = getSqlServiceList(sqlClientKey);
    for (const group of groups) results[group.id] = 'error';
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
    for (const service of serviceList) {
      if (service?.id && service.id !== 'all') results[service.id] = 'error';
    }
    const windowsGroupIds = serviceList.filter((s) => getHanaWindowsServiceGroup(hanaClientKey, s.id)).map((s) => s.id);
    if (windowsGroupIds.length > 0) {
      const conn = hasClientCredentials(hanaClientKey)
        ? hanaConnFromCredentials(getClientCredentials(hanaClientKey))
        : getHanaConnectionConfig(hanaClientKey);
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
      const entries = Object.entries(results).filter(([key]) => key !== 'all').map(([key]) => [key, buildHanaHealthCommand(hanaClientKey, key)]);
      const settled = await Promise.allSettled(
        entries.map(([key, cmd]) =>
          !cmd
            ? Promise.resolve({ key, out: { stdout: 'not-configured' } })
            :
          (useCreds ? sshExecWithConfig(conn, cmd) : execHanaSsh(hanaClientKey, cmd)).then((out) => ({ key, out }))
        )
      );
      entries.forEach(([key], i) => {
        const s = settled[i];
        if (s.status === 'fulfilled') {
          const stdout = (s.value.out && s.value.out.stdout != null) ? String(s.value.out.stdout) : '';
          const stdoutLower = stdout.toLowerCase();
          const stdoutTrim = stdout.trim();
          const isActive = key === 'hana'
            ? stdoutLower.includes('hdbnameserver') || stdoutLower.includes('nameserver')
            : /\b(active|running|activating|reloading|online)\b/.test(stdoutLower) && !/\b(inactive|deactivating|dead|failed)\b/.test(stdoutLower);
          results[key] = isActive ? 'active' : 'inactive';
          if (!isActive && stdoutTrim && stdoutTrim !== 'inactive') {
            console.warn(`[services/health] ${hanaClientKey} ${key} returned unexpected: "${stdoutTrim}"`);
          }
        } else {
          console.warn(`[services/health] HANA ${hanaClientKey} ${key} failure: ${s.reason?.message || s.reason}. Used host: ${conn?.host}:${conn?.port || 22}, User: ${conn?.username}`);
          results[key] = 'error';
        }
      });
    } catch (e) {
      console.error(`[services/health] Error in HANA ${hanaClientKey} loop:`, e.message);
      return res.status(500).json({ error: e.message });
    }
    return res.json(results);
  }

  if (isSshConfigured()) {
    try {
      for (const [key, cmd] of Object.entries(HEALTH_COMMANDS)) {
        try {
          const { stdout } = await sshExec(cmd);
          const stdoutLower = (stdout || '').toLowerCase();
          const isActive = key === 'hana' ? stdout.includes('hdbnameserver') : /\b(active|running|activating|reloading|online)\b/.test(stdoutLower) && !/\b(inactive|deactivating|dead|failed)\b/.test(stdoutLower);
          results[key] = isActive ? 'active' : 'inactive';
        } catch (e) {
          console.warn(`[services/health] Default SSH ${key} failure:`, e.message);
          results[key] = 'error';
        }
      }
    } catch (e) {
      console.error('[services/health] Error in Default SSH loop:', e.message);
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
  const rawServiceId = String(req.params.serviceId || '').trim();
  const serviceId = normalizeServiceId(rawServiceId);
  const u = userStore.getById(req.user?.id);
  const clientKeyBody = (req.body?.clientKey && String(req.body.clientKey).trim()) || null;
  const uWithProjects = await getRequestScopedUser(u, req, req.body);
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
  const s = serviceList.find((x) => normalizeServiceId(x.id) === serviceId);
  if (!s) return res.status(404).json({ error: 'Serviço não encontrado' });
  if (u?.role !== 'admin' && s.action === 'executar') {
    const allowed = normalizeAllowedServiceIds(u?.allowedServiceIds);
    // Default-deny para clientes: só executa serviços explicitamente atribuídos.
    if (u?.role === 'client') {
      if (!allowed.includes(serviceId)) {
        return res.status(403).json({ error: 'Sem permissão para executar este serviço' });
      }
    } else {
      const sqlAllowed = sqlClientKey && getSqlServiceList(sqlClientKey).some((x) => x.id === serviceId);
      const hanaAllowed = hanaClientKey && getHanaServiceList(hanaClientKey).some((x) => x.id === serviceId);
      if (!sqlAllowed && !hanaAllowed && !allowed.includes(serviceId)) {
        return res.status(403).json({ error: 'Sem permissão para executar este serviço SAP/HANA' });
      }
    }
  }
  const isSqlGroup = sqlClientKey && getSqlGroupServiceIds(sqlClientKey, serviceId).length > 0;
  const hanaCommand = hanaClientKey && !sqlClientKey ? buildHanaRestartCommand(hanaClientKey, serviceId) : null;
  const isHanaService = !!hanaCommand || (!sqlClientKey && !!COMMANDS[serviceId]);
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
        const conn = hasClientCredentials(hanaClientKey)
          ? hanaConnFromCredentials(getClientCredentials(hanaClientKey))
          : getHanaConnectionConfig(hanaClientKey);
        if (!conn) return res.status(400).json({ error: 'SSH do cliente (ROLANDWEB) não configurado' });
        result = await sshExecWithConfig(conn, cmd);
      } else if (isHanaService && hanaClientKey) {
        const restartCommand = hanaCommand || COMMANDS[serviceId];
        if (!restartCommand) return res.status(400).json({ error: 'Comando HANA não configurado para este serviço' });
        if (process.env.DEBUG_SSH) console.log('[services/execute] Iniciando comando SSH para HANA [%s]: %s', hanaClientKey, restartCommand);
        if (hasClientCredentials(hanaClientKey)) {
          const conn = hanaConnFromCredentials(getClientCredentials(hanaClientKey));
          if (!conn) return res.status(400).json({ error: 'Configuração do cliente HANA indisponível' });
          result = await sshExecWithConfig(conn, restartCommand);
        } else {
          result = await execHanaSsh(hanaClientKey, restartCommand);
        }
      } else {
        if (process.env.DEBUG_SSH) console.log('[services/execute] Iniciando comando SSH em VM padrao:', COMMANDS[serviceId]);
        result = await sshExec(COMMANDS[serviceId]);
      }
      if (process.env.DEBUG_SSH) console.log('[services/execute] Resultado SSH:', result.code, 'stdout:', result.stdout, 'stderr:', result.stderr);
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
