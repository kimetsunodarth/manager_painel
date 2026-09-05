/**
 * Leitura do inventário e dos agendamentos de VMs do Cloud8 (app.cloud8.com.br) — sem API pública
 * documentada (confirmado: "Integrações" no Cloud8 é só webhook de notificação, não API
 * self-service), mas a própria SPA usa uma API JSON interna por trás da tela (descoberta em
 * 2026-09-04 inspecionando o proxy REST do componente Ext.data.Store do calendário) — usada aqui
 * pra ler agendamento real (dia/hora, não só um booleano) sem precisar navegar a tela do calendário.
 * Mesmo padrão de processo isolado do controlCenterService.js: roda via worker (tools/cloud8-worker.cjs
 * + node.exe embarcado) no IIS/.exe empacotado (pkg); em dev, roda Playwright direto no processo.
 *
 * Duas fontes — ver comentário completo em installer/tools/cloud8-worker.cjs:
 *   - "Componentes Atuais > Servidores" (DOM, paginado): inventário — provedor/cliente, nome,
 *     tipo, região, IPs. Rápido, sem hover.
 *   - `GET /scheduleevents/list` (API JSON, mesma sessão): agendamentos reais por servidor —
 *     nome da tarefa, próxima execução, se é recorrente. Substitui a leitura antiga por DOM
 *     (clicar "Automações" → "Servidores" → "Mensal" → contar `.sch-event`).
 * Sem status ligado/desligado confiável nesta versão.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

function runWorker({ username, password, headless, maxPages, action }) {
  return new Promise((resolve) => {
    const cwd = process.cwd();
    const nodeExe = join(cwd, 'tools', 'node', 'node.exe');
    const workerScript = join(cwd, 'tools', 'cloud8-worker.cjs');

    if (!existsSync(nodeExe)) {
      return resolve({ ok: false, error: `node.exe embarcado não encontrado em ${nodeExe}. Reinstale o aplicativo (instalador completo).` });
    }
    if (!existsSync(workerScript)) {
      return resolve({ ok: false, error: `Worker do Cloud8 não encontrado em ${workerScript}. Reinstale o aplicativo (instalador completo).` });
    }
    const browsersDir = join(cwd, 'browsers');
    if (!existsSync(browsersDir)) {
      return resolve({ ok: false, error: `Pasta de browsers do Playwright não encontrada em ${browsersDir}. Reinstale o aplicativo com o instalador completo.` });
    }

    const child = spawn(nodeExe, [workerScript], {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: browsersDir,
        NODE_PATH: join(cwd, 'node_modules'),
      },
    });

    const timeoutMs = 5 * 60 * 1000;
    const timeout = setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ ok: false, error: 'Timeout na automação do Cloud8 (Playwright).' });
    }, timeoutMs);

    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { console.log(`[cloud8-worker] ${d.trim()}`); });

    child.on('error', (e) => {
      clearTimeout(timeout);
      resolve({ ok: false, error: e?.message || 'Falha ao iniciar worker do Cloud8' });
    });

    child.on('exit', () => {
      clearTimeout(timeout);
      try {
        const parsed = out ? JSON.parse(out) : null;
        if (parsed && typeof parsed === 'object') return resolve(parsed);
      } catch (parseError) {
        console.warn('[cloud8] Falha ao parsear saída do worker:', parseError.message);
      }
      resolve({ ok: false, error: (err || out || '').trim() || 'Falha ao executar worker do Cloud8' });
    });

    try {
      child.stdin.write(JSON.stringify({ username, password, headless: headless ?? true, maxPages, action }));
      child.stdin.end();
    } catch (e) {
      clearTimeout(timeout);
      resolve({ ok: false, error: e?.message || 'Falha ao enviar dados ao worker do Cloud8' });
    }
  });
}

/**
 * Clica um locator resiliente à máscara "Processando... Aguarde..." do Cloud8, que reaparece
 * periodicamente sobre a grid e intercepta cliques do Playwright — confirmado em produção
 * (2026-09-04, via installer/tools/cloud8-worker.cjs, mesma lógica duplicada aqui pro modo dev):
 * clique em "Mensal" estourou os 30s padrão do Playwright, `<div class="x-mask">` interceptando
 * repetidamente. Espera a máscara sumir antes de cada tentativa e tenta de novo.
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
    if (!addedNew && pageIndex > 0) break;
    await nextBtn.click();
    await page.waitForTimeout(900);
  }
  return items;
}

/**
 * Busca os eventos de agendamento reais via a API JSON do Cloud8 (descoberta em 2026-09-04
 * inspecionando o proxy REST do componente Ext.data.Store da tela de calendário) — substitui a
 * leitura antiga por DOM (clicar "Automações" → "Servidores" → "Mensal" → contar `.sch-event`).
 * `context.request` compartilha os cookies da sessão já logada, então não precisa navegar tela
 * nenhuma. Ver comentário completo em installer/tools/cloud8-worker.cjs (produção).
 */
