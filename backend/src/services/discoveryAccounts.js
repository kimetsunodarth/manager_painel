/**
 * Contas extras para "Descobrir Projetos" (além das fixas em huawei-iam.js), cadastradas pela Home.
 * Ficam no config.enc: DISCOVERY_ACCOUNT_<ID>=<nome>|<região>,<região> e o perfil <ID>_DISCOVERY_* (AK/SK/projeto/região).
 * Todo valor é validado por formato antes de virar linha do config.enc (nada de quebra de linha ou "=" injetado).
 */
const LABEL_RE = /^[\p{L}\p{N} ()&._-]{2,60}$/u;
const REGION_RE = /^[a-z]{2}-[a-z]+-\d{1,2}$/;

export function accountIdFromLabel(label) {
  return String(label || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
}

export function buildAccountSnippet({ label, regions, ak, sk, projectId }, existingIds) {
  const name = String(label || '').trim();
  if (!LABEL_RE.test(name)) throw new Error('invalid_label');
  const id = accountIdFromLabel(name);
  if (id.length < 2) throw new Error('invalid_label');
  if ((existingIds || []).map((x) => String(x).toUpperCase()).includes(id)) throw new Error('duplicate_account');
  const regs = (Array.isArray(regions) ? regions : [regions]).map((r) => String(r || '').trim()).filter(Boolean);
  if (!regs.length || regs.length > 5 || !regs.every((r) => REGION_RE.test(r))) throw new Error('invalid_region');
  if (!/^[A-Z0-9]{16,40}$/.test(String(ak || ''))) throw new Error('invalid_ak');
  if (!/^[A-Za-z0-9]{30,60}$/.test(String(sk || ''))) throw new Error('invalid_sk');
  if (!/^[0-9a-f]{32}$/.test(String(projectId || ''))) throw new Error('invalid_project_id');
  const profile = `${id}_DISCOVERY`;
  const snippet = [
    `DISCOVERY_ACCOUNT_${id}=${name.replace(/\|/g, ' ')}|${regs.join(',')}`,
    `${profile}_ACCESS_KEY=${ak}`,
    `${profile}_SECRET_KEY=${sk}`,
    `${profile}_PROJECT_ID=${projectId}`,
    `${profile}_REGION=${regs[0]}`,
  ].join('\n') + '\n';
  return { id, profile, label: name, regions: regs, snippet };
}

/** Contas extras a partir do config carregado (chaves DISCOVERY_ACCOUNT_<ID>). */
export function extraAccountsFromConfig(config) {
  const list = [];
  for (const [key, value] of Object.entries(config || {})) {
    const m = /^DISCOVERY_ACCOUNT_([A-Z0-9_]{2,24})$/.exec(key);
    if (!m || typeof value !== 'string') continue;
    const [label, regions] = value.split('|');
    const regs = String(regions || '').split(',').map((r) => r.trim()).filter((r) => REGION_RE.test(r));
    if (!label || !regs.length) continue;
    list.push({ id: m[1], label: label.trim(), profile: `${m[1]}_DISCOVERY`, regions: regs });
  }
  return list.sort((a, b) => a.label.localeCompare(b.label));
}
