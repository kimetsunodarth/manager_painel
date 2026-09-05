/**
 * Huawei Cloud Operations Center (COC) — Scheduled O&M.
 *
 * Proveniência (2026-09-03): portado de um script Node real, já usado pelo time para criar
 * scheduled tasks de verdade na conta Ramo_Sistemas (migração dos agendamentos do Cloud8/Moove
 * para o COC). O payload (input_param/target_instances/trigger_time) é byte-a-byte o que
 * funcionou em produção — o script de referência usava token IAM escopado por domínio.
 *
 * **Dois métodos de auth, com fallback automático**: cada chamada tenta primeiro **AK/SK
 * assinado** (mesmo padrão de ECS/CBR, `huawei-signer.js`, perfis já cadastrados no painel — sem
 * credencial extra). Se a Huawei responder 401/403 (rejeitando AK/SK nesse endpoint) E o perfil
 * tiver credenciais IAM de domínio configuradas (`getProfileIamCredentials`, usuário dedicado tipo
 * "ananimreport"), tenta de novo com **token IAM escopado por domínio** (`scope.domain`, via
 * `getIAMTokenByPassword` de `huawei-iam.js` — o método que o script de referência usava). Não se
 * sabe ainda qual dos dois a Huawei aceita no COC — por isso os dois ficam disponíveis.
 *
 * - Host FIXO: coc-intl.myhuaweicloud.com (COC internacional). O host regional
 *   "coc.{region}.myhuaweicloud.com" roteia para o COC da China e retorna vazio em contas internacionais.
 * - Runbooks COMMUNAL globais (mesmo UUID para qualquer conta): Start_ECS, Stop_ECS, Restart_ECS.
 * - **A tarefa nasce ATIVADA** — createScheduledTask() já chama disable() logo em seguida (mesmo
 *   comportamento do script de referência: cria, confirma o id, desativa).
 * - **`input_param` não pode ser `{}`**: os campos internos do runbook (job_uuid, execute_atomic_tasks,
 *   version_uuid, vars, success_rate) são CLONADOS de uma tarefa já existente da mesma ação — a Huawei
 *   não documenta esses valores publicamente. Se a conta não tem NENHUMA tarefa daquele runbook ainda,
 *   é preciso criar uma manualmente pelo console COC uma vez, e o código clona dela daí em diante.
 * - `target_instances` é uma string JSON *dupla*: o objeto interno (batches/policy/all_rotation) é
 *   serializado com JSON.stringify() e colocado dentro do array externo do payload.
 * - Quota: 200 tarefas agendadas por conta — estourar retorna erro COC.00014138.
 *
 * Nenhuma chamada real foi feita por este código ainda (nem AK/SK, nem token) — validar contra
 * uma conta real antes de uso em produção.
 */

import { getProfileCredentials, getProfileIamCredentials } from '../config/configLoader.js';
import { signRequest } from './huawei-signer.js';
import { listProjectsWithAKSK, getIAMTokenByPassword } from './huawei-iam.js';

const COC_HOST = 'coc-intl.myhuaweicloud.com';
const COC_TIMEOUT = 20000;
const SCHEDULE_TASK_PATH = '/v1/schedule/task';
const QUOTA_ERROR_CODE = 'COC.00014138';
const LIST_PAGE_SIZE = 100;
const TOKEN_TTL_MS = 20 * 60 * 1000; // margem de segurança; token IAM real dura ~24h

/** Runbooks COMMUNAL globais da Huawei — mesmo UUID para qualquer conta. */
const RUNBOOKS = {
  Start_ECS: { id: 'RB2023070311023401e43d156', nameZh: 'ECS开机', en: 'Start_ECS' },
  Stop_ECS: { id: 'RB2023070311023401e43d155', nameZh: 'ECS关机', en: 'Stop_ECS' },
  Restart_ECS: { id: 'RB2023070311023401e43d157', nameZh: 'ECS重启', en: 'Restart_ECS' },
};

/** Nomes dos runbooks públicos, para montar o seletor no formulário. */
export const BUILTIN_JOBS = Object.keys(RUNBOOKS);

const tokenCache = new Map(); // perfil -> { token, expiresAt }

