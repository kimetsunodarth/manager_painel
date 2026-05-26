# Controlla – Jump host (CONTROLLAWEB → CONTROLLAHDB)

Conexão em dois saltos: **Backend → CONTROLLAWEB (servidor web Windows) → CONTROLLAHDB (HANA em SUSE)**.

## Variáveis no `.env` (pasta `backend/`)

### Jump (servidor web – CONTROLLAWEB, Windows)
Mesmo usuário/senha que o Roland (worker).

- `SSH_HANA_CONTROLLA_JUMP_HOST=124.81.4.4`
- `SSH_HANA_CONTROLLA_JUMP_USER=worker`
- `SSH_HANA_CONTROLLA_JUMP_PASSWORD=` _(senha do worker; se tiver `#`, use aspas: `"R@m0S@p2016#"`)_
- `SSH_HANA_CONTROLLA_JUMP_PORT=22` (opcional; padrão 22)

### Destino (HANA – CONTROLLAHDB, SUSE)
Após logar no CONTROLLAWEB, o backend faz jump para o CONTROLLAHDB. Use o **IP** ou hostname do CONTROLLAHDB acessível a partir do CONTROLLAWEB.

- `SSH_HANA_CONTROLLA_HOST=` _(IP ou hostname, ex.: CONTROLLAHDB ou 172.16.x.x)_
- `SSH_HANA_CONTROLLA_USER=root`
- `SSH_HANA_CONTROLLA_PASSWORD=` _(senha do root no SUSE; se tiver `#`, use aspas: `"Controlla@cloud#"`)_
- `SSH_HANA_CONTROLLA_PORT=22` (opcional; padrão 22)

Com isso, o Controlla passa a aparecer no dropdown de Serviços (CONTROLLAWEB e CONTROLLAHDB) e as ações usam o jump automaticamente.

---

## Control Center (Ativar Support)

- `CONTROL_CENTER_CONTROLLA_USER=` _(usuário do Control Center)_
- `CONTROL_CENTER_CONTROLLA_PASSWORD=` _(senha; se tiver `#`, use aspas no .env)_

URL do Control Center: `https://controlla.ananim.com.br:40000/ControlCenter/` (definida em `config/control-center/controlla.json`).

---

## Status "Não configurado" ou "error"

1. **Confira o `.env`**: todas as variáveis JUMP e HOST/USER/PASSWORD devem estar definidas.
2. **CONTROLLAWEB** usa só as variáveis **JUMP**.
3. **CONTROLLAHDB** usa JUMP + HOST/USER/PASSWORD. Se o hostname CONTROLLAHDB não resolver a partir do CONTROLLAWEB, use o **IP** em `SSH_HANA_CONTROLLA_HOST`.
4. **Senha com `#`:** use aspas no .env, ex.: `SSH_HANA_CONTROLLA_PASSWORD="Controlla@cloud#"`.
5. Reinicie o backend após alterar o `.env`.
6. Timeouts: em caso de "Timed out while waiting for handshake", defina `SSH_JUMP_HANDSHAKE_TIMEOUT=60000` ou `SSH_DIRECT_HANDSHAKE_TIMEOUT=45000` no `.env`.
