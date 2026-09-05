/**
 * Carregador de configuração – mesmo conceito do CBR e tags:
 * Prioridade 1: config.enc criptografado (chave em .encryption_key)
 * Prioridade 2: .env em texto plano
 *
 * Perfis (uma conta por perfil, como no CBR/tags):
 *   PROFILENAME_ACCESS_KEY, PROFILENAME_SECRET_KEY, PROFILENAME_PROJECT_ID, PROFILENAME_REGION
 * Para herdar credenciais de outro perfil (ex.: mesma conta, outra região):
 *   PROFILENAME_USE_PROFILE=OUTRO_PERFIL, PROFILENAME_REGION=sa-brazil-1
 * Listagem: todos os projetos de cada conta são listados via IAM (busca direta no provedor).
 *
 * Perfis sugeridos pela descoberta (ex.: ANANIMCLOUD_ANANIM_CLOUD) não precisam estar no .env:
 * se o perfil não tiver credenciais, resolve para a conta master da descoberta (ex.: ANANIMCLOUD_MASTER).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Fernet } from 'fernet-nodejs';

const WORK_DIR = process.cwd();
const KEY_FILE_NAMES = ['.encryption_key', 'key.bin'];
function resolveKeyPath() {
  for (const name of KEY_FILE_NAMES) {
    const p = join(WORK_DIR, name);
    if (existsSync(p)) return p;
  }
  return join(WORK_DIR, '.encryption_key');
}
const CONFIG_ENC_PATH = join(WORK_DIR, 'config.enc');

let _config = null;

/** Prefixo do perfil sugerido → perfil master no .env (contas de descoberta). Permite listar ECS sem cadastrar cada perfil. */
const SUGGESTED_TO_MASTER = [
  { prefix: 'ANANIMCLOUD_', master: 'ANANIMCLOUD_MASTER' },
  { prefix: 'RAMO_CH_', master: 'RAMO_SP_RAMOONE' },
  { prefix: 'RAMO_SP_', master: 'RAMO_SP_RAMOONE' },
  { prefix: 'MOOVE_SP_', master: 'MOOVE_SP_PRINCIPAL' },
  { prefix: 'MOOVE', master: 'MOOVE_SP_PRINCIPAL' }, // conta MOOVE (projeto na raiz pode vir com perfil "MOOVE")
  { prefix: 'RSDONE_CH_', master: 'RSDONE_CH_ZHOUSE' },
];

// Compatibilidade com outros projetos (ex.: finops) que usam chaves globais (MOOVE_AK/MOOVE_SK etc.)
// Permite rodar o painel com o mesmo arquivo de credenciais, sem duplicar perfis.
const PROFILE_ENV_ALIASES = [
  { profile: 'MOOVE_SP_PRINCIPAL', ak: 'MOOVE_AK', sk: 'MOOVE_SK', region: 'MOOVE_REGION', projectId: 'MOOVE_PROJECT_ID' },
  { profile: 'RAMO_SP_RAMOONE', ak: 'RAMO_AK', sk: 'RAMO_SK', region: 'RAMO_REGION', projectId: 'RAMO_PROJECT_ID' },
  { profile: 'ANANIMCLOUD_MASTER', ak: 'ANANIM_AK', sk: 'ANANIM_SK', region: 'ANANIM_REGION', projectId: 'ANANIM_PROJECT_ID' },
  { profile: 'RSDONE_CH_ZHOUSE', ak: 'RSDONE_AK', sk: 'RSDONE_SK', region: 'RSDONE_REGION', projectId: 'RSDONE_PROJECT_ID' },
];

function parseEnvContent(content) {
  const config = {};
  if (!content || typeof content !== 'string') return config;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    config[key] = value;
  }
  return config;
}

/**
 * Carrega configuração: primeiro tenta config.enc + .encryption_key, depois .env (dotenv já carregado em index).
 * @returns {Record<string, string>} Objeto chave -> valor (env)
 */