async function fetchJson(method, host, urlPath, headers, bodyStr, queryParams) {
  const qs = queryParams ? `?${new URLSearchParams(queryParams).toString()}` : '';
  const res = await fetch(`https://${host}${urlPath}${qs}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json;charset=utf8' },
    body: bodyStr ?? undefined,
    signal: AbortSignal.timeout(COC_TIMEOUT),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data, raw: text };
}

function toError(status, data, raw) {
  const code = data?.error_code || data?.code;
  const err = code === QUOTA_ERROR_CODE
    ? new Error(`Limite de 200 tarefas agendadas atingido nesta conta (${QUOTA_ERROR_CODE}) — solicitar aumento de quota à Huawei.`)
    : new Error(data?.error_msg || data?.message || raw || `HTTP ${status}`);
  err.status = status;
  return err;
}

async function requestWithAksk(method, perfil, urlPath, body, queryParams) {
  const { ak, sk, project_id: projectId } = getProfileCredentials(perfil);
  const bodyStr = body != null ? JSON.stringify(body) : null;
  const headers = signRequest(method, COC_HOST, urlPath, ak, sk, { 'X-Project-Id': projectId }, queryParams, bodyStr);
  const { status, ok, data, raw } = await fetchJson(method, COC_HOST, urlPath, headers, bodyStr, queryParams);
  if (!ok) throw toError(status, data, raw);
  return data;
}

async function getCocToken(perfil, { forceRefresh = false } = {}) {
  const cached = tokenCache.get(perfil);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.token;

  const { username, password, domain } = getProfileIamCredentials(perfil);
  if (!username || !password || !domain) return null;
  const token = await getIAMTokenByPassword(username, password, domain, null);
  tokenCache.set(perfil, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

async function requestWithIamToken(method, perfil, urlPath, body, queryParams, { retryOn401 = true } = {}) {
  const token = await getCocToken(perfil);
  if (!token) return null; // sem credenciais IAM configuradas nesse perfil — não há fallback
  const bodyStr = body != null ? JSON.stringify(body) : null;
  const { status, ok, data, raw } = await fetchJson(method, COC_HOST, urlPath, { 'X-Auth-Token': token }, bodyStr, queryParams);
  if (status === 401 && retryOn401) {
    tokenCache.delete(perfil);
    await getCocToken(perfil, { forceRefresh: true });
    return requestWithIamToken(method, perfil, urlPath, body, queryParams, { retryOn401: false });
  }
  if (!ok) throw toError(status, data, raw);
  return data;
}

/**
 * Tenta AK/SK assinado primeiro; se a Huawei rejeitar com 401/403 e o perfil tiver credenciais
 * IAM de domínio configuradas, tenta de novo com token IAM (mesmo método do script de referência).
 */
async function cocRequest(method, perfil, urlPath, body, queryParams = null) {
  try {
    return await requestWithAksk(method, perfil, urlPath, body, queryParams);
  } catch (akskError) {
    if (akskError.status !== 401 && akskError.status !== 403) throw akskError;
    let iamResult;
    try {
      iamResult = await requestWithIamToken(method, perfil, urlPath, body, queryParams);
    } catch (iamError) {
      throw new Error(`AK/SK rejeitado (${akskError.message}) e fallback com token IAM também falhou: ${iamError.message}`);
    }
    if (iamResult === null) throw akskError; // sem credenciais IAM pra tentar — erro original do AK/SK
    return iamResult;
  }
}

/**
 * Lista TODAS as tarefas de Scheduled O&M cadastradas no COC para a conta (perfil), paginando.
 * Resposta da Huawei: { scheduled_tasks: [...], count: N }.
 */
export async function listScheduledTasks(perfil) {
  const tasks = [];
  let offset = 0;
  for (;;) {
    const data = await cocRequest('GET', perfil, SCHEDULE_TASK_PATH, null, { offset: String(offset), limit: String(LIST_PAGE_SIZE) });
    const page = data?.scheduled_tasks || [];
    tasks.push(...page);
    const total = data?.count || 0;
    offset += page.length;
    if (page.length === 0 || offset >= total) break;
  }
  return tasks;
}

/** Detalhe de uma tarefa (usado para clonar os "bits de ação" do input_param). */
async function getScheduledTask(perfil, taskId) {
  return cocRequest('GET', perfil, `${SCHEDULE_TASK_PATH}/${encodeURIComponent(taskId)}`, null);
}

/**
 * Encontra uma tarefa existente com o mesmo runbook (associated_task_id) e extrai os campos
 * internos do input_param (job_uuid/execute_atomic_tasks/version_uuid/vars/success_rate) — a
 * Huawei não aceita input_param vazio e esses valores não são documentados publicamente, então
 * a única forma confiável de obtê-los é clonar de uma tarefa que já funciona.
 */
async function findActionBits(perfil, jobId) {
  const existing = await listScheduledTasks(perfil);
  for (const task of existing) {
    const taskId = task.id || task.task_id;
    if (!taskId) continue;
    let full;
    try {
      full = await getScheduledTask(perfil, taskId);
    } catch {
      continue;
    }
    if (!full || full.associated_task_id !== jobId || !full.input_param) continue;
    try {
      const parsed = JSON.parse(full.input_param);
      return {
        success_rate: parsed.success_rate,
        job_uuid: parsed.job_uuid,
        execute_atomic_tasks: parsed.execute_atomic_tasks,
        vars: parsed.vars,
        version_uuid: parsed.version_uuid,
      };
    } catch {
      continue;
    }
  }
  return null;
}

const coverageCache = new Map(); // perfil -> { entries, expiresAt }
const COVERAGE_CACHE_TTL_MS = 15 * 60 * 1000;

/** Invalida o cache de cobertura de um perfil — chamar depois de enable/disable/delete pra a tela `/automacoes` não continuar mostrando estado antigo por até 15 min. */
export function invalidateCoverageCache(perfil) {
  coverageCache.delete(perfil);
}

/** Roda `fn` sobre `items` com no máximo `limit` chamadas em paralelo. */
async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Extrai as instâncias de VM de dentro do target_instances (string JSON dupla) de uma tarefa —
 * hostname + identidade Huawei (resourceId/regionId/projectId), essa última necessária pra poder
 * ligar/desligar/reiniciar a VM direto da tela de reconciliação (mesmos parâmetros que
 * `huawei-ecs.js`'s startEcs/stopEcs/restartEcs já exigem).
 */
function parseTargetInstances(detail) {
  const instances = [];
  try {
    const outer = JSON.parse(detail.target_instances || '[]');
    for (const ot of outer) {
      const inner = JSON.parse(ot.target_instances || '{}');
      for (const batch of inner.batches || []) {
        for (const inst of batch.targetInstances || []) {
          const hostName = inst?.properties?.hostName;
          if (!hostName) continue;
          instances.push({
            hostName: String(hostName).trim().toUpperCase(),
            resourceId: inst?.resourceId || null,
            regionId: inst?.regionId || inst?.properties?.regionId || null,
            projectId: inst?.properties?.projectId || null,
          });
        }
      }
    }
  } catch {
    // tarefa com shape inesperado — ignora silenciosamente, não deve quebrar a reconciliação
  }
  return instances;
}

/**
 * Lista os hostnames de VM cobertos por tarefas COC HABILITADAS de um perfil (conta). Caro: a
 * listagem de tarefas não traz o alvo, então busca o DETALHE de cada tarefa habilitada
 * (`getScheduledTask`, concorrência limitada) — cacheado em memória por 15 min pra não repetir
 * a cada carregamento da tela de reconciliação (`/automacoes`).
 * @returns {Promise<Array<{ perfil: string, taskId: string, taskName: string, jobName: string, hostName: string, triggerTime: object|null, resourceId: string|null, regionId: string|null, projectId: string|null }>>}
 */
export async function listCocCoveredHostnames(perfil) {
  const cached = coverageCache.get(perfil);
  if (cached && cached.expiresAt > Date.now()) return cached.entries;

  const tasks = (await listScheduledTasks(perfil)).filter((t) => t.enabled);
  const entries = [];
  await mapWithConcurrency(tasks, 8, async (task) => {
    const taskId = task.id || task.task_id;
    if (!taskId) return;
    let detail;
    try {
      detail = await getScheduledTask(perfil, taskId);
    } catch {
      return;
    }
    let triggerTime = null;
    try {
      triggerTime = typeof detail.trigger_time === 'string' ? JSON.parse(detail.trigger_time) : detail.trigger_time || null;
    } catch {
      triggerTime = null;
    }
    for (const inst of parseTargetInstances(detail)) {
      entries.push({
        perfil,
        taskId,
        taskName: task.name,
        jobName: task.associated_task_name_en,
        hostName: inst.hostName,
        triggerTime,
        resourceId: inst.resourceId,
        regionId: inst.regionId,
        projectId: inst.projectId,
      });
    }
  });

  coverageCache.set(perfil, { entries, expiresAt: Date.now() + COVERAGE_CACHE_TTL_MS });
  return entries;
}

/** Projeto-raiz de cada região (ex.: "sa-brazil-1" -> projectId), via IAM /v3/projects com o mesmo AK/SK. */
async function fetchRegionRootProjects(perfil) {
  const { ak, sk } = getProfileCredentials(perfil);
  const projects = await listProjectsWithAKSK(ak, sk, '', null);
  const regionToRootProjectId = new Map();
  for (const p of projects) {
    if (/^[a-z]{2}-[a-z]+-\d+$/.test(p.name)) regionToRootProjectId.set(p.name, p.id);
  }
  return regionToRootProjectId;
}

/**
 * Monta o payload completo (create-shape) a partir dos parâmetros de alto nível — usado tanto
 * para criar (POST) quanto para alterar (PUT, que exige o mesmo corpo completo, não um diff
 * parcial — confirmado contra conta real: PATCH não existe nessa API, `enable_approve` e os
 * demais campos obrigatórios do create são exigidos também no PUT).
 */
async function buildTaskPayload(perfil, params) {
  const { taskName, jobName, triggerTime, targetServers, riskLevel } = params || {};
  if (!taskName || !jobName || !triggerTime || !Array.isArray(targetServers) || targetServers.length === 0) {
    throw new Error('taskName, jobName, triggerTime e targetServers (não vazio) são obrigatórios');
  }
  const job = RUNBOOKS[jobName];
  if (!job) throw new Error(`jobName deve ser um de: ${BUILTIN_JOBS.join(', ')}`);

  const regions = new Set(targetServers.map((s) => s.regionId));
  if (regions.size !== 1) throw new Error('Todos os targetServers devem estar na mesma região (regionId)');
  const region = [...regions][0];
  const projectId = targetServers[0].projectId;

  const actionBits = await findActionBits(perfil, job.id);
  if (!actionBits) {
    throw new Error(
      `Nenhuma tarefa existente encontrada para o runbook ${jobName} nesta conta — o COC não aceita input_param vazio ` +
      `(os IDs internos do job são clonados de uma tarefa já existente da mesma ação). Crie uma manualmente pelo console ` +
      `COC uma vez (qualquer VM, mesmo runbook) e tente de novo.`
    );
  }

  const regionToRootProjectId = await fetchRegionRootProjects(perfil);
  const executeProjectId = regionToRootProjectId.get(region);
  if (!executeProjectId) throw new Error(`Não encontrei o projeto-raiz da região '${region}' via IAM /v3/projects`);

  const instances = targetServers.map((s) => ({
    resourceId: s.resourceId,
    regionId: s.regionId,
    provider: 'ECS',
    type: 'CLOUDSERVERS',
    agentSn: null,
    agentStatus: null,
    nodeId: '',
    enterpriseProjectId: '0',
    properties: {
      hostName: s.hostName,
      fixedIp: s.fixedIp || '',
      regionId: s.regionId,
      zoneId: s.zoneId || '',
      projectId: s.projectId,
    },
  }));

  // policy 'none' confirmado funcionando contra conta real para 1 batch/1 instância; uma tarefa
  // real de produção com 2 batches usava 'manual' — não confirmado se 'none' também serve pra
  // múltiplos batches.
  const innerTargets = {
    batches: [{ batchIndex: '1', targetInstances: instances, rotationStrategy: 'CONTINUE' }],
    policy: 'none',
    all_rotation: 'ALL_CONTINUE',
  };

  return {
    name: taskName,
    version_no: '1.0.0',
    enterprise_project_id: '0',
    task_type: 'RUNBOOK',
    associated_task_type: 'COMMUNAL',
    associated_task_id: job.id,
    associated_task_name: job.nameZh,
    associated_task_name_en: job.en,
    input_param: {
      success_rate: actionBits.success_rate || '100',
      project_id: projectId,
      job_uuid: actionBits.job_uuid,
      execute_atomic_tasks: actionBits.execute_atomic_tasks,
      vars: actionBits.vars || '[]',
      version_uuid: actionBits.version_uuid,
      region_id: region,
      execute_project_id: executeProjectId,
    },
    runbook_instance_mode: 'SAME',
    agency_name: 'ServiceAgencyForCOC',
    target_instances: [{ target_selection: 'MANUAL', target_instances: JSON.stringify(innerTargets), order_no: 0 }],
    trigger_time: triggerTime,
    risk_level: riskLevel || 'LOW',
    enable_approve: false,
    enable_message_notification: false,
  };
}

/**
 * Cria uma tarefa de Scheduled O&M no Huawei COC e a desativa em seguida (ela nasce ATIVADA).
 * @param {string} perfil - Perfil da conta Huawei (AK/SK; usa token IAM de domínio como fallback se configurado).
 * @param {object} params
 * @param {string} params.taskName
 * @param {'Start_ECS'|'Stop_ECS'|'Restart_ECS'} params.jobName
 * @param {object} params.triggerTime - Periódico: { policy:'PERIODIC', periodic_scheduled_time:'HH:MM:SS', period:'2,3,4,5,6' (1=Dom..7=Sáb), time_zone:'America/Sao_Paulo' }. Único: { policy:'ONCE', single_scheduled_time: epochMs, time_zone:'America/Sao_Paulo' } — **time_zone é obrigatório mesmo em ONCE** (confirmado: erro real da Huawei "trigger_time.time_zone 不得为 null" sem ele).
 * @param {Array<{resourceId:string, regionId:string, hostName:string, fixedIp?:string, zoneId?:string, projectId:string}>} params.targetServers - ECS alvo, todas na mesma região.
 * @param {'LOW'|'MEDIUM'|'HIGH'} [params.riskLevel] - Padrão LOW (mesmo padrão do processo real).
 * @returns {Promise<{ taskId: string, disabled: boolean }>}
 */
export async function createScheduledTask(perfil, params) {
  const payload = await buildTaskPayload(perfil, params);
  const created = await cocRequest('POST', perfil, SCHEDULE_TASK_PATH, payload);
  const taskId = created?.data || created?.id;
  if (!taskId) throw new Error('Huawei não retornou o id da tarefa criada: ' + JSON.stringify(created));

  await disableScheduledTask(perfil, taskId); // nasce ATIVADA — desativa antes de devolver
  return { taskId, disabled: true };
}

/**
 * Altera uma tarefa existente — confirmado contra conta real: é um `PUT` com o payload COMPLETO
 * (mesmo formato do create), não um PATCH parcial (a API nem tem verbo PATCH — 404 "method PATCH
 * not found"; um PUT com corpo parcial também falha, "enable_approve não pode ser null" etc.).
 * Duas pegadinhas confirmadas contra conta real:
 * 1) A Huawei recusa o PUT com "The task cannot be edited when it is enabled" — precisa desativar
 *    ANTES de editar (por isso o try/catch abaixo: ignora erro se já estava desativada).
 * 2) O PUT reativa a tarefa como efeito colateral (mesmo sem "enabled" no payload, igual o
 *    create) — por isso desativa de novo DEPOIS. Sem esse segundo disable, updateScheduledTask
 *    reabilitaria silenciosamente o agendamento (confirmado: aconteceu numa tarefa de teste real).
 * Mesmos parâmetros de createScheduledTask — reconstrói o payload inteiro do zero (clona
 * action bits de novo, não reaproveita os da tarefa antiga).
 * @param {string} perfil
 * @param {string} taskId
 * @param {Parameters<typeof createScheduledTask>[1]} params
 */
export async function updateScheduledTask(perfil, taskId, params) {
  if (!taskId) throw new Error('taskId é obrigatório');
  const payload = await buildTaskPayload(perfil, params);
  try {
    await disableScheduledTask(perfil, taskId);
  } catch {
    // já estava desativada — segue o jogo
  }
  const result = await cocRequest('PUT', perfil, `${SCHEDULE_TASK_PATH}/${encodeURIComponent(taskId)}`, payload);
  await disableScheduledTask(perfil, taskId); // PUT reativa como efeito colateral — desativa de novo
  return result;
}

/** Ativa uma tarefa (createScheduledTask já a desativa por padrão ao criar). */
export async function enableScheduledTask(perfil, taskId) {
  if (!taskId) throw new Error('taskId é obrigatório');
  return cocRequest('POST', perfil, `${SCHEDULE_TASK_PATH}/${encodeURIComponent(taskId)}/enable`, {});
}

/** Desativa uma tarefa — necessário antes de conseguir deletar. */
export async function disableScheduledTask(perfil, taskId) {
  if (!taskId) throw new Error('taskId é obrigatório');
  return cocRequest('POST', perfil, `${SCHEDULE_TASK_PATH}/${encodeURIComponent(taskId)}/disable`, {});
}

/** Remove uma tarefa. A Huawei só permite deletar se ela já estiver desativada. */
export async function deleteScheduledTask(perfil, taskId) {
  if (!taskId) throw new Error('taskId é obrigatório');
  return cocRequest('DELETE', perfil, `${SCHEDULE_TASK_PATH}/${encodeURIComponent(taskId)}`, null);
}
