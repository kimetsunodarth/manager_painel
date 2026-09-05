import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { getCloud8ConfigSafe, saveCloud8Credentials, getCloud8Credentials } from '../config/cloud8Config.js';
import { listCloud8Vms, createOrUpdateCloud8Schedule, suspendCloud8Schedule, deleteCloud8Schedule } from '../services/cloud8Service.js';
import { listSchedules } from '../config/vmScheduleV2.js';
import { listCocCoveredHostnames } from '../services/cocService.js';
import { getDiscoveryAccounts } from '../services/huawei-iam.js';
import { getEcsUuidIndex } from '../services/huawei-ecs.js';

const router = Router();
router.use(authMiddleware);

/** Agrupa uma lista plana de VMs por cliente (campo `provider`), ordenado por nome do cliente. */
function groupByProvider(vms) {
  const byProvider = new Map();
  for (const vm of vms) {
    const key = vm.provider || '(sem cliente)';
    if (!byProvider.has(key)) byProvider.set(key, []);
    byProvider.get(key).push(vm);
  }
  return Array.from(byProvider.entries())
    .map(([provider, vmsOfClient]) => ({
      provider,
      vms: vmsOfClient.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

/**
 * GET /api/cloud8/credentials
 * Retorna username + se há senha salva. Nunca a senha em si.
 * NUNCA nomear essa rota "/config" — o web.config tem hiddenSegments com "config" pra proteger
 * a pasta config/ da instalação, e o IIS bloqueia por SEGMENTO da URL (não por path completo).
 * "/api/cloud8/config" batia nisso e o IIS devolvia 404 antes de chegar no Express — o pedido
 * nem aparecia no requests.log. Confirmado em produção (2026-09-04): ver docs/MEMORIA_INTERNA.md.
 */
router.get('/credentials', requirePermission('huawei:projects'), (req, res) => {
  res.json(getCloud8ConfigSafe());
});

/**
 * PATCH /api/cloud8/credentials
 * Salva usuário de serviço do Cloud8 (app.cloud8.com.br). Body: { username, password }.
 * Enviar password vazio mantém a senha já salva. Apenas admin.
 */
router.patch('/credentials', (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem configurar o acesso ao Cloud8' });
  }
  const { username, password } = req.body || {};
  if (username !== undefined && typeof username !== 'string') {
    return res.status(400).json({ error: 'username deve ser texto' });
  }
  if (password !== undefined && typeof password !== 'string') {
    return res.status(400).json({ error: 'password deve ser texto' });
  }
  if (username !== undefined && username.trim().length > 255) {
    return res.status(400).json({ error: 'username deve ter no máximo 255 caracteres' });
  }
  try {
    const updated = saveCloud8Credentials({ username, password });
    logAction(req, 'cloud8-config-update', { username: updated.username, passwordSet: updated.passwordSet });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

/**
 * GET /api/cloud8/vms
 * Lê ao vivo (Playwright) o inventário "Componentes Atuais" do Cloud8 — cliente, nome, tipo,
 * região, IPs e se tem agendamento configurado — agrupado por cliente. Pode demorar (login +
 * paginação de ~750 recursos) — usar com moderação, não em polling frequente.
 */
router.get('/vms', requirePermission('huawei:projects'), async (req, res) => {
  const creds = getCloud8Credentials();
  if (!creds) {
    return res.status(400).json({ error: 'Credenciais do Cloud8 não configuradas. Salve em Programação (admin).' });
  }
  const maxPages = Math.min(100, Math.max(1, Number(req.query.maxPages) || 60));
  try {
    const result = await listCloud8Vms(creds, { maxPages });
    if (!result.ok) {
      logAction(req, 'cloud8-vms-read', { success: false, error: result.error });
      return res.status(502).json({ error: result.error || 'Falha ao ler VMs do Cloud8' });
    }
    const clients = groupByProvider(result.vms);
    logAction(req, 'cloud8-vms-read', { success: true, count: result.vms?.length ?? 0, clients: clients.length });
    res.json({ ok: true, clients, vms: result.vms, totalRowsFound: result.totalRowsFound });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

/**
 * GET /api/cloud8/reconciliation
 * Cruza as VMs do Cloud8 (hasSchedule) com as programações nativas do Portal (vmScheduleV2) e as
 * tarefas HABILITADAS do Huawei COC (`cocService.listCocCoveredHostnames`, uma por conta-mestre —
 * ver `getDiscoveryAccounts()`), por nome de servidor, agrupado por cliente. Classifica cada VM
 * em `cloud8` | `portal` | `coc` | `conflict` (2+ fontes) | `none` (nenhuma). A consulta ao COC é
 * cara na primeira vez (busca o detalhe de cada tarefa habilitada — pode ser centenas por conta)
 * mas fica cacheada em memória por 15 min; falha numa conta específica não derruba o resto
 * (`Promise.allSettled`, cobertura tratada como vazia pra essa conta).
 * A lista base parte do inventário do Cloud8, mas VMs cobertas só pelo Portal e/ou pelo COC (que
 * nunca foram cadastradas no Cloud8) são adicionadas como linhas "órfãs" — senão ficariam
 * completamente ausentes da tela, mesmo tendo agendamento real em outro lugar.
 */
router.get('/reconciliation', requirePermission('huawei:projects'), async (req, res) => {
  const creds = getCloud8Credentials();
  if (!creds) {
    return res.status(400).json({ error: 'Credenciais do Cloud8 não configuradas. Salve em Programação (admin).' });
  }
  const maxPages = Math.min(100, Math.max(1, Number(req.query.maxPages) || 60));
  try {
    const cocPerfis = getDiscoveryAccounts().map((a) => a.profile);
    const [cloud8Result, cocSettled, ecsUuidIndex] = await Promise.all([
      listCloud8Vms(creds, { maxPages }),
      Promise.allSettled(cocPerfis.map((perfil) => listCocCoveredHostnames(perfil))),
      getEcsUuidIndex().catch((e) => {
        console.warn('[cloud8-reconciliation] Falha ao montar índice de ECS por UUID:', e?.message || e);
        return new Map();
      }),
    ]);

    if (!cloud8Result.ok) {
      logAction(req, 'cloud8-reconciliation-read', { success: false, error: cloud8Result.error });
      return res.status(502).json({ error: cloud8Result.error || 'Falha ao ler VMs do Cloud8' });
    }

    const cocHostnames = new Set();
    const cocPerfilByHost = new Map(); // hostname -> perfil que a cobre (só pra rótulo das órfãs)
    const cocDetailByHost = new Map(); // hostname -> { perfil, taskName, jobName, triggerTime } (1ª tarefa encontrada)
    const cocErrors = [];
    cocSettled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        for (const entry of result.value) {
          cocHostnames.add(entry.hostName);
          if (!cocPerfilByHost.has(entry.hostName)) cocPerfilByHost.set(entry.hostName, entry.perfil);
          if (!cocDetailByHost.has(entry.hostName)) {
            cocDetailByHost.set(entry.hostName, {
              perfil: entry.perfil,
              taskId: entry.taskId,
              taskName: entry.taskName,
              jobName: entry.jobName,
              triggerTime: entry.triggerTime,
              resourceId: entry.resourceId,
              regionId: entry.regionId,
              projectId: entry.projectId,
            });
          }
        }
      } else {
        cocErrors.push({ perfil: cocPerfis[i], error: result.reason?.message || String(result.reason) });
      }
    });
    if (cocErrors.length) console.warn('[cloud8-reconciliation] Falha ao ler COC de algumas contas:', cocErrors);

    const portalNames = new Set();
    // hostname -> { perfil, region, projectId, serverId } — o Portal já guarda a identidade Huawei
    // completa por agendamento (vmScheduleV2), então dá pra ligar/desligar/reiniciar a VM direto
    // daqui, sem precisar de nenhum mapeamento novo.
    const portalInfoByHost = new Map();
    for (const s of listSchedules()) {
      if (!s.enabled || !s.serverName) continue;
      const upper = s.serverName.trim().toUpperCase();
      portalNames.add(upper);
      if (!portalInfoByHost.has(upper)) {
        portalInfoByHost.set(upper, { perfil: s.perfil, region: s.region, projectId: s.projectId, serverId: s.serverId });
      }
    }

    // Identidade Huawei (projectId/region/serverId/perfil) pra poder ligar/desligar/reiniciar a VM
    // direto da tela. Três fontes, em ordem de preferência: Portal (nativo) > COC (target_instances
    // da tarefa) > o `cloudinstanceid` que o próprio Cloud8 expõe pra VMs Huawei, cruzado com
    // `ecsUuidIndex` (índice reverso uuid->projeto/perfil, construído varrendo todas as contas
    // Huawei cadastradas — ver `huawei-ecs.js`'s `getEcsUuidIndex()`). Sem essa 3ª fonte, uma VM
    // que só existe no Cloud8 (nunca migrada pro Portal/COC) nunca teria botão de ação.
    function resolveVmIdentity(upperName, vm) {
      const portal = portalInfoByHost.get(upperName);
      if (portal?.projectId && portal?.serverId) {
        return { projectId: portal.projectId, region: portal.region, serverId: portal.serverId, perfil: portal.perfil };
      }
      const coc = cocDetailByHost.get(upperName);
      if (coc?.projectId && coc?.resourceId) {
        return { projectId: coc.projectId, region: coc.regionId, serverId: coc.resourceId, perfil: coc.perfil };
      }
      if (vm?.cloudinstanceid) {
        const fromEcs = ecsUuidIndex.get(vm.cloudinstanceid);
        if (fromEcs) return { projectId: fromEcs.projectId, region: fromEcs.region, serverId: vm.cloudinstanceid, perfil: fromEcs.perfil };
      }
      return null;
    }

    const vms = cloud8Result.vms.map((vm) => {
      const upperName = (vm.name || '').trim().toUpperCase();
      const sources = [];
      if (vm.hasSchedule) sources.push('cloud8');
      if (portalNames.has(upperName)) sources.push('portal');
      if (cocHostnames.has(upperName)) sources.push('coc');
      const origin = sources.length >= 2 ? 'conflict' : sources.length === 1 ? sources[0] : 'none';
      return {
        ...vm,
        inPortal: sources.includes('portal'),
        inCoc: sources.includes('coc'),
        sources,
        origin,
        cocSchedule: cocDetailByHost.get(upperName) || null,
        vmIdentity: resolveVmIdentity(upperName, vm),
      };
    });

    // VMs cobertas só pelo Portal e/ou COC, nunca cadastradas no Cloud8 — sem isso, ficariam
    // ausentes da tela inteira mesmo tendo agendamento real em outro lugar.
    const cloud8NameSet = new Set(vms.map((v) => (v.name || '').trim().toUpperCase()));
    const orphanNames = new Set([...cocHostnames, ...portalNames].filter((h) => !cloud8NameSet.has(h)));
    for (const upperName of orphanNames) {
      const inPortal = portalNames.has(upperName);
      const inCoc = cocHostnames.has(upperName);
      const sources = [];
      if (inPortal) sources.push('portal');
      if (inCoc) sources.push('coc');
      const origin = sources.length >= 2 ? 'conflict' : sources[0];
      const perfil = cocPerfilByHost.get(upperName) || portalInfoByHost.get(upperName)?.perfil || null;
      vms.push({
        provider: perfil ? `Fora do Cloud8 — ${perfil}` : 'Fora do Cloud8',
        name: upperName,
        recordId: `orphan-${upperName}`,
        tipo: '—',
        region: portalInfoByHost.get(upperName)?.region || '—',
        ipExterno: '',
        ipLocal: '',
        hasSchedule: false,
        inPortal,
        inCoc,
        sources,
        origin,
        cocSchedule: cocDetailByHost.get(upperName) || null,
        vmIdentity: resolveVmIdentity(upperName),
      });
    }

    const summary = {
      total: vms.length,
      cloud8: vms.filter((v) => v.origin === 'cloud8').length,
      portal: vms.filter((v) => v.origin === 'portal').length,
      coc: vms.filter((v) => v.origin === 'coc').length,
      conflict: vms.filter((v) => v.origin === 'conflict').length,
      none: vms.filter((v) => v.origin === 'none').length,
    };

    logAction(req, 'cloud8-reconciliation-read', { success: true, ...summary, cocErrors: cocErrors.length });
    res.json({ ok: true, clients: groupByProvider(vms), vms, summary, totalRowsFound: cloud8Result.totalRowsFound, cocErrors });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

/**
 * POST /api/cloud8/schedules
 * Cria um agendamento de execução única (liga/desliga/reinicia) direto no Cloud8. Body:
 * { name, resourceIds: string[] (ids numéricos do Cloud8, sem sufixo "s"), taskTypes: string[]
 * ('ev_serverstart'|'ev_serverstop'|'ev_serverreboot'), startDate, endDate (ISO com offset), email? }.
 * Permissão granular própria (`cloud8:schedule:manage`), independente de `huawei:projects` — mesmo
 * raciocínio do COC (`coc:schedule:toggle`/`delete`): nenhum frontend chamava essa rota antes de
 * existir UI de verdade, então não há usuário legado dependente de `huawei:projects` sozinho.
 * Recorrência (semanal etc.) não é suportada ainda — só execução única, formato validado contra
 * teste real. Ver docs/MEMORIA_INTERNA.md.
 */
router.post('/schedules', requirePermission('cloud8:schedule:manage'), async (req, res) => {
  const creds = getCloud8Credentials();
  if (!creds) return res.status(400).json({ error: 'Credenciais do Cloud8 não configuradas. Salve em Programação (admin).' });
  const { name, resourceIds, taskTypes, startDate, endDate, email } = req.body || {};
  if (!name || !Array.isArray(resourceIds) || !resourceIds.length || !Array.isArray(taskTypes) || !taskTypes.length || !startDate || !endDate) {
    return res.status(400).json({ error: 'name, resourceIds (array), taskTypes (array), startDate e endDate são obrigatórios' });
  }
  try {
    const result = await createOrUpdateCloud8Schedule(creds, { name, resourceIds, taskTypes, startDate, endDate, email });
    if (!result.ok) {
      logAction(req, 'cloud8-schedule-create', { success: false, error: result.error, name });
      return res.status(502).json({ error: result.error || 'Falha ao criar agendamento no Cloud8' });
    }
    logAction(req, 'cloud8-schedule-create', { success: true, name, resourceIds, taskTypes });
    res.status(201).json({ ok: true, data: result.data });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

/**
 * PUT /api/cloud8/schedules/:id
 * Altera um agendamento existente — o Cloud8 também exige o payload completo (mesmo formato do
 * create). Body igual ao POST + `scheduleId` (o `parent_id`/`schedule.id`, diferente do `id` da
 * ocorrência que vai na URL).
 */
router.put('/schedules/:id', requirePermission('cloud8:schedule:manage'), async (req, res) => {
  const creds = getCloud8Credentials();
  if (!creds) return res.status(400).json({ error: 'Credenciais do Cloud8 não configuradas. Salve em Programação (admin).' });
  const { name, resourceIds, taskTypes, startDate, endDate, email, scheduleId } = req.body || {};
  const id = Number(req.params.id);
  if (!id || !name || !Array.isArray(resourceIds) || !resourceIds.length || !Array.isArray(taskTypes) || !taskTypes.length || !startDate || !endDate) {
    return res.status(400).json({ error: 'id (na URL), name, resourceIds (array), taskTypes (array), startDate e endDate são obrigatórios' });
  }
  try {
    const result = await createOrUpdateCloud8Schedule(creds, { id, scheduleId: scheduleId || id, name, resourceIds, taskTypes, startDate, endDate, email });
    if (!result.ok) {
      logAction(req, 'cloud8-schedule-update', { success: false, error: result.error, id });
      return res.status(502).json({ error: result.error || 'Falha ao alterar agendamento no Cloud8' });
    }
    logAction(req, 'cloud8-schedule-update', { success: true, id, name, resourceIds, taskTypes });
    res.json({ ok: true, data: result.data });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

/**
 * POST /api/cloud8/schedules/:id/suspend
 * Suspende (pausa sem apagar) um agendamento existente — confirmado contra teste real
 * (2026-09-05): reenvia o registro **bruto** (`raw`, exatamente como veio de `/reconciliation` na
 * VM correspondente) com `status: 7` e `jsaction: "suspend"`, preservando recorrência — funciona
 * pra programações recorrentes também (diferente de criar/alterar, que só cobre execução única).
 * Body: `{ raw: <Cloud8ScheduleEntry.raw> }`.
 */
router.post('/schedules/:id/suspend', requirePermission('cloud8:schedule:manage'), async (req, res) => {
  const creds = getCloud8Credentials();
  if (!creds) return res.status(400).json({ error: 'Credenciais do Cloud8 não configuradas. Salve em Programação (admin).' });
  const { raw } = req.body || {};
  const id = Number(req.params.id);
  if (!id || !raw || raw.id == null) {
    return res.status(400).json({ error: 'id (na URL) e raw (registro bruto do agendamento) são obrigatórios' });
  }
  try {
    const result = await suspendCloud8Schedule(creds, raw);
    if (!result.ok) {
      logAction(req, 'cloud8-schedule-suspend', { success: false, error: result.error, id });
      return res.status(502).json({ error: result.error || 'Falha ao suspender agendamento no Cloud8' });
    }
    logAction(req, 'cloud8-schedule-suspend', { success: true, id });
    res.json({ ok: true, data: result.data });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

/**
 * DELETE /api/cloud8/schedules/:id
 * Apaga um agendamento do Cloud8 — confirmado contra teste real em produção (2026-09-05).
 */
router.delete('/schedules/:id', requirePermission('cloud8:schedule:manage'), async (req, res) => {
  const creds = getCloud8Credentials();
  if (!creds) return res.status(400).json({ error: 'Credenciais do Cloud8 não configuradas. Salve em Programação (admin).' });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  try {
    const result = await deleteCloud8Schedule(creds, id);
    if (!result.ok) {
      logAction(req, 'cloud8-schedule-delete', { success: false, error: result.error, id });
      return res.status(502).json({ error: result.error || 'Falha ao apagar agendamento no Cloud8' });
    }
    logAction(req, 'cloud8-schedule-delete', { success: true, id });
    res.json({ ok: true, data: result.data });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

export default router;
