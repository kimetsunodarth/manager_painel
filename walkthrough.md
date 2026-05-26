# Walkthrough - External Schedule Monitoring (v1.2.x)

Esta versão introduz o monitoramento automatizado para VMs com controle externo (como Cloud8), permitindo que o Painel calcule automaticamente as horas extras mesmo sem controlar o ligar/desligar.

## Alterações Realizadas

### Backend: Monitoramento Inteligente
- **[scheduleRunner.js](file:///c:/Projetos/Ananim_manager_painel/backend/src/services/scheduleRunner.js)**: Implementada a função `monitorStatus()` que roda a cada minuto.
    - Verifica se a VM está `ACTIVE` fora do seu horário programado.
    - Abre automaticamente uma sessão de **Extra Hours** se detectar atividade não planejada.
    - Fecha a sessão automaticamente quando a VM é desligada.
- **[vmScheduleV2.js](file:///c:/Projetos/Ananim_manager_painel/backend/src/config/vmScheduleV2.js)**: Nova utilidade `isInsideScheduleWindow` para determinar o estado esperado da VM em qualquer minuto do dia.

### Frontend: Interface Aprimorada
- **[Programacao.tsx](file:///c:/Projetos/Ananim_manager_painel/frontend/src/pages/Programacao.tsx)**:
    - O checkbox de "Controle Externo" foi reformulado e agora utiliza cores roxas para destaque.
    - A descrição deixa claro que a API não enviará comandos, mas monitorará o status para contagem de horas.

## Verificação e Resultados

1. **Monitoramento Automatizado**: O sistema agora detecta mudanças de status via API Huawei a cada minuto e sincroniza com o banco de dados de sessões (`extension_sessions`).
2. **Registro de Horas**: Sessões abertas pelo monitor são identificadas como criadas pelo "Sistema (Monitor)".

## Instalador Gerado

O novo instalador está disponível em:
`C:\Projetos\Ananim_manager_painel\installer\Output\Ananim-Manager-Painel-IIS-Setup-1.2.14.exe`

> [!TIP]
> Ao instalar a linha v1.2.x, as VMs marcadas como "Externo" começarão a gerar logs de horas extras automaticamente sempre que estiverem ligadas fora do horário cadastrado.
