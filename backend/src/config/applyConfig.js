/**
 * Copia a configuração carregada (config.enc/.env) para o ambiente do processo.
 * Chaves em `protectedKeys` mantêm o valor do ambiente (ex.: porta e origem definidas pelo systemd no Linux).
 */
export function applyConfig(merged, env, protectedKeys) {
  for (const [k, v] of Object.entries(merged)) {
    if (protectedKeys.has(k) && env[k] !== undefined) continue;
    if (v !== undefined && v !== null && String(v).trim() !== '') env[k] = v;
  }
}
