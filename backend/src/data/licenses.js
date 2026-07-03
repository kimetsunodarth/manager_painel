// Licenças SAP e add-ons (mock). Em produção integrar com dados reais do SAP B1.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { getDataDir } from '../appRoot.js';

const dataDir = getDataDir();
const ADDONS_LICENSE_PATH = path.join(dataDir, 'licenca-addons.txt');
const SUMMARY_PATH = path.join(dataDir, 'license-summary.json');
const ADDONS_PATH = path.join(dataDir, 'addons-detail.json');

const defaultSummary = {
  crm: 0,
  financials: 0,
  logistics: 0,
  professional: 0,
  licencasIndiretas: 0,
  totalUsuariosLicenciados: 0,
  totalLicencas: 0,
};

function loadSummary() {
  try {
    if (existsSync(SUMMARY_PATH)) {
      const data = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
      return { ...defaultSummary, ...data };
    }
  } catch (_) {}
  return { ...defaultSummary };
}

function loadAddons() {
  try {
    if (existsSync(ADDONS_PATH)) {
      const data = JSON.parse(readFileSync(ADDONS_PATH, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (_) {}
  return [];
}

/** Texto editável da licença de add-ons (somente admin pode alterar). Persistido em arquivo. */
export function getLicencaAddons() {
  try {
    if (existsSync(ADDONS_LICENSE_PATH)) {
      return readFileSync(ADDONS_LICENSE_PATH, 'utf8').trim();
    }
  } catch (_) {}
  return '';
}

export function setLicencaAddons(text) {
  const value = typeof text === 'string' ? text : '';
  writeFileSync(ADDONS_LICENSE_PATH, value, 'utf8');
  return value;
}

export function getLicenseSummary(envId) {
  return loadSummary();
}

export function setLicenseSummary(data) {
  const current = loadSummary();
  const merged = { ...current };
  const keys = Object.keys(defaultSummary);
  for (const k of keys) {
    if (data[k] !== undefined) merged[k] = Number(data[k]) || 0;
  }
  writeFileSync(SUMMARY_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

export function getAddonsDetail(envId) {
  return loadAddons();
}

export function setAddonsDetail(list) {
  const valid = Array.isArray(list)
    ? list
        .filter((a) => a && typeof a.name === 'string')
        .map((a) => ({
          name: String(a.name).trim(),
          count: Math.max(0, Number(a.count) || 0),
          color: /^#[0-9a-fA-F]{6}$/.test(a.color) ? a.color : '#2196f3',
        }))
    : [];
  writeFileSync(ADDONS_PATH, JSON.stringify(valid, null, 2), 'utf8');
  return valid;
}
