# Ananim Manager Agent — serviços das VMs sem SSH de entrada

Esboço aprovado em 21/10/2026: https://claude.ai/artifact/NVQxbtPqnff3dktRzGNScu

## Intenção

Hoje o painel executa serviços entrando por SSH no servidor Web (Windows/OpenSSH) e no SUSE do HANA, com senhas/chaves de todos os clientes no `config.enc` e serviços cadastrados à mão (`hana-clients/<k>-web.json`). Substituir por um agente em cada servidor que só faz HTTPS de saída, descobre os serviços e executa apenas o que o admin liberar — o mesmo modelo do conector AD do Cofre.

## Decisões (do usuário)

1. Agente **próprio do Manager** ("Ananim Manager Agent"): `AnanimManagerAgent.exe` (Windows) e `ananim-manager-agent` (Linux/systemd). Não reutiliza o AnanimAD; só o modelo (código de ativação de uso único, requisições assinadas, fila, atualização sem reativar).
2. Admin lista os serviços dos servidores de um projeto e **atribui o cliente ao projeto** com visão só das VMs e serviços selecionados.
3. SUSE: os reinícios HANA/SAP de hoje continuam; só os serviços liberados aparecem (igual ao Windows).
4. VMs atribuídas: o cliente liga/desliga/reinicia no padrão de hoje (`visibleProjects` + `allowedHuaweiEcsIds`); ligar após o horário contratado continua abrindo extensão de horário (`extension_sessions`). **Já existe — não muda.**
5. DNS `ananim-manager.ananim.com.br`; na VM portais a pasta se chama "Ananim Manager Painel" (`/opt/ananim/ananim-manager-painel`).
6. "Desenvolvemos no Windows, mas o portal deve ser criado e sempre atualizado no Linux (portais)."

## Escopo desta entrega

Agente Windows + receptor e telas no Manager + implantação no portais. O agente Linux (fase 3) vem depois, no mesmo protocolo.

## Restrições

- O painel nunca envia comando de shell: só `{serviceName, action}` com `action ∈ {start, stop, restart}`.
- Serviços nunca liberáveis (servidor e agente): o próprio agente, `WinRM`, `sshd`, `TermService`, `EventLog`, `RpcSs`, `RpcEptMapper`, `DcomLaunch`, `LSM`, `SamSs`, `Schedule`, `CryptSvc`.
- Padrão: tudo oculto até o admin liberar; cliente só executa serviço com grant + ação liberada.
- WAF do portais: sem `Expect: 100-continue`; catálogo vai em envelope gzip (`{"format":"gzip-base64-json","data":...}`), como o inventário do Cofre.
- Sem segredos de produção copiados pelo agente de IA: o `config.enc` de produção é copiado pelo usuário.
