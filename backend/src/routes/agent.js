/**
 * Rotas do Ananim Manager Agent (sem sessão de usuário): ativação por código e requisições assinadas
 * pela chave do agente. Montadas antes do express.json global, porque a assinatura cobre o corpo cru.
 */
import express, { Router } from 'express';
import { BLOCKED_PREFIXES, BLOCKED_SERVICES, unwrapEnvelope, verifySignature } from '../agent/agentCrypto.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FAILURES = 20;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const POLL_SECONDS = 30;

function json(raw) {
  const value = JSON.parse(raw.toString('utf8') || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_json');
  return value;
}

/**
 * `findServer(projeto, hostname)` (opcional): procura no projeto a VM com o mesmo nome do servidor, para o cadastro
 * pela chave do projeto ligar o agente sozinho. Sem ela, todo cadastro fica aguardando vínculo.
 */
export function createAgentRouter(getStore, { findServer } = {}) {
  const router = Router();
  router.use(express.raw({ type: () => true, limit: '1mb' }));
  const failures = [];

  // Força bruta de códigos: 20 erros em 10 min bloqueiam novas ativações por 10 min (contador por processo).
  router.post('/activate', (req, res) => {
    const now = Date.now();
    while (failures.length && failures[0] < now - FAILURE_WINDOW_MS) failures.shift();
    if (failures.length >= MAX_FAILURES) return res.status(429).json({ error: 'too_many_attempts' });
    let body;
    try { body = json(req.body); } catch { return res.status(400).json({ error: 'invalid_request' }); }
    try {
      const agent = getStore().activate({ code: body.code, agentId: String(body.agentId || '').toLowerCase(), jwk: body.publicKey,
        hostname: body.hostname, os: body.os, agentVersion: body.agentVersion });
      return res.status(201).json({ agentId: agent.id, projectName: agent.projectName, ecsName: agent.ecsName });
    } catch (e) {
      if (e.message === 'invalid_or_expired_code' || e.message === 'invalid_code') {
        failures.push(now);
        return res.status(403).json({ error: 'invalid_or_expired_code' });
      }
      return res.status(400).json({ error: 'invalid_request' });
    }
  });

  // Instalador baixado pelo projeto: o agente se cadastra com a chave do projeto (sem código) e é ligado à VM de mesmo nome.
  router.post('/enroll', async (req, res) => {
    const now = Date.now();
    while (failures.length && failures[0] < now - FAILURE_WINDOW_MS) failures.shift();
    if (failures.length >= MAX_FAILURES) return res.status(429).json({ error: 'too_many_attempts' });
    let body;
    try { body = json(req.body); } catch { return res.status(400).json({ error: 'invalid_request' }); }
    const token = String(body.enrollToken || '');
    const hostname = String(body.hostname || '').trim().slice(0, 200);
    const projeto = /^[A-Za-z0-9_-]{20,80}$/.test(token) ? getStore().peekEnrollment(token, now) : null;
    if (!projeto) {
      failures.push(now);
      return res.status(403).json({ error: 'invalid_or_expired_enrollment' });
    }
    let ecs = null;
    // Instalador geral (sem projeto): não há onde procurar a VM; fica aguardando o admin escolher projeto e servidor.
    try { ecs = findServer && hostname && projeto.projectKey ? await findServer(projeto, hostname) : null; } catch { ecs = null; }
    try {
      const agent = getStore().enroll({ token, agentId: String(body.agentId || '').toLowerCase(), jwk: body.publicKey, hostname, os: body.os,
        agentVersion: body.agentVersion, ecs }, Date.now());
      return res.status(201).json({ agentId: agent.id, projectName: agent.projectName, ecsName: agent.ecsName, pending: agent.pending });
    } catch (e) {
      if (e.message === 'invalid_or_expired_enrollment') return res.status(403).json({ error: e.message });
      return res.status(400).json({ error: 'invalid_request' });
    }
  });

  /** Confere agente ativo, horário (±300 s), nonce de uso único e assinatura do corpo. */
  function signed(req, res, next) {
    const store = getStore();
    const agentId = String(req.get('X-Agent-Id') || '').toLowerCase();
    const timestamp = String(req.get('X-Timestamp') || '');
    const nonce = String(req.get('X-Nonce') || '');
    const signature = String(req.get('X-Signature') || '');
    const agent = UUID.test(agentId) ? store.getAgent(agentId) : null;
    const now = Date.now();
    const ok = agent && !agent.revoked && /^\d{1,12}$/.test(timestamp) && Math.abs(now / 1000 - Number(timestamp)) <= 300 && UUID.test(nonce)
      && signature.length <= 2048 && Buffer.isBuffer(req.body)
      && verifySignature({ jwk: agent.jwk, method: 'POST', path: req.baseUrl + req.path, agentId, timestamp, nonce, body: req.body, signature })
      && store.useNonce(agentId, nonce.toLowerCase(), now);
    if (!ok) return res.status(401).json({ error: 'authentication_failed' });
    store.touch(agentId, now);
    req.agent = agent;
    next();
  }

  router.post('/claim', signed, (req, res) => {
    const job = getStore().claim(req.agent.id);
    res.json({
      job: job && { jobId: job.id, serviceName: job.serviceName, action: job.action, attempt: job.attempts, requestedBy: job.requestedBy },
      blocked: [...BLOCKED_SERVICES], blockedPrefixes: BLOCKED_PREFIXES, pollSeconds: POLL_SECONDS,
    });
  });

  router.post('/result', signed, (req, res) => {
    let body;
    try { body = json(req.body); } catch { return res.status(400).json({ error: 'invalid_request' }); }
    try {
      const ok = getStore().finish(req.agent.id, String(body.jobId || ''), { status: body.status, code: body.code, message: body.message, serviceStatus: body.serviceStatus });
      return ok ? res.json({ status: 'recorded' }) : res.status(409).json({ error: 'job_not_claimed' });
    } catch {
      return res.status(400).json({ error: 'invalid_request' });
    }
  });

  router.post('/catalog', signed, (req, res) => {
    let body;
    try { body = json(unwrapEnvelope(req.body)); } catch { return res.status(400).json({ error: 'invalid_request' }); }
    if (!Array.isArray(body.services)) return res.status(400).json({ error: 'invalid_request' });
    res.json({ services: getStore().saveCatalog(req.agent.id, body.services, body.agentVersion) });
  });

  return router;
}
