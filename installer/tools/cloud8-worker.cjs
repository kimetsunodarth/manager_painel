/**
 * Worker Playwright para ler o inventário de VMs do Cloud8 (app.cloud8.com.br) — mesmo padrão
 * de processo isolado do control-center-worker.cjs (roda sob o node.exe embarcado no IIS/.exe).
 *
 * Sem API pública (confirmado: "Integrações" no Cloud8 é só webhook de notificação, não API
 * self-service). Duas telas usadas, seletores verificados manualmente contra a conta de produção
 * (ExtJS + Bryntum Scheduler):
 *
 * 1) "Componentes Atuais > Servidores" — tabela paginada (~750 recursos, 25/página), fonte
 *    principal: provedor/cliente, nome, tipo, região, IPs. Rápida (sem hover), só pagina.
 *    Colunas mapeadas por headerId: it1=Provedor, it2=Nome, it3=Tipo, it8=Região,
 *    it11=IP/DNS Externo, it12=IP/DNS Local.
 *
 * 2) Agendamentos (dia/hora reais, não só um booleano) — a SPA do Cloud8 (ExtJS + Bryntum
 *    Scheduler) usa uma API JSON real por trás da tela de calendário (`GET
 *    /scheduleevents/list?objtype=s&startDate=...&endDate=...`), descoberta inspecionando o
 *    proxy REST do componente `Ext.data.Store` em produção (2026-09-04) — a mesma sessão logada
 *    (cookies do `context`) já autentica essas chamadas, sem precisar clicar em nada na tela.
 *    Cada item retornado é uma OCORRÊNCIA já expandida (a API resolve a recorrência): traz
 *    `ResourceId` (id numérico do servidor + sufixo "s", casa com o `recordId` do inventário),
 *    `dtbegin`/`dtend` (data/hora real da próxima execução) e `schedule.{id,name,isrecurrent,
 *    comments}`. Isso SUBSTITUIU a leitura antiga por DOM (clicar em "Automações" → "Servidores"
 *    → botão "Mensal" → contar `.sch-event` na linha) — mais rápida, mais confiável (nada de
 *    máscara "Processando..." interceptando clique) e dá o horário de verdade, não só um booleano.
 *
 * Não há status ligado/desligado confiável nesta versão — a coluna "Info" de Componentes Atuais
 * é sobre módulos/proteção (accept/protect/policy), não energia; "Data Ligado" é a data do
 * primeiro liga, não o estado atual. Se precisar de status ao vivo, teria que voltar a fazer
 * hover por linha em Automações (lento, ~1-1.5s por VM).
 */

const fs = require('fs');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

/**
 * Clica um locator resiliente à máscara "Processando... Aguarde..." do Cloud8, que reaparece
 * periodicamente sobre a grid e intercepta cliques do Playwright — confirmado em produção
 * (2026-09-04): clique em "Mensal" estourou os 30s padrão do Playwright, log mostrando
 * `<div class="x-mask">` interceptando repetidamente. Espera a máscara sumir antes de cada
 * tentativa e tenta de novo (em vez de deixar o Playwright estourar o timeout default inteiro
 * numa única tentativa).
 */
async function clickResilient(page, locator, { attempts = 8, timeoutMs = 8000 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const mask = page.locator('.x-mask').first();
      if (await mask.isVisible().catch(() => false)) {
        await mask.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(300);
      }
      await locator.click({ timeout: timeoutMs });
      return;
    } catch (e) {
      lastError = e;
      await page.waitForTimeout(500);
    }
  }
  throw lastError || new Error('clickResilient: falhou sem erro capturado');
}

