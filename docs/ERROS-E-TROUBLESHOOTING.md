# Erros comuns e troubleshooting — Ananim Manager Painel

Este documento lista erros frequentes, causas e soluções. Ver também **DOCUMENTACAO.md** (seção 8) e **IIS-DEPLOY.md**.

---

## 1. SSH / Testar conexão não funciona após criar cliente

**Sintoma:** Após cadastrar um novo cliente na tela **Clientes**, o **Testar conexão** na aba **Serviços** falha ou o cliente não aparece na lista.

**Causas e soluções:**

- **Desenvolvimento (.env):** As credenciais SSH são gravadas no `.env`, mas o processo do backend já carregou as variáveis na inicialização. **Solução:** Reinicie o backend (`npm run dev`) após colar o snippet no `.env`. O registry de clientes dinâmicos é lido a cada uso; as variáveis de ambiente (SSH/Jump) só são lidas no startup.
- **IIS (config.enc):** O backend atualiza o **config.enc** automaticamente ao criar o cliente. **Solução:** Reinicie o site no IIS (ou o pool) para o processo recarregar o config.enc. Depois use **Testar conexão** na aba Serviços.
- **Chaves no config:** Confirme que a resposta da criação do cliente listou **envKeysWritten** com as chaves esperadas (ex.: `SSH_HANA_MEUCLIENTE_JUMP_HOST`). Se faltar, verifique o snippet e se o config.enc foi realmente atualizado (e reinicie).

---

## 2. Programações não estão acontecendo (cron não executa)

**Sintoma:** Os agendamentos de Start/Stop não executam no horário.

**Causas e soluções:**

1. **Nenhum agendamento cadastrado**  
   O arquivo `agendamentos-vm.json` pode estar vazio ou não existir (ex.: primeira instalação ou pasta de config diferente). **Solução:** Na tela **Programação**, selecione o projeto e clique em **Novo agendamento**; preencha VM, ação (Start/Stop), horário e dias. Ao salvar, o arquivo é criado em `backend/src/config/agendamentos-vm.json` (desenvolvimento) ou `config/agendamentos-vm.json` na pasta do programa (.exe).

2. **Hora do servidor diferente do esperado**  
   O cron usa a **hora local do servidor**. Se o servidor estiver em UTC e você esperar 08:00 em Brasília, o agendamento só rodará quando o servidor marcar 08:00 (ou 11:00 UTC). **Solução:** Use o botão **Diagnóstico** na tela Programação e confira **Hora do servidor** e **Devidos agora**. Ajuste o fuso do servidor ou os horários dos agendamentos.

3. **Agendamentos sem projectId ou serverId**  
   Se o agendamento foi criado/editado sem projeto/região (ou com dados perdidos), o runner ignora e registra no log: *"Agendamento ignorado (falta projectId ou serverId)"*. **Solução:** No **Diagnóstico**, veja se aparece **X agendamento(s) inválido(s)**. Edite cada agendamento na tela Programação (botão Editar) e salve de novo **com o mesmo projeto selecionado** para que projectId/region sejam reenviados.

4. **Backend não está rodando**  
   O cron roda dentro do processo da API (a cada 1 minuto). Se a API estiver parada (dev ou IIS), nenhum agendamento executa. **Solução:** Mantenha o backend (ou o site no IIS) em execução. Confira os logs (`logs/api-stdout.log` no IIS) para ver se há mensagens `[Schedule]`.

---

## 3. Programação deixa de funcionar após editar

**Sintoma:** Um agendamento (Start/Stop) funciona ao criar, mas após **editar** (alterar horário, VM, etc.) deixa de executar ou perde o vínculo com o projeto.

**Causa:** O backend só atualiza `projectKey`/`projectId`/`region` na edição quando os valores enviados não estão vazios; o frontend deve enviar esses campos do agendamento em edição.

**Solução:** Já corrigido no código: o formulário de edição envia `projectKey`, `projectId`, `region` e `perfil` do agendamento. Se ainda falhar, confira no **Diagnóstico** (Programação) se o agendamento aparece com projeto e região corretos; em caso de dúvida, recrie o agendamento.

---

## 4. Cancelar programação do dia afeta o dia seguinte?

**Comportamento esperado:** O cancelamento é **por data**: ao cancelar a programação para **hoje**, apenas o dia atual é afetado. O dia seguinte segue com a programação normal (Start/Stop nos horários configurados).

**Se notar impacto em outros dias:** Verifique se não há outro agendamento ou ação manual; a lógica do runner usa apenas a data do dia (`today`) para aplicar o cancelamento.

---

## 5. "The API does not exist or has not been published in the environment" (Huawei)