async function fetchScheduleEventsViaApi(context, days = 14) {
  const now = new Date();
  const start = now.toISOString().slice(0, 19);
  const end = new Date(now.getTime() + days * 24 * 3600 * 1000).toISOString().slice(0, 19);
  const url = `https://app.cloud8.com.br/scheduleevents/list?objtype=s&startDate=${start}&endDate=${end}&page=1&start=0&limit=5000`;
  const res = await context.request.get(url, { timeout: 30000 });
  if (!res.ok()) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.scheduleevents) ? data.scheduleevents : [];
}

/**
 * Busca `/servers/schedulelist` (mesma API JSON interna) só pelo `cloudinstanceid` de cada
 * servidor — o UUID real do recurso na nuvem de origem (ex.: o ID do ECS na Huawei). O Cloud8 não
 * expõe projeto/perfil Huawei nenhum, só esse UUID; quem cruza esse UUID com projeto/perfil é
 * `huawei-ecs.js`'s `getEcsUuidIndex()`, chamado em `routes/cloud8.js`.
 * @returns {Promise<Map<string, { cloudinstanceid: string|null, typeprovider: string|null }>>}
 */
async function fetchCloudInstanceIdsViaApi(context) {
  const url = 'https://app.cloud8.com.br/servers/schedulelist?objtype=s&page=1&start=0&limit=5000';
  const res = await context.request.get(url, { timeout: 30000 });
  if (!res.ok()) return new Map();
  const data = await res.json().catch(() => null);
  const objects = Array.isArray(data?.objects) ? data.objects : [];
  const byId = new Map();
  for (const o of objects) {
    if (o?.id == null) continue;
    byId.set(String(o.id), { cloudinstanceid: o.cloudinstanceid || null, typeprovider: o.provider?.typeprovider || null });
  }
  return byId;
}

/**
 * Agrupa ocorrências por servidor, deduplicando por `schedule.id` e mantendo a próxima execução.
 * Guarda também os campos necessários pra reconstruir o payload de `updateAction` (editar direto
 * da tela): `id` (id da OCORRÊNCIA, é o que vai na URL de update — diferente de `scheduleId`,
 * que é o `parent_id`/`schedule.id`), `resourceIds` e `taskTypes` completos (não só o primeiro).
 */
function summarizeScheduleEvents(rawEvents) {
  const byResource = new Map();
  for (const ev of rawEvents) {
    const resourceId = String(ev.ResourceId || '').replace(/s$/, '');
    const scheduleId = ev.schedule?.id;
    if (!resourceId || scheduleId == null || !ev.dtbegin) continue;
    if (!byResource.has(resourceId)) byResource.set(resourceId, new Map());
    const schedMap = byResource.get(resourceId);
    const existing = schedMap.get(scheduleId);
    if (!existing || new Date(ev.dtbegin) < new Date(existing.nextRun)) {
      schedMap.set(scheduleId, {
        scheduleId,
        id: ev.id ?? null,
        name: ev.schedule?.name || null,
        nextRun: ev.dtbegin,
        startDate: ev.dtbegin || null,
        endDate: ev.dtend || null,
        isrecurrent: !!ev.schedule?.isrecurrent,
        taskType: ev.tasks?.[0]?.type || null,
        taskTypes: Array.isArray(ev.tasks) ? ev.tasks.map((t) => t.type).filter(Boolean) : [],
        resourceIds: String(ev.ResourceId || '').split(',').map((r) => r.trim().replace(/s$/, '')).filter(Boolean),
        // Registro bruto, tal como veio da API — usado pra "Suspender" (e qualquer ação futura que
        // precise reenviar a programação quase intacta): preserva os campos de recorrência
        // (rec_type/rec_wkly_days/etc.) sem eu precisar entender o formato deles.
        raw: ev,
      });
    }
  }
  const result = new Map();
  for (const [resourceId, schedMap] of byResource) result.set(resourceId, Array.from(schedMap.values()));
  return result;
}

