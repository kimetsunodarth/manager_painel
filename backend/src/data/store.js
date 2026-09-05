/**
 * Store de usuários persistido em SQLite (banco interno).
 */

import { getDb } from '../db/database.js';
import { normalizeAllowedServiceIds } from '../utils/servicePermissions.js';

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    permissions: JSON.parse(row.permissions || '[]'),
    allowedEcsIds: JSON.parse(row.allowedEcsIds || '[]'),
    visibleProjects: JSON.parse(row.visibleProjects || '[]'),
    allowedHuaweiEcsIds: (() => {
      const val = row.allowedHuaweiEcsIds;
      if (!val) return {};
      try {
        const parsed = JSON.parse(val);
        return typeof parsed === 'object' && parsed !== null ? parsed : {};
      } catch {
        // Fallback: se for lista simples (string separada por vírgula), aceita mas avisa
        return {};
      }
    })(),
    allowedServiceIds: normalizeAllowedServiceIds(JSON.parse(row.allowedServiceIds ?? '[]')),
    preferredServiceClientKey: row.preferredServiceClientKey != null && row.preferredServiceClientKey !== '' ? row.preferredServiceClientKey : null,
    mfaEnabled: Number(row.mfaEnabled ?? 1) !== 0,
    mfaEmail: row.mfaEmail ? String(row.mfaEmail) : null,
    failedLoginAttempts: Number(row.failedLoginAttempts || 0),
    lockedUntil: row.lockedUntil || null,
    lastLoginAt: row.lastLoginAt || null,
  };
}

function rowToUserWithHash(row) {
  if (!row) return null;
  return {
    ...rowToUser(row),
    passwordHash: row.passwordHash,
    mfaSecret: row.mfaSecret ? String(row.mfaSecret) : null,
  };
}

