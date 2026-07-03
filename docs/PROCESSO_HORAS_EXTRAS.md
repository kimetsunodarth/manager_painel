# Processo de Horas Extras — Ananim Manager Painel

> Versão do documento: v1.2.54 · Última revisão: 2026-06-11

---

## Visão geral

O módulo de horas extras controla automaticamente quando uma VM da Huawei Cloud fica ligada fora do horário comercial programado. Ele detecta, registra, calcula o custo e envia notificações por e-mail para os responsáveis.

---

## Quando uma sessão de hora extra começa

Existem dois caminhos:

### 1. VM ligada fora do horário (detecção automática)

O `scheduleRunner` roda em background e monitora todas as VMs a cada intervalo. Quando detecta que uma VM está **ligada fora da janela de schedule**, ele:

1. Cria uma sessão de hora extra via `createManualStart(projectKey, serverId, 'Ligou VM após o horário')` no banco SQLite.
2. Dispara `notifyOvertimeStart(session)` — e-mail de alerta para os destinatários configurados.

### 2. Cancelamento de programação de desligamento (ação manual)

Quando um operador acessa a tela **Home → Huawei** e cancela o stop programado para uma VM:

1. A rota `POST /api/huawei/ecs/action` com `action: 'cancel-for-date'` é chamada.
2. O backend cria a sessão via `createCancelStop(projectKey, serverId, scheduledStopAt, 'Cancelou o stop programado')`.
3. Dispara `notifyOvertimeStart(session)` — e-mail de abertura.

### 3. Início manual de hora extra

Quando um operador clica em **"Iniciar hora extra"** no painel:

1. Rota `POST /api/huawei/ecs/action` com `action: 'start'`.
2. Backend cria sessão via `createManualStart(...)`.
3. Dispara `notifyOvertimeStart(session)` — e-mail de abertura.

---

## E-mail de abertura de sessão

O e-mail enviado contém:
- **Tipo de acionamento**: "Cancelou stop programado" ou "Ligou VM após o horário"
- **Projeto / conta**: ex. `roland-prod`
- **Servidor**: ID da VM
- **Quem acionou**: nome/login do usuário (quando ação manual)
- **Horário de início da cobrança** (horário de Brasília)

---

## Quando uma sessão de hora extra termina

Existem três situações de fechamento:

### 1. Operador fecha manualmente (ação stop)

Rota `POST /api/huawei/ecs/action` com `action: 'stop'` — chama `closeOpenSession(key, serverId)` e dispara o e-mail de fechamento.

### 2. VM entra no horário comercial (schedule runner)

Quando o `scheduleRunner` detecta que chegou o horário de inicio de trabalho, chama `closeOpenSession(...)` e dispara o e-mail.

### 3. VM desligada com sessão aberta

Se a VM aparece desligada e ainda há sessão aberta, o monitor fecha a sessão e dispara o e-mail.

---

## E-mail de fechamento de sessão

O e-mail de fechamento traz o relatório completo:

| Campo | Descrição |
|-------|-----------|
| Tipo de acionamento | Quem/como iniciou a hora extra |
| Projeto / servidor | Identificação da VM |
| Horário de início da cobrança | `scheduledStopAt` (se cancel-for-date) ou `startedAt` |
| Horário de término | Quando a sessão foi fechada |
| Duração real | Tempo exato entre início e fim |
| **Horas cobráveis** | Valor arredondado (regra de 30 min) |
| Tarifa | R$/hora configurada para o projeto |
| **Valor a pagar** | `horasCobráveis × tarifa` |

---

## Regra de arredondamento (30 minutos)

O sistema arredonda para o intervalo de 30 minutos **mais próximo**:

| Tempo real | Horas cobráveis |
|------------|-----------------|
| 1h00 | 1h00 |
| 1h01 | 1h00 |
| 1h15 | 1h30 |
| 1h29 | 1h30 |
| 1h30 | 1h30 |
| 1h31 | 1h30 |
| 1h45 | 2h00 |
| 1h59 | 2h00 |

**Fórmula:**
```js
step = roundingMinutes / 60   // 30 → 0.5h
billableHours = Math.round( Math.round(actualHours / step) * step * 100 ) / 100
```

O parâmetro `roundingMinutes` é configurável por projeto e tem padrão de **30 minutos**.

---

## Hierarquia de tarifas

O custo por hora é buscado em duas camadas:

1. **Exceção por projeto** (`projectRates[projectKey]`) — tarifa específica para aquele projeto.
2. **Tarifa global** (`defaultHourlyRate`) — fallback se não houver exceção.

Se nenhuma tarifa estiver configurada, o campo `amountDue` fica `null` (sem cobrança calculada).

---

## Onde configurar

**Menu:** Horas Extras → aba **Configuração de tarifa**

### Aba: Configuração global
- Moeda (padrão: BRL)
- Tarifa padrão (R$/hora)
- Grace period (minutos antes de começar a contar)
- Arredondamento (padrão: 30 min)

### Aba: Exceções por projeto
- Cada projeto pode ter tarifa e arredondamento próprios.

### Seção: Notificações de hora extra (base da página)
- **Servidor SMTP**: host, porta, usuário, senha, nome do remetente
- **Destinatários**: lista de e-mails que recebem os alertas
- **Botão Testar**: envia e-mail de teste imediato

---

## Fluxo técnico resumido

```
VM detectada fora do horário
        ↓
scheduleRunner / rota /ecs/action
        ↓
createManualStart() ou createCancelStop()
  → insere em extension_sessions (SQLite)
        ↓
notifyOvertimeStart(session)
  → emailNotifier.js → nodemailer → Office 365 SMTP
  → destinatários em extension-billing.json (alertEmails[])
        ↓
[Sessão aberta — aguardando fechamento]
        ↓
closeOpenSession() (monitor, stop manual ou entrada no horário)
  → atualiza extension_sessions (endedAt)
        ↓
notifyOvertimeClose(computeSessionBilling(session))
  → computeSessionBilling() calcula: actualHours, billableHours, amountDue
  → emailNotifier.js → e-mail com relatório completo
```

---

## Arquivos relevantes

| Arquivo | Função |
|---------|--------|
| `backend/src/config/extensionBilling.js` | Config, tarifas, `computeSessionBilling()`, `loadBillingConfig()` |
| `backend/src/services/emailNotifier.js` | Templates HTML, envio SMTP, `notifyOvertimeStart/Close()` |
| `backend/src/services/scheduleRunner.js` | Monitor em background, detecção automática |
| `backend/src/routes/huawei.js` | Rotas REST: `action`, `billing-config`, endpoints SMTP/email |
| `backend/src/db/extensionSessions.js` | CRUD das sessões no SQLite |
| `installer/package-iis/config/extension-billing.json` | Config padrão instalada (sem senha SMTP) |
| `frontend/src/pages/TarifaHorasExtras.tsx` | UI de configuração de tarifa e notificações |

---

## Configuração pós-instalação

Após instalar o pacote `Ananim-Manager-Painel-IIS-Setup-1.2.54.exe`:

1. Abrir o painel e ir em **Horas extras → Configuração de tarifa**.
2. Rolar até **Notificações de hora extra** e clicar em **Editar SMTP**.
3. Preencher a senha da app Office 365 (campo `pass`).
4. Salvar e clicar em **Testar** para validar o envio.
5. Verificar que `rcombinato@ananim.com.br` está na lista de destinatários (já vem pré-configurado).
