/**
 * Projetos e servidores cadastrados à mão (fora da Huawei: on-premise, outras nuvens), para ligar o
 * Ananim Manager Agent e atribuir a clientes como qualquer projeto. Sem perfil: a chave é o próprio id.
 * servicesOnly = true: sem ligar/desligar VM pela API Huawei, só os serviços do agente.
 */
import crypto from 'node:crypto';

const PREFIX = 'manual-';

export function isManualProjectId(id) {
  return typeof id === 'string' && /^manual-[0-9a-f]{12}$/.test(id);
}

function cleanName(name) {
  const value = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (value.length < 2 || value.length > 80) throw new Error('invalid_name');
  return value;
}

export function createManualProjects(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS manual_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_by TEXT, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS manual_servers (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL COLLATE NOCASE, created INTEGER NOT NULL,
      UNIQUE (project_id, name));
  `);
  const unique = (fn) => {
    try { return fn(); } catch (e) {
      if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw new Error('duplicate_name');
      throw e;
    }
  };

  return {
    listProjects() {
      return db.prepare('SELECT id, name FROM manual_projects ORDER BY name').all()
        .map((r) => ({ id: r.id, name: r.name, perfil: null, region: null, enabled: true, manual: true, servicesOnly: true }));
    },
    getProject(id) {
      return db.prepare('SELECT id, name FROM manual_projects WHERE id = ?').get(id) || null;
    },
    createProject({ name, createdBy }, now = Date.now()) {
      const id = PREFIX + crypto.randomBytes(6).toString('hex');
      const value = cleanName(name);
      unique(() => db.prepare('INSERT INTO manual_projects (id, name, created_by, created) VALUES (?, ?, ?, ?)').run(id, value, String(createdBy || ''), now));
      return { id, name: value };
    },
    listServers(projectId) {
      return db.prepare('SELECT id, name FROM manual_servers WHERE project_id = ? ORDER BY name').all(projectId)
        .map((r) => ({ id: r.id, name: r.name, status: 'MANUAL' }));
    },
    addServer(projectId, name, now = Date.now()) {
      if (!this.getProject(projectId)) throw new Error('not_found');
      const id = PREFIX + 'srv-' + crypto.randomBytes(6).toString('hex');
      const value = cleanName(name);
      unique(() => db.prepare('INSERT INTO manual_servers (id, project_id, name, created) VALUES (?, ?, ?, ?)').run(id, projectId, value, now));
      return { id, name: value };
    },
  };
}