export function loadConfig() {
  if (_config !== null) return _config;

  // 1) Tentar config.enc + .encryption_key ou key.bin (mesmo conceito CBR / Huawei Cloud Panel)
  const keyPath = resolveKeyPath();
  if (existsSync(keyPath) && existsSync(CONFIG_ENC_PATH)) {
    try {
      const keyBytes = readFileSync(keyPath);
      const key = keyBytes.toString('utf8').trim();
      const fernet = new Fernet(key);
      const encryptedBuf = readFileSync(CONFIG_ENC_PATH);
      const token = encryptedBuf.toString('utf8');
      const decrypted = fernet.decrypt(token);
      const parsed = parseEnvContent(decrypted);
      _config = { ...process.env };
      for (const [k, v] of Object.entries(parsed)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') _config[k] = v;
      }
      console.log('[Ananim] Config carregado de config.enc (chave: ' + keyPath + ')');
      return _config;
    } catch (e) {
      console.warn('[Ananim] Config: falha ao descriptografar config.enc:', e.message, '- Use o par config.enc + .encryption_key gerado junto no backend.');
    }
  } else {
    if (!existsSync(keyPath)) console.warn('[Ananim] Config: arquivo de chave nao encontrado:', keyPath);
    if (!existsSync(CONFIG_ENC_PATH)) console.warn('[Ananim] Config: config.enc nao encontrado:', CONFIG_ENC_PATH);
  }

  // 2) Fallback: process.env (dotenv já carregou .env no index)
  _config = { ...process.env };
  console.log('[Ananim] Config: usando .env (config.enc ausente ou falha na descriptografia)');
  return _config;
}

/**
 * Retorna o conjunto de nomes de perfil (prefixos que têm _ACCESS_KEY ou _USE_PROFILE).
 * Formato CBR: RAMO_ACCESS_KEY -> perfil "RAMO". USE_PROFILE permite herdar credenciais (ex.: ANANIMCLOUD_AGUASPRATAS_USE_PROFILE=RAMO_CH_AGUAS_PRATA).
 */
export function getProfileNames() {
  const config = loadConfig();
  const names = new Set();
  for (const key of Object.keys(config)) {
    if (key.endsWith('_ACCESS_KEY') && config[key]) {
      names.add(key.replace(/_ACCESS_KEY$/, ''));
    }
    if (key.endsWith('_USE_PROFILE') && config[key]) {
      names.add(key.replace(/_USE_PROFILE$/, ''));
    }
  }
  return Array.from(names);
}

/**
 * Se o nome for um perfil sugerido pela descoberta (ex.: ANANIMCLOUD_ANANIM_CLOUD), retorna o perfil master no .env.
 * @param {string} suggestedName
 * @returns {string|null}
 */
export function getMasterProfileForSuggested(suggestedName) {
  const name = ((suggestedName && String(suggestedName).trim()) || '').toUpperCase();
  if (!name) return null;
  for (const { prefix, master } of SUGGESTED_TO_MASTER) {
    const p = prefix.toUpperCase();
    if (name.startsWith(p) || name === p.replace(/_+$/, '')) return master;
  }
  return null;
}

/**
 * Credenciais de um perfil (formato CBR).
 * Se o perfil tiver USE_PROFILE=OutroPerfil, herda AK/SK e PROJECT_ID do outro perfil e aplica REGION do próprio perfil (busca direta no provedor, como CBR).
 * @param {string} profileName - Nome do perfil (ex: RAMO, ANANIMCLOUD_AGUASPRATAS)
 * @param {Set<string>} [visited] - Evita recursão circular em USE_PROFILE
 * @returns {{ ak: string, sk: string, project_id: string, region: string }}
 */
