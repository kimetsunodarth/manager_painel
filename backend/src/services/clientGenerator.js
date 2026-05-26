/**
 * Gera arquivos de configuração para um novo cliente HANA + Control Center (adicionado pela página admin).
 */

import fs from 'fs';
import path from 'path';
import { getConfigDir } from '../appRoot.js';

const CONFIG_DIR = getConfigDir();
const HANA_CLIENTS_DIR = path.join(CONFIG_DIR, 'hana-clients');
const CONTROL_CENTER_DIR = path.join(CONFIG_DIR, 'control-center');
const REGISTRY_PATH = path.join(CONFIG_DIR, 'dynamic-clients-registry.json');

const SAFE_KEY_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Converte clientKey para prefixo em maiúsculas (ex.: meu-cliente -> MEU_CLIENTE). */
function envPrefix(clientKey) {
  return clientKey.toUpperCase().replace(/-/g, '_');
}

/**
 * Valida e normaliza os dados do novo cliente.
 * @returns {{ ok: boolean, error?: string, clientKey?: string, ... }}
 */
export function validateNewClient(body) {
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  let clientKey = typeof body.clientKey === 'string' ? body.clientKey.trim().toLowerCase() : '';
  const jumpHost = typeof body.jumpHost === 'string' ? body.jumpHost.trim() : '';
  const jumpUser = typeof body.jumpUser === 'string' ? body.jumpUser.trim() : '';
  const jumpPassword = typeof body.jumpPassword === 'string' ? body.jumpPassword : '';
  const jumpPort = body.jumpPort != null ? Number(body.jumpPort) : 22;
  const hanaHost = typeof body.hanaHost === 'string' ? body.hanaHost.trim() : '';
  const hanaUser = typeof body.hanaUser === 'string' ? body.hanaUser.trim() : '';
  const hanaPassword = typeof body.hanaPassword === 'string' ? body.hanaPassword : '';
  const hanaPort = body.hanaPort != null ? Number(body.hanaPort) : 22;
  const controlCenterUrl = typeof body.controlCenterUrl === 'string' ? body.controlCenterUrl.trim() : '';
  const controlCenterUser = typeof body.controlCenterUser === 'string' ? body.controlCenterUser.trim() : '';
  const controlCenterPassword = typeof body.controlCenterPassword === 'string' ? body.controlCenterPassword : '';

  if (!displayName || displayName.length > 100) return { ok: false, error: 'Nome do cliente é obrigatório (máx. 100 caracteres).' };
  if (!clientKey) clientKey = displayName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!SAFE_KEY_REGEX.test(clientKey)) return { ok: false, error: 'Chave do cliente deve conter apenas letras minúsculas, números e hífens (ex.: meu-cliente).' };
  if (clientKey.length > 50) return { ok: false, error: 'Chave do cliente muito longa.' };
  if (!jumpHost || !jumpUser || !jumpPassword) return { ok: false, error: 'Jump (servidor web): host, usuário e senha são obrigatórios.' };
  if (!hanaHost || !hanaUser || !hanaPassword) return { ok: false, error: 'HANA (destino): host, usuário e senha são obrigatórios.' };
  if (controlCenterUrl && (!controlCenterUser || !controlCenterPassword)) return { ok: false, error: 'Se informar URL do Control Center, informe também usuário e senha.' };

  const hanaServices = parseServicesList(body.hanaServices);
  const webServices = parseServicesList(body.webServices);
  const windowsServiceGroups = parseWindowsServiceGroups(body.windowsServiceGroupsText, body.windowsServiceGroups);

  return {
    ok: true,
    clientKey,
    displayName,
    jumpHost,
    jumpUser,
    jumpPassword,
    jumpPort: jumpPort || 22,
    hanaHost,
    hanaUser,
    hanaPassword,
    hanaPort: hanaPort || 22,
    controlCenterUrl: controlCenterUrl || null,
    controlCenterUser: controlCenterUrl ? controlCenterUser : null,
    controlCenterPassword: controlCenterUrl ? controlCenterPassword : null,
    hanaServices: hanaServices.length > 0 ? hanaServices : null,
    webServices: webServices.length > 0 ? webServices : null,
    windowsServiceGroups: windowsServiceGroups && Object.keys(windowsServiceGroups).length > 0 ? windowsServiceGroups : null,
  };
}

const DEFAULT_HANA_SERVICES = [
  { id: 'serviceLayer', name: 'Reiniciar Service Layer', action: 'executar' },
  { id: 'sld', name: 'Reiniciar SLD', action: 'executar' },
  { id: 'hana', name: 'Reiniciar HANA (Cuidado)', action: 'executar' },
  { id: 'authentication', name: 'Reiniciar Authentication', action: 'executar' },
  { id: 'all', name: 'Reiniciar TUDO', action: 'executar' },
];

