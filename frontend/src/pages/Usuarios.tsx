import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import { users as api, environments, huawei, services as servicesApi, type User, type CreateUser, type HuaweiProject, type HuaweiEcsServer, PREFERRED_SERVICE_CLIENT_OPTIONS } from '../api/client';
import { useUser } from '../hooks/useUser';
import PageHeader from '../components/PageHeader';

function projectKey(p: HuaweiProject) {
  return p.perfil ? `${p.perfil}-${p.id}` : p.id;
}

/** Exibe o nome do perfil (ex.: ANANIMCLOUD_RAMOONE). */
function displayPerfil(perfil: string | undefined): string {
  if (!perfil) return '—';
  return perfil;
}

/** Resumo de permissões ECS para exibição na tabela: projetos Huawei + total de ECS permitidos. */
function ecsPermissionsSummary(u: { role: string; visibleProjects?: HuaweiProject[]; allowedHuaweiEcsIds?: Record<string, string[]>; allowedEcsIds?: string[] }): string {
  if (u.role === 'admin') return 'Todos';
  const projects = u.visibleProjects?.length ?? 0;
  const huaweiEcs = u.allowedHuaweiEcsIds && typeof u.allowedHuaweiEcsIds === 'object'
    ? Object.values(u.allowedHuaweiEcsIds).flat().length
    : 0;
  const legacyEcs = u.allowedEcsIds?.length ?? 0;
  const parts: string[] = [];
  if (projects > 0) parts.push(`${projects} projeto(s)`);
  if (huaweiEcs > 0) parts.push(`${huaweiEcs} ECS`);
  if (legacyEcs > 0) parts.push(`${legacyEcs} ECS (amb.)`);
  return parts.length ? parts.join(', ') : '0 ECS';
}

const SAP_SERVICES_FALLBACK = [
  { id: 'hana', name: 'Reiniciar HANA' },
  { id: 'serviceLayer', name: 'Reiniciar Service Layer' },
  { id: 'sld', name: 'Reiniciar SLD' },
  { id: 'authentication', name: 'Reiniciar Authentication' },
];