async function readInventory(page, maxPages) {
  await clickResilient(page, page.locator('span.x-tree-node-text:has-text("Componentes Atuais")').first());
  await page.locator('tr.x-grid-data-row').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1500);

  const items = [];
  const seenRecordIds = new Set();
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const rows = await page.evaluate(() => {
      const trs = Array.from(document.querySelectorAll('tr.x-grid-data-row'));
      return trs.map((tr) => {
        const cellByHeader = {};
        Array.from(tr.querySelectorAll('td')).forEach((td) => {
          const m = td.className.match(/x-grid-cell-headerId-(\S+)/);
          if (m) cellByHeader[m[1]] = td.textContent.trim();
        });
        return {
          recordId: tr.getAttribute('data-recordid'),
          provider: cellByHeader.it1 || '',
          name: cellByHeader.it2 || '',
          tipo: cellByHeader.it3 || '',
          region: cellByHeader.it8 || '',
          ipExterno: cellByHeader.it11 || '',
          ipLocal: cellByHeader.it12 || '',
        };
      }).filter((r) => r.recordId && r.name);
    });

    let addedNew = false;
    for (const r of rows) {
      if (seenRecordIds.has(r.recordId)) continue;
      seenRecordIds.add(r.recordId);
      items.push(r);
      addedNew = true;
    }

    // O ícone interno (.x-tbar-page-next) não é o elemento clicável — o botão real é o link
    // .x-btn que o envolve (data-qtip="Próxima Página"). Clicar no ícone faz o Playwright achar
    // que o próprio container da toolbar está "interceptando" o clique (falso positivo do ExtJS).
    const nextBtn = page.locator('a.x-btn[data-qtip="Próxima Página"], .x-btn:has(.x-tbar-page-next)').first();
    const visible = await nextBtn.isVisible().catch(() => false);
    if (!visible) break;
    const disabled = await nextBtn.evaluate((el) =>
      el.classList.contains('x-item-disabled') || el.classList.contains('x-btn-disabled') || el.getAttribute('aria-disabled') === 'true'
    ).catch(() => true);
    if (disabled) break;
    if (!addedNew && pageIndex > 0) break; // segurança: parar se a página não mudou nada
    await nextBtn.click();
    await page.waitForTimeout(900);
  }
  return items;
}

/**
 * Busca os eventos de agendamento reais via a API JSON do Cloud8 (mesma sessão logada,
 * `context.request` compartilha os cookies do browser). `days` é a janela de busca a partir de
 * agora — não precisa ser grande: a API já devolve cada ocorrência com data real, então uma
 * janela de ~14 dias é suficiente pra pegar pelo menos uma ocorrência de qualquer agendamento
 * semanal/diário (agendamentos mensais mais espaçados poderiam escapar dessa janela, aceitável
 * pra essa tela de visão geral).
 */
async function fetchScheduleEventsViaApi(context, days = 14) {
  const now = new Date();
  const start = now.toISOString().slice(0, 19);
  const end = new Date(now.getTime() + days * 24 * 3600 * 1000).toISOString().slice(0, 19);
  const url = `https://app.cloud8.com.br/scheduleevents/list?objtype=s&startDate=${start}&endDate=${end}&page=1&start=0&limit=5000`;
  const res = await context.request.get(url, { timeout: 30000 });
  if (!res.ok()) {
    console.error(`[cloud8-worker] scheduleevents/list respondeu ${res.status()}`);
    return [];
  }
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.scheduleevents) ? data.scheduleevents : [];
}

/**
 * Agrupa as ocorrências por servidor (resourceId numérico, sem o sufixo "s"), deduplicando por
 * `schedule.id` (uma tarefa recorrente aparece várias vezes na janela — uma por ocorrência) e
 * mantendo a PRÓXIMA execução (menor `dtbegin`) de cada uma.
 * @returns {Map<string, Array<{ scheduleId, name, nextRun, isrecurrent, taskType }>>}
 */
function summarizeScheduleEvents(rawEvents) {
  const byResource = new Map();
  for (const ev of rawEvents) {
    const resourceId = String(ev.ResourceId || '').replace(/s$/, '');
    const scheduleId = ev.schedule && ev.schedule.id;
    if (!resourceId || scheduleId == null || !ev.dtbegin) continue;
    if (!byResource.has(resourceId)) byResource.set(resourceId, new Map());
    const schedMap = byResource.get(resourceId);
    const existing = schedMap.get(scheduleId);
    if (!existing || new Date(ev.dtbegin) < new Date(existing.nextRun)) {
      schedMap.set(scheduleId, {
        scheduleId,
        id: ev.id != null ? ev.id : null,
        name: (ev.schedule && ev.schedule.name) || null,
        nextRun: ev.dtbegin,
        startDate: ev.dtbegin || null,
        endDate: ev.dtend || null,
        isrecurrent: !!(ev.schedule && ev.schedule.isrecurrent),
        taskType: (ev.tasks && ev.tasks[0] && ev.tasks[0].type) || null,
        taskTypes: Array.isArray(ev.tasks) ? ev.tasks.map((t) => t.type).filter(Boolean) : [],
        resourceIds: String(ev.ResourceId || '').split(',').map((r) => r.trim().replace(/s$/, '')).filter(Boolean),
        raw: ev,
      });
    }
  }
  const result = new Map();
  for (const [resourceId, schedMap] of byResource) result.set(resourceId, Array.from(schedMap.values()));
  return result;
}