/** Rótulo do runbook exibido na UI, por tipo de tarefa do Cloud8. */
const CLOUD8_TASK_LABELS = { ev_serverstart: 'Ligar', ev_serverstop: 'Desligar', ev_serverreboot: 'Reiniciar' };

/**
 * Monta o payload de criar (`id=0`) ou alterar (`id` real) um agendamento no Cloud8 —
 * formato confirmado byte-a-byte contra um teste real (2026-09-05, capturado via DevTools do
 * usuário depois de preencher "Novo Workflow" e clicar Gravar, e depois "Alterar"). A maioria dos
 * campos de `tasks[]` são defaults compartilhados com outros tipos de tarefa (backup, script) que
 * não fazem sentido pra liga/desliga/reboot — mantidos como no payload real capturado, nunca
 * inventados. **Só cobre execução ÚNICA (`rec_type: 0`)** — recorrência (semanal etc.) não foi
 * validada contra um create/update real ainda, por isso não é suportada aqui (evita adivinhar
 * `rec_wkly_days`/`rec_type` do lado de escrita — o valor lido em `summarizeScheduleEvents` vem
 * só de listagem, nunca de um create confirmado).
 */
function buildScheduleEventPayload({ id = 0, scheduleId = 0, name, resourceIds, taskTypes, startDate, endDate, email, status = 1, jsaction = '' }) {
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
      status,
      name,
      comments: '',
      schedservers,
      obj: 's',
      isholiday: false,
      jsaction,
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

/** POST real pro Cloud8 — `context.request` reaproveita a sessão já logada (cookies do browser). */
async function postScheduleEvent(context, params) {
  const payload = buildScheduleEventPayload(params);
  const id = params.id || 0;
  const url = id === 0
    ? 'https://app.cloud8.com.br/scheduleevents/newAction/0'
    : `https://app.cloud8.com.br/scheduleevents/updateAction/${id}`;
  const res = await context.request.post(url, { data: payload, headers: { 'content-type': 'application/json' }, timeout: 30000 });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok() || data?.success === false) throw new Error(data?.message || data?.error || `HTTP ${res.status()}`);
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
 * Monta o payload de "reenviar quase intacto" um agendamento existente — mesmo formato usado pelo
 * próprio Cloud8 quando você abre um workflow e clica Suspender/Gravar sem mudar nada: reaproveita
 * o `schedule` bruto (com `rec_type`/`rec_wkly_days`/etc. originais, sejam quais forem) e só troca
 * `status`/`jsaction`. Diferente de `buildScheduleEventPayload()` (que reconstrói do zero e só
 * suporta execução única), este preserva recorrência automaticamente — não precisa entender o
 * formato dela. Confirmado byte-a-byte contra teste real (2026-09-05, botão "Suspender").
 * @param {object} raw - o objeto bruto de `GET /scheduleevents/list` pra essa ocorrência.
 */
function buildResendPayload(raw, { status, jsaction = '' }) {
  if (!raw || raw.id == null) throw new Error('registro bruto do agendamento (raw.id) é obrigatório');
  const schedule = raw.schedule || {};
  return {
    scheduleevents: {
      parent_id: schedule.id ?? raw.id,
      id: raw.id,
      original_id: raw.original_id ?? raw.id,
      status,
      name: raw.name || schedule.name || '',
      comments: raw.comments ?? schedule.comments ?? '',
      schedservers: raw.schedservers || raw.ResourceId || '',
      obj: raw.obj || 's',
      isholiday: !!raw.isholiday,
      jsaction,
      country: raw.country || schedule.cc || 'BR',
      timezone: schedule.timezone || 'America/Sao_Paulo',
      offset: schedule.offset ?? -10800000,
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

/** POST do payload "reenviar quase intacto" (ver `buildResendPayload`) — usado por `setCloud8ScheduleStatus`. */
async function postResendPayload(context, raw, opts) {
  const payload = buildResendPayload(raw, opts);
  const url = `https://app.cloud8.com.br/scheduleevents/updateAction/${raw.id}`;
  const res = await context.request.post(url, { data: payload, headers: { 'content-type': 'application/json' }, timeout: 30000 });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok() || data?.success === false) throw new Error(data?.message || data?.error || `HTTP ${res.status()}`);
  return data;
}

/**
 * Apaga um agendamento (`termAction`) — `POST /scheduleevents/termAction/{id}` com corpo vazio.
 * **Confirmado contra teste real** (2026-09-05): usuário criou e apagou várias tarefas de teste
 * reais no Cloud8 com exatamente esse formato (corpo `{}`) e confirmou visualmente que sumiram de
 * verdade da tela — não é mais inferência.
 */
async function deleteScheduleEvent(context, id) {
  const url = `https://app.cloud8.com.br/scheduleevents/termAction/${id}`;
  const res = await context.request.post(url, { data: {}, headers: { 'content-type': 'application/json' }, timeout: 30000 });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok() || data?.success === false) throw new Error(data?.message || data?.error || `HTTP ${res.status()}`);
  return data;
}

/** Login + escrita direta (dev, sem worker/pkg) — mesma lógica do installer/tools/cloud8-worker.cjs. */
async function runDirectAction({ username, password, headless, action }) {
  let chromium;
  try {
    const playwright = await import('playwright');
    chromium = playwright.chromium;
  } catch (e) {
    return { ok: false, error: 'Playwright não disponível. No backend execute: npm install playwright e npx playwright install chromium.' };
  }

  const browser = await chromium.launch({ headless: headless ?? true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });

  try {
    const page = await context.newPage();
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
      return { ok: false, error: 'Login falhou (usuário/senha inválidos ou MFA exigido).' };
    }

    let data;
    if (action.type === 'deleteScheduleEvent') {
      data = await deleteScheduleEvent(context, action.id);
    } else if (action.type === 'patchStatus') {
      data = await postResendPayload(context, action.raw, { status: action.status, jsaction: action.jsaction });
    } else {
      data = await postScheduleEvent(context, action.params);
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message || 'Erro inesperado ao gravar agendamento no Cloud8' };
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Cria (`id` omitido/0) ou altera (`id` da tarefa) um agendamento de execução única no Cloud8.
 * @param {{ username: string, password: string }} credentials
 * @param {{ id?: number, scheduleId?: number, name: string, resourceIds: string[], taskTypes: string[], startDate: string, endDate: string, email?: string }} params
 *   `resourceIds` são os ids NUMÉRICOS do Cloud8 (sem o sufixo "s" — ele é adicionado aqui).
 *   `taskTypes`: `'ev_serverstart'`, `'ev_serverstop'` ou `'ev_serverreboot'`.
 *   `startDate`/`endDate`: ISO com offset (ex.: `2026-09-05T16:06:04-03:00`).
 */
export async function createOrUpdateCloud8Schedule(credentials, params) {
  const { username, password } = credentials || {};
  if (!username || !password) return { ok: false, error: 'Credenciais do Cloud8 não configuradas' };

  const action = { type: 'scheduleEvent', params };
  const isPkg = typeof process.pkg !== 'undefined';
  const isIisNode = typeof process.env.IISNODE_VERSION !== 'undefined';
  if (isPkg || isIisNode) {
    return runWorker({ username, password, headless: true, action });
  }
  return runDirectAction({ username, password, headless: true, action });
}

/**
 * Suspende (pausa sem apagar) um agendamento existente reenviando o registro **bruto** quase
 * intacto (ver `buildResendPayload`) — funciona pra programações recorrentes também, porque não
 * reconstrói `schedule` do zero (só `createOrUpdateCloud8Schedule`/"Editar" faz isso, por isso
 * continua limitado a execução única). Confirmado byte-a-byte contra teste real (2026-09-05): o
 * botão "Suspender somente este workflow" do Cloud8 gera exatamente `status: 7, jsaction: "suspend"`
 * mantendo o resto do registro (incluindo `rec_*`) idêntico.
 * **"Retomar" (reverter a suspensão) não foi capturado ainda** — não implementado sem confirmar.
 * @param {{ username: string, password: string }} credentials
 * @param {object} raw - o registro bruto do agendamento (`Cloud8ScheduleEntry.raw`, vindo de `/scheduleevents/list`).
 */
export async function suspendCloud8Schedule(credentials, raw) {
  const { username, password } = credentials || {};
  if (!username || !password) return { ok: false, error: 'Credenciais do Cloud8 não configuradas' };

  const action = { type: 'patchStatus', raw, status: 7, jsaction: 'suspend' };
  const isPkg = typeof process.pkg !== 'undefined';
  const isIisNode = typeof process.env.IISNODE_VERSION !== 'undefined';
  if (isPkg || isIisNode) {
    return runWorker({ username, password, headless: true, action });
  }
  return runDirectAction({ username, password, headless: true, action });
}

/**
 * Apaga um agendamento do Cloud8 — confirmado contra teste real (2026-09-05, ver `deleteScheduleEvent`).
 * @param {{ username: string, password: string }} credentials
 * @param {number} id - id da ocorrência (o mesmo usado em `updateAction`).
 */
export async function deleteCloud8Schedule(credentials, id) {
  const { username, password } = credentials || {};
  if (!username || !password) return { ok: false, error: 'Credenciais do Cloud8 não configuradas' };

  const action = { type: 'deleteScheduleEvent', id };
  const isPkg = typeof process.pkg !== 'undefined';
  const isIisNode = typeof process.env.IISNODE_VERSION !== 'undefined';
  if (isPkg || isIisNode) {
    return runWorker({ username, password, headless: true, action });
  }
  return runDirectAction({ username, password, headless: true, action });
}

/**
 * Login + leitura direta (dev, sem worker/pkg) — mesma lógica do installer/tools/cloud8-worker.cjs.
 */
async function runDirect({ username, password, headless, maxPages }) {
  let chromium;
  try {
    const playwright = await import('playwright');
    chromium = playwright.chromium;
  } catch (e) {
    return { ok: false, error: 'Playwright não disponível. No backend execute: npm install playwright e npx playwright install chromium.' };
  }

  const browser = await chromium.launch({ headless: headless ?? true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });

  try {
    const page = await context.newPage();
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
      return { ok: false, error: 'Login falhou (usuário/senha inválidos ou MFA exigido).' };
    }

    const inventory = await readInventory(page, maxPages || 60);
    const [scheduleEventsRaw, cloudInstanceIdsById] = await Promise.all([
      fetchScheduleEventsViaApi(context, 14),
      fetchCloudInstanceIdsViaApi(context),
    ]);
    const scheduleByResourceId = summarizeScheduleEvents(scheduleEventsRaw);
    const vms = inventory.map((item) => {
      const schedules = scheduleByResourceId.get(String(item.recordId)) || [];
      const cloudInfo = cloudInstanceIdsById.get(String(item.recordId));
      return {
        ...item,
        hasSchedule: schedules.length > 0,
        schedules,
        cloudinstanceid: cloudInfo?.typeprovider === 'HUAWEI' ? cloudInfo.cloudinstanceid : null,
      };
    });

    return { ok: true, vms, totalRowsFound: vms.length };
  } catch (err) {
    return { ok: false, error: err.message || 'Erro inesperado na automação do Cloud8' };
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Lê o inventário de VMs do Cloud8 (provedor/cliente, nome, tipo, região, IPs, se tem
 * agendamento). Pode demorar (login + paginação) — usar com moderação, não em polling frequente.
 * @param {{ username: string, password: string }} credentials
 * @param {{ headless?: boolean, maxPages?: number }} [options]
 */
export async function listCloud8Vms(credentials, options = {}) {
  const { username, password } = credentials || {};
  if (!username || !password) {
    return { ok: false, error: 'Credenciais do Cloud8 não configuradas' };
  }
  const { headless = true, maxPages = 60 } = options;

  const isPkg = typeof process.pkg !== 'undefined';
  const isIisNode = typeof process.env.IISNODE_VERSION !== 'undefined';
  if (isPkg || isIisNode) {
    return runWorker({ username, password, headless, maxPages });
  }
  return runDirect({ username, password, headless, maxPages });
}
