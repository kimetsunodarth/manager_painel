/**
 * Usuários do painel — armazenamento em JSON (criptografado quando SESSION_SECRET está definido), senhas com bcrypt.
 */
const path = require("path");
const bcrypt = require("bcryptjs");
const secureStore = require("./utils/secureStore");

const dataDir = process.env.APP_DATA_DIR || __dirname;
const FILE = path.join(dataDir, "users.json");
const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Política de senha: mínimo 8 caracteres, pelo menos uma letra, um número e um caractere especial.
 */
function validatePassword(password) {
  const pwd = (password || "").trim();
  if (pwd.length < MIN_PASSWORD_LENGTH) {
    throw new Error("Senha deve ter no mínimo " + MIN_PASSWORD_LENGTH + " caracteres");
  }
  if (!/[a-zA-Z]/.test(pwd)) throw new Error("Senha deve conter pelo menos uma letra");
  if (!/[0-9]/.test(pwd)) throw new Error("Senha deve conter pelo menos um número");
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd)) {
    throw new Error("Senha deve conter pelo menos um caractere especial (ex.: !@#$%&*)");
  }
}

function load() {
  try {
    return secureStore.readJson(FILE);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

function save(list) {
  secureStore.writeJson(FILE, list);
}

function nextId(list) {
  const ids = list.map((u) => u.id).filter((n) => typeof n === "number");
  return ids.length ? Math.max(...ids) + 1 : 1;
}

async function ensureAdmin() {
  const list = load();
  const admin = list.find((u) => u.role === "admin");
  if (!admin) {
    const hash = await bcrypt.hash("admin123", SALT_ROUNDS);
    list.push({
      id: 1,
      email: "admin",
      passwordHash: hash,
      role: "admin",
      createdAt: new Date().toISOString(),
    });
    save(list);
  }
}

function findByEmail(email) {
  const list = load();
  const e = (email || "").trim().toLowerCase();
  return list.find((u) => (u.email || "").toLowerCase() === e);
}

async function verify(email, password) {
  const user = findByEmail(email);
  if (!user || !user.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? { id: user.id, email: user.email, role: user.role } : null;
}

function list() {
  return load().map((u) => ({ id: u.id, email: u.email, role: u.role, createdAt: u.createdAt }));
}

async function create(body) {
  const list = load();
  const email = (body.email || "").trim().slice(0, 256);
  if (!email) throw new Error("E-mail é obrigatório");
  if (findByEmail(email)) throw new Error("Usuário já existe");
  const password = (body.password || "").trim();
  if (!password) throw new Error("Senha é obrigatória");
  validatePassword(password);
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const id = nextId(list);
  list.push({
    id,
    email,
    passwordHash: hash,
    role: body.role || "user",
    createdAt: new Date().toISOString(),
  });
  save(list);
  return { id, email, role: list[list.length - 1].role };
}

async function resetPassword(id, newPassword) {
  const list = load();
  const idx = list.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error("Usuário não encontrado");
  const pwd = (newPassword || "").trim();
  if (!pwd) throw new Error("Nova senha é obrigatória");
  validatePassword(pwd);
  list[idx].passwordHash = await bcrypt.hash(pwd, SALT_ROUNDS);
  save(list);
  return { ok: true };
}

function remove(id) {
  const list = load();
  const idx = list.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error("Usuário não encontrado");
  if (list[idx].role === "admin") throw new Error("Não é possível excluir o usuário admin");
  list.splice(idx, 1);
  save(list);
  return { ok: true };
}

module.exports = {
  load,
  ensureAdmin,
  verify,
  list,
  create,
  resetPassword,
  remove,
  findByEmail,
};
