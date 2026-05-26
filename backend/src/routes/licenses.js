import { Router } from 'express';
import { getLicenseSummary, getAddonsDetail, setLicenseSummary, setAddonsDetail, getLicencaAddons, setLicencaAddons } from '../data/licenses.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/summary', (req, res) => {
  const envId = req.query.envId;
  res.json(getLicenseSummary(envId));
});

router.get('/addons', (req, res) => {
  const envId = req.query.envId;
  res.json(getAddonsDetail(envId));
});

/** Atualizar quantidades de licenças SAP (apenas admin). Body: { crm, financials, logistics, professional, licencasIndiretas, totalUsuariosLicenciados, totalLicencas }. */
router.patch('/summary', requireAdmin, (req, res) => {
  const updated = setLicenseSummary(req.body || {});
  res.json(updated);
});

/** Atualizar lista de add-ons (apenas admin). Body: [ { name, count, color } ]. */
router.patch('/addons', requireAdmin, (req, res) => {
  const updated = setAddonsDetail(req.body);
  res.json(updated);
});

/** Texto da licença de add-ons (todos podem ler; apenas admin pode alterar). */
router.get('/addons-license', (req, res) => {
  res.json({ licencaAddons: getLicencaAddons() });
});

router.patch('/addons-license', requireAdmin, (req, res) => {
  const text = req.body?.licencaAddons != null ? String(req.body.licencaAddons) : getLicencaAddons();
  setLicencaAddons(text);
  res.json({ licencaAddons: getLicencaAddons() });
});

export default router;
