import React from 'react';

type Option = { id: string; name: string };

export default function AccountProjectBar({
  accounts,
  projects,
  selectedAccount,
  selectedProject,
  onChangeAccount,
  onChangeProject,
  onLoad,
  loading,
  disabled,
  requireProject = true,
  hideProject = false,
  extraActions,
}: {
  accounts: Option[];
  projects: Option[];
  selectedAccount: string;
  selectedProject: string;
  onChangeAccount: (id: string) => void;
  onChangeProject: (id: string) => void;
  onLoad: () => void;
  loading?: boolean;
  disabled?: boolean;
  requireProject?: boolean;
  hideProject?: boolean;
  extraActions?: React.ReactNode;
}) {
  const canLoad = !!selectedAccount && (!requireProject || !!selectedProject) && !loading && !disabled;

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="flex flex-col gap-0.5">
        <span className="ananim-label mb-1">Conta</span>
        <select
          value={selectedAccount}
          onChange={(e) => onChangeAccount(e.target.value)}
          disabled={disabled || loading}
          className="ananim-select min-w-[180px] text-sm"
        >
          <option value="">Conta…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {!hideProject && (projects.length > 0 || selectedAccount) ? (
        <div className="flex flex-col gap-0.5">
          <span className="ananim-label mb-1">Projeto</span>
          <select
            value={selectedProject}
            onChange={(e) => onChangeProject(e.target.value)}
            disabled={!selectedAccount || disabled || loading}
            className="ananim-select min-w-[220px] text-sm"
          >
            <option value="">Projeto…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5">
        <span className="ananim-label mb-1 text-transparent select-none">ação</span>
        <button
          type="button"
          onClick={onLoad}
          disabled={!canLoad}
          className="ananim-btn-primary px-4"
        >
          {loading ? 'Carregando…' : 'Carregar'}
        </button>
      </div>

      {extraActions && (
        <div className="flex flex-col gap-0.5">
          <span className="ananim-label mb-1 text-transparent select-none">extra</span>
          <div className="flex gap-2">{extraActions}</div>
        </div>
      )}
    </div>
  );
}