const DEFAULT_WEB_SERVICES = [
  { id: 'invent-dfe', name: 'Invent DFe', action: 'executar' },
  { id: 'invent-nfe', name: 'Invent NFe', action: 'executar' },
  { id: 'invent-bankplus', name: 'Invent BankPlus', action: 'executar' },
  { id: 'sap-b1if', name: 'SAP B1iF', action: 'executar' },
];

const ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parseia texto "id|Nome do serviço" por linha. Retorna array de { id, name, action }. */
function parseServicesList(text) {
  if (text == null || typeof text !== 'string') return [];
  const lines = text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const sep = line.includes('|') ? '|' : (line.includes('\t') ? '\t' : ',');
    const idx = line.indexOf(sep);
    const id = (idx === -1 ? line : line.slice(0, idx)).trim().toLowerCase().replace(/\s+/g, '-');
    const name = (idx === -1 ? line : line.slice(idx + 1)).trim();
    if (!id || !name) continue;
    if (!ID_REGEX.test(id)) continue;
    out.push({ id, name, action: 'executar' });
  }
  return out;
}

/** Parseia texto "id=NomeServ1,NomeServ2" por linha ou objeto windowsServiceGroups. */
function parseWindowsServiceGroups(text, obj) {
  if (obj != null && typeof obj === 'object' && !Array.isArray(obj)) {
    const result = {};
    for (const [sid, arr] of Object.entries(obj)) {
      if (Array.isArray(arr)) {
        const names = arr.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim());
        if (names.length) result[sid] = names;
      }
    }
    if (Object.keys(result).length) return result;
  }
  if (text == null || typeof text !== 'string') return null;
  const lines = text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result = {};
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const id = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (!id) continue;
    const names = value.split(/[,;]/).map((n) => n.trim()).filter(Boolean);
    if (names.length) result[id] = names;
  }
  return Object.keys(result).length ? result : null;
}

/**
 * Gera os arquivos de configuração e atualiza o registry.
 * Não escreve senhas no .env (retorna snippet para o usuário colar).
 */
