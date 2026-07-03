/**
 * Registra ação no log de auditoria. Chamar após operação bem-sucedida.
 * req.user deve ter id e email; userName é obtido do userStore.
 */

import { userStore } from '../data/store.js';
import { appendLog } from '../data/auditLog.js';
import { extractIp } from '../utils/validation.js';

export function logAction(req, action, details = null) {
  if (!req?.user?.id) return;
  const u = userStore.getById(req.user.id);
  appendLog({
    userId: req.user.id,
    userName: u?.name ?? req.user.name ?? '',
    userEmail: req.user.email ?? '',
    action,
    details: details && typeof details === 'object' ? details : { value: details },
    ipAddress: extractIp(req),
    userAgent: req.headers && req.headers['user-agent'] ? req.headers['user-agent'] : null,
    countryCode: req.securityContext?.geo?.countryCode || null,
    countryName: req.securityContext?.geo?.countryName || null,
    regionName: req.securityContext?.geo?.regionName || null,
    cityName: req.securityContext?.geo?.cityName || null,
    createdAt: new Date().toISOString(),
  });
}
