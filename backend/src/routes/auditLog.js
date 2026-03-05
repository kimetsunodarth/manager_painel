import { Router } from 'express';
import { getLogs } from '../data/auditLog.js';
import { authMiddleware, requirePermission } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/audit-logs?limit=500
 * Lista o log de auditoria. Apenas administradores.
 */
router.get('/', requirePermission('users:*'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
  const logs = getLogs(limit);
  res.json(logs);
});

export default router;