/**
 * Busca `/servers/schedulelist` só pelo `cloudinstanceid` de cada servidor — o UUID real do
 * recurso na nuvem de origem (ex.: o ID do ECS na Huawei). Usado pra resolver a identidade Huawei
 * de VMs cobertas só pelo Cloud8, cruzando esse UUID com projeto/perfil em `huawei-ecs.js`'s
 * `getEcsUuidIndex()` (chamado em `routes/cloud8.js`, não aqui — este worker só lê o Cloud8).
 * @returns {Promise<Map<string, { cloudinstanceid: string|null, typeprovider: string|null }>>}
 */
async function fetchCloudInstanceIdsViaApi(context) {
  const url = 'https://app.cloud8.com.br/servers/schedulelist?objtype=s&page=1&start=0&limit=5000';
  const res = await context.request.get(url, { timeout: 30000 });
  if (!res.ok()) return new Map();
  const data = await res.json().catch(() => null);
  const objects = Array.isArray(data && data.objects) ? data.objects : [];
  const byId = new Map();
  for (const o of objects) {
    if (o == null || o.id == null) continue;
    byId.set(String(o.id), { cloudinstanceid: o.cloudinstanceid || null, typeprovider: (o.provider && o.provider.typeprovider) || null });
  }
  return byId;
}

/** Rótulo do runbook exibido na UI, por tipo de tarefa do Cloud8. */
const CLOUD8_TASK_LABELS = { ev_serverstart: 'Ligar', ev_serverstop: 'Desligar', ev_serverreboot: 'Reiniciar' };

/**
 * Monta o payload de criar/alterar um agendamento no Cloud8 — mesmo formato de
 * `backend/src/services/cloud8Service.js` (duplicado aqui por ser CJS vs ESM), confirmado
 * byte-a-byte contra um teste real (2026-09-05). Só cobre execução ÚNICA (`rec_type: 0`).
 */
function buildScheduleEventPayload(params) {
  const { id = 0, scheduleId = 0, name, resourceIds, taskTypes, startDate, endDate, email, status, jsaction } = params || {};
  if (!name) throw new Error('name é obrigatório');
  if (!Array.isArray(resourceIds) || !resourceIds.length) throw new Error('resourceIds (array não vazio) é obrigatório');
  if (!Array.isArray(taskTypes) || !taskTypes.length) throw new Error('taskTypes (array não vazio) é obrigatório');
  if (!startDate || !endDate) throw new Error('startDate e endDate são obrigatórios');
  const schedservers = resourceIds.map((r) => `${r}s`).join(',');
  const isUpdate = id !== 0;
  return {
    scheduleevents: {
      parent_id: scheduleId,
      id,
      original_id: id,
      status: status != null ? status : 1,
      name,
      comments: '',
      schedservers,
      obj: 's',
      isholiday: false,
      jsaction: jsaction || '',
      country: 'BR',
      timezone: 'America/Sao_Paulo',
      offset: isUpdate ? -10800000 : 0,
      ResourceId: isUpdate ? schedservers : '',
      type: taskTypes,
      StartDate: startDate,
      EndDate: endDate,
      schedule: {
        id: scheduleId,
        isrecurrent: false,
        name,
        comments: '',
        emails: email || '',
        emailswarn: email || '',
        chkwarnok: true,
        chkwarnerror: true,
        chkwarninteg: false,
        rec_type: 0,
        rec_numtimes: 1,
        rec_end_option: 0,
        rec_dt_end_option: null,
        rec_daily_every: 1,
        rec_daily_type: 1,
        rec_wkly_days: '',
        rec_mthyI_day: '',
        rec_mthyII_day_pos: 1,
        rec_mthyII_wday: 2,
        rec_rdmonthly: 0,
        rec_holiday: false,
        rec_dt_begin: null,
        rec_dt_end: null,
        obj: 's',
        tasks: taskTypes.map((type, i) => ({
          id: i + 1,
          text: CLOUD8_TASK_LABELS[type] || type,
          type,
          objtype: 'sd',
          cloud: '', compid: '', message: '', status: 0, idhidden: 0, initretry: '1', snewtype: '',
          chksrvstop: 'false', chksrvstopbackup: 'true', chkebsopt: 'false', isaz: false,
          dtstarted: '', dtended: '', pause: '', reporttype: '', repnumdays: 0, reptags: '', repuserlevel: 0,
          currency: '', jschklbdisconn: false, jschkecsall: false, sync: false, bkpinc: false, bkplock: '',
          unlim: false, bkptimeout: '', bkpdaysarch: '', bucket: '', dbs: '', numnodes: '', nodes: '',
          scripttype: 0, scriptdata: '', scriptemail: false, scriptparams: '', newregion: '', snapregion: '',
          permprovs: '', alttypes: '', initypes: '', asd: '', asn: '', asx: '', srv: '', tsk: '',
          voltype: '', voliops: '', dtus: '', bkpoltype: '1',
          lb: null, lbtg: null, sg: null, pool: null, kms: null, ip: null, policybkp: null,
        })),
      },
      Cls: '',
      integrations: null,
    },
  };
}

