import { Router } from 'express';
import { filterEnvironments } from '../data/environments.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const { ip, pais, vlan, ambiente, cliente, parceiro, erp } = req.query;
  const list = filterEnvironments({ ip, pais, vlan, ambiente, cliente, parceiro, erp });
  res.json(list);
});

export default router;