export function getProfileCredentials(profileName, visited = new Set()) {
  const name = (profileName && String(profileName).trim()) || '';
  if (!name) throw new Error('Nome do perfil não informado');
  if (visited.has(name)) throw new Error(`Perfil '${name}': USE_PROFILE em ciclo`);
  const config = loadConfig();
  const prefix = name + '_';
  const useProfile = config[prefix + 'USE_PROFILE'] && String(config[prefix + 'USE_PROFILE']).trim();
  if (useProfile) {
    visited.add(name);
    const parent = getProfileCredentials(useProfile, visited);
    const region = config[prefix + 'REGION'] && String(config[prefix + 'REGION']).trim() ? config[prefix + 'REGION'].trim() : parent.region;
    return { ak: parent.ak, sk: parent.sk, project_id: parent.project_id || '', region };
  }
  const ak = config[prefix + 'ACCESS_KEY'];
  const sk = config[prefix + 'SECRET_KEY'];
  const project_id = config[prefix + 'PROJECT_ID'];
  const region = config[prefix + 'REGION'] || 'la-south-2';
  if (!ak || !sk) {
    // 1) Fallback: aliases globais (finops/webpanel style) para os perfis master.
    const alias = PROFILE_ENV_ALIASES.find((a) => a.profile.toUpperCase() === name.toUpperCase());
    if (alias) {
      const ak2 = config[alias.ak];
      const sk2 = config[alias.sk];
      if (ak2 && sk2) {
        const region2 = (alias.region && config[alias.region] && String(config[alias.region]).trim()) ? String(config[alias.region]).trim() : region;
        const pid2 = (alias.projectId && config[alias.projectId] && String(config[alias.projectId]).trim()) ? String(config[alias.projectId]).trim() : (project_id || '');
        return { ak: ak2, sk: sk2, project_id: pid2, region: region2 || 'la-south-2' };
      }
    }

    const master = getMasterProfileForSuggested(name);
    if (master && !visited.has(master)) {
      return getProfileCredentials(master, visited);
    }
    throw new Error(`Perfil '${name}' não encontrado ou sem ACCESS_KEY/SECRET_KEY em config.enc ou .env`);
  }
  return { ak, sk, project_id: project_id || '', region };
}

/**
 * Credenciais IAM por usuário/senha de um perfil (usuário de domínio dedicado "ananimreport", usado
 * como fallback do COC quando AK/SK assinado não é aceito pela Huawei nesse endpoint).
 * Formato: {PERFIL}_IAM_USERNAME, {PERFIL}_IAM_PASSWORD, {PERFIL}_IAM_DOMAIN (nome do domínio Huawei da conta).
 * Herda de USE_PROFILE como getProfileCredentials(). Fallback final: variáveis globais
 * IAM_USERNAME/IAM_PASSWORD/IAM_DOMAIN (uma conta só).
 * @param {string} profileName
 * @returns {{ username: string|null, password: string|null, domain: string|null }}
 */
export function getProfileIamCredentials(profileName, visited = new Set()) {
  const name = (profileName && String(profileName).trim()) || '';
  if (!name) throw new Error('Nome do perfil não informado');
  if (visited.has(name)) throw new Error(`Perfil '${name}': USE_PROFILE em ciclo`);
  const config = loadConfig();
  const prefix = name + '_';
  const useProfile = config[prefix + 'USE_PROFILE'] && String(config[prefix + 'USE_PROFILE']).trim();
  if (useProfile) {
    visited.add(name);
    return getProfileIamCredentials(useProfile, visited);
  }
  const username = config[prefix + 'IAM_USERNAME'];
  const password = config[prefix + 'IAM_PASSWORD'];
  const domain = config[prefix + 'IAM_DOMAIN'];
  if (username && password && domain) {
    return { username, password, domain };
  }
  if (config.IAM_USERNAME && config.IAM_PASSWORD && config.IAM_DOMAIN) {
    return { username: config.IAM_USERNAME, password: config.IAM_PASSWORD, domain: config.IAM_DOMAIN };
  }
  return { username: null, password: null, domain: null };
}

