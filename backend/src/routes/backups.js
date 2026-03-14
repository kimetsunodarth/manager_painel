import { Router } from 'express';
import { searchBackups } from '../data/backups.js';
import { authMiddleware } from '../middleware/auth.js';
import { requirePermission } from '../middleware/auth.js';
import { getProfileNames, getProfileCredentials } from '../config/configLoader.js';
import { listBackups } from '../services/huawei-cbr.js';
import { userStore } from '../data/store.js';
import { getEnrichedVisibleProjects } from './huawei.js';

const router = Router();
router.use(authMiddleware);

function projectKey(projectId, perfil) {
  return perfil ? `${perfil}-${projectId}` : projectId;
}

/**
 * Resolve lista de alvos (perfil + projectId + clientName + region) que o usuário pode ver.
 */
function getCbrTargets(u) {
  const targets = [];
  const profileNames = getProfileNames();
  
  // Mapeamento de projectId para Perfil para resolução rápida
  const projectIdToProfile = new Map();
  profileNames.forEach((pn) => {
    try {
      const creds = getProfileCredentials(pn);
      if (creds.project_id) projectIdToProfile.set(creds.project_id.trim(), pn);
    } catch (_) {}
  });

  if (u.role === 'admin' && u.permissions?.includes('huawei:projects')) {
    profileNames.forEach((profile) => {
      try {
        const creds = getProfileCredentials(profile);
        targets.push({ profile, projectId: creds.project_id || '', clientName: profile, region: creds.region || 'la-south-2' });
      } catch (_) {}
    });
  } else {
    const visible = u.visibleProjects || [];
    console.log(`[CBR] Resolvendo alvos para ${u.email}. Projetos visíveis (enriquecidos):`, visible.map(p => p.id));
    
    visible.forEach((p) => {
      const projectId = p.id;
      let profile = p.perfil ? String(p.perfil).trim() : null;
      if (!profile) profile = projectIdToProfile.get(projectId) || null;
      
      if (!profile) {
        // Fallback robusto por nome do projeto ou perfil
        const search = (p.name || '').toLowerCase();
        profile = profileNames.find((pn) => pn.toLowerCase().includes(search) || search.includes(pn.toLowerCase())) || null;
      }
      
      const region = p.region || 'la-south-2';
      const clientName = p.name || profile || projectId;
      
      if (projectId) {
        targets.push({ profile: profile || '', projectId, clientName, region });
      } else {
        console.warn(`[CBR] Projeto ${p.name} sem ID. Ignorado.`);
      }
    });
  }
  
  // Deduplicação
  return targets.filter((t, index, self) => 
    t.projectId && self.findIndex(i => i.projectId === t.projectId && i.profile === t.profile) === index
  );
}

router.get('/', (req, res) => {
  const { q, page = 1, perPage = 10 } = req.query;
  const result = searchBackups(q, Number(page), Number(perPage) || 10);
  res.json(result);
});

/**
 * GET /api/backups/cbr?days=7
 */
router.get('/cbr', requirePermission('backups:list'), async (req, res) => {
  try {
    const days = Math.min(31, Math.max(1, Number(req.query.days) || 7));
    const filterPerfil = (req.query.perfil || '').trim() || null;
    const u = userStore.getById(req.user.id);
    if (!u) return res.status(401).json({ error: 'Usuário não encontrado' });

    // ENRIQUECIMENTO: Mesma lógica da Home e Serviços
    const visibleProjects = await getEnrichedVisibleProjects(u);
    const uWithEnrichment = { ...u, visibleProjects };
    
    const targets = getCbrTargets(uWithEnrichment);
    console.log(`[CBR] Alvos identificados para fetch:`, targets.map(t => `${t.profile || 'SEM_PERFIL'}:${t.projectId}`));

    let toFetch = targets;
    if (filterPerfil) {
      toFetch = targets.filter((t) => t.profile === filterPerfil);
    }

    const byClient = [];
    const allowedByProject = u?.allowedHuaweiEcsIds || {};

    for (const t of toFetch) {
      const { profile, projectId, clientName, region } = t;
      if (!profile) {
        console.warn(`[CBR] Pulando alvo ${clientName} (${projectId}) pois perfil não foi resolvido.`);
        byClient.push({ profile: '', clientName, projectId, region, backups: [], error: 'Perfil não identificado para este projeto.' });
        continue;
      }

      try {
        const creds = getProfileCredentials(profile);
        const projectIdForCbr = (projectId && String(projectId).trim()) || creds.project_id;
        
        console.log(`[CBR] Buscando backups para ${clientName} (Profile: ${profile}, Project: ${projectIdForCbr})`);
        let backups = await listBackups(profile, { days, projectId: projectIdForCbr, region: region || creds.region });
        
        // Filtro de permissão por ID de ECS (se o operador tiver limites)
        const key = projectKey(projectIdForCbr, profile);
        let allowedIds = allowedByProject[key] || allowedByProject[projectIdForCbr];
        
        if (u.role !== 'admin' && Array.isArray(allowedIds) && allowedIds.length > 0) {
          const idSet = new Set(allowedIds);
          backups = backups.filter((b) => b.resource_id && idSet.has(b.resource_id));
        }

        byClient.push({
          profile,
          clientName,
          projectId: projectIdForCbr,
          region: region || creds.region,
          backups,
        });
      } catch (e) {
        console.error(`[CBR] Erro ao buscar para ${clientName}:`, e.message);
        byClient.push({ profile, clientName, projectId, region, backups: [], error: e.message });
      }
    }

    res.json({ byClient, days });
  } catch (e) {
    console.error(`[CBR] Erro fatal na rota:`, e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
