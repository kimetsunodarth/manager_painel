# Teste SSH ROLANDWEB – Análise

## Por que o teste pode falhar em um ambiente e funcionar no seu PC

O comando `npm run test-ssh-roland-web` que o Cursor executou rodou no **ambiente do Cursor** (sandbox/VM), não necessariamente na sua máquina. Esse ambiente pode:

- Não estar na mesma rede que o ROLANDWEB (101.44.194.247)
- Não ter VPN conectada
- Ter firewall ou rede que bloqueia saída para 101.44.194.247:22

Por isso um **ETIMEDOUT** ou **Timed out while waiting for handshake** nesse ambiente **não significa** que o SSH esteja quebrado no seu PC. O resultado que importa é o do **mesmo computador onde o backend roda**.

## Onde rodar o teste

Sempre rode na **mesma máquina e mesma rede** em que você sobe o backend:

```bash
cd c:\Projetos\Ananim_manager_painel\backend
npm run test-ssh-roland-web
```

Se aí der **“Conexão SSH estabelecida com sucesso”**, o backend (quando rodando nesse PC) consegue falar com o ROLANDWEB.

## “Funcionava antes” e parou – o que pode ter mudado

1. **Diretório de trabalho ao subir o backend**  
   O backend carrega o `.env` com `dotenv/config`, que usa o **diretório atual** (`process.cwd()`).  
   Se você abrir o backend a partir de outra pasta (ex.: raiz do projeto em vez de `backend/`), o `.env` pode não ser encontrado e as variáveis SSH ficarem vazias.  
   - Sempre subir o backend de dentro da pasta `backend/`:  
     `cd backend` e depois `npm run dev`.

2. **Timeout (rede mais lenta)**  
   Se a rede estiver mais lenta, 20 s podem não bastar e aparece “Timed out while waiting for handshake”.  
   No `.env` do backend:
   ```env
   SSH_DIRECT_HANDSHAKE_TIMEOUT=45000
   ```
   Reinicie o backend e teste de novo.

3. **VPN**  
   Se o ROLANDWEB só for acessível por VPN, o backend precisa rodar em um PC com a VPN conectada. Se a VPN cair ou não estiver ativa, o teste e o painel voltam a falhar.

4. **Firewall ou IP**  
   Alteração de firewall no ROLANDWEB ou no seu escritório, ou mudança de IP do servidor, pode bloquear o acesso.

5. **Várias requisições ao mesmo tempo**  
   O health do ROLANDWEB dispara várias conexões SSH em paralelo. Em rede lenta isso pode estourar tempo ou recursos. Já há timeouts maiores e execução em paralelo; se ainda falhar, o limite é a rede até 101.44.194.247.

## Resumo

- O teste que o Cursor rodou não é representativo do seu PC: rode **você mesmo** `npm run test-ssh-roland-web` dentro da pasta `backend`.
- Para “funcionava e parou”, confira: **cwd** ao iniciar o backend (sempre a partir de `backend/`), **timeout** (`SSH_DIRECT_HANDSHAKE_TIMEOUT`), **VPN** e **firewall/rede**.