export default function Usuarios() {
  const user = useUser();
  const canManageUsers = user?.role === 'admin' || (Array.isArray(user?.permissions) && user?.permissions.includes('users:*'));
  const canToggleMfa = user?.role === 'admin';
  if (!canManageUsers) {
    return <Navigate to="/" replace />;
  }
  const [list, setList] = useState<User[]>([]);
  const [envs, setEnvs] = useState<{ id: string; ip: string; cliente: string }[]>([]);
  const [huaweiProjects, setHuaweiProjects] = useState<HuaweiProject[]>([]);
  const [huaweiProjectsLoading, setHuaweiProjectsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateUser & { allowedEcsIds: string[]; visibleProjects: HuaweiProject[]; allowedServiceIds: string[]; allowedHuaweiEcsIds: Record<string, string[]> }>({
    name: '',
    email: '',
    password: '',
    role: 'operator',
    permissions: ['backups:list'],
    allowedEcsIds: [],
    visibleProjects: [],
    allowedServiceIds: [],
    allowedHuaweiEcsIds: {},
    mfaEnabled: true,
    mfaEmail: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    email: string;
    role: string;
    permissions: string[];
    allowedEcsIds: string[];
    visibleProjects: HuaweiProject[];
    allowedHuaweiEcsIds: Record<string, string[]>;
    allowedServiceIds: string[];
    preferredServiceClientKey: string;
    mfaEnabled: boolean;
    mfaEmail: string;
    password: string;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [sapServiceOptions, setSapServiceOptions] = useState<{ id: string; name: string }[]>(SAP_SERVICES_FALLBACK);
  const [projectEcsMap, setProjectEcsMap] = useState<Record<string, HuaweiEcsServer[]>>({});

  const closeEditModal = () => {
    setEditingUserId(null);
    setEditForm(null);
    setError('');
    setSuccess('');
  };

  const load = async () => {
    setLoading(true);
    try {
      const [users, envList] = await Promise.all([api.list(), environments.list()]);
      setList(users);
      setEnvs(envList.map((e) => ({ id: e.id, ip: e.ip, cliente: e.cliente })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!showForm && !editingUserId || huaweiProjects.length > 0) return;
    setHuaweiProjectsLoading(true);
    const timeout = window.setTimeout(() => setHuaweiProjectsLoading(false), 25000);
    huawei.projects('region', 'all_perfis')
      .then((data) => setHuaweiProjects(data))
      .catch(() => setHuaweiProjects([]))
      .finally(() => {
        window.clearTimeout(timeout);
        setHuaweiProjectsLoading(false);
      });
  }, [showForm, editingUserId]);

  useEffect(() => {
    if (showForm || editingUserId) {
      servicesApi.options()
        .then(setSapServiceOptions)
        .catch(() => setSapServiceOptions(SAP_SERVICES_FALLBACK));
    }
  }, [showForm, editingUserId]);

  useEffect(() => {
    const projs = showForm ? form.visibleProjects : (editForm ? editForm.visibleProjects : []);
    if (!projs || projs.length === 0) return;
    
    projs.forEach(p => {
      const key = projectKey(p);
      if (!projectEcsMap[key]) {
        huawei.ecs(p.id, p.region || undefined, p.perfil)
          .then(ecsList => {
            setProjectEcsMap(prev => ({ ...prev, [key]: Array.isArray(ecsList) ? ecsList : [] }));
          })
          .catch(() => {});
      }
    });
  }, [showForm, form.visibleProjects, editForm?.visibleProjects]);

  const toggleEcs = (id: string) => {
    setForm((f) => ({
      ...f,
      allowedEcsIds: f.allowedEcsIds.includes(id)
        ? f.allowedEcsIds.filter((x) => x !== id)
        : [...f.allowedEcsIds, id],
    }));
  };

  const toggleVisibleProject = (p: HuaweiProject) => {
    const key = projectKey(p);
    setForm((f) => {
      const exists = f.visibleProjects.some((x) => projectKey(x) === key);
      return {
        ...f,
        visibleProjects: exists
          ? f.visibleProjects.filter((x) => projectKey(x) !== key)
          : [...f.visibleProjects, p],
      };
    });
  };

  const isProjectSelected = (p: HuaweiProject) =>
    form.visibleProjects.some((x) => projectKey(x) === projectKey(p));

  const toggleEditVisibleProject = (p: HuaweiProject) => {
    if (!editForm) return;
    const key = projectKey(p);
    const exists = editForm.visibleProjects.some((x) => projectKey(x) === key);
    setEditForm((f) => (!f ? f : {
      ...f,
      visibleProjects: exists
        ? f.visibleProjects.filter((x) => projectKey(x) !== key)
        : [...f.visibleProjects, p],
    }));
  };

  const isEditProjectSelected = (p: HuaweiProject) =>
    editForm?.visibleProjects.some((x) => projectKey(x) === projectKey(p)) ?? false;

  const toggleEditEcs = (id: string) => {
    if (!editForm) return;
    setEditForm((f) => (!f ? f : {
      ...f,
      allowedEcsIds: f.allowedEcsIds.includes(id)
        ? f.allowedEcsIds.filter((x) => x !== id)
        : [...f.allowedEcsIds, id],
    }));
  };

  const toggleService = (id: string) => {
    setForm((f) => ({
      ...f,
      allowedServiceIds: f.allowedServiceIds.includes(id)
        ? f.allowedServiceIds.filter((x) => x !== id)
        : [...f.allowedServiceIds, id],
    }));
  };

  const toggleEditService = (id: string) => {
    if (!editForm) return;
    setEditForm((f) => (!f ? f : {
      ...f,
      allowedServiceIds: f.allowedServiceIds.includes(id)
        ? f.allowedServiceIds.filter((x) => x !== id)
        : [...f.allowedServiceIds, id],
    }));
  };

  const togglePermission = (perm: string) => {
    setForm((f) => ({
      ...f,
      permissions: (f.permissions || []).includes(perm)
        ? (f.permissions || []).filter((x) => x !== perm)
        : [...(f.permissions || []), perm],
    }));
  };

  const toggleEditPermission = (perm: string) => {
    if (!editForm) return;
    setEditForm((f) => (!f ? f : {
      ...f,
      permissions: (f.permissions || []).includes(perm)
        ? (f.permissions || []).filter((x) => x !== perm)
        : [...(f.permissions || []), perm],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.name || !form.email || !form.password) {
      setError('Nome, e-mail e senha são obrigatórios.');
      return;
    }
    try {
      await api.create({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        permissions: form.permissions,
        allowedEcsIds: form.allowedEcsIds,
        allowedHuaweiEcsIds: form.allowedHuaweiEcsIds,
        visibleProjects: form.visibleProjects,
        allowedServiceIds: form.allowedServiceIds,
        mfaEnabled: canToggleMfa ? form.mfaEnabled : true,
        mfaEmail: form.mfaEmail || form.email,
      });
      setSuccess('Usuário criado e salvo com sucesso.');
      setForm({
        name: '',
        email: '',
        password: '',
        role: 'operator',
        permissions: ['backups:list'],
        allowedEcsIds: [],
        visibleProjects: [],
        allowedServiceIds: [],
        allowedHuaweiEcsIds: {},
        mfaEnabled: true,
        mfaEmail: '',
      });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    }
  };

  const handleDelete = async (u: User) => {
    if (!window.confirm(`Remover o usuário "${u.name}" (${u.email})?`)) return;
    setActionLoading(u.id);
    setError('');
    try {
      await api.delete(u.id);
      setSuccess('Usuário removido.');
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao remover usuário.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async () => {
    if (!resetUserId || !resetPassword || resetPassword.length < 6) {
      setError('Nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    setError('');
    try {
      await api.resetPassword(resetUserId, resetPassword);
      setSuccess('Senha alterada com sucesso.');
      setResetUserId(null);
      setResetPassword('');
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar senha.');
    }
  };

  const openEdit = async (u: User) => {
    setEditingUserId(u.id);
    setError('');
    try {
      const full = await api.get(u.id);
      setEditForm({
        name: full.name,
        email: full.email,
        role: full.role,
        permissions: full.permissions || [],
        allowedEcsIds: full.allowedEcsIds || [],
        visibleProjects: (full.visibleProjects || []) as HuaweiProject[],
        allowedHuaweiEcsIds: full.allowedHuaweiEcsIds || {},
        allowedServiceIds: full.allowedServiceIds || [],
        preferredServiceClientKey: full.preferredServiceClientKey ?? '',
        mfaEnabled: full.mfaEnabled !== false,
        mfaEmail: full.mfaEmail ?? full.email,
        password: '',
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuário.');
      setEditingUserId(null);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId || !editForm) return;
    setEditLoading(true);
    setError('');
    try {
      const payload: Parameters<typeof api.update>[1] = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        permissions: editForm.permissions,
        allowedEcsIds: editForm.allowedEcsIds,
        allowedHuaweiEcsIds: editForm.allowedHuaweiEcsIds,
        visibleProjects: editForm.visibleProjects,
        allowedServiceIds: editForm.allowedServiceIds,
        preferredServiceClientKey: editForm.preferredServiceClientKey || null,
        mfaEnabled: canToggleMfa ? editForm.mfaEnabled : true,
        mfaEmail: editForm.mfaEmail || editForm.email,
      };
      if (editForm.password.length >= 6) payload.password = editForm.password;
      await api.update(editingUserId, payload);
      setSuccess('Usuário atualizado.');
      setEditingUserId(null);
      setEditForm(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar usuário.');
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="ananim-page">
      <PageHeader
        badge="Usuários"
        title="Usuários e permissões"
        description="Gerencie acesso ao painel, projetos Huawei, serviços SAP/HANA e regras de MFA em uma única operação."
        actions={
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="ananim-btn-primary"
          >
            {showForm ? 'Cancelar' : 'Adicionar usuário'}
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="ananim-metric">
          <p className="ananim-metric-label">Usuários</p>
          <p className="ananim-metric-value">{list.length}</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Projetos Huawei</p>
          <p className="ananim-metric-value">{huaweiProjects.length}</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Serviços SAP/HANA</p>
          <p className="ananim-metric-value">{sapServiceOptions.length}</p>
        </div>
      </div>

      {showForm && (
        <div className="ananim-card p-6 mb-6">
          <div className="mb-4">
            <h3 className="ananim-section-title">Novo usuário</h3>
            <p className="ananim-section-subtitle">Cadastro com permissões, projetos, ECS e serviços já definidos desde a criação.</p>
          </div>
          {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg text-sm">{error}</div>}
          {success && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 rounded-lg text-sm">{success}</div>}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="ananim-label">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="ananim-input"
                  required
                />
              </div>
              <div>
                <label className="ananim-label">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="ananim-input"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="ananim-label">Senha</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="ananim-input"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="ananim-label">Perfil</label>
                <select
                  value={form.role}
                  onChange={(e) => {
                    const newRole = e.target.value;
                    const newPerms = newRole === 'admin'
                      ? ['ecs:*', 'services:*', 'backups:list', 'licenses:*', 'users:*', 'huawei:projects']
                      : newRole === 'client'
                        ? ['backups:list', 'services:*']
                        : ['backups:list'];
                    setForm((f) => ({ ...f, role: newRole, permissions: newPerms }));
                  }}
                  className="ananim-select"
                >
                  <option value="operator">Operador</option>
                  <option value="client">Cliente</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>

            <div className="ananim-card-muted p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-ananim-text">MFA no primeiro login</label>
                  <p className="text-xs leading-5 text-ananim-muted">
                    Usuários novos já saem com MFA preparado para ativação no primeiro acesso. Somente administrador pode desabilitar essa exigência.
                  </p>
                </div>
                <label className="inline-flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={form.mfaEnabled !== false}
                    disabled={!canToggleMfa}
                    onChange={() => setForm((current) => ({ ...current, mfaEnabled: !(current.mfaEnabled !== false) }))}
                    className="rounded border-white/20 bg-transparent"
                  />
                  <span className="text-sm font-medium text-ananim-text">{form.mfaEnabled !== false ? 'MFA habilitado' : 'MFA desabilitado'}</span>
                </label>
              </div>
              <div className="mt-3">
                <label className="ananim-label">E-mail para MFA</label>
                <input
                  type="email"
                  value={form.mfaEmail || ''}
                  onChange={(e) => setForm((current) => ({ ...current, mfaEmail: e.target.value }))}
                  className="ananim-input"
                  placeholder="Se vazio, usa o e-mail do usuário"
                  disabled={!canToggleMfa}
                />
              </div>
            </div>

            {form.role !== 'admin' && (
              <div className="ananim-card-muted p-4">
                <label className="ananim-label">Permissões Especiais</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.permissions?.includes('ecs:*') ?? false} onChange={() => togglePermission('ecs:*')} className="rounded border-white/20 bg-transparent"/>
                    <span className="text-sm">Controlar ECS (Ligar/Desligar)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.permissions?.includes('services:*') ?? false} onChange={() => togglePermission('services:*')} className="rounded border-white/20 bg-transparent"/>
                    <span className="text-sm">Acessar Aba Serviços</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.permissions?.includes('huawei:projects') ?? false} onChange={() => togglePermission('huawei:projects')} className="rounded border-white/20 bg-transparent"/>
                    <span className="text-sm">Gerenciar API Huawei (Home)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.permissions?.includes('backups:list') ?? false} onChange={() => togglePermission('backups:list')} className="rounded border-white/20 bg-transparent"/>
                    <span className="text-sm">Visualizar Backups</span>
                  </label>
                </div>
              </div>
            )}

            <div>
              <label className="ananim-label">
                Projetos Huawei (visão ao logar)
              </label>
              <p className="text-xs text-ananim-muted mb-2">
                Selecione os projetos que este usuário poderá ver na Home ao logar.
              </p>
              {huaweiProjectsLoading ? (
                <p className="text-sm text-ananim-muted">Carregando projetos...</p>
              ) : huaweiProjects.length === 0 ? (
                <p className="text-sm text-ananim-muted">Nenhum projeto carregado. Carregue os projetos na Home primeiro ou tente novamente.</p>
              ) : (
                <>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, visibleProjects: [...huaweiProjects] }))}
                      className="text-sm text-ananim-accent hover:text-white font-medium"
                    >
                      Selecionar todos
                    </button>
                    <span className="text-ananim-muted">|</span>
                    <button
                      type="button"
                    onClick={() => setForm((f) => ({ ...f, visibleProjects: [] }))}
                    className="text-sm text-ananim-textSoft hover:text-white font-medium"
                  >
                    Desmarcar todos
                  </button>
                </div>
                  <div className="max-h-40 overflow-y-auto border border-white/10 rounded-xl p-3 flex flex-wrap gap-2 bg-white/[0.02]">
                    {huaweiProjects.map((p) => (
                      <label key={projectKey(p)} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isProjectSelected(p)}
                          onChange={() => toggleVisibleProject(p)}
                          className="rounded border-white/20 bg-transparent"
                        />
                        <span className="text-sm">{displayPerfil(p.perfil)} — {p.name || p.id}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="ananim-label mt-4">ECS permitidas Huawei (Projetos selecionados)</label>
              {form.visibleProjects.map(p => {
                const key = projectKey(p);
                const ecsList = projectEcsMap[key] || [];
                const allowed = form.allowedHuaweiEcsIds?.[key] || [];
                const toggle = (ecsId: string) => {
                  setForm(f => {
                    const prevMap = f.allowedHuaweiEcsIds || {};
                    const prevList = prevMap[key] || [];
                    const newList = prevList.includes(ecsId) ? prevList.filter(x => x !== ecsId) : [...prevList, ecsId];
                    return { ...f, allowedHuaweiEcsIds: { ...prevMap, [key]: newList } };
                  });
                };
                return (
                  <div key={key} className="mb-2">
                    <p className="text-xs font-semibold text-ananim-textSoft border-b border-white/10 pb-1 mb-1">{displayPerfil(p.perfil)} — {p.name || p.id}</p>
                    <div className="flex flex-wrap gap-2">
                      {ecsList.length === 0 && <span className="text-xs text-ananim-muted">Carregando ECS...</span>}
                      {ecsList.map(ecs => (
                        <label key={ecs.id} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={allowed.includes(ecs.id)} onChange={() => toggle(ecs.id)} className="rounded border-white/20 bg-transparent"/>
                          <span className="text-xs">{ecs.name || ecs.id}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <label className="ananim-label">
                ECS permitidos (start/stop/restart)
              </label>
              <p className="text-xs text-ananim-muted mb-2">
                Selecione os ambientes/ECS que este usuário pode iniciar, parar ou reiniciar.
              </p>
              {envs.length > 0 && (
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, allowedEcsIds: envs.map((e) => e.id) }))}
                    className="text-sm text-ananim-accent hover:text-white font-medium"
                  >
                    Selecionar todos
                  </button>
                  <span className="text-ananim-muted">|</span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, allowedEcsIds: [] }))}
                    className="text-sm text-ananim-textSoft hover:text-white font-medium"
                  >
                    Desmarcar todos
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {envs.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.allowedEcsIds.includes(e.id)}
                      onChange={() => toggleEcs(e.id)}
                      className="rounded border-white/20 bg-transparent"
                    />
                    <span className="text-sm">{e.ip} – {e.cliente}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="ananim-label">
                Serviços SAP/HANA (restart)
              </label>
              <p className="text-xs text-ananim-muted mb-2">
                Selecione os serviços que este operador pode executar na tela Serviços (reiniciar Banco Hana, EDS, Service Layer, SLD).
              </p>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, allowedServiceIds: sapServiceOptions.map((s) => s.id) }))}
                  className="text-sm text-ananim-accent hover:text-white font-medium"
                >
                  Selecionar todos
                </button>
                <span className="text-ananim-muted">|</span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, allowedServiceIds: [] }))}
                  className="text-sm text-ananim-textSoft hover:text-white font-medium"
                >
                  Desmarcar todos
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {sapServiceOptions.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.allowedServiceIds.includes(s.id)}
                      onChange={() => toggleService(s.id)}
                      className="rounded border-white/20 bg-transparent"
                    />
                    <span className="text-sm">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="ananim-btn-primary"
              >
                Criar usuário
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="ananim-btn-ghost"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

        <div className="ananim-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h3 className="ananim-section-title">Usuários cadastrados</h3>
          <span className="ananim-chip">{list.length} registro(s)</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-ananim-muted">Carregando...</div>
        ) : (
          <div className="ananim-table-wrap">
            <table className="ananim-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>MFA</th>
                  <th>Permissões ECS</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium text-ananim-text">{u.name}</td>
                    <td className="break-words">{u.email}</td>
                    <td className="capitalize">{u.role}</td>
                    <td>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${u.mfaEnabled !== false ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.04] text-ananim-textSoft'}`}>
                        {u.mfaEnabled !== false ? 'Obrigatório' : 'Desabilitado'}
                      </span>
                    </td>
                    <td>{ecsPermissionsSummary(u)}</td>
                    <td>
                      <span className="inline-flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          disabled={!!actionLoading}
                          className="text-ananim-accent hover:text-white font-medium text-xs disabled:opacity-50"
                          title="Editar usuário"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetUserId(u.id)}
                          disabled={!!actionLoading}
                          className="text-amber-300 hover:text-amber-100 font-medium text-xs disabled:opacity-50"
                          title="Redefinir senha"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(u)}
                          disabled={!!actionLoading}
                          className="text-red-300 hover:text-red-100 font-medium text-xs disabled:opacity-50"
                          title="Excluir usuário"
                        >
                          Delete
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {resetUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="ananim-card w-full max-w-md p-6 shadow-lg shadow-black/30">
            <h3 className="text-lg font-medium text-white mb-2">Redefinir senha</h3>
            <p className="text-sm text-ananim-textSoft mb-3">Informe a nova senha (mín. 6 caracteres).</p>
            {error && <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg text-sm">{error}</div>}
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Nova senha"
              className="ananim-input mb-4"
              minLength={6}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setResetUserId(null); setResetPassword(''); setError(''); }}
                className="ananim-btn-ghost"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                className="ananim-btn-primary"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUserId && editForm && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md"
          onClick={(e) => { if (e.target === e.currentTarget) closeEditModal(); }}
        >
          <div className="flex h-full w-full items-stretch justify-stretch p-0 md:p-4">
            <div className="ananim-card flex h-full w-full flex-col overflow-hidden rounded-none border-0 shadow-2xl shadow-black/60 md:rounded-[28px] md:border md:border-white/10">

              {/* Header */}
              <div className="flex shrink-0 items-start justify-between border-b border-white/10 px-5 py-4 md:px-8">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ananim-accent">Usuários</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white md:text-3xl">Editar usuário</h3>
                  <p className="mt-1 text-sm text-ananim-muted">{editForm.email}</p>
                </div>
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="ananim-btn-ghost h-11 w-11 shrink-0 p-0"
                  aria-label="Fechar"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-8 md:py-6">
                  <div className="space-y-6">

                  {error && <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg text-sm">{error}</div>}
                  {success && <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 rounded-lg text-sm">{success}</div>}

                  {/* Seção: Dados básicos */}
                  <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 md:p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ananim-muted mb-3">Dados básicos</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="ananim-label">Nome</span>
                        <input type="text" value={editForm.name} onChange={(e) => setEditForm((f) => f ? { ...f, name: e.target.value } : f)} className="ananim-input" required />
                      </label>
                      <label className="block">
                        <span className="ananim-label">E-mail</span>
                        <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => f ? { ...f, email: e.target.value } : f)} className="ananim-input" required />
                      </label>
                      <label className="block">
                        <span className="ananim-label">Perfil</span>
                        <select
                          value={editForm.role}
                          onChange={(e) => {
                            const r = e.target.value;
                            const perms = r === 'admin' ? ['ecs:*', 'services:*', 'backups:list', 'licenses:*', 'users:*', 'huawei:projects']
                              : r === 'client' ? ['backups:list', 'services:*'] : ['backups:list'];
                            setEditForm((f) => f ? { ...f, role: r, permissions: perms } : f);
                          }}
                          className="ananim-select"
                        >
                          <option value="operator">Operador</option>
                          <option value="client">Cliente</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="ananim-label">Nova senha <span className="font-normal text-ananim-muted">(deixe em branco para não alterar)</span></span>
                        <input type="password" value={editForm.password} onChange={(e) => setEditForm((f) => f ? { ...f, password: e.target.value } : f)} placeholder="••••••••" className="ananim-input" minLength={6} autoComplete="new-password" />
                      </label>
                    </div>
                  </section>

                  {/* Seção: MFA */}
                  <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 md:p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ananim-muted mb-3">Autenticação (MFA)</p>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-ananim-text">Exigir autenticação em dois fatores</p>
                        <p className="mt-0.5 text-xs text-ananim-muted">O usuário configura no primeiro login. Apenas admin pode desabilitar.</p>
                      </div>
                      <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={editForm.mfaEnabled !== false}
                          disabled={!canToggleMfa}
                          onChange={() => setEditForm((c) => c ? { ...c, mfaEnabled: !(c.mfaEnabled !== false) } : c)}
                          className="rounded border-white/20 bg-transparent"
                        />
                        <span className="text-sm font-medium text-ananim-text">{editForm.mfaEnabled !== false ? 'Habilitado' : 'Desabilitado'}</span>
                      </label>
                    </div>
                    <label className="block mt-3">
                      <span className="ananim-label">E-mail para receber código MFA</span>
                      <input
                        type="email"
                        value={editForm.mfaEmail}
                        onChange={(e) => setEditForm((c) => c ? { ...c, mfaEmail: e.target.value } : c)}
                        className="ananim-input"
                        placeholder="Se vazio, usa o e-mail do usuário"
                        disabled={!canToggleMfa}
                      />
                    </label>
                  </section>

                  {/* Seção: Permissões especiais (não-admin) */}
                  {editForm.role !== 'admin' && (
                    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 md:p-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-ananim-muted mb-3">Permissões especiais</p>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {[
                          { perm: 'ecs:*', label: 'Controlar ECS (ligar/desligar/restart)' },
                          { perm: 'services:*', label: 'Acessar aba Serviços SAP/HANA' },
                          { perm: 'huawei:projects', label: 'Gerenciar projetos Huawei (Home)' },
                          { perm: 'backups:list', label: 'Visualizar backups' },
                        ].map(({ perm, label }) => (
                          <label key={perm} className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={editForm.permissions?.includes(perm) ?? false} onChange={() => toggleEditPermission(perm)} className="rounded border-white/20 bg-transparent" />
                            <span className="text-sm text-ananim-text">{label}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Seção: Projetos Huawei */}
                  <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 md:p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ananim-muted mb-3">Projetos Huawei (visão ao logar)</p>
                    {huaweiProjectsLoading ? (
                      <p className="text-sm text-ananim-muted">Carregando projetos...</p>
                    ) : huaweiProjects.length === 0 ? (
                      <p className="text-sm text-ananim-muted">Nenhum projeto disponível. Carregue projetos na Home.</p>
                    ) : (
                      <>
                        <div className="flex gap-3 mb-2">
                          <button type="button" onClick={() => setEditForm((f) => f ? { ...f, visibleProjects: [...huaweiProjects] } : f)} className="text-xs text-ananim-accent hover:text-white font-medium">Selecionar todos</button>
                          <span className="text-ananim-muted">|</span>
                          <button type="button" onClick={() => setEditForm((f) => f ? { ...f, visibleProjects: [] } : f)} className="text-xs text-ananim-textSoft hover:text-white font-medium">Desmarcar todos</button>
                        </div>
                        <div className="max-h-32 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-wrap gap-2">
                          {huaweiProjects.map((p) => (
                            <label key={projectKey(p)} className="flex items-center gap-2 cursor-pointer select-none">
                              <input type="checkbox" checked={isEditProjectSelected(p)} onChange={() => toggleEditVisibleProject(p)} className="rounded border-white/20 bg-transparent" />
                              <span className="text-xs text-ananim-text">{displayPerfil(p.perfil)} — {p.name || p.id}</span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </section>

                  {/* Seção: ECS por projeto */}
                  {(editForm.visibleProjects || []).length > 0 && (
                    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 md:p-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-ananim-muted mb-3">ECS permitidas por projeto</p>
                      <div className="space-y-3">
                        {(editForm.visibleProjects || []).map((p) => {
                          const key = projectKey(p);
                          const ecsList = projectEcsMap[key] || [];
                          const allowed = editForm.allowedHuaweiEcsIds?.[key] || [];
                          const toggleEc = (ecsId: string) => setEditForm((f) => {
                            if (!f) return f;
                            const prev = f.allowedHuaweiEcsIds?.[key] || [];
                            const next = prev.includes(ecsId) ? prev.filter((x) => x !== ecsId) : [...prev, ecsId];
                            return { ...f, allowedHuaweiEcsIds: { ...f.allowedHuaweiEcsIds, [key]: next } };
                          });
                          return (
                            <div key={key} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                              <p className="text-xs font-semibold text-ananim-accent mb-2">{displayPerfil(p.perfil)} — {p.name || p.id}</p>
                              {ecsList.length === 0 ? (
                                <p className="text-xs text-ananim-muted">Carregando VMs...</p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {ecsList.map((ecs) => (
                                    <label key={ecs.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                                      <input type="checkbox" checked={allowed.includes(ecs.id)} onChange={() => toggleEc(ecs.id)} className="rounded border-white/20 bg-transparent" />
                                      <span className="text-xs text-ananim-text">{ecs.name || ecs.id}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Seção: ECS legados (ambientes) */}
                  {envs.length > 0 && (
                    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 md:p-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-ananim-muted mb-3">ECS ambientes (legado)</p>
                      <div className="flex gap-3 mb-2">
                        <button type="button" onClick={() => setEditForm((f) => f ? { ...f, allowedEcsIds: envs.map((e) => e.id) } : f)} className="text-xs text-ananim-accent hover:text-white font-medium">Selecionar todos</button>
                        <span className="text-ananim-muted">|</span>
                        <button type="button" onClick={() => setEditForm((f) => f ? { ...f, allowedEcsIds: [] } : f)} className="text-xs text-ananim-textSoft hover:text-white font-medium">Desmarcar todos</button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {envs.map((e) => (
                          <label key={e.id} className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={editForm.allowedEcsIds.includes(e.id)} onChange={() => toggleEditEcs(e.id)} className="rounded border-white/20 bg-transparent" />
                            <span className="text-sm text-ananim-text">{e.ip} — {e.cliente}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Seção: Serviços SAP/HANA */}
                  <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 md:p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ananim-muted mb-3">Serviços SAP / HANA</p>
                    <div className="flex gap-3 mb-2">
                      <button type="button" onClick={() => setEditForm((f) => f ? { ...f, allowedServiceIds: sapServiceOptions.map((s) => s.id) } : f)} className="text-xs text-ananim-accent hover:text-white font-medium">Selecionar todos</button>
                      <span className="text-ananim-muted">|</span>
                      <button type="button" onClick={() => setEditForm((f) => f ? { ...f, allowedServiceIds: [] } : f)} className="text-xs text-ananim-textSoft hover:text-white font-medium">Desmarcar todos</button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {sapServiceOptions.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={editForm.allowedServiceIds.includes(s.id)} onChange={() => toggleEditService(s.id)} className="rounded border-white/20 bg-transparent" />
                          <span className="text-sm text-ananim-text">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  {/* Seção: Cliente preferido */}
                  <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 md:p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ananim-muted mb-3">Preferências de exibição</p>
                    <label className="block">
                      <span className="ananim-label">Cliente preferido na aba Serviços</span>
                      <p className="mb-1 text-xs text-ananim-muted">Quando o usuário tem múltiplos projetos, define qual exibir por padrão.</p>
                      <select value={editForm.preferredServiceClientKey} onChange={(e) => setEditForm((f) => f ? { ...f, preferredServiceClientKey: e.target.value } : f)} className="ananim-select">
                        {PREFERRED_SERVICE_CLIENT_OPTIONS.map((opt) => (
                          <option key={opt.value || 'auto'} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                  </section>

                  </div>
                </div>

                {/* Footer */}
                <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 px-5 py-4 md:px-8">
                  <button type="button" onClick={closeEditModal} className="ananim-btn-ghost">
                    Cancelar
                  </button>
                  <button type="submit" disabled={editLoading} className="ananim-btn-primary disabled:opacity-60">
                    {editLoading ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}
      </div>
    </div>
  );
}
