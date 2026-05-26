# Roland – Jump host (ROLANDWEB → ROLANDHDB)

Conexão em dois saltos: **Backend → ROLANDWEB (servidor web) → ROLANDHDB (HANA)**.

## Variáveis no `.env` (pasta `backend/`)

### Jump (servidor web – ROLANDWEB, Windows)
- `SSH_HANA_ROLAND_JUMP_HOST=101.44.194.247`
- `SSH_HANA_ROLAND_JUMP_USER=worker`
- `SSH_HANA_ROLAND_JUMP_PASSWORD=` _(senha do worker; se tiver `#` na senha, use aspas: `"R@m0S@p2016#"`)_
- `SSH_HANA_ROLAND_JUMP_PORT=22` (opcional; padrão 22)

### Destino (HANA – ROLANDHDB, Linux)
Após logar no ROLANDWEB, o backend faz jump para o ROLANDHDB. Use o **IP** do ROLANDHDB acessível a partir do ROLANDWEB.

- `SSH_HANA_ROLAND_HOST=172.16.12.75`
- `SSH_HANA_ROLAND_USER=root`
- `SSH_HANA_ROLAND_PASSWORD=` _(senha do root; se tiver `#`, use aspas no .env: `"Roland@cloud#"`)_
- `SSH_HANA_ROLAND_PORT=22` (opcional; padrão 22)

Com isso, o Roland passa a aparecer no dropdown de Serviços (junto com Águas Pratas e outros) e as ações de restart usam o jump automaticamente.

---

## Status "Não configurado" na tela de Serviços

Se **ROLANDWEB** ou **ROLANDHDB** aparecerem com status **"Não configurado"** (unconfigured) em todos os serviços:

1. **Confira o `.env`** na pasta do backend: todas as variáveis acima devem estar definidas (host, usuário e senha).
2. **ROLANDWEB** usa as variáveis **JUMP** (`SSH_HANA_ROLAND_JUMP_HOST`, `SSH_HANA_ROLAND_JUMP_USER`, `SSH_HANA_ROLAND_JUMP_PASSWORD`).
3. **ROLANDHDB** usa as variáveis de destino (`SSH_HANA_ROLAND_HOST`, `SSH_HANA_ROLAND_USER`, `SSH_HANA_ROLAND_PASSWORD`) e, para o jump, as **JUMP** também.
4. Depois de alterar o `.env`, **reinicie o backend** (`npm run dev`).

---

## Status "error" (todos os serviços em vermelho)

Se os serviços aparecerem como **"error"** em vez de active/inactive:

1. **Veja o terminal do backend** ao clicar em "Atualizar status": aparecem linhas `[services/health] HANA roland <serviço> <mensagem>`. A mensagem indica a causa (ex.: conexão recusada, host não encontrado, falha de autenticação).
2. **ROLANDHDB não resolve do ROLANDWEB:** se aparecer `getaddrinfo ENOTFOUND ROLANDHDB`, o servidor Windows não resolve o hostname. No `.env` use o **IP** do servidor HANA em vez do hostname: `SSH_HANA_ROLAND_HOST=<IP_do_ROLANDHDB>`.
3. **Rede/firewall:** do ROLANDWEB (101.44.194.247) deve ser possível fazer SSH para o IP/host do ROLANDHDB na porta 22.
4. **Usuário/senha:** confira `SSH_HANA_ROLAND_USER` e `SSH_HANA_ROLAND_PASSWORD` (acesso ao Linux do HANA, normalmente root).

5. **"Timed out while waiting for handshake":** o handshake SSH está passando do tempo (rede lenta ou firewall). No `.env` aumente o timeout em ms, por exemplo: `SSH_JUMP_HANDSHAKE_TIMEOUT=60000` (60 s). O padrão é 45000 (45 s). Reinicie o backend. Confirme também que o ROLANDWEB (101.44.194.247) consegue fazer SSH até o host do ROLANDHDB (porta 22).

6. **ROLANDWEB (Invent DFe, NFe, etc.) em "error":** a conexão é direta do backend para 101.44.194.247 (sem jump). Se der timeout, no `.env` defina `SSH_DIRECT_HANDSHAKE_TIMEOUT=45000` (45 s). O padrão é 20 s. Veja no terminal do backend a mensagem `[services/health] HANA Windows roland-web <grupo> <erro>` para o motivo exato.
