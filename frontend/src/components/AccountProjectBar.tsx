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
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Conta</span>
        <select
          value={selectedAccount}
          onChange={(e) => onChangeAccount(e.target.value)}
          disabled={disabled || loading}
          className="h-8 px-2 pr-6 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-200 outline-none focus:border-[#00C8E0]/50 disabled:opacity-50 min-w-[140px]"
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
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Projeto</span>
          <select
            value={selectedProject}
            onChange={(e) => onChangeProject(e.target.value)}
            disabled={!selectedAccount || disabled || loading}
            className="h-8 px-2 pr-6 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-200 outline-none focus:border-[#00C8E0]/50 disabled:opacity-50 min-w-[160px]"
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
        <span className="text-[9px] font-bold text-transparent uppercase tracking-wider select-none">_</span>
        <button
          type="button"
          onClick={onLoad}
          disabled={!canLoad}
          className="h-8 px-4 rounded-lg bg-[#00C8E0]/15 border border-[#00C8E0]/30 text-[#00C8E0] text-xs font-bold hover:bg-[#00C8E0]/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Carregando…' : '▶ Carregar'}
        </button>
      </div>

      {extraActions && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-transparent uppercase tracking-wider select-none">_</span>
          <div className="flex gap-2">{extraActions}</div>
        </div>
      )}
    </div>
  );
}

