import { Router } from 'express';
import { searchBackups } from '../data/backups.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/auth.js';
import { getProfileNames, getProfileCredentials } from '../config/configLoader.js';
import { listBackups } from '../services/huawei-cbr.js';
import { userStore } from '../data/store.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const { q, page = 1, perPage = 10 } = req.query;
  const result = searchBackups(q, Number(page), Number(perPage) || 10);
  res.json(result);
});

function projectKey(projectId, perfil) {
  return perfil ? `${perfil}-${projectId}` : projectId;
}

/**
 * Resolve lista de alvos (perfil + projectId + clientName + region) que o usuário pode ver.
 * Mesma regra que ECS/restart: admin com huawei:projects vê todos os perfis; operador só visibleProjects.
 */
function getCbrTargets(u) {
  const targets = [];
  if (u.role === 'admin' && u.permissions?.includes('huawei:projects')) {
    const profileNames = getProfileNames();
    profileNames.forEach((profile) => {
      try {
        const creds = getProfileCredentials(profile);
        targets.push({ profile, projectId: creds.project_id || '', clientName: profile, region: creds.region || 'la-south-2' });
      } catch (_) {}
    });
  } else {
    const visible = u.visibleProjects || [];
    const profileNames = getProfileNames();
    const projectIdToProfile = new Map();
    profileNames.forEach((p) => {
      try {
        const creds = getProfileCredentials(p);
        if (creds.project_id) projectIdToProfile.set(creds.project_id.trim(), p);
      } catch (_) {}
    });
    visible.forEach((p) => {
      const projectId = p.id;
      const profile = p.perfil || projectIdToProfile.get(projectId);
      const clientName = p.name || profile || projectId;
      const region = p.region || 'la-south-2';
      targets.push({ profile: profile || '', projectId, clientName, region });
    });
  }
  return targets;
}

/**
 * GET /api/backups/cbr?days=7&perfil=RAMO_CH_RAMOONE
 * Lista backups CBR. Mesma regra de permissão que projetos/ECS/restart:
 * - Admin com huawei:projects: todos os perfis.
 * - Operador: apenas projetos em visibleProjects (só vê CBR dos projetos que tem permissão).
 * Se perfil for informado, retorna apenas esse projeto (e exige que o usuário tenha permissão).
 */
router.get('/cbr', requirePermission('backups:list'), async (req, res) => {
  try {
    const days = Math.min(31, Math.max(1, Number(req.query.days) || 7));
    const filterPerfil = (req.query.perfil || '').trim() || null;
    const u = userStore.getById(req.user.id);
    if (!u) return res.status(401).json({ error: 'Usuário não encontrado' });

    const targets = getCbrTargets(u);
    let toFetch = targets;
    if (filterPerfil) {
      const allowed = targets.filter((t) => t.profile === filterPerfil);
      if (allowed.length === 0) {
        return res.status(403).json({ error: 'Sem permissão para este projeto' });
      }
      toFetch = allowed;
    }

    /** @type {Array<{ profile: string, clientName: string, projectId: string, region: string, backups: Array, error?: string }>} */
    const byClient = [];

    const allowedByProject = u?.allowedHuaweiEcsIds || {};

    for (const t of toFetch) {
      const { profile, projectId, clientName, region } = t;
      if (!profile) {
        byClient.push({ profile: '', clientName, projectId, region, backups: [], error: 'Perfil não configurado para este projeto' });
        continue;
      }
      try {
        const creds = getProfileCredentials(profile);
        const projectIdForCbr = (projectId && String(projectId).trim()) || creds.project_id;
        let backups = await listBackups(profile, { days, projectId: projectIdForCbr, region: region || creds.region });
        const key = projectKey(projectIdForCbr, profile);
        const allowedIds = allowedByProject[key];
        if (u.role !== 'admin' && Array.isArray(allowedIds) && allowedIds.length > 0) {
          const idSet = new Set(allowedIds);
          backups = backups.filter((b) => b.resource_id && idSet.has(b.resource_id));
        }
        byClient.push({
          profile,
          clientName,
          projectId: projectIdForCbr || projectId,
          region: region || creds.region,
          backups,
        });
      } catch (e) {
        byClient.push({ profile, clientName, projectId, region, backups: [], error: e.message });
      }
    }

    res.json({ byClient, days });
  } catch (e) {
    const status = e.message?.includes('Perfil') || e.message?.includes('Configure') ? 400 : 502;
    res.status(status).json({ error: e.message });
  }
});

export default router;
