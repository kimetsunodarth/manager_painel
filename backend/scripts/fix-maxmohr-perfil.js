/**
 * Ajusta o cliente maxmohr para usar o perfil Huawei existente (MAXMOHR) em vez do derivado (MAX_MOHR).
 * Atualiza: dynamic-clients-registry.json (perfilPattern) e visibleProjects de todos os usuários.
 * Execute na pasta backend: node scripts/fix-maxmohr-perfil.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERFIL_EXISTENTE = 'MAXMOHR';
const CLIENT_KEY = 'maxmohr';

const backendRoot = path.join(__dirname, '..');
const configDir = path.join(backendRoot, 'src', 'config');
const registryPath = path.join(configDir, 'dynamic-clients-registry.json');
const dbPath = path.join(backendRoot, 'src', 'data', 'ananim.db');

async function main() {
  let registry = [];
  if (fs.existsSync(registryPath)) {
    const raw = fs.readFileSync(registryPath, 'utf8');
    registry = JSON.parse(raw);
    if (!Array.isArray(registry)) registry = [];
  }

  const entry = registry.find((e) => e.clientKey === CLIENT_KEY);
  if (entry) {
    entry.perfilPattern = PERFIL_EXISTENTE;
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
    console.log(`Registry: perfilPattern de "${CLIENT_KEY}" definido como "${PERFIL_EXISTENTE}".`);
  } else {
    console.log(`Registry: nenhuma entrada com clientKey "${CLIENT_KEY}" (arquivo pode estar vazio).`);
  }

  if (!fs.existsSync(dbPath)) {
    console.log('Banco de usuários não encontrado; pulando atualização de visibleProjects.');
    return;
  }

  try {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath, { readonly: false });
    try {
      const rows = db.prepare('SELECT id, visibleProjects FROM users').all();
      let updated = 0;
      for (const row of rows) {
        let projects;
        try {
          projects = JSON.parse(row.visibleProjects || '[]');
        } catch {
          continue;
        }
        if (!Array.isArray(projects)) continue;
        const changed = projects.some((p) => p && p.id === CLIENT_KEY && p.perfil !== PERFIL_EXISTENTE);
        if (!changed) continue;
        const newProjects = projects.map((p) => {
          if (p && p.id === CLIENT_KEY) return { ...p, perfil: PERFIL_EXISTENTE };
          return p;
        });
        db.prepare('UPDATE users SET visibleProjects = ? WHERE id = ?').run(JSON.stringify(newProjects), row.id);
        updated++;
        console.log(`Usuário ${row.id}: visibleProjects de "${CLIENT_KEY}" com perfil "${PERFIL_EXISTENTE}".`);
      }
      if (updated > 0) console.log(`${updated} usuário(s) atualizado(s).`);
      else if (rows.length > 0) console.log('Nenhum usuário tinha visibleProjects com id "maxmohr" para atualizar.');
    } finally {
      db.close();
    }
  } catch (err) {
    if (err.code === 'ERR_DLOPEN_FAILED' || err.message?.includes('NODE_MODULE_VERSION')) {
      console.log('better-sqlite3 não compatível com esta versão do Node; apenas registry foi atualizado. Para atualizar usuários, use a tela Usuários ou execute "npm rebuild better-sqlite3" e rode o script novamente.');
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
