import { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  adminClients,
  users,
  huawei,
  type AdminClientsList,
  type AdminClientCreateBody,
  type AdminClientCreateResult,
  type HuaweiProject,
  type HuaweiEcsServer,
} from '../api/client';
import type { User } from '../api/client';

const HUAWEI_PREFIX = 'huawei:';

/** Nome do cliente a partir dos metadados da ECS (centro_custo, cliente, etc.). */
function clientNameFromEcs(ecs: HuaweiEcsServer): string {
  const meta = ecs.metadata;
  if (meta) {
    const raw = meta.centro_custo || meta.centrodecusto || meta.cost_center || meta.cliente || meta.client || '';
    const t = raw.trim();
    if (t) return t.replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return ecs.name || ecs.id || '';
}

const defaultHanaServices = `serviceLayer|Reiniciar Service Layer
sld|Reiniciar SLD
hana|Reiniciar HANA (Cuidado)
authentication|Reiniciar Authentication
all|Reiniciar TUDO`;

const defaultWebServices = `invent-dfe|Invent DFe
invent-nfe|Invent NFe
invent-bankplus|Invent BankPlus
sap-b1if|SAP B1iF`;

const emptyForm: AdminClientCreateBody & { jumpPort?: number; hanaPort?: number; hanaServices?: string; webServices?: string; windowsServiceGroupsText?: string } = {
  displayName: '',
  clientKey: '',
  jumpHost: '',
  jumpUser: '',
  jumpPassword: '',
  jumpPort: 22,
  hanaHost: '',
  hanaUser: '',
  hanaPassword: '',
  hanaPort: 22,
  controlCenterUrl: '',
  controlCenterUser: '',
  controlCenterPassword: '',
  hanaServices: defaultHanaServices,
  webServices: defaultWebServices,
  windowsServiceGroupsText: '',
};

export default function Clientes() {
  const user = JSON.parse(localStorage.getItem('user') || '{}') as User;
  if (user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const [list, setList] = useState<AdminClientsList | null>(null);
  const [userList, setUserList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [assignToUserIds, setAssignToUserIds] = useState<string[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AdminClientCreateResult | null>(null);
  const [editClientKey, setEditClientKey] = useState<string | null>(null);
  const [editHana, setEditHana] = useState('');
  const [editWeb, setEditWeb] = useState('');
  const [editWindows, setEditWindows] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [profileKey, setProfileKey] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [huaweiProjects, setHuaweiProjects] = useState<HuaweiProject[] | null>(null);
  const [perfisLoading, setPerfisLoading] = useState(false);
  const [perfisError, setPerfisError] = useState<string | null>(null);
  const [selectedHuaweiProject, setSelectedHuaweiProject] = useState<HuaweiProject | null>(null);
  const [huaweiEcsList, setHuaweiEcsList] = useState<HuaweiEcsServer[]>([]);
  const [huaweiEcsLoading, setHuaweiEcsLoading] = useState(false);
  const [selectedEcsIdForName, setSelectedEcsIdForName] = useState<string>('');
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [clientsData, usersData] = await Promise.all([adminClients.list(), users.list()]);
      setList(clientsData);
      setUserList(usersData);
    } catch (e) {
      setList({ registry: [], controlCenterKeys: [], hanaKeys: [] });
      setUserList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const key = searchParams.get('editServices');
    if (key) {
      setSearchParams({}, { replace: true });
      openEditServices(key);
    }
  }, []);

  /** Clientes HANA existentes (para reutilizar serviços/control center). */
  const hanaProfileOptions = (() => {
    if (!list) return [];
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    list.registry?.forEach((r) => {
      if (!seen.has(r.clientKey)) {
        seen.add(r.clientKey);
        out.push({ value: r.clientKey, label: `${r.displayName} (${r.clientKey})` });
      }
    });
    list.hanaKeys?.forEach((k) => {
      const base = k.endsWith('-web') ? k.replace(/-web$/, '') : k;
      if (!seen.has(base)) {
        seen.add(base);
        out.push({ value: base, label: base });
      }
    });
    return out.sort((a, b) => a.label.localeCompare(b.label));
  })();

  /** Opções unificadas: HANA + Perfis Huawei (um por projeto, para escolher ECS quando houver vários). */
  const profileOptionsUnified = (() => {
    const out: { value: string; label: string; group: 'hana' | 'huawei' }[] = [];
    hanaProfileOptions.forEach((o) => out.push({ ...o, group: 'hana' }));
    if (huaweiProjects?.length) {
      huaweiProjects.forEach((p) => {
        if (p.perfil && p.id) {
          const value = `${HUAWEI_PREFIX}${p.perfil}::${p.id}`;
          const label = p.name ? `${p.perfil} — ${p.name}` : p.perfil;
          out.push({ value, label, group: 'huawei' });
        }
      });
    }
    return out;
  })();

  const loadPerfis = async () => {
    setPerfisError(null);
    setPerfisLoading(true);
    try {
      const data = await huawei.projects('region', 'all_perfis');
      setHuaweiProjects(Array.isArray(data) ? data : []);
    } catch (e) {
      setPerfisError(e instanceof Error ? e.message : 'Erro ao carregar perfis');
      setHuaweiProjects(null);
    } finally {
      setPerfisLoading(false);
    }
  };





  const clearProfileSelection = () => {
    setProfileKey('');
    setProfileError('');
    setSelectedHuaweiProject(null);
    setHuaweiEcsList([]);
    setSelectedEcsIdForName('');
  };

  const loadProfileFromKey = async (key: string) => {
    if (!key) {
      clearProfileSelection();
      return;
    }
    if (key.startsWith(HUAWEI_PREFIX)) {
      clearProfileSelection();
      setProfileKey(key);
      setProfileError('');
      const parts = key.slice(HUAWEI_PREFIX.length).split('::');
      const perfil = parts[0] || '';
      const projectId = parts[1] || '';
      const project = huaweiProjects?.find((p) => p.perfil === perfil && p.id === projectId);
      if (!project) {
        setProfileError('Projeto não encontrado.');
        return;
      }
      setSelectedHuaweiProject(project);
      setHuaweiEcsLoading(true);
      try {
        const ecsList = await huawei.ecs(project.id, project.region || undefined, project.perfil);
        setHuaweiEcsList(Array.isArray(ecsList) ? ecsList : []);
        const first = Array.isArray(ecsList) ? ecsList[0] : null;
        if (first) {
          const suggested = clientNameFromEcs(first);
          if (suggested) setForm((f) => ({ ...f, displayName: suggested }));
          else setForm((f) => ({ ...f, displayName: project.name || project.perfil || '' }));
        } else {
          setForm((f) => ({ ...f, displayName: project.name || project.perfil || '' }));
        }
      } catch (e) {
        setProfileError(e instanceof Error ? e.message : 'Erro ao carregar ECS');
        setHuaweiEcsList([]);
      } finally {
        setHuaweiEcsLoading(false);
      }
      return;
    }
    setSelectedHuaweiProject(null);
    setHuaweiEcsList([]);
    setSelectedEcsIdForName('');
    setProfileKey(key);
    setProfileError('');
    setProfileLoading(true);
    try {
      const profile = await adminClients.getProfile(key);
      setForm((f) => ({
        ...f,
        displayName: profile.displayName,
        clientKey: '',
        hanaServices: profile.hanaServices.map((s) => `${s.id}|${s.name}`).join('\n') || defaultHanaServices,
        webServices: profile.webServices.map((s) => `${s.id}|${s.name}`).join('\n') || defaultWebServices,
        windowsServiceGroupsText: Object.entries(profile.windowsServiceGroups || {})
          .map(([k, v]) => `${k}=${(v || []).join(',')}`)
          .join('\n'),
        controlCenterUrl: profile.controlCenterUrl || '',
      }));
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Erro ao carregar perfil');
    } finally {
      setProfileLoading(false);
    }
  };

  const onEcsChoiceForName = (ecsId: string) => {
    setSelectedEcsIdForName(ecsId);
    if (!ecsId) {
      if (selectedHuaweiProject)
        setForm((f) => ({ ...f, displayName: selectedHuaweiProject.name || selectedHuaweiProject.perfil || '' }));
      return;
    }
    const ecs = huaweiEcsList.find((e) => e.id === ecsId);
    if (ecs) {
      const name = clientNameFromEcs(ecs) || ecs.name || ecs.id;
      setForm((f) => ({ ...f, displayName: name }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setSubmitLoading(true);
    try {
      const body: AdminClientCreateBody = {
        displayName: form.displayName.trim(),
        jumpHost: form.jumpHost.trim(),
        jumpUser: form.jumpUser.trim(),
        jumpPassword: form.jumpPassword,
        jumpPort: form.jumpPort ?? 22,
        hanaHost: form.hanaHost.trim(),
        hanaUser: form.hanaUser.trim(),
        hanaPassword: form.hanaPassword,
        hanaPort: form.hanaPort ?? 22,
      };
      if (form.clientKey?.trim()) body.clientKey = form.clientKey.trim().toLowerCase();
      if (form.controlCenterUrl?.trim()) {
        body.controlCenterUrl = form.controlCenterUrl.trim();
        body.controlCenterUser = form.controlCenterUser?.trim() ?? '';
        body.controlCenterPassword = form.controlCenterPassword ?? '';
      }
      if (assignToUserIds.length > 0) body.assignToUserIds = assignToUserIds;
      if (form.hanaServices?.trim()) body.hanaServices = form.hanaServices.trim();
      if (form.webServices?.trim()) body.webServices = form.webServices.trim();
      if (form.windowsServiceGroupsText?.trim()) body.windowsServiceGroupsText = form.windowsServiceGroupsText.trim();
      if (selectedHuaweiProject?.perfil) {
        body.huaweiPerfil = selectedHuaweiProject.perfil;
        if (selectedHuaweiProject.id) body.huaweiProjectId = selectedHuaweiProject.id;
        if (selectedEcsIdForName) body.huaweiEcsId = selectedEcsIdForName;
      }
      const data = await adminClients.create(body);
      setResult(data);
      setForm({ ...emptyForm, hanaServices: defaultHanaServices, webServices: defaultWebServices, windowsServiceGroupsText: '' });
      setAssignToUserIds([]);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar cliente');
    } finally {
      setSubmitLoading(false);
    }
  };

  const copySnippet = () => {
    if (!result?.envSnippet) return;
    navigator.clipboard.writeText(result.envSnippet);
  };

  const openEditServices = async (clientKey: string) => {
    setEditClientKey(clientKey);
    setEditError('');
    setEditLoading(true);
    try {
      const data = await adminClients.getServices(clientKey);
      setEditHana(data.hanaServices.map((s) => `${s.id}|${s.name}`).join('\n'));
      setEditWeb(data.webServices.map((s) => `${s.id}|${s.name}`).join('\n'));
      setEditWindows(
        Object.entries(data.windowsServiceGroups || {})
          .map(([k, v]) => `${k}=${(v || []).join(',')}`)
          .join('\n')
      );
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Erro ao carregar serviços');
    } finally {
      setEditLoading(false);
    }
  };

  const closeEditModal = () => {
    setEditClientKey(null);
    setEditHana('');
    setEditWeb('');
    setEditWindows('');
    setEditError('');
  };

  const parseServicesText = (text: string): { id: string; name: string; action: string }[] => {
    return text
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const sep = line.includes('|') ? '|' : line.includes('\t') ? '\t' : ',';
        const i = line.indexOf(sep);
        const id = (i === -1 ? line : line.slice(0, i)).trim().toLowerCase().replace(/\s+/g, '-');
        const name = (i === -1 ? line : line.slice(i + 1)).trim();
        return { id, name, action: 'executar' };
      });
  };

  const parseWindowsText = (text: string): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    text
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const eq = line.indexOf('=');
        if (eq === -1) return;
        const id = line.slice(0, eq).trim().toLowerCase();
        const value = line.slice(eq + 1).trim();
        if (!id) return;
        out[id] = value.split(/[,;]/).map((n) => n.trim()).filter(Boolean);
      });
    return out;
  };

  const saveEditServices = async () => {
    if (!editClientKey) return;
    setEditSaving(true);
    setEditError('');
    try {
      await adminClients.updateServices(editClientKey, {
        hanaServices: parseServicesText(editHana),
        webServices: parseServicesText(editWeb),
        windowsServiceGroups: parseWindowsText(editWindows),
      });
      closeEditModal();
      load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* Só mostra a seção de carregar perfis quando ainda não há perfis carregados */}
      {(!huaweiProjects || huaweiProjects.length === 0) && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-lg font-medium text-gray-800 mb-2">Perfis do config (Huawei)</h2>
          <p className="text-sm text-gray-500 mb-3">
            Use <code className="bg-gray-100 px-1 rounded">config.enc</code> + <code className="bg-gray-100 px-1 rounded">.encryption_key</code> (CBR) ou <code className="bg-gray-100 px-1 rounded">.env</code>. Perfis: NOME_ACCESS_KEY, NOME_SECRET_KEY, NOME_PROJECT_ID, NOME_REGION.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadPerfis}
              disabled={perfisLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {perfisLoading ? 'Carregando...' : 'Carregar perfis'}
            </button>
          </div>
          {perfisError && <p className="text-sm text-red-600 mt-2">{perfisError}</p>}
        </div>
      )}

      <h1 className="text-2xl font-semibold text-gray-800">Adicionar cliente</h1>
      <p className="text-gray-600 text-sm">
        Preencha nome, credenciais e link. O sistema gera os arquivos de configuração (HANA + Control Center, se informado)
        e devolve um bloco para você colar no <code className="bg-gray-200 px-1 rounded">backend/.env</code>.
      </p>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {(hanaProfileOptions.length > 0 || (huaweiProjects && huaweiProjects.length > 0)) ? (
          <div className="pb-4 border-b border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-1">Usar perfil de cliente existente</label>
            <p className="text-gray-500 text-xs mb-2">
              Selecione um cliente HANA (reutiliza serviços) ou um perfil Huawei (projeto). Ao escolher perfil Huawei com vários projetos, use a ECS abaixo para definir o nome do cliente. Credenciais (Jump/HANA) preencha manualmente.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={profileKey}
                onChange={(e) => loadProfileFromKey(e.target.value)}
                disabled={profileLoading || huaweiEcsLoading}
                className="border border-gray-300 rounded px-3 py-2 bg-white text-gray-800 min-w-[280px]"
              >
                <option value="">— Nenhum (criar do zero) —</option>
                {hanaProfileOptions.length > 0 && (
                  <optgroup label="Clientes HANA existentes">
                    {hanaProfileOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                {huaweiProjects && huaweiProjects.length > 0 && (
                  <optgroup label="Perfis Huawei (projeto)">
                    {profileOptionsUnified.filter((o) => o.group === 'huawei').map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {(profileLoading || huaweiEcsLoading) && <span className="text-sm text-gray-500">Carregando...</span>}
              {huaweiProjects && huaweiProjects.length > 0 && (
                <button type="button" onClick={loadPerfis} disabled={perfisLoading} className="text-sm text-blue-600 hover:underline ml-2">
                  {perfisLoading ? 'Carregando...' : 'Recarregar perfis'}
                </button>
              )}
            </div>
            {selectedHuaweiProject && huaweiEcsList.length > 0 && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Escolha a ECS para o nome do cliente</label>
                <p className="text-gray-500 text-xs mb-1">
                  Quando há mais de um projeto/ECS (ex.: MOOVE_RAMOSISTEMAS, RAMOONE), selecione qual ECS usar como nome do cliente.
                </p>
                <select
                  value={selectedEcsIdForName}
                  onChange={(e) => onEcsChoiceForName(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 bg-white text-gray-800 min-w-[260px]"
                >
                  <option value="">Usar nome do projeto</option>
                  {huaweiEcsList.map((ecs) => {
                    const label = clientNameFromEcs(ecs) || ecs.name || ecs.id;
                    return (
                      <option key={ecs.id} value={ecs.id}>
                        {ecs.name || ecs.id} {label !== (ecs.name || ecs.id) ? `(${label})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            {profileError && <p className="text-red-600 text-sm mt-1">{profileError}</p>}
          </div>
        ) : (
          <div className="pb-4 border-b border-gray-200">
            <p className="text-gray-500 text-sm">
              Carregue os perfis acima (botão &quot;Carregar perfis&quot;) para selecionar um perfil Huawei ou cliente HANA existente nesta tela.
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do cliente *</label>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2"
              placeholder="Ex.: Meu Cliente"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chave (slug, opcional)</label>
            <input
              type="text"
              value={form.clientKey ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, clientKey: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2"
              placeholder="Ex.: meu-cliente (minúsculas, hífens)"
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <h2 className="text-lg font-medium text-gray-800 mb-3">Jump (servidor web)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Host *</label>
              <input
                type="text"
                value={form.jumpHost}
                onChange={(e) => setForm((f) => ({ ...f, jumpHost: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="IP ou hostname"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuário *</label>
              <input
                type="text"
                value={form.jumpUser}
                onChange={(e) => setForm((f) => ({ ...f, jumpUser: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
              <input
                type="password"
                value={form.jumpPassword}
                onChange={(e) => setForm((f) => ({ ...f, jumpPassword: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Porta</label>
              <input
                type="number"
                value={form.jumpPort ?? 22}
                onChange={(e) => setForm((f) => ({ ...f, jumpPort: Number(e.target.value) || 22 }))}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <h2 className="text-lg font-medium text-gray-800 mb-3">HANA (destino)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Host *</label>
              <input
                type="text"
                value={form.hanaHost}
                onChange={(e) => setForm((f) => ({ ...f, hanaHost: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="IP ou hostname da VM SUSE/HANA"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuário *</label>
              <input
                type="text"
                value={form.hanaUser}
                onChange={(e) => setForm((f) => ({ ...f, hanaUser: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
              <input
                type="password"
                value={form.hanaPassword}
                onChange={(e) => setForm((f) => ({ ...f, hanaPassword: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Porta</label>
              <input
                type="number"
                value={form.hanaPort ?? 22}
                onChange={(e) => setForm((f) => ({ ...f, hanaPort: Number(e.target.value) || 22 }))}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <h2 className="text-lg font-medium text-gray-800 mb-3">Control Center (opcional)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">URL base</label>
              <input
                type="url"
                value={form.controlCenterUrl ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, controlCenterUrl: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="https://sld.exemplo.com/sap/bc/webdynpro/sap/"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usuário</label>
              <input
                type="text"
                value={form.controlCenterUser ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, controlCenterUser: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input
                type="password"
                value={form.controlCenterPassword ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, controlCenterPassword: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <h2 className="text-lg font-medium text-gray-800 mb-2">Serviços (aba Serviços)</h2>
          <p className="text-gray-600 text-sm mb-3">
            Defina os serviços que aparecerão na aba Serviços para este cliente. Uma linha por serviço: <code className="bg-gray-100 px-1 rounded">id|Nome exibido</code>. Se deixar em branco, usa a lista padrão.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serviços HANA (VM destino)</label>
              <textarea
                value={form.hanaServices ?? defaultHanaServices}
                onChange={(e) => setForm((f) => ({ ...f, hanaServices: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
                rows={6}
                placeholder="serviceLayer|Reiniciar Service Layer&#10;sld|Reiniciar SLD&#10;..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serviços Web (servidor Jump)</label>
              <textarea
                value={form.webServices ?? defaultWebServices}
                onChange={(e) => setForm((f) => ({ ...f, webServices: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
                rows={6}
                placeholder="invent-dfe|Invent DFe&#10;invent-nfe|Invent NFe&#10;..."
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Serviços Windows (mapeamento para Web)</label>
            <p className="text-gray-500 text-xs mb-1">
              Para cada serviço web, nomes reais no Windows (Get-Service). Uma linha por grupo: <code className="bg-gray-100 px-1 rounded">id=NomeServ1,NomeServ2</code>
            </p>
            <textarea
              value={form.windowsServiceGroupsText ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, windowsServiceGroupsText: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
              rows={3}
              placeholder="invent-dfe=TaxPlusDfeCteNsu,TaxPlusDfeEvento&#10;invent-nfe=TaxPlusNfe,..."
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <h2 className="text-lg font-medium text-gray-800 mb-2">Atribuir a operadores</h2>
          <p className="text-gray-600 text-sm mb-3">
            Selecione quem já deve ver este cliente na aba <strong>Serviços</strong> (ex.: Edmar). Para quem for atribuído, a aba Serviços mostrará <strong>este</strong> cliente: se for Roland, Serviços exibirá Roland; se for Brado, exibirá Brado (VM de banco, status, reinício, Ativar Support).
          </p>
          <div className="flex flex-wrap gap-4">
            {userList.map((u) => (
                <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignToUserIds.includes(u.id)}
                    onChange={(e) => {
                      if (e.target.checked) setAssignToUserIds((ids) => [...ids, u.id]);
                      else setAssignToUserIds((ids) => ids.filter((id) => id !== u.id));
                    }}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">
                    {u.name}
                    {u.role === 'operator' ? ' (operador)' : ''}
                  </span>
                </label>
              ))}
            {userList.length === 0 && (
              <p className="text-gray-500 text-sm">Nenhum usuário cadastrado. Crie operadores em Usuários.</p>
            )}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {submitLoading ? 'Gerando...' : 'Gerar arquivos e snippet .env'}
          </button>
        </div>
      </form>

      {result && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-3">
          <h2 className="text-lg font-medium text-gray-800">Cliente criado</h2>
          <p className="text-gray-600 text-sm">{result.message}</p>
          <p className="text-gray-600 text-sm">Arquivos: {result.filesCreated.join(', ')}</p>
          {result.assignedOperators && result.assignedOperators.length > 0 && (
            <p className="text-green-700 text-sm">
              Atribuído à aba Serviços para: {result.assignedOperators.map((a) => a.name).join(', ')}.
              {result.assignedOperators.some((a) => a.alreadyHad) && ' (alguns já tinham este cliente.)'}
            </p>
          )}
          {result.configEncUpdated && (
            <p className="text-green-700 text-sm font-medium">
              config.enc atualizado na pasta do programa (IIS). Credenciais já estão disponíveis; não é necessário colar no .env.
            </p>
          )}
          {result.envKeysWritten && result.envKeysWritten.length > 0 && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <p className="text-green-800 text-sm font-medium mb-1">Acesso SSH e Jump (credenciais das VMs) gravado</p>
              <p className="text-green-700 text-xs mb-2">
                As chaves abaixo foram salvas no config.enc (IIS) ou estão no bloco para colar no .env (desenvolvimento): Jump (servidor web) e HANA (VM destino).
              </p>
              <p className="text-gray-600 text-xs font-mono break-all">
                {result.envKeysWritten.join(', ')}
              </p>
              <p className="text-green-800 text-xs mt-2 font-medium">
                Para validar: vá na aba <strong>Serviços</strong>, selecione o cliente &quot;{result.displayName}&quot; e clique em <strong>Testar conexão</strong>.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <label className="block text-sm font-medium text-gray-700">{result.configEncUpdated ? 'Bloco que foi gravado no config.enc (referência)' : 'Copie o bloco abaixo para o backend/.env'}</label>
            <button
              type="button"
              onClick={copySnippet}
              className="px-3 py-1.5 bg-gray-200 rounded text-sm hover:bg-gray-300"
            >
              Copiar
            </button>
          </div>
          <pre className="bg-gray-100 border border-gray-300 rounded p-3 text-sm overflow-x-auto whitespace-pre-wrap font-mono">
            {result.envSnippet}
          </pre>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-800 mb-3">Clientes cadastrados</h2>
        {loading ? (
          <p className="text-gray-500 text-sm">Carregando...</p>
        ) : list ? (
          <div className="space-y-2">
            {list.registry.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhum cliente no registry (adicione acima ou configure manualmente).</p>
            ) : (
              <ul className="space-y-2 text-sm text-gray-700">
                {list.registry.map((r) => (
                  <li key={r.clientKey} className="flex items-center gap-2 flex-wrap">
                    <span>
                      <strong>{r.displayName}</strong> — {r.clientKey}
                      {r.hasControlCenter ? ' (Control Center)' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditServices(r.clientKey)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Editar serviços
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Excluir o cliente "${r.displayName}" (${r.clientKey})? Os arquivos de configuração e o registro serão removidos.`)) return;
                        setDeletingKey(r.clientKey);
                        adminClients.delete(r.clientKey).then(() => {
                          load();
                          setDeletingKey(null);
                        }).catch((e) => {
                          window.alert(e instanceof Error ? e.message : 'Erro ao excluir');
                          setDeletingKey(null);
                        });
                      }}
                      disabled={deletingKey === r.clientKey}
                      className="text-red-600 hover:underline text-xs disabled:opacity-50"
                      title="Excluir cliente (remove do registry e arquivos de config)"
                    >
                      {deletingKey === r.clientKey ? 'Excluindo...' : 'Excluir'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {list.hanaKeys.length > 0 && (
              <p className="text-gray-500 text-xs mt-2">
                Chaves HANA no disco: {list.hanaKeys.join(', ')}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {editClientKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !editSaving && closeEditModal()}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800">Editar serviços — {editClientKey}</h2>
            </div>
            <div className="p-4 overflow-y-auto space-y-3">
              {editLoading ? (
                <p className="text-gray-500">Carregando...</p>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Serviços HANA (VM destino)</label>
                    <textarea
                      value={editHana}
                      onChange={(e) => setEditHana(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
                      rows={5}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Serviços Web (Jump)</label>
                    <textarea
                      value={editWeb}
                      onChange={(e) => setEditWeb(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
                      rows={5}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Serviços Windows (id=Nome1,Nome2)</label>
                    <textarea
                      value={editWindows}
                      onChange={(e) => setEditWindows(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
                      rows={3}
                    />
                  </div>
                </>
              )}
              {editError && <p className="text-red-600 text-sm">{editError}</p>}
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button type="button" onClick={closeEditModal} disabled={editSaving} className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={saveEditServices} disabled={editLoading || editSaving} className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                {editSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
