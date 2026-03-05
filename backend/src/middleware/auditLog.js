/**
 * Registra ação no log de auditoria. Chamar após operação bem-sucedida.
 * req.user deve ter id e email; userName é obtido do userStore.
 */

import { userStore } from '../data/store.js';
import { appendLog } from '../data/auditLog.js';

export function logAction(req, action, details = null) {
  if (!req?.user?.id) return;
  const u = userStore.getById(req.user.id);
  appendLog({
    userId: req.user.id,
    userName: u?.name ?? req.user.name ?? '',
    userEmail: req.user.email ?? '',
    action,
    details: details && typeof details === 'object' ? details : { value: details },
    createdAt: new Date().toISOString(),
  });
}