export function getKeyPath() {
  return resolveKeyPath();
}

export function getConfigEncPath() {
  return CONFIG_ENC_PATH;
}

/**
 * Converte objeto chave->valor em texto no formato .env (uma linha por chave).
 */
function stringifyEnvContent(obj) {
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;
    const v = String(value).trim();
    const needsQuote = /["#\r\n]/.test(v);
    const escaped = needsQuote ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : v;
    lines.push(`${key}=${escaped}`);
  }
  return lines.join('\n');
}

/**
 * Mescla o snippet .env (texto) no config.enc e reescreve o arquivo.
 * Usado no IIS quando não existe .env: ao criar cliente, as credenciais vão direto para config.enc.
 * @param {string} envSnippet - Texto no formato KEY=value (linhas).
 * @returns {{ ok: boolean, error?: string }}
 */
export function mergeIntoConfigEnc(envSnippet) {
  if (!envSnippet || typeof envSnippet !== 'string') return { ok: false, error: 'Snippet vazio' };
  const keyPath = resolveKeyPath();
  if (!existsSync(keyPath) || !existsSync(CONFIG_ENC_PATH)) {
    return { ok: false, error: 'config.enc ou chave não encontrados na pasta do programa' };
  }
  try {
    const keyBytes = readFileSync(keyPath);
    const key = keyBytes.toString('utf8').trim();
    const fernet = new Fernet(key);
    const encryptedBuf = readFileSync(CONFIG_ENC_PATH);
    const decrypted = fernet.decrypt(encryptedBuf.toString('utf8'));
    const existing = parseEnvContent(decrypted);
    const fromSnippet = parseEnvContent(envSnippet);
    const merged = { ...existing };
    for (const [k, v] of Object.entries(fromSnippet)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') merged[k] = v;
    }
    const newContent = stringifyEnvContent(merged);
    const token = fernet.encrypt(newContent);
    writeFileSync(CONFIG_ENC_PATH, token, 'utf8');
    _config = null; // força recarregar no próximo loadConfig()
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'Erro ao atualizar config.enc' };
  }
}

/**
 * Verifica se o app está rodando em modo IIS/exe (config.enc na pasta atual).
 */
export function isConfigEncInCwd() {
  return existsSync(join(WORK_DIR, 'config.enc')) && (existsSync(join(WORK_DIR, '.encryption_key')) || existsSync(join(WORK_DIR, 'key.bin')));
}

/**
 * Retorna credenciais para uso na API Huawei (listar projetos).
 * Usa MASTER_PROFILE ou primeiro perfil disponível.
 */
export function getCredentialsForApi() {
  const config = loadConfig();
  const master = config.MASTER_PROFILE || config.HUAWEI_MASTER_PROFILE;
  const profiles = getProfileNames();
  if (master && profiles.includes(master)) {
    return getProfileCredentials(master);
  }
  if (profiles.length) {
    return getProfileCredentials(profiles[0]);
  }
  if (config.HUAWEI_AK && config.HUAWEI_SK) {
    return {
      ak: config.HUAWEI_AK,
      sk: config.HUAWEI_SK,
      project_id: config.HUAWEI_PROJECT_ID || config.PROJECT_ID || '',
      region: config.HUAWEI_REGION || config.REGION || 'la-south-2',
    };
  }
  if (config.IAM_USERNAME && config.IAM_PASSWORD && config.IAM_DOMAIN) {
    return {
      type: 'password',
      iamUsername: config.IAM_USERNAME,
      iamPassword: config.IAM_PASSWORD,
      iamDomain: config.IAM_DOMAIN,
      project_id: config.HUAWEI_PROJECT_ID || config.PROJECT_ID || '',
      region: config.HUAWEI_REGION || config.REGION || 'la-south-2',
    };
  }
  return null;
}
