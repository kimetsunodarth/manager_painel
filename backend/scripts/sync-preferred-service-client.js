/**
 * Ajusta preferredServiceClientKey para usuários que já têm projetos atribuídos mas
 * ainda não tinham preferência definida. Assim a aba Serviços mostra o cliente correto
 * (Roland, Brado, CLOUDHDB, etc.) para quem já estava configurado.
 * Uso: na pasta backend: node scripts/sync-preferred-service-client.js
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
const dbPath = path.join(backendRoot, 'src', 'data', 'ananim.db');
const configDir = path.join(backendRoot, 'src', 'config');
const hanaClientsDir = path.join(configDir, 'hana-clients');
const registryPath = path.join(configDir, 'dynamic-clients-registry.json');

// Regras estáticas (mesma lógica de hanaClients.js, só name/perfil/displayPerfil)
function buildStaticRules() {
  return [
    { key: 'ananimcloud', test: (p) => { const n = (p?.name || '').toString().toLowerCase(); const f = (p?.perfil || '').toString(); if (/RAMOONE/i.test(f)) return false; return (n && (n.includes('ananim cloud') || n.includes('ananimcloud') || n.includes('cloudhdb'))) || /ANANIM|CLOUDHDB/i.test(f); } },
    { key: 'cloudhdb', test: (p) => { const n = (p?.name || '').toString(); const f = (p?.perfil || '').toString(); if (/RAMOONE/i.test(f)) return false; return (n && (n.includes('Kitfire') || n.includes('CLOUDHDB') || n.toLowerCase().includes('cloudhdb'))) || /KITFIRE|CLOUDHDB/i.test(f); } },
    { key: 'roland', test: (p) => { const n = (p?.name || '').toString().toLowerCase(); const f = (p?.perfil || '').toString(); const d = (p?.displayPerfil || '').toString(); return (n && n.includes('roland')) || /roland/i.test(f) || /ANANIM_ROLAND/i.test(d); } },
    { key: 'roland-web', test: (p) => { const n = (p?.name || '').toString().toLowerCase(); const f = (p?.perfil || '').toString(); const d = (p?.displayPerfil || '').toString(); return (n && n.includes('roland')) || /roland/i.test(f) || /ANANIM_ROLAND/i.test(d); } },
    { key: 'controlla', test: (p) => { const n = (p?.name || '').toString().toLowerCase(); const f = (p?.perfil || '').toString(); const d = (p?.displayPerfil || '').toString(); return (n && n.includes('controlla')) || /controlla/i.test(f) || /ANANIM_CONTROLLA|CONTROLLA/i.test(d); } },
    { key: 'controlla-web', test: (p) => { const n = (p?.name || '').toString().toLowerCase(); const f = (p?.perfil || '').toString(); const d = (p?.displayPerfil || '').toString(); return (n && n.includes('controlla')) || /controlla/i.test(f) || /ANANIM_CONTROLLA|CONTROLLA/i.test(d); } },
    { key: 'alfa-citrus', test: (p) => { const n = (p?.name || '').toString().toLowerCase(); const f = (p?.perfil || '').toString(); return (n && n.includes('alfa') && n.includes('citrus')) || /ALFA.?CITRUS|ALFA_CITRUS/i.test(f); } },
  ];
}

function getDynamicRules() {
  try {
    if (!fs.existsSync(registryPath)) return [];
    const raw = fs.readFileSync(registryPath, 'utf8');
    const registry = JSON.parse(raw);
    if (!Array.isArray(registry)) return [];
    const rules = [];
    for (const entry of registry) {
      const nameContains = (entry.nameContains || entry.clientKey || '').toLowerCase();
      const perfilPattern = (entry.perfilPattern || entry.clientKey || '').toString();
      const test = (p) => {
        const name = (p?.name || '').toString().toLowerCase();
        const perfil = (p?.perfil || '').toString();
        const displayPerfil = (p?.displayPerfil || '').toString();
        if (nameContains && name && name.includes(nameContains)) return true;
        if (perfilPattern && perfil && new RegExp(perfilPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(perfil)) return true;
        if (perfilPattern && displayPerfil && new RegExp(perfilPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(displayPerfil)) return true;
        return false;
      };
      rules.push({ key: entry.clientKey, test });
      if (entry.clientKey && !entry.clientKey.endsWith('-web')) rules.push({ key: `${entry.clientKey}-web`, test });
    }
    return rules;
  } catch {
    return [];
  }
}

function getConfiguredHanaKeys() {
  if (!fs.existsSync(hanaClientsDir)) return [];
  return fs.readdirSync(hanaClientsDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => f.replace(/\.json$/, '').toLowerCase());
}

function main() {
  if (!fs.existsSync(dbPath)) {
    console.log('Banco não encontrado:', dbPath);
    return;
  }
  const db = new Database(dbPath, { readonly: false });
  try {
    try {
      db.exec('ALTER TABLE users ADD COLUMN preferredServiceClientKey TEXT');
    } catch (e) {
      if (!e.message?.includes('duplicate column')) throw e;
    }

    const configuredKeys = new Set(getConfiguredHanaKeys());
    const staticRules = buildStaticRules();
    const dynamicRules = getDynamicRules();
    const allRules = [...dynamicRules, ...staticRules].filter((r) => configuredKeys.has(r.key));

    const rows = db.prepare('SELECT id, name, visibleProjects, preferredServiceClientKey FROM users').all();
    let updated = 0;
    for (const row of rows) {
      let preferred = row.preferredServiceClientKey != null && String(row.preferredServiceClientKey).trim() !== '' ? row.preferredServiceClientKey.trim() : null;
      if (preferred) continue; // já tem preferência
      let projects;
      try {
        projects = JSON.parse(row.visibleProjects || '[]');
      } catch {
        continue;
      }
      if (!Array.isArray(projects) || projects.length === 0) continue;

      const allowedKeys = [];
      for (const rule of allRules) {
        if (projects.some((p) => rule.test(p))) allowedKeys.push(rule.key);
      }
      if (allowedKeys.length === 0) continue;

      for (const p of projects) {
        for (const rule of allRules) {
          if (allowedKeys.includes(rule.key) && rule.test(p)) {
            preferred = rule.key;
            break;
          }
        }
        if (preferred) break;
      }
      if (!preferred) preferred = allowedKeys[0];

      db.prepare('UPDATE users SET preferredServiceClientKey = ? WHERE id = ?').run(preferred, row.id);
      console.log(`  ${row.name} (id ${row.id}): preferredServiceClientKey = "${preferred}"`);
      updated++;
    }
    console.log(updated ? `Ajustados ${updated} usuário(s).` : 'Nenhum usuário precisou de ajuste (todos já tinham preferência ou sem projetos).');
  } finally {
    db.close();
  }
}

main();