**Sintoma:** Erro ao agendar ou executar ações ECS (start/stop/restart) na Huawei.

**Causa:** Uso de endpoint ou versão incorreta da API ECS. O painel utiliza a API **v1** de ECS para ações em lote:  
`/v1/{projectId}/cloudservers/action` com body no formato batch (ex.: `{"os-start": { "servers": [{ "id": serverId }] }}`).

**Solução:** Não usar a API v2.1 para essas ações. Se o erro persistir, confira no console do backend o `projectId`, `region` e o body enviado; valide no IAM da Huawei se o perfil tem permissão **ECS Full Access** (ou equivalente) no projeto/região.

---

## 6. Ativar Support User — "Executable doesn't exist" / Chromium não encontrado

**Sintoma:** Ao usar **Ativar Support User** (SAP Control Center / SLD), o backend retorna erro do Playwright indicando que o executável do Chromium não existe.

**Causa:** O Playwright precisa do Chromium em uma pasta conhecida. Em desenvolvimento o `npm install playwright` instala os browsers em cache global; no **instalador IIS** (.exe), o Chromium deve estar na pasta **browsers** junto do executável.

**Soluções:**

- **Desenvolvimento:** No backend, execute `npm install playwright` (ou `npx playwright install chromium`) e reinicie o servidor.
- **IIS (.exe):** O build (`build-package-iis.ps1` / `update-package-iis-quick.ps1`) instala o Chromium em `playwright-runtime/browsers` e copia para `package-iis/browsers`. O .exe usa `PLAYWRIGHT_BROWSERS_PATH` apontando para a pasta **browsers** na pasta do programa. Confirme que a pasta **browsers** existe na instalação (ex.: `C:\Program Files\Ananim Manager Painel\browsers\`). Se faltar, refaça o build e reinstale ou copie a pasta **browsers** do `installer/package-iis/` para a pasta de instalação.

---

## 7. Serviços duplicados na lista (Serviços ou Clientes)

**Sintoma:** O mesmo serviço ou cliente aparece mais de uma vez na aba Serviços ou na listagem de projetos/clientes.

**Causa:** Listas montadas sem deduplicação por chave (ex.: `clientKey` ou `projectId`).

**Solução:** Já corrigido no backend: listas de servidores e projetos são deduplicadas por chave; ao atribuir cliente a operadores, `visibleProjects` é deduplicado por id. Se ainda vir duplicado, limpe cache do navegador e confira se não há dois clientes com chaves diferentes para o mesmo ambiente.

---

## 8. Log de auditoria — Detalhes truncados ou erro de agendamento pouco claro

**Comportamento:** Na tela **Logs**, a coluna **Detalhes** exibe o JSON completo do registro (em `<pre>`) e há botão **Copiar**. Erros de agendamento registram `projectId`, `region`, `action` e `projectKey` quando disponíveis.

**Se precisar de mais contexto:** Verifique **api-stdout.log** (IIS) ou o console do backend no momento do erro; o scheduleRunner grava em log de auditoria os dados disponíveis no contexto da falha.

---

## 9. 502.3 Bad Gateway (IIS)

**Sintoma:** O site retorna 502.3 ao acessar a API.

**Soluções:**  
- Abra **logs\api-stdout.log** na pasta do programa. Lá aparecem erros do .exe (ex.: JWT_SECRET ausente, better-sqlite3 não encontrado, Chromium não encontrado).  
- Confirme **config.enc** e **key.bin** (ou .encryption_key) na raiz da pasta do programa.  
- Confirme que a pasta **lib** contém `node_modules/better-sqlite3` (módulo nativo).  
- Se usar Ativar Support, confirme a pasta **browsers** (ver item 5 acima).

---

## 10. Build PowerShell — "A parameter cannot be found that matches parameter name 'and'"

**Sintoma:** Ao rodar `build-package-iis.ps1` ou `update-package-iis-quick.ps1`, o PowerShell falha na linha que verifica se o Chromium existe.

**Causa:** Sintaxe incorreta na condição (ex.: uso de `-and` fora de expressão válida).

**Solução:** Os scripts foram ajustados para usar uma única expressão com `Test-Path` e `Get-ChildItem` (ex.: `$hasChromium = (Test-Path $playwrightBrowsers) -and ((Get-ChildItem ...).Count -gt 0)`). Atualize o script a partir do repositório se ainda estiver na versão antiga.

---

## Referências

- **DOCUMENTACAO.md** — Seção 8 (Troubleshooting), configuração config.enc, build e instalador.
- **IIS-DEPLOY.md** — Implantação no IIS, logs, pré-requisitos.
- **backend/SECURITY.md** — Segurança, JWT, config.enc, checklist de produção.
