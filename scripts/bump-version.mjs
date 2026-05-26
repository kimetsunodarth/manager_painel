import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

function readVersionFile() {
  const p = path.join(ROOT, 'VERSION');
  const v = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '';
  if (!/^\d+\.\d+\.\d+$/.test(v)) {
    throw new Error(`VERSION inválido ou ausente em ${p}.`);
  }
  return v;
}

function bump(v, kind) {
  const [maj, min, pat] = v.split('.').map((n) => parseInt(n, 10));
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Uso: node scripts/bump-version.mjs patch|minor|major`);
}

const kind = (process.argv[2] || '').trim();
const current = readVersionFile();
const next = bump(current, kind);

const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'set-version.mjs'), next], {
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
