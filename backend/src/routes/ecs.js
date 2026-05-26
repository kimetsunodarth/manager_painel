import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

function canActOnEcs(req, ecsId) {
  if (req.user?.role === 'admin') return true;
  const allowed = req.user?.allowedEcsIds || [];
  return allowed.includes(ecsId);
}

router.post('/:ecsId/start', requirePermission('ecs:*'), (req, res) => {
  if (!canActOnEcs(req, req.params.ecsId)) {
    return res.status(403).json({ error: 'Sem permissão para este ECS' });
  }
  // TODO: chamar Huawei ECS API (start server)
  res.json({ ok: true, message: 'Comando start enviado para o ECS', ecsId: req.params.ecsId });
});

router.post('/:ecsId/stop', requirePermission('ecs:*'), (req, res) => {
  if (!canActOnEcs(req, req.params.ecsId)) {
    return res.status(403).json({ error: 'Sem permissão para este ECS' });
  }
  res.json({ ok: true, message: 'Comando stop enviado para o ECS', ecsId: req.params.ecsId });
});

router.post('/:ecsId/restart', requirePermission('ecs:*'), (req, res) => {
  if (!canActOnEcs(req, req.params.ecsId)) {
    return res.status(403).json({ error: 'Sem permissão para este ECS' });
  }
  res.json({ ok: true, message: 'Comando restart enviado para o ECS', ecsId: req.params.ecsId });
});

export default router;