/** POST real pro Cloud8 — `context.request` reaproveita a sessão já logada. */
async function postScheduleEvent(context, params) {
  const payload = buildScheduleEventPayload(params);
  const id = (params && params.id) || 0;
  const url = id === 0
    ? 'https://app.cloud8.com.br/scheduleevents/newAction/0'
    : `https://app.cloud8.com.br/scheduleevents/updateAction/${id}`;
  const res = await context.request.post(url, { data: payload, headers: { 'content-type': 'application/json' }, timeout: 30000 });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok() || (data && data.success === false)) throw new Error((data && (data.message || data.error)) || `HTTP ${res.status()}`);
  return data;
}

/** Converte um ISO/epoch em UTC pro formato com offset fixo "-03:00" que o Cloud8 espera em StartDate/EndDate. */
function toBrazilIsoOffset(isoOrEpoch) {
  const d = new Date(isoOrEpoch);
  const brazil = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${brazil.getUTCFullYear()}-${pad(brazil.getUTCMonth() + 1)}-${pad(brazil.getUTCDate())}T${pad(brazil.getUTCHours())}:${pad(brazil.getUTCMinutes())}:${pad(brazil.getUTCSeconds())}-03:00`;
}

/**
 * Monta o payload de "reenviar quase intacto" um agendamento existente (mesmo padrão de
 * backend/src/services/cloud8Service.js, duplicado aqui por ser CJS vs ESM) — preserva o
 * `schedule` bruto (recorrência incluída) e só troca `status`/`jsaction`.
 */
function buildResendPayload(raw, opts) {
  const status = opts && opts.status;
  const jsaction = (opts && opts.jsaction) || '';
  if (!raw || raw.id == null) throw new Error('registro bruto do agendamento (raw.id) é obrigatório');
  const schedule = raw.schedule || {};
  return {
    scheduleevents: {
      parent_id: schedule.id != null ? schedule.id : raw.id,
      id: raw.id,
      original_id: raw.original_id != null ? raw.original_id : raw.id,
      status,
      name: raw.name || schedule.name || '',
      comments: raw.comments != null ? raw.comments : (schedule.comments || ''),
      schedservers: raw.schedservers || raw.ResourceId || '',
      obj: raw.obj || 's',
      isholiday: !!raw.isholiday,
      jsaction,
      country: raw.country || schedule.cc || 'BR',
      timezone: schedule.timezone || 'America/Sao_Paulo',
      offset: schedule.offset != null ? schedule.offset : -10800000,
      ResourceId: raw.ResourceId || raw.schedservers || '',
      type: '',
      StartDate: toBrazilIsoOffset(raw.StartDate || raw.dtbegin),
      EndDate: toBrazilIsoOffset(raw.EndDate || raw.dtend),
      schedule,
      Cls: '',
      integrations: schedule.integrations || [],
      Id: raw.id,
    },
  };
}

/** POST do payload "reenviar quase intacto" (ver `buildResendPayload`). */
async function postResendPayload(context, raw, opts) {
  const payload = buildResendPayload(raw, opts);
  const url = `https://app.cloud8.com.br/scheduleevents/updateAction/${raw.id}`;
  const res = await context.request.post(url, { data: payload, headers: { 'content-type': 'application/json' }, timeout: 30000 });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok() || (data && data.success === false)) throw new Error((data && (data.message || data.error)) || `HTTP ${res.status()}`);
  return data;
}

