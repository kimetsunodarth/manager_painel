import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import { embedActivation, readEmbeddedActivation, buildTarGz } from '../src/agent/agentPackages.js';
import { createAgentStore, CODE_TTL_MS, PACKAGE_CODE_TTL_MS } from '../src/agent/agentStore.js';

const ativacao = { url: 'https://ananim-manager.ananim.com.br', code: 'ABCD-EFGH-JKLM', enroll: '', projectName: 'sa-brazil-1_Ecoa', ecsName: 'ECOAWEB' };

test('ativação embutida no fim do exe e lida de volta (o exe continua igual no começo)', () => {
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(5000, 7)]);
  const pacote = embedActivation(exe, ativacao);
  assert.ok(pacote.subarray(0, exe.length).equals(exe));
  assert.deepEqual(readEmbeddedActivation(pacote), ativacao);
  assert.equal(readEmbeddedActivation(exe), null);
});

/** Lê um tar (ustar) simples: [{ name, mode, data }]. */
function lerTar(buf) {
  const out = [];
  for (let off = 0; off + 512 <= buf.length;) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const name = h.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const prefix = h.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(h.subarray(124, 136).toString('ascii').replace(/\0.*$/s, '').trim(), 8);
    const mode = parseInt(h.subarray(100, 108).toString('ascii').replace(/\0.*$/s, '').trim(), 8);
    out.push({ name: prefix ? `${prefix}/${name}` : name, mode, data: buf.subarray(off + 512, off + 512 + size) });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

test('tar.gz do Linux com arquivos, permissões e arquivo de ativação', () => {
  const tgz = buildTarGz([
    { name: 'ananim-manager-agent-linux/install.sh', data: Buffer.from('#!/bin/bash\necho ok\n'), mode: 0o755 },
    { name: 'ananim-manager-agent-linux/ativacao.conf', data: Buffer.from('URL=x\nCODE=y\n'), mode: 0o600 },
  ]);
  const arquivos = lerTar(zlib.gunzipSync(tgz));
  assert.deepEqual(arquivos.map((a) => [a.name, a.mode]), [['ananim-manager-agent-linux/install.sh', 0o755], ['ananim-manager-agent-linux/ativacao.conf', 0o600]]);
  assert.equal(arquivos[1].data.toString(), 'URL=x\nCODE=y\n');
});

test('código de pacote vale 24 h; o código avulso continua 1 h', () => {
  const store = createAgentStore(new Database(':memory:'));
  const now = 1_000_000;
  const avulso = store.issueCode({ projectKey: 'P', projectName: 'p', ecsId: 'e', ecsName: 'E', createdBy: 'a' }, now);
  const pacote = store.issueCode({ projectKey: 'P', projectName: 'p', ecsId: 'e', ecsName: 'E', createdBy: 'a', ttlMs: PACKAGE_CODE_TTL_MS }, now);
  assert.equal(avulso.expiresAt, now + CODE_TTL_MS);
  assert.equal(pacote.expiresAt, now + 24 * 3600 * 1000);
  const excessivo = store.issueCode({ projectKey: 'P', projectName: 'p', ecsId: 'e', ecsName: 'E', createdBy: 'a', ttlMs: 99 * 24 * 3600 * 1000 }, now);
  assert.equal(excessivo.expiresAt, now + PACKAGE_CODE_TTL_MS);
});
