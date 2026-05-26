import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function setPackageVersion(pkgPath, version) {
  const raw = readText(pkgPath);
  const pkg = JSON.parse(raw);
  pkg.version = version;
  writeText(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function setIssDefineVersion(issPath, version) {
  const raw = readText(issPath);
  const re = /#define\s+MyAppVersion\s+"[^"]+"/;
  if (!re.test(raw)) {
    throw new Error(`Não encontrei '#define MyAppVersion' em ${issPath}`);
  }
  const next = raw.replace(re, `#define MyAppVersion "${version}"`);
  if (next !== raw) writeText(issPath, next);
}

function normalizeVersion(v) {
  const version = String(v || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Versão inválida: "${version}". Use SemVer X.Y.Z (ex.: 1.2.15).`);
  }
  return version;
}

const arg = process.argv[2];
const version = normalizeVersion(arg);

writeText(path.join(ROOT, 'VERSION'), version + '\n');
// Opcional: versionar o meta-package do repo (scripts).
const rootPkgPath = path.join(ROOT, 'package.json');
if (fs.existsSync(rootPkgPath)) setPackageVersion(rootPkgPath, version);
setPackageVersion(path.join(ROOT, 'backend', 'package.json'), version);
setPackageVersion(path.join(ROOT, 'frontend', 'package.json'), version);
setIssDefineVersion(path.join(ROOT, 'installer', 'installer-iis.iss'), version);

console.log(`[version] OK -> ${version}`);
