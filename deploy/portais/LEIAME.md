# Ananim Manager Painel na VM portais (Linux)

Endereço: **https://ananim-manager.ananim.com.br**, só pelo WAF (124.81.4.214), igual ao Cofre e à Ananimbase.
Node 22 em `127.0.0.1:5192`, atrás do nginx da VM `portais` (192.168.10.13).

## Layout

```
/opt/ananim/ananim-manager-painel/
├── releases/<data-hora>/      código de cada publicação (backend + public); ficam as 5 últimas
├── current -> releases/...    release no ar
├── bin/                       atualizar-manager.sh e instalar-manager.sh (enviados pelo publicador)
├── incoming/                  pacote em trânsito
└── shared/  (700, ananim)     estado; nunca é tocado por uma publicação
    ├── manager.env            variáveis do systemd (porta, pastas, FRONTEND_ORIGIN)
    ├── config.enc             copiado da produção
    ├── .encryption_key        copiado da produção
    ├── config/                clientes, HANA/SQL, agendamentos (ANANIM_CONFIG_DIR)
    ├── data/ananim.db         usuários, auditoria, agentes, extensões (ANANIM_DATA_DIR / DB_PATH)
    └── logs/                  logs criptografados
```

Serviço `ananim-manager-painel` (usuário `ananim`), site `/etc/nginx/conf.d/ananim-manager.conf`,
certificado `/etc/nginx/qa-certs/ananim-manager.ananim.com.br.{crt,key}` (Traefik + Route53, renovação no
timer `ananim-cert-manager.timer`, domingo 03:45).

Com `ANANIM_ENV_PRIORITY=1`, o que está em `manager.env` vale mais que o `config.enc`: a porta, a origem e as
pastas do Linux não são trocadas pelos valores do IIS que vierem no `config.enc` da produção.

## Publicar (sempre a partir de um commit)

No Windows, na raiz do repositório:

```powershell
python scripts/publicar-portais.py
```

Usa o `HEAD` num worktree temporário: o que não estiver commitado não vai para a VM. Faz o build do frontend,
empacota, recusa pacote com `.env`, `config.enc`, chave ou banco, envia pelo canal SSH do Cofre e roda o
`atualizar-manager.sh` na VM: release nova → `npm ci --omit=dev` → arquivos de configuração novos em
`shared/config` (os existentes não são tocados) → `current` → reinício → `/api/health`. Se o health falhar, volta
para a release anterior.

## Primeira instalação (uma vez, quem tem a senha do sudo da VM)

1. **Preparar a VM** (pastas, systemd, sudoers só para reiniciar este serviço, certificado e nginx):
   ```bash
   sudo bash /opt/ananim/ananim-manager-painel/bin/instalar-manager.sh
   ```
2. **DNS e WAF:** registro público `ananim-manager.ananim.com.br` apontando para o WAF (como `ananimcofre`), e
   no WAF o domínio novo com origem 119.8.136.109:443. Sem o WAF, a origem responde 403 a qualquer acesso.
3. **Configuração da produção:** copiar `config.enc` e `.encryption_key` do servidor atual (IIS) para
   `/opt/ananim/ananim-manager-painel/shared/` (dono `ananim`, modo `600`) e, se for migrar os dados, o
   `ananim.db` para `shared/data/` e as pastas de `backend/src/config` com estado (clientes, agendamentos) para
   `shared/config/`. Depois:
   ```bash
   sudo systemctl restart ananim-manager-painel
   curl -s http://127.0.0.1:5192/api/health
   ```
4. Sem migrar o banco, o primeiro acesso usa o administrador padrão do painel: **trocar a senha na hora**.

## Diagnóstico

| Sintoma | Onde olhar |
|---|---|
| timeout de fora | DNS/WAF/Security Group |
| 403 HTML sem "Application Shield" | acesso sem passar pelo WAF (gate `portais-waf-only.conf`) |
| 403 "Ananim · Application Shield" | regra do WAF (ver Request ID) |
| 502 | serviço parado: `systemctl status ananim-manager-painel`, `journalctl -u ananim-manager-painel` |
| serviço "skipped" | falta `shared/config.enc` (condição da unit) |

## Ananim Manager Agent (Windows)

`agent/windows/build.ps1` gera `agent/windows/dist/AnanimManagerAgent.exe`. No servidor do cliente, como
administrador: informar `https://ananim-manager.ananim.com.br`, colar o código gerado em
**Servidores (conector) → Conectar**, **Ativar** e **Instalar / atualizar serviço**. Versão nova: abrir o exe novo
com o serviço instalado já atualiza, sem novo código.