/**
 * Apaga um agendamento (`termAction`) — corpo vazio, confirmado contra teste real (2026-09-05).
 */
async function deleteScheduleEvent(context, id) {
  const url = `https://app.cloud8.com.br/scheduleevents/termAction/${id}`;
  const res = await context.request.post(url, { data: {}, headers: { 'content-type': 'application/json' }, timeout: 30000 });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok() || (data && data.success === false)) throw new Error((data && (data.message || data.error)) || `HTTP ${res.status()}`);
  return data;
}

async function main() {
  try {
    const raw = await readStdin();
    const input = raw ? JSON.parse(raw) : {};
    const { username, password, headless = true, maxPages = 60, action } = input || {};
    if (!username || !password) {
      process.stdout.write(JSON.stringify({ ok: false, error: 'Configuração incompleta (username e password obrigatórios)' }));
      return;
    }

    const playwright = require('playwright');
    const chromium = playwright.chromium;

    const browser = await chromium.launch({ headless: headless ?? true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });

    try {
      const page = await context.newPage();
      console.error('[cloud8-worker] Navegando para app.cloud8.com.br...');
      await page.goto('https://app.cloud8.com.br', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);

      await page.fill('input[name="username"]', username);
      await page.fill('input[name="password"]', password);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null),
        page.click('[type="submit"]'),
      ]);
      await page.waitForTimeout(2000);

      if (/\/secure\/login/i.test(page.url())) {
        await browser.close();
        process.stdout.write(JSON.stringify({ ok: false, error: 'Login falhou (usuário/senha inválidos ou MFA exigido).' }));
        return;
      }
      console.error('[cloud8-worker] Login OK.');

      if (action && (action.type === 'scheduleEvent' || action.type === 'deleteScheduleEvent' || action.type === 'patchStatus')) {
        console.error(`[cloud8-worker] Executando ação (${action.type})...`);
        let data;
        if (action.type === 'deleteScheduleEvent') {
          data = await deleteScheduleEvent(context, action.id);
        } else if (action.type === 'patchStatus') {
          data = await postResendPayload(context, action.raw, { status: action.status, jsaction: action.jsaction });
        } else {
          data = await postScheduleEvent(context, action.params);
        }
        await browser.close();
        process.stdout.write(JSON.stringify({ ok: true, data }));
        return;
      }

      console.error('[cloud8-worker] Lendo Componentes Atuais > Servidores (paginado)...');
      const inventory = await readInventory(page, maxPages);
      console.error(`[cloud8-worker] ${inventory.length} VM(s) lida(s) do inventário.`);

      console.error('[cloud8-worker] Lendo agendamentos e cloudinstanceid via API...');
      const scheduleEventsRaw = await fetchScheduleEventsViaApi(context, 14);
      const cloudInstanceIdsById = await fetchCloudInstanceIdsViaApi(context);
      const scheduleByResourceId = summarizeScheduleEvents(scheduleEventsRaw);
      console.error(`[cloud8-worker] ${scheduleByResourceId.size} servidor(es) com agendamento detectado (${scheduleEventsRaw.length} ocorrência(s) na janela de 14 dias).`);

      const vms = inventory.map((item) => {
        const schedules = scheduleByResourceId.get(String(item.recordId)) || [];
        const cloudInfo = cloudInstanceIdsById.get(String(item.recordId));
        return {
          ...item,
          hasSchedule: schedules.length > 0,
          schedules,
          cloudinstanceid: cloudInfo && cloudInfo.typeprovider === 'HUAWEI' ? cloudInfo.cloudinstanceid : null,
        };
      });

      await browser.close();
      process.stdout.write(JSON.stringify({ ok: true, vms, totalRowsFound: vms.length }));
    } catch (err) {
      console.error(`[cloud8-worker] ERRO FATAL: ${err.message}`);
      try { await browser.close(); } catch {}
      process.stdout.write(JSON.stringify({ ok: false, error: err.message || 'Erro durante a execução do worker' }));
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'Falha crítica de inicialização do worker' }));
  }
}

main();
