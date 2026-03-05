import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { users as api, environments, huawei, services as servicesApi, type User, type CreateUser, type HuaweiProject, PREFERRED_SERVICE_CLIENT_OPTIONS } from '../api/client';

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
  { id: 'reiniciar-banco-hana', name: 'Reiniciar Banco Hana' },
  { id: 'reiniciar-eds-hana', name: 'Reiniciar EDS HANA' },
  { id: 'reiniciar-service-layer-hana', name: 'Reiniciar Service Layer HANA' },
  { id: 'reiniciar-sld-hana', name: 'Reiniciar SLD HANA' },
];

export default function Usuarios() {
  const user = JSON.parse(localStorage.getItem('user') || '{}') as User;
  if (user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  const [list, setList] = useState<User[]>([]);
  const [envs, setEnvs] = useState<{ id: string; ip: string; cliente: string }[]>([]);
  const [huaweiProjects, setHuaweiProjects] = useState<HuaweiProject[]>([]);
  const [huaweiProjectsLoading, setHuaweiProjectsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateUser & { allowedEcsIds: string[]; visibleProjects: HuaweiProject[]; allowedServiceIds: string[] }>({
    name: '',
    email: '',
    password: '',
    role: 'operator',
    permissions: ['backups:list'],
    allowedEcsIds: [],
    visibleProjects: [],
    allowedServiceIds: [],
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
    allowedServiceIds: string[];
    preferredServiceClientKey: string;
    password: string;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [sapServiceOptions, setSapServiceOptions] = useState<{ id: string; name: string }[]>(SAP_SERVICES_FALLBACK);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.name || !form.email || !form.password) {
      setError('Nome, e-mail e senha são obrigatórios.');
      return;
    }
    try {
      const permissions =
        form.role === 'admin'
          ? ['ecs:*', 'services:*', 'backups:list', 'licenses:*', 'users:*', 'huawei:projects']
          : form.allowedEcsIds.length || form.allowedServiceIds.length
            ? ['backups:list', 'ecs:*', 'services:*']
            : ['backups:list'];
      await api.create({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        permissions,
        allowedEcsIds: form.allowedEcsIds,
        visibleProjects: form.visibleProjects,
        allowedServiceIds: form.allowedServiceIds,
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
        allowedServiceIds: full.allowedServiceIds || [],
        preferredServiceClientKey: full.preferredServiceClientKey ?? '',
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
      const permissions =
        editForm.role === 'admin'
          ? ['ecs:*', 'services:*', 'backups:list', 'licenses:*', 'users:*', 'huawei:projects']
          : editForm.allowedEcsIds.length || editForm.allowedServiceIds.length
            ? ['backups:list', 'ecs:*', 'services:*']
            : ['backups:list'];
      const payload: Parameters<typeof api.update>[1] = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        permissions,
        allowedEcsIds: editForm.allowedEcsIds,
        visibleProjects: editForm.visibleProjects,
        allowedServiceIds: editForm.allowedServiceIds,
        preferredServiceClientKey: editForm.preferredServiceClientKey || null,
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
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Usuários e permissões</h2>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : 'Adicionar usuário'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-800 mb-4">Novo usuário</h3>
          {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
          {success && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm">{success}</div>}
          <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                >
                  <option value="operator">Operador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Projetos Huawei (visão ao logar)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Selecione os projetos que este usuário poderá ver na Home ao logar.
              </p>
              {huaweiProjectsLoading ? (
                <p className="text-sm text-gray-500">Carregando projetos...</p>
              ) : huaweiProjects.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum projeto carregado. Carregue os projetos na Home primeiro ou tente novamente.</p>
              ) : (
                <>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, visibleProjects: [...huaweiProjects] }))}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Selecionar todos
                    </button>
                    <span className="text-gray-400">|</span>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, visibleProjects: [] }))}
                      className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                    >
                      Desmarcar todos
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 flex flex-wrap gap-2">
                    {huaweiProjects.map((p) => (
                      <label key={projectKey(p)} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isProjectSelected(p)}
                          onChange={() => toggleVisibleProject(p)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">{displayPerfil(p.perfil)} — {p.name || p.id}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ECS permitidos (start/stop/restart)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Selecione os ambientes/ECS que este usuário pode iniciar, parar ou reiniciar.
              </p>
              {envs.length > 0 && (
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, allowedEcsIds: envs.map((e) => e.id) }))}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Selecionar todos
                  </button>
                  <span className="text-gray-400">|</span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, allowedEcsIds: [] }))}
                    className="text-sm text-gray-600 hover:text-gray-800 font-medium"
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
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{e.ip} – {e.cliente}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Serviços SAP/HANA (restart)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Selecione os serviços que este operador pode executar na tela Serviços (reiniciar Banco Hana, EDS, Service Layer, SLD).
              </p>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, allowedServiceIds: sapServiceOptions.map((s) => s.id) }))}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Selecionar todos
                </button>
                <span className="text-gray-400">|</span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, allowedServiceIds: [] }))}
                  className="text-sm text-gray-600 hover:text-gray-800 font-medium"
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
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
              >
                Criar usuário
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-300"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <h3 className="text-lg font-medium text-gray-800 p-4 border-b border-gray-100">
          Usuários cadastrados
        </h3>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-2 px-4 font-semibold text-gray-700">Nome</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-700">E-mail</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-700">Perfil</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-700">Permissões ECS</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">{u.name}</td>
                  <td className="py-3 px-4">{u.email}</td>
                  <td className="py-3 px-4 capitalize">{u.role}</td>
                  <td className="py-3 px-4">
                    {ecsPermissionsSummary(u)}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        disabled={!!actionLoading}
                        className="text-blue-600 hover:text-blue-800 font-medium text-xs disabled:opacity-50"
                        title="Editar usuário"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetUserId(u.id)}
                        disabled={!!actionLoading}
                        className="text-amber-700 hover:text-amber-800 font-medium text-xs disabled:opacity-50"
                        title="Redefinir senha"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(u)}
                        disabled={!!actionLoading}
                        className="text-red-600 hover:text-red-700 font-medium text-xs disabled:opacity-50"
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
        )}

      {resetUserId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-medium text-gray-800 mb-2">Redefinir senha</h3>
            <p className="text-sm text-gray-600 mb-3">Informe a nova senha (mín. 6 caracteres).</p>
            {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Nova senha"
              className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
              minLength={6}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setResetUserId(null); setResetPassword(''); setError(''); }}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUserId && editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-xl w-full my-8">
            <h3 className="text-lg font-medium text-gray-800 mb-4">Editar usuário</h3>
            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
            {success && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm">{success}</div>}
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => f ? { ...f, name: e.target.value } : f)}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => f ? { ...f, email: e.target.value } : f)}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm((f) => f ? { ...f, role: e.target.value } : f)}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  >
                    <option value="operator">Operador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha (opcional)</label>
                  <input
                    type="password"
                    value={editForm.password}
                    onChange={(e) => setEditForm((f) => f ? { ...f, password: e.target.value } : f)}
                    placeholder="Deixe em branco para não alterar"
                    className="w-full border border-gray-300 rounded px-3 py-2"
                    minLength={6}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Projetos Huawei (visão ao logar)</label>
                {huaweiProjectsLoading ? (
                  <p className="text-sm text-gray-500">Carregando projetos...</p>
                ) : huaweiProjects.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum projeto carregado.</p>
                ) : (
                  <>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setEditForm((f) => f ? { ...f, visibleProjects: [...huaweiProjects] } : f)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Selecionar todos
                      </button>
                      <span className="text-gray-400">|</span>
                      <button
                        type="button"
                        onClick={() => setEditForm((f) => f ? { ...f, visibleProjects: [] } : f)}
                        className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                      >
                        Desmarcar todos
                      </button>
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 flex flex-wrap gap-2">
                      {huaweiProjects.map((p) => (
                        <label key={projectKey(p)} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isEditProjectSelected(p)}
                            onChange={() => toggleEditVisibleProject(p)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">{displayPerfil(p.perfil)} — {p.name || p.id}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ECS permitidos</label>
                {envs.length > 0 && (
                  <>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setEditForm((f) => f ? { ...f, allowedEcsIds: envs.map((e) => e.id) } : f)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Selecionar todos
                      </button>
                      <span className="text-gray-400">|</span>
                      <button
                        type="button"
                        onClick={() => setEditForm((f) => f ? { ...f, allowedEcsIds: [] } : f)}
                        className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                      >
                        Desmarcar todos
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {envs.map((e) => (
                        <label key={e.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editForm.allowedEcsIds.includes(e.id)}
                            onChange={() => toggleEditEcs(e.id)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">{e.ip} – {e.cliente}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Serviços SAP/HANA (restart)</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setEditForm((f) => f ? { ...f, allowedServiceIds: sapServiceOptions.map((s) => s.id) } : f)}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Selecionar todos
                  </button>
                  <span className="text-gray-400">|</span>
                  <button
                    type="button"
                    onClick={() => setEditForm((f) => f ? { ...f, allowedServiceIds: [] } : f)}
                    className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                  >
                    Desmarcar todos
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sapServiceOptions.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.allowedServiceIds.includes(s.id)}
                        onChange={() => toggleEditService(s.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente preferido na aba Serviços</label>
                <p className="text-xs text-gray-500 mb-1">Quando o usuário tem vários projetos (ex.: Roland e CLOUDHDB), define qual cliente exibir em Serviços. Deixe em automático para usar a ordem dos projetos.</p>
                <select
                  value={editForm.preferredServiceClientKey}
                  onChange={(e) => setEditForm((f) => f ? { ...f, preferredServiceClientKey: e.target.value } : f)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  {PREFERRED_SERVICE_CLIENT_OPTIONS.map((opt) => (
                    <option key={opt.value || 'auto'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => { setEditingUserId(null); setEditForm(null); setError(''); setSuccess(''); }}
                  className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  {editLoading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