export const userStore = {
  findByLogin(login) {
    const value = typeof login === 'string' ? login.trim() : '';
    if (!value) return null;
    const row = getDb().prepare(`
      SELECT *
      FROM users
      WHERE LOWER(email) = LOWER(?)
         OR LOWER(
           CASE
             WHEN INSTR(email, '@') > 0 THEN SUBSTR(email, 1, INSTR(email, '@') - 1)
             ELSE email
           END
         ) = LOWER(?)
      LIMIT 1
    `).get(value, value);
    return row ? rowToUserWithHash(row) : null;
  },

  findByEmail(email) {
    const row = getDb().prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    return row ? rowToUserWithHash(row) : null;
  },

  findById(id) {
    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row ? rowToUserWithHash(row) : null;
  },

  getAll() {
    const rows = getDb().prepare('SELECT id, name, email, role, permissions, allowedEcsIds, visibleProjects, allowedHuaweiEcsIds, allowedServiceIds, preferredServiceClientKey, mfaEnabled, mfaEmail, failedLoginAttempts, lockedUntil, lastLoginAt FROM users').all();
    return rows.map(rowToUser);
  },

  create(user) {
    const db = getDb();
    const ids = db.prepare('SELECT id FROM users').all().map((r) => parseInt(r.id, 10)).filter((n) => !Number.isNaN(n));
    const id = String((ids.length ? Math.max(...ids) : 0) + 1);
    const allowedHuaweiEcsIds = user.allowedHuaweiEcsIds != null ? JSON.stringify(user.allowedHuaweiEcsIds) : '{}';
    const allowedServiceIds = JSON.stringify(normalizeAllowedServiceIds(user.allowedServiceIds || []));
    db.prepare(
      `INSERT INTO users (id, name, email, passwordHash, role, permissions, allowedEcsIds, visibleProjects, allowedHuaweiEcsIds, allowedServiceIds, mfaEnabled, mfaEmail, mfaSecret, failedLoginAttempts, lockedUntil, lastLoginAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      user.name,
      user.email,
      user.passwordHash,
      user.role || 'operator',
      JSON.stringify(user.permissions || ['backups:list']),
      JSON.stringify(user.allowedEcsIds || []),
      JSON.stringify(user.visibleProjects || []),
      allowedHuaweiEcsIds,
      allowedServiceIds,
      user.mfaEnabled === false ? 0 : 1,
      user.mfaEmail || null,
      user.mfaSecret || null,
      0,
      null,
      null
    );
    return this.getById(id);
  },

  delete(id) {
    const result = getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
    return result.changes > 0;
  },

  update(id, data) {
    const existing = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) return null;

    const updates = [];
    const values = [];
    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.email !== undefined) {
      updates.push('email = ?');
      values.push(data.email);
    }
    if (data.role !== undefined) {
      updates.push('role = ?');
      values.push(data.role);
    }
    if (data.permissions !== undefined) {
      updates.push('permissions = ?');
      values.push(JSON.stringify(data.permissions));
    }
    if (data.allowedEcsIds !== undefined) {
      updates.push('allowedEcsIds = ?');
      values.push(JSON.stringify(data.allowedEcsIds));
    }
    if (data.visibleProjects !== undefined) {
      updates.push('visibleProjects = ?');
      values.push(JSON.stringify(data.visibleProjects));
    }
    if (data.allowedHuaweiEcsIds !== undefined) {
      updates.push('allowedHuaweiEcsIds = ?');
      values.push(JSON.stringify(data.allowedHuaweiEcsIds));
    }
    if (data.allowedServiceIds !== undefined) {
      updates.push('allowedServiceIds = ?');
      values.push(JSON.stringify(normalizeAllowedServiceIds(data.allowedServiceIds)));
    }
    if (data.preferredServiceClientKey !== undefined) {
      updates.push('preferredServiceClientKey = ?');
      values.push(data.preferredServiceClientKey == null || data.preferredServiceClientKey === '' ? null : data.preferredServiceClientKey);
    }
    if (data.mfaEnabled !== undefined) {
      updates.push('mfaEnabled = ?');
      values.push(data.mfaEnabled ? 1 : 0);
    }
    if (data.mfaEmail !== undefined) {
      updates.push('mfaEmail = ?');
      values.push(data.mfaEmail == null || data.mfaEmail === '' ? null : String(data.mfaEmail));
    }
    if (data.mfaSecret !== undefined) {
      updates.push('mfaSecret = ?');
      values.push(data.mfaSecret == null || data.mfaSecret === '' ? null : String(data.mfaSecret));
    }
    if (data.passwordHash !== undefined) {
      updates.push('passwordHash = ?');
      values.push(data.passwordHash);
    }
    if (data.failedLoginAttempts !== undefined) {
      updates.push('failedLoginAttempts = ?');
      values.push(Number(data.failedLoginAttempts) || 0);
    }
    if (data.lockedUntil !== undefined) {
      updates.push('lockedUntil = ?');
      values.push(data.lockedUntil || null);
    }
    if (data.lastLoginAt !== undefined) {
      updates.push('lastLoginAt = ?');
      values.push(data.lastLoginAt || null);
    }
    if (updates.length === 0) return this.getById(id);
    values.push(id);
    getDb().prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  },

  setPassword(id, passwordHash) {
    const result = getDb().prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(passwordHash, id);
    return result.changes > 0;
  },

  getById(id) {
    const row = getDb().prepare('SELECT id, name, email, role, permissions, allowedEcsIds, visibleProjects, allowedHuaweiEcsIds, allowedServiceIds, preferredServiceClientKey, mfaEnabled, mfaEmail, failedLoginAttempts, lockedUntil, lastLoginAt FROM users WHERE id = ?').get(id);
    return row ? rowToUser(row) : null;
  },

  registerFailedLogin(id, { lockMinutes = 15, maxAttempts = 5 } = {}) {
    const user = this.findById(id);
    if (!user) return null;
    const failedLoginAttempts = Number(user.failedLoginAttempts || 0) + 1;
    const lockedUntil = failedLoginAttempts >= maxAttempts
      ? new Date(Date.now() + lockMinutes * 60 * 1000).toISOString()
      : null;
    return this.update(id, {
      failedLoginAttempts,
      lockedUntil,
    });
  },

  clearFailedLogins(id) {
    return this.update(id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  },

  markSuccessfulLogin(id) {
    return this.update(id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date().toISOString(),
    });
  },

  /** Limpa o segredo TOTP do usuário — próximo login (se MFA continuar exigido) mostra um QR code novo pra reconfigurar do zero (perda do celular/autenticador). */
  resetMfa(id) {
    return this.update(id, { mfaSecret: null });
  },

  _raw() {
    return getDb().prepare('SELECT * FROM users').all().map((row) => rowToUserWithHash(row));
  },
};

// Última execução dos serviços (em memória; opcional persistir depois)
export const serviceExecutions = {
  'reiniciar-banco-hana': null,
  'reiniciar-eds-hana': null,
  'reiniciar-service-layer-hana': null,
  'reiniciar-sld-hana': null,
};

export function setServiceExecution(serviceId, status = 'Success') {
  serviceExecutions[serviceId] = {
    at: new Date().toISOString(),
    status,
  };
}

export function getServiceExecution(serviceId) {
  return serviceExecutions[serviceId];
}
