/**
 * Rotas de admin para gerenciar clientes (adicionar novo cliente e listar).
 * POST /api/admin/clients - cria arquivos de config e retorna snippet .env.
 *   No IIS: se config.enc existir na pasta do programa, o snippet é mesclado automaticamente em config.enc.
 * GET /api/admin/clients - lista clientes (registry + control center).
 * GET /api/admin/clients/:clientKey/services - retorna serviços HANA/Web e windowsServiceGroups do cliente.
 * PATCH /api/admin/clients/:clientKey/services - atualiza serviços e windowsServiceGroups do cliente.
 */

import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { validateNewClient, generateClientConfig, loadDynamicRegistry } from '../services/clientGenerator.js';
import { listControlCenterClientKeys } from '../config/controlCenterClients.js';
import { userStore } from '../data/store.js';
import { mergeIntoConfigEnc, isConfigEncInCwd } from '../config/configLoader.js';
import { clearHanaClientsCache } from '../config/hanaClients.js';
import fs from 'fs';
import path from 'path';
import { getConfigDir } from '../appRoot.js';

const HANA_CLIENTS_DIR = path.join(getConfigDir(), 'hana-clients');

const router = Router();
router.use(authMiddleware);
router.use(requireAdmin);

/** Lista clientes: registry dinâmico + chaves dos JSON em control-center e hana-clients (para referência). */
router.get('/clients', (req, res) => {
  try {
    const registry = loadDynamicRegistry();
    const ccKeys = listControlCenterClientKeys();
    let hanaKeys = [];
    try {
      const files = fs.readdirSync(HANA_CLIENTS_DIR);
      hanaKeys = files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    } catch {
      // ignore
    }
    res.json({
      registry,
      controlCenterKeys: ccKeys,
      hanaKeys,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao listar clientes' });
  }
});

/**
 * Adiciona novo cliente: valida, gera JSONs, atualiza registry, retorna snippet .env.
 * Se assignToUserIds for enviado, adiciona o cliente ao visibleProjects desses usuários
 * para que a aba Serviços já mostre o cliente (ex.: operador Edmar).
 */
router.post('/clients', (req, res) => {
  const body = req.body || {};
  const validated = validateNewClient(body);
  if (!validated.ok) {
    return res.status(400).json({ error: validated.error });
  }
  const assignToUserIds = Array.isArray(body.assignToUserIds)
    ? body.assignToUserIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const huaweiPerfil = typeof body.huaweiPerfil === 'string' ? body.huaweiPerfil.trim() : null;
  const huaweiProjectId = typeof body.huaweiProjectId === 'string' ? body.huaweiProjectId.trim() : null;
  if (huaweiPerfil) validated.huaweiPerfil = huaweiPerfil;
  try {
    const result = generateClientConfig(validated);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    clearHanaClientsCache();
    const nameForMatch = result.displayName.toLowerCase().replace(/\s+/g, '');
    /** Usar projectId e perfil Huawei existentes para que o cliente use a conta já configurada (não cria novo perfil). */
    const projectEntry = {
      id: huaweiProjectId || result.clientKey,
      name: nameForMatch,
      perfil: huaweiPerfil || result.displayName.toUpperCase().replace(/\s+/g, '_'),
    };
    const assigned = [];
    for (const userId of assignToUserIds) {
      const u = userStore.getById(userId);
      if (!u) continue;
      const current = Array.isArray(u.visibleProjects) ? u.visibleProjects : [];
      const alreadyHasProject = current.some(
        (p) => p && (p.id === projectEntry.id || p.id === result.clientKey || (huaweiProjectId && p.id === huaweiProjectId))
      );
      let merged;
      if (alreadyHasProject) {
        merged = current.map((p) => (p && (p.id === projectEntry.id || p.id === result.clientKey) ? projectEntry : p));
      } else {
        merged = [...current, projectEntry];
      }
      // Evitar duplicatas por id (mesmo projeto não aparece duas vezes)
      const byId = new Map();
      for (const p of merged) {
        if (p && p.id) byId.set(p.id, p);
      }
      merged = Array.from(byId.values());
      userStore.update(userId, {
        visibleProjects: merged,
        preferredServiceClientKey: result.clientKey,
      });
      assigned.push({ userId, name: u.name, alreadyHad: alreadyHasProject });
    }

    let configEncUpdated = false;
    if (isConfigEncInCwd()) {
      const mergeResult = mergeIntoConfigEnc(result.envSnippet);
      configEncUpdated = mergeResult.ok;
      if (!mergeResult.ok) console.warn('[Ananim] config.enc não atualizado:', mergeResult.error);
    }

    res.status(201).json({
      clientKey: result.clientKey,
      displayName: result.displayName,
      filesCreated: result.filesCreated,
      envSnippet: result.envSnippet,
      message: result.message,
      assignedOperators: assigned,
      configEncUpdated,
      envKeysWritten: result.envKeysWritten || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao gerar configuração' });
  }
});

/**
 * Retorna perfil do cliente para usar como base ao criar novo cliente (displayName, serviços, control center URL).
 * Credenciais não são retornadas (ficam no .env/config.enc).
 */
router.get('/clients/:clientKey/profile', (req, res) => {
  const clientKey = String(req.params.clientKey || '').trim().toLowerCase();
  if (!clientKey || /[^a-z0-9-]/.test(clientKey)) {
    return res.status(400).json({ error: 'Chave do cliente inválida' });
  }
  const baseKey = clientKey.endsWith('-web') ? clientKey.replace(/-web$/, '') : clientKey;
  const hanaPath = path.join(HANA_CLIENTS_DIR, `${baseKey}.json`);
  const webPath = path.join(HANA_CLIENTS_DIR, `${baseKey}-web.json`);
  const ccPath = path.join(getConfigDir(), 'control-center', `${baseKey}.json`);
  try {
    let displayName = '';
    let hanaServices = [];
    let webServices = [];
    let windowsServiceGroups = {};
    let controlCenterUrl = '';
    if (fs.existsSync(hanaPath)) {
      const hana = JSON.parse(fs.readFileSync(hanaPath, 'utf8'));
      displayName = hana.displayName || baseKey;
      hanaServices = Array.isArray(hana.services) ? hana.services : [];
    }
    if (fs.existsSync(webPath)) {
      const web = JSON.parse(fs.readFileSync(webPath, 'utf8'));
      if (!displayName) displayName = web.displayName || baseKey;
      webServices = Array.isArray(web.services) ? web.services : [];
      windowsServiceGroups = web.windowsServiceGroups && typeof web.windowsServiceGroups === 'object' ? web.windowsServiceGroups : {};
    }
    if (fs.existsSync(ccPath)) {
      const cc = JSON.parse(fs.readFileSync(ccPath, 'utf8'));
      if (cc.baseUrl) controlCenterUrl = cc.baseUrl.replace(/\/$/, '');
    }
    if (!displayName) {
      const registry = loadDynamicRegistry();
      const entry = registry.find((e) => e.clientKey === baseKey);
      if (entry) displayName = entry.displayName || baseKey;
    }
    res.json({
      clientKey: baseKey,
      displayName: displayName || baseKey,
      hanaServices,
      webServices,
      windowsServiceGroups,
      controlCenterUrl,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao carregar perfil' });
  }
});

/** Retorna serviços HANA, Web e windowsServiceGroups do cliente (para edição). */
router.get('/clients/:clientKey/services', (req, res) => {
  const clientKey = String(req.params.clientKey || '').trim().toLowerCase();
  if (!clientKey || /[^a-z0-9-]/.test(clientKey)) {
    return res.status(400).json({ error: 'Chave do cliente inválida' });
  }
  const hanaPath = path.join(HANA_CLIENTS_DIR, `${clientKey}.json`);
  const webPath = path.join(HANA_CLIENTS_DIR, `${clientKey}-web.json`);
  try {
    let hanaServices = [];
    let webServices = [];
    let windowsServiceGroups = {};
    if (fs.existsSync(hanaPath)) {
      const hana = JSON.parse(fs.readFileSync(hanaPath, 'utf8'));
      hanaServices = Array.isArray(hana.services) ? hana.services : [];
    }
    if (fs.existsSync(webPath)) {
      const web = JSON.parse(fs.readFileSync(webPath, 'utf8'));
      webServices = Array.isArray(web.services) ? web.services : [];
      windowsServiceGroups = web.windowsServiceGroups && typeof web.windowsServiceGroups === 'object' ? web.windowsServiceGroups : {};
    }
    res.json({ clientKey, hanaServices, webServices, windowsServiceGroups });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao ler serviços do cliente' });
  }
});

/**
 * DELETE /api/admin/clients/:clientKey
 * Remove o cliente: registry, arquivos JSON (hana-clients, control-center) e referências em visibleProjects dos usuários.
 */
router.delete('/clients/:clientKey', (req, res) => {
  const clientKey = String(req.params.clientKey || '').trim().toLowerCase();
  if (!clientKey || /[^a-z0-9-]/.test(clientKey)) {
    return res.status(400).json({ error: 'Chave do cliente inválida' });
  }
  try {
    const registry = loadDynamicRegistry();
    const idx = registry.findIndex((e) => e.clientKey === clientKey);
    if (idx === -1) {
      return res.status(404).json({ error: 'Cliente não encontrado no registry' });
    }
    const removed = registry[idx];
    registry.splice(idx, 1);
    const { writeFileSync, unlinkSync, existsSync } = fs;
    const REGISTRY_PATH = path.join(getConfigDir(), 'dynamic-clients-registry.json');
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');

    const baseKey = clientKey.endsWith('-web') ? clientKey.replace(/-web$/, '') : clientKey;
    const toDelete = [
      path.join(HANA_CLIENTS_DIR, `${baseKey}.json`),
      path.join(HANA_CLIENTS_DIR, `${baseKey}-web.json`),
      path.join(getConfigDir(), 'control-center', `${baseKey}.json`),
    ];
    for (const file of toDelete) {
      try {
        if (existsSync(file)) unlinkSync(file);
      } catch (e) {
        console.warn('[adminClients] delete file', file, e.message);
      }
    }

    const allUsers = userStore.getAll?.() || [];
    for (const u of allUsers) {
      if (!u.id || !Array.isArray(u.visibleProjects)) continue;
      const filtered = u.visibleProjects.filter(
        (p) => p && p.id !== baseKey && p.id !== clientKey && (p.name || '').toLowerCase().replace(/\s+/g, '') !== (removed.displayName || '').toLowerCase().replace(/\s+/g, '')
      );
      if (filtered.length !== u.visibleProjects.length) {
        userStore.update(u.id, { visibleProjects: filtered });
      }
    }
    clearHanaClientsCache();
    logAction(req, 'client_delete', { clientKey: baseKey, displayName: removed.displayName });
    res.json({ ok: true, clientKey: baseKey, displayName: removed.displayName });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao excluir cliente' });
  }
});

/** Atualiza serviços HANA, Web e windowsServiceGroups do cliente. */
router.patch('/clients/:clientKey/services', (req, res) => {
  const clientKey = String(req.params.clientKey || '').trim().toLowerCase();
  if (!clientKey || /[^a-z0-9-]/.test(clientKey)) {
    return res.status(400).json({ error: 'Chave do cliente inválida' });
  }
  const { hanaServices, webServices, windowsServiceGroups } = req.body || {};
  const hanaPath = path.join(HANA_CLIENTS_DIR, `${clientKey}.json`);
  const webPath = path.join(HANA_CLIENTS_DIR, `${clientKey}-web.json`);
  try {
    if (fs.existsSync(hanaPath) && Array.isArray(hanaServices) && hanaServices.length > 0) {
      const hana = JSON.parse(fs.readFileSync(hanaPath, 'utf8'));
      const valid = hanaServices.every((s) => s && typeof s.id === 'string' && typeof s.name === 'string');
      if (valid) {
        hana.services = hanaServices.map((s) => ({ ...s, action: s.action || 'executar' }));
        fs.writeFileSync(hanaPath, JSON.stringify(hana, null, 2), 'utf8');
      }
    }
    if (fs.existsSync(webPath)) {
      const web = JSON.parse(fs.readFileSync(webPath, 'utf8'));
      if (Array.isArray(webServices) && webServices.length > 0 && webServices.every((s) => s && typeof s.id === 'string' && typeof s.name === 'string')) {
        web.services = webServices.map((s) => ({ ...s, action: s.action || 'executar' }));
      }
      if (windowsServiceGroups && typeof windowsServiceGroups === 'object' && !Array.isArray(windowsServiceGroups)) {
        const filtered = {};
        for (const [k, v] of Object.entries(windowsServiceGroups)) {
          if (Array.isArray(v) && v.every((n) => typeof n === 'string')) filtered[k] = v;
        }
        web.windowsServiceGroups = filtered;
      }
      fs.writeFileSync(webPath, JSON.stringify(web, null, 2), 'utf8');
    }
    clearHanaClientsCache();
    res.json({ ok: true, clientKey });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro ao atualizar serviços' });
  }
});

export default router;
