import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-for-auth-middleware';

const { initDb, closeDb } = await import('../src/db/database.js');
const { userStore } = await import('../src/data/store.js');
const { authMiddleware } = await import('../src/middleware/auth.js');

initDb();
after(() => closeDb());

let nextUserId = 0;
function createUser() {
  return userStore.create({
    name: 'Test User',
    email: `test-${++nextUserId}@example.com`,
    passwordHash: 'test-password-hash',
    role: 'operator',
    permissions: ['backups:list'],
  });
}

function tokenFor(user) {
  const current = userStore.getAuthStateById(user.id);
  return jwt.sign({
    id: user.id,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    authVersion: current.authVersion,
  }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function authenticate(token) {
  const req = { cookies: { token }, headers: {} };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let continued = false;
  authMiddleware(req, res, () => { continued = true; });
  return { req, res, continued };
}

test('accepts a current token and loads the current stored user', () => {
  const user = createUser();
  const result = authenticate(tokenFor(user));

  assert.equal(result.continued, true);
  assert.equal(result.req.user.id, user.id);
  assert.deepEqual(result.req.user.permissions, ['backups:list']);
  userStore.delete(user.id);
});

test('rejects a token after the user is removed', () => {
  const user = createUser();
  const token = tokenFor(user);
  userStore.delete(user.id);

  const result = authenticate(token);
  assert.equal(result.continued, false);
  assert.equal(result.res.statusCode, 401);
});

test('rejects a token after permissions or role change', () => {
  const user = createUser();
  const token = tokenFor(user);
  userStore.update(user.id, { role: 'client', permissions: [] });

  const result = authenticate(token);
  assert.equal(result.continued, false);
  assert.equal(result.res.statusCode, 401);
  userStore.delete(user.id);
});

test('rejects a token after password reset', () => {
  const user = createUser();
  const token = tokenFor(user);
  userStore.setPassword(user.id, 'new-test-password-hash');

  const result = authenticate(token);
  assert.equal(result.continued, false);
  assert.equal(result.res.statusCode, 401);
  userStore.delete(user.id);
});

test('rejects a token while the account is temporarily locked', () => {
  const user = createUser();
  const token = tokenFor(user);
  userStore.update(user.id, { lockedUntil: new Date(Date.now() + 60_000).toISOString() });

  const result = authenticate(token);
  assert.equal(result.continued, false);
  assert.equal(result.res.statusCode, 401);
  userStore.delete(user.id);
});

test('rejects legacy tokens without an auth version', () => {
  const user = createUser();
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const result = authenticate(token);
  assert.equal(result.continued, false);
  assert.equal(result.res.statusCode, 401);
  userStore.delete(user.id);
});