export function generateClientConfig(data) {
  const { clientKey, displayName, jumpHost, jumpUser, jumpPassword, jumpPort, hanaHost, hanaUser, hanaPassword, hanaPort, controlCenterUrl, controlCenterUser, controlCenterPassword, hanaServices, webServices, windowsServiceGroups } = data;
  const P = envPrefix(clientKey);

  const hanaServicesList = Array.isArray(hanaServices) && hanaServices.length > 0 ? hanaServices : DEFAULT_HANA_SERVICES;
  const webServicesList = Array.isArray(webServices) && webServices.length > 0 ? webServices : DEFAULT_WEB_SERVICES;
  const wsGroups = windowsServiceGroups && typeof windowsServiceGroups === 'object' ? windowsServiceGroups : {};

  const hanaJson = {
    clientKey,
    displayName: `${displayName.toUpperCase().replace(/\s+/g, '')}HDB`,
    comment: `${displayName}: jump (servidor web) → HANA. Credenciais via .env.`,
    envHostKey: `SSH_HANA_${P}_HOST`,
    envUserKey: `SSH_HANA_${P}_USER`,
    envPasswordKey: `SSH_HANA_${P}_PASSWORD`,
    envPortKey: `SSH_HANA_${P}_PORT`,
    envPrivateKeyPathKey: `SSH_HANA_${P}_PRIVATE_KEY_PATH`,
    envJumpHostKey: `SSH_HANA_${P}_JUMP_HOST`,
    envJumpUserKey: `SSH_HANA_${P}_JUMP_USER`,
    envJumpPasswordKey: `SSH_HANA_${P}_JUMP_PASSWORD`,
    envJumpPortKey: `SSH_HANA_${P}_JUMP_PORT`,
    hanaSid: 'NDB',
    hanaSapcontrol: '/usr/sap/NDB/HDB00/exe/sapcontrol -nr 00',
    services: hanaServicesList,
  };

  const webJson = {
    clientKey: `${clientKey}-web`,
    displayName: `${displayName.toUpperCase().replace(/\s+/g, '')}WEB`,
    comment: `Servidor web ${displayName}. Ativar Support via control-center (${clientKey}).`,
    envHostKey: `SSH_HANA_${P}_JUMP_HOST`,
    envUserKey: `SSH_HANA_${P}_JUMP_USER`,
    envPasswordKey: `SSH_HANA_${P}_JUMP_PASSWORD`,
    envPortKey: `SSH_HANA_${P}_JUMP_PORT`,
    hanaSid: 'NDB',
    hanaSapcontrol: '/usr/sap/NDB/HDB00/exe/sapcontrol -nr 00',
    services: webServicesList,
    windowsServiceGroups: wsGroups,
  };

  const nameForMatch = displayName.toLowerCase().replace(/\s+/g, '');
  /** Perfil Huawei existente no config (ex.: MAXMOHR); quando informado, evita criar perfil novo e usa o já existente. */
  const perfilPattern = (data.huaweiPerfil && String(data.huaweiPerfil).trim())
    ? String(data.huaweiPerfil).trim()
    : displayName.toUpperCase().replace(/\s+/g, '_');

  const hanaMainPath = path.join(HANA_CLIENTS_DIR, `${clientKey}.json`);
  const hanaWebPath = path.join(HANA_CLIENTS_DIR, `${clientKey}-web.json`);
  const ccPath = controlCenterUrl ? path.join(CONTROL_CENTER_DIR, `${clientKey}.json`) : null;
  if (fs.existsSync(hanaMainPath) || fs.existsSync(hanaWebPath) || (ccPath && fs.existsSync(ccPath))) {
    return { ok: false, error: 'Já existem arquivos para este cliente. Use outra chave ou remova os arquivos manualmente.' };
  }

  fs.mkdirSync(HANA_CLIENTS_DIR, { recursive: true });
  fs.mkdirSync(CONTROL_CENTER_DIR, { recursive: true });

  fs.writeFileSync(hanaMainPath, JSON.stringify(hanaJson, null, 2), 'utf8');
  fs.writeFileSync(path.join(HANA_CLIENTS_DIR, `${clientKey}-web.json`), JSON.stringify(webJson, null, 2), 'utf8');

  let controlCenterJson = null;
  if (controlCenterUrl) {
    const baseUrl = controlCenterUrl.replace(/\/$/, '') + '/';
    controlCenterJson = {
      clientKey,
      displayName,
      comment: `SAP Control Center (SLD) - Ativar Support User. Credenciais via env.`,
      baseUrl,
      envUserKey: `CONTROL_CENTER_${P}_USER`,
      envPasswordKey: `CONTROL_CENTER_${P}_PASSWORD`,
      associatedHanaKeys: [clientKey, `${clientKey}-web`],
    };
    fs.writeFileSync(ccPath, JSON.stringify(controlCenterJson, null, 2), 'utf8');
  }

  let registry = [];
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    registry = JSON.parse(raw);
    if (!Array.isArray(registry)) registry = [];
  } catch {
    registry = [];
  }
  if (registry.some((e) => e.clientKey === clientKey)) {
    return { ok: false, error: 'Cliente com essa chave já existe no registry.' };
  }
  registry.push({
    clientKey,
    displayName,
    nameContains: nameForMatch,
    perfilPattern,
    hasControlCenter: !!controlCenterUrl,
  });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');

  const envKeysWritten = [
    `SSH_HANA_${P}_JUMP_HOST`,
    `SSH_HANA_${P}_JUMP_USER`,
    `SSH_HANA_${P}_JUMP_PASSWORD`,
    `SSH_HANA_${P}_JUMP_PORT`,
    `SSH_HANA_${P}_HOST`,
    `SSH_HANA_${P}_USER`,
    `SSH_HANA_${P}_PASSWORD`,
    `SSH_HANA_${P}_PORT`,
  ];
  if (controlCenterUrl) {
    envKeysWritten.push(`CONTROL_CENTER_${P}_USER`, `CONTROL_CENTER_${P}_PASSWORD`);
  }

  const envSnippet = [
    `# ${displayName}`,
    `SSH_HANA_${P}_JUMP_HOST=${jumpHost}`,
    `SSH_HANA_${P}_JUMP_USER=${jumpUser}`,
    `SSH_HANA_${P}_JUMP_PASSWORD=${jumpPassword.includes('"') || jumpPassword.includes('#') ? `"${jumpPassword.replace(/"/g, '\\"')}"` : jumpPassword}`,
    `SSH_HANA_${P}_JUMP_PORT=${jumpPort}`,
    `SSH_HANA_${P}_HOST=${hanaHost}`,
    `SSH_HANA_${P}_USER=${hanaUser}`,
    `SSH_HANA_${P}_PASSWORD=${hanaPassword.includes('"') || hanaPassword.includes('#') ? `"${hanaPassword.replace(/"/g, '\\"')}"` : hanaPassword}`,
    `SSH_HANA_${P}_PORT=${hanaPort}`,
  ];
  if (controlCenterUrl) {
    envSnippet.push(`CONTROL_CENTER_${P}_USER=${controlCenterUser}`);
    envSnippet.push(`CONTROL_CENTER_${P}_PASSWORD=${controlCenterPassword.includes('"') || controlCenterPassword.includes('#') ? `"${controlCenterPassword.replace(/"/g, '\\"')}"` : controlCenterPassword}`);
  }
  envSnippet.push('');

  return {
    ok: true,
    clientKey,
    displayName,
    filesCreated: [
      `config/hana-clients/${clientKey}.json`,
      `config/hana-clients/${clientKey}-web.json`,
      ...(controlCenterUrl ? [`config/control-center/${clientKey}.json`] : []),
    ],
    envSnippet: envSnippet.join('\n'),
    envKeysWritten,
    message: 'Arquivos criados. Copie o bloco "envSnippet" para o .env do backend e reinicie o backend. Atualize também visibleProjects dos usuários (nome ou perfil que contenha "' + nameForMatch + '") para que vejam este cliente.',
  };
}

/** Carrega o registry de clientes dinâmicos. */
export function loadDynamicRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
