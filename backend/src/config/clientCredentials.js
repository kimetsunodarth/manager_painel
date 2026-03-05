/**
 * Credenciais por cliente: cada cliente tem uma pasta em config/clients/<clientKey>/
 * com config.json e credentials.enc (conteúdo criptografado do .env do cliente).
 * Usa a mesma .encryption_key do projeto para descriptografar.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { Fernet } from 'fernet-nodejs';
import { getConfigDir } from '../appRoot.js';

const CONFIG_DIR = getConfigDir();
const CLIENTS_DIR = path.join(CONFIG_DIR, 'clients');
const WORK_DIR = process.cwd();
const KEY_PATH = path.join(WORK_DIR, '.encryption_key');

const credentialsCache = new Map();

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
 * Carrega credenciais descriptografadas do cliente (credentials.enc).
 * @param {string} clientKey - ex: aguas-pratas, ananimcloud
 * @returns {Record<string, string> | null} Objeto chave -> valor ou null se não existir/falhar
 */
export function getClientCredentials(clientKey) {
  if (credentialsCache.has(clientKey)) return credentialsCache.get(clientKey);

  const credPath = path.join(CLIENTS_DIR, clientKey, 'credentials.enc');
  if (!existsSync(credPath)) {
    credentialsCache.set(clientKey, null);
    return null;
  }

  if (!existsSync(KEY_PATH)) {
    console.warn('clientCredentials: .encryption_key não encontrado');
    credentialsCache.set(clientKey, null);
    return null;
  }

  try {
    const key = readFileSync(KEY_PATH, 'utf8').trim();
    const fernet = new Fernet(key);
    const encrypted = readFileSync(credPath, 'utf8');
    const decrypted = fernet.decrypt(encrypted);
    const parsed = parseEnvContent(decrypted);
    credentialsCache.set(clientKey, parsed);
    return parsed;
  } catch (e) {
    console.warn('clientCredentials: falha ao descriptografar', clientKey, e.message);
    credentialsCache.set(clientKey, null);
    return null;
  }
}

/** Verifica se o cliente possui credentials.enc. */
export function hasClientCredentials(clientKey) {
  const credPath = path.join(CLIENTS_DIR, clientKey, 'credentials.enc');
  return existsSync(credPath);
}

/** Limpa cache (útil após atualizar credentials.enc). */
export function clearClientCredentialsCache() {
  credentialsCache.clear();
}

/**
 * Carrega config.json do cliente (displayName, type, groups, etc.).
 * @param {string} clientKey
 * @returns {object | null}
 */
export function getClientConfig(clientKey) {
  const configPath = path.join(CLIENTS_DIR, clientKey, 'config.json');
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

/** Lista clientKeys que possuem pasta em clients/. */
export function listClientKeys() {
  if (!existsSync(CLIENTS_DIR)) return [];
  try {
    return readdirSync(CLIENTS_DIR).filter((name) => {
      const p = path.join(CLIENTS_DIR, name);
      return statSync(p).isDirectory();
    });
  } catch {
    return [];
  }
}
