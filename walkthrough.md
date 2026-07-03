# Walkthrough: Huawei COC Scheduled O&M Automation (Integrado ao Ananim)

Nesta etapa, integramos totalmente a automação do **Huawei Cloud Operations Center (COC) Scheduled O&M** diretamente ao seu painel oficial **Ananim Manager Painel**. A versão beta separada foi descartada para garantir que a funcionalidade tenha acesso real e seguro às credenciais de contas já configuradas.

## O que foi feito:

1. **Backend Integrado (`c:\Projetos\Ananim_manager_painel\backend\server.js`)**
   - Criamos a rota `POST /api/coc/schedules` no painel principal.
   - Reutilizamos o sistema seguro do Ananim `getCredentials(accountId)` para pegar seu AK/SK real encriptado.
   - Utilizamos o script existente de assinatura da Huawei `huaweiSigner.js` para validar e assinar nativamente o payload enviado para o Cloud Operations Center.
   - Ação adicionada ao Action Log (Log de Ações) para auditoria (`coc_schedule_create`).

2. **Frontend Integrado (Aba COC O&M)**
   - Criamos uma nova aba **COC O&M** no cabeçalho do `Ananim_manager_painel/frontend/index.html`.
   - Incluímos o HTML e o script `coc.js` dedicado para carregar dinamicamente as **Contas**, **Regiões** e **Projetos** reais.
   - O campo "Target Instances" agora lista dinamicamente as ECS reais (VMs) disponíveis na conta selecionada usando a rota nativa `/api/ecs/servers`.
   - **Job Actions Suportados (Built-in Public Jobs):** 
     - `Restart_ECS`
     - `Stop_ECS`
     - `Start_ECS`
   - **Tipos de Execução:** Suporta periodicidade cron (ex: `0 0 2 ? * SUN`) ou *One-time Execution*.

## Como validar

1. Inicie o projeto oficial (se já não estiver rodando):
   ```bash
   cd c:\Projetos\Ananim_manager_painel
   node backend\server.js
   ```
2. Acesse `http://localhost:5000` e faça login com seu usuário administrador.
3. No topo, clique na nova aba **COC O&M**.
4. Clique em **Novo Scheduled O&M**.
5. Selecione a Conta e a Região — note que as ECS da sua conta real carregarão magicamente em "Target Instances".
6. Configure o Job (Risk Level, Cron) e clique em Criar Agendamento COC.

## Verificação e Resultados

1. **Monitoramento Automatizado**: O sistema agora detecta mudanças de status via API Huawei a cada minuto e sincroniza com o banco de dados de sessões (`extension_sessions`).
2. **Registro de Horas**: Sessões abertas pelo monitor são identificadas como criadas pelo "Sistema (Monitor)".

## Instalador Gerado

O novo instalador está disponível em:
`C:\Projetos\Ananim_manager_painel\installer\Output\Ananim-Manager-Painel-IIS-Setup-1.2.14.exe`

> [!TIP]
> Ao instalar a linha v1.2.x, as VMs marcadas como "Externo" começarão a gerar logs de horas extras automaticamente sempre que estiverem ligadas fora do horário cadastrado.
