/**
 * Persistência do Ananim Manager Agent (SQLite do painel): ativações, agentes, catálogo de serviços
 * descobertos, liberações do admin, acessos por usuário e fila de tarefas.
 */
import crypto from 'node:crypto';
import { ACTIONS, codeHash, isBlocked, newCode, publicKeyFromJwk, validServiceName } from './agentCrypto.js';

export const CODE_TTL_MS = 60 * 60 * 1000;
export const JOB_TTL_MS = 30 * 60 * 1000;
export const LEASE_MS = 5 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
export const NONCE_TTL_MS = 15 * 60 * 1000;
export const MAX_SERVICES = 2000;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS agent_activations (
    code_hash TEXT PRIMARY KEY, project_key TEXT NOT NULL, project_name TEXT NOT NULL, ecs_id TEXT NOT NULL,
    ecs_name TEXT NOT NULL, created_by TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY, project_key TEXT NOT NULL, project_name TEXT NOT NULL, ecs_id TEXT NOT NULL, ecs_name TEXT NOT NULL,
    os TEXT NOT NULL, jwk TEXT NOT NULL, hostname TEXT NOT NULL, agent_version TEXT NOT NULL DEFAULT '',
    created INTEGER NOT NULL, last_seen INTEGER, revoked INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_key);
  CREATE TABLE IF NOT EXISTS agent_nonces (agent_id TEXT NOT NULL, nonce TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (agent_id, nonce));
  CREATE TABLE IF NOT EXISTS agent_services (
    agent_id TEXT NOT NULL, name TEXT NOT NULL, display_name TEXT NOT NULL, status TEXT NOT NULL, start_type TEXT NOT NULL,
    discovered_at INTEGER NOT NULL, PRIMARY KEY (agent_id, name));
  CREATE TABLE IF NOT EXISTS agent_releases (
    agent_id TEXT NOT NULL, service_name TEXT NOT NULL, label TEXT NOT NULL, actions TEXT NOT NULL, PRIMARY KEY (agent_id, service_name));
  CREATE TABLE IF NOT EXISTS agent_grants (
    user_id TEXT NOT NULL, agent_id TEXT NOT NULL, service_name TEXT NOT NULL, PRIMARY KEY (user_id, agent_id, service_name));
  CREATE TABLE IF NOT EXISTS agent_jobs (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, service_name TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL,
    requested_by TEXT NOT NULL, requested_at INTEGER NOT NULL, claimed_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
    finished_at INTEGER, result_code TEXT, result_message TEXT, expires INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_agent_jobs_agent ON agent_jobs(agent_id, status, requested_at);
`;

const agentRow = (r) => r && ({
  id: r.id, projectKey: r.project_key, projectName: r.project_name, ecsId: r.ecs_id, ecsName: r.ecs_name, os: r.os,
  jwk: JSON.parse(r.jwk), hostname: r.hostname, agentVersion: r.agent_version, created: r.created, lastSeen: r.last_seen, revoked: !!r.revoked,
});
const jobRow = (r) => r && ({
  id: r.id, agentId: r.agent_id, serviceName: r.service_name, action: r.action, status: r.status, requestedBy: r.requested_by,
  requestedAt: r.requested_at, claimedAt: r.claimed_at, attempts: r.attempts, finishedAt: r.finished_at,
  resultCode: r.result_code, resultMessage: r.result_message,
});
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export function createAgentStore(db) {
  db.exec(SCHEMA);
  const tx = (fn) => db.transaction(fn);

  function expire(now) {
    db.prepare("UPDATE agent_jobs SET status='expired', finished_at=? WHERE status IN ('pending','claimed') AND expires<?").run(now, now);
    db.prepare("UPDATE agent_jobs SET status='failed', finished_at=?, result_code='lease_exhausted' WHERE status='claimed' AND claimed_at<? AND attempts>=?")
      .run(now, now - LEASE_MS, MAX_ATTEMPTS);
  }

  return {
    issueCode({ projectKey, projectName, ecsId, ecsName, createdBy }, now = Date.now()) {
      const code = newCode();
      db.prepare('INSERT INTO agent_activations VALUES (?,?,?,?,?,?,?,0)')
        .run(codeHash(code), text(projectKey, 200), text(projectName, 200), text(ecsId, 100), text(ecsName, 200), text(createdBy, 254), now + CODE_TTL_MS);
      return { code, expiresAt: now + CODE_TTL_MS };
    },

    activate({ code, agentId, jwk, hostname, os, agentVersion }, now = Date.now()) {
      publicKeyFromJwk(jwk);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(String(agentId))) throw new Error('invalid_agent_id');
      if (!['windows', 'linux'].includes(os)) throw new Error('invalid_os');
      return tx(() => {
        const act = db.prepare('SELECT * FROM agent_activations WHERE code_hash=? AND used=0 AND expires>=?').get(codeHash(code), now);
        if (!act) throw new Error('invalid_or_expired_code');
        db.prepare('INSERT INTO agents (id, project_key, project_name, ecs_id, ecs_name, os, jwk, hostname, agent_version, created, last_seen) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(agentId, act.project_key, act.project_name, act.ecs_id, act.ecs_name, os, JSON.stringify({ kty: 'RSA', n: jwk.n, e: jwk.e }),
            text(hostname, 200), text(agentVersion, 64), now, now);
        db.prepare('UPDATE agent_activations SET used=1 WHERE code_hash=?').run(act.code_hash);
        return agentRow(db.prepare('SELECT * FROM agents WHERE id=?').get(agentId));
      })();
    },

    getAgent: (id) => agentRow(db.prepare('SELECT * FROM agents WHERE id=?').get(id)),
    listAgents: (projectKey) => (projectKey
      ? db.prepare('SELECT * FROM agents WHERE project_key=? ORDER BY ecs_name').all(projectKey)
      : db.prepare('SELECT * FROM agents ORDER BY project_name, ecs_name').all()).map(agentRow),
    revoke(id, now = Date.now()) {
      db.prepare('UPDATE agents SET revoked=1 WHERE id=?').run(id);
      db.prepare("UPDATE agent_jobs SET status='cancelled', finished_at=? WHERE agent_id=? AND status IN ('pending','claimed')").run(now, id);
    },
    touch: (id, now = Date.now()) => db.prepare('UPDATE agents SET last_seen=? WHERE id=?').run(now, id),

    useNonce(agentId, nonce, now = Date.now()) {
      db.prepare('DELETE FROM agent_nonces WHERE at<?').run(now - NONCE_TTL_MS);
      try {
        db.prepare('INSERT INTO agent_nonces VALUES (?,?,?)').run(agentId, nonce, now);
        return true;
      } catch {
        return false;
      }
    },

    saveCatalog(agentId, services, agentVersion, now = Date.now()) {
      const clean = (Array.isArray(services) ? services : []).filter((s) => s && validServiceName(s.name) && !isBlocked(s.name)).slice(0, MAX_SERVICES);
      tx(() => {
        db.prepare('DELETE FROM agent_services WHERE agent_id=?').run(agentId);
        const ins = db.prepare('INSERT OR REPLACE INTO agent_services VALUES (?,?,?,?,?,?)');
        for (const s of clean) ins.run(agentId, s.name, text(s.displayName || s.name, 256), text(s.status, 32), text(s.startType, 32), now);
        db.prepare('UPDATE agents SET agent_version=?, last_seen=? WHERE id=?').run(text(agentVersion, 64), now, agentId);
      })();
      return clean.length;
    },
    listServices: (agentId) => db.prepare('SELECT * FROM agent_services WHERE agent_id=? ORDER BY display_name').all(agentId)
      .map((r) => ({ name: r.name, displayName: r.display_name, status: r.status, startType: r.start_type, discoveredAt: r.discovered_at })),

    setReleases(agentId, releases) {
      const clean = [];
      for (const r of Array.isArray(releases) ? releases : []) {
        if (!validServiceName(r?.serviceName) || isBlocked(r.serviceName)) throw new Error('service_not_allowed');
        const actions = [...new Set(Array.isArray(r.actions) ? r.actions : [])];
        if (actions.some((a) => !ACTIONS.includes(a))) throw new Error('invalid_action');
        if (actions.length) clean.push({ serviceName: r.serviceName, label: text(r.label || r.serviceName, 80), actions });
      }
      tx(() => {
        db.prepare('DELETE FROM agent_releases WHERE agent_id=?').run(agentId);
        const ins = db.prepare('INSERT INTO agent_releases VALUES (?,?,?,?)');
        for (const r of clean) ins.run(agentId, r.serviceName, r.label, JSON.stringify(r.actions));
        // Serviço que deixou de ser liberado perde os acessos dos usuários.
        db.prepare('DELETE FROM agent_grants WHERE agent_id=? AND service_name NOT IN (SELECT service_name FROM agent_releases WHERE agent_id=?)').run(agentId, agentId);
      })();
      return clean;
    },
    getReleases: (agentId) => db.prepare('SELECT * FROM agent_releases WHERE agent_id=? ORDER BY label').all(agentId)
      .map((r) => ({ serviceName: r.service_name, label: r.label, actions: JSON.parse(r.actions) })),

    setGrants(userId, agentId, serviceNames) {
      const released = new Set(db.prepare('SELECT service_name FROM agent_releases WHERE agent_id=?').all(agentId).map((r) => r.service_name));
      const clean = [...new Set(Array.isArray(serviceNames) ? serviceNames : [])];
      if (clean.some((n) => !released.has(n))) throw new Error('service_not_released');
      tx(() => {
        db.prepare('DELETE FROM agent_grants WHERE user_id=? AND agent_id=?').run(userId, agentId);
        const ins = db.prepare('INSERT INTO agent_grants VALUES (?,?,?)');
        for (const n of clean) ins.run(userId, agentId, n);
      })();
      return clean;
    },
    getGrants: (userId) => db.prepare('SELECT agent_id, service_name FROM agent_grants WHERE user_id=?').all(userId)
      .map((r) => ({ agentId: r.agent_id, serviceName: r.service_name })),
    getGrantsForAgent: (agentId) => db.prepare('SELECT user_id, service_name FROM agent_grants WHERE agent_id=?').all(agentId)
      .map((r) => ({ userId: r.user_id, serviceName: r.service_name })),

    enqueue({ agentId, serviceName, action, requestedBy }, now = Date.now()) {
      if (!ACTIONS.includes(action) || !validServiceName(serviceName) || isBlocked(serviceName)) throw new Error('invalid_job');
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO agent_jobs (id, agent_id, service_name, action, status, requested_by, requested_at, expires) VALUES (?,?,?,?,'pending',?,?,?)")
        .run(id, agentId, serviceName, action, text(requestedBy, 254), now, now + JOB_TTL_MS);
      return jobRow(db.prepare('SELECT * FROM agent_jobs WHERE id=?').get(id));
    },
    claim(agentId, now = Date.now()) {
      return tx(() => {
        expire(now);
        const job = db.prepare("SELECT * FROM agent_jobs WHERE agent_id=? AND (status='pending' OR (status='claimed' AND claimed_at<? AND attempts<?)) ORDER BY requested_at LIMIT 1")
          .get(agentId, now - LEASE_MS, MAX_ATTEMPTS);
        if (!job) return null;
        db.prepare("UPDATE agent_jobs SET status='claimed', claimed_at=?, attempts=attempts+1 WHERE id=?").run(now, job.id);
        return jobRow(db.prepare('SELECT * FROM agent_jobs WHERE id=?').get(job.id));
      })();
    },
    finish(agentId, jobId, { status, code, message, serviceStatus }, now = Date.now()) {
      if (!['done', 'failed'].includes(status)) throw new Error('invalid_status');
      return tx(() => {
        const job = db.prepare("SELECT * FROM agent_jobs WHERE id=? AND agent_id=? AND status='claimed'").get(jobId, agentId);
        if (!job) return false;
        db.prepare('UPDATE agent_jobs SET status=?, result_code=?, result_message=?, finished_at=? WHERE id=?')
          .run(status, text(code, 40), text(message, 300), now, jobId);
        if (serviceStatus) db.prepare('UPDATE agent_services SET status=? WHERE agent_id=? AND name=?').run(text(serviceStatus, 32), agentId, job.service_name);
        return true;
      })();
    },
    listJobs({ agentId, projectKey, limit = 50 } = {}) {
      const rows = agentId
        ? db.prepare('SELECT * FROM agent_jobs WHERE agent_id=? ORDER BY requested_at DESC LIMIT ?').all(agentId, limit)
        : db.prepare('SELECT j.* FROM agent_jobs j JOIN agents a ON a.id=j.agent_id WHERE a.project_key=? ORDER BY j.requested_at DESC LIMIT ?').all(projectKey, limit);
      return rows.map(jobRow);
    },
  };
}
