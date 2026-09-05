import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Settings,
  ClipboardList,
  Calendar,
  Clock,
  Building2,
  Users,
  ScrollText,
  Radar,
  type LucideIcon,
} from 'lucide-react';
import { auth } from '../api/client';
import { useUser } from '../hooks/useUser';
import { clearBrowserSession } from '../utils/browserSession';

const menuItems: { path: string; label: string; icon: LucideIcon; adminOnly?: boolean; permission?: string }[] = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/servicos', label: 'Serviços', icon: Settings },
  { path: '/backups', label: 'Detalhes / Backups', icon: ClipboardList },
  { path: '/programacao', label: 'Programação', icon: Calendar, adminOnly: true },
  { path: '/automacoes', label: 'Origem das Automações', icon: Radar, adminOnly: true },
  { path: '/extensao-horario', label: 'Extensão de horário', icon: Clock, adminOnly: true },
  { path: '/horas-extras', label: 'Horas extras', icon: Clock, permission: 'client:self' },
  // { path: '/documentos', label: 'Documentos', icon: FolderOpen },
  { path: '/clientes', label: 'Clientes', icon: Building2, adminOnly: true },
  { path: '/usuarios', label: 'Usuários', icon: Users, permission: 'users:*' },
  { path: '/logs', label: 'Log de auditoria', icon: ScrollText, adminOnly: true },
];

function safeUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return { name: 'Usuário', role: '' };
  }
}

function hasPermission(u: any, perm: string): boolean {
  if (!u) return false;
  if (u.role === 'admin') return true;
  if (perm === 'client:self') return u.role === 'client';
  const list = Array.isArray(u.permissions) ? u.permissions : [];
  return list.includes(perm);
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const user = useUser() || safeUser();
  const appVersion = (import.meta as any).env?.VITE_APP_VERSION as string | undefined;

  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await auth.logout();
    } catch (err) {
      console.warn('Erro ao chamar logout na API:', err);
    }
    localStorage.removeItem('user');
    clearBrowserSession();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-ananim-bg text-ananim-text flex">
      <aside
        className={`relative border-r border-white/10 bg-ananim-surface/90 text-white backdrop-blur-sm transition-all duration-200 ${
          sidebarOpen ? 'w-[250px]' : 'w-20'
        } flex flex-col`}
      >
        <div className="absolute inset-0 bg-ananim-glow opacity-40 pointer-events-none" />
        <div className="relative p-4 flex items-center justify-between border-b border-white/10">
          <Link to="/" className="flex items-center min-w-0 flex-1 gap-3">
            <div className={`flex items-center justify-center ${sidebarOpen ? 'h-11 w-12' : 'h-10 w-10'} rounded-2xl border border-white/10 bg-white/95 overflow-hidden shadow-panel-sm`}>
              <img
                src="/logos/logo Ananim_Prancheta 1 cópia 10.png"
                alt="Ananim"
                className={`h-full w-full object-cover ${sidebarOpen ? 'px-2' : ''}`}
              />
            </div>
            {sidebarOpen && (
              <div className="min-w-0 space-y-0.5">
                <p className="font-display text-sm font-semibold text-white">Ananim</p>
                <p className="truncate text-[11px] uppercase tracking-[0.2em] text-ananim-muted">Manager Painel</p>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ananim-btn-ghost h-10 w-10 px-0"
            aria-label="Menu"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        <nav className="relative flex-1 px-3 py-4 space-y-1.5">
          {menuItems
            .filter((item: any) => {
              if (item.adminOnly) return user?.role === 'admin';
              if (item.permission) return hasPermission(user, item.permission);
              return true;
            })
            .map((item) => (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                aria-label={item.label}
                className={`group flex items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-200 ${
                  location.pathname === item.path
                    ? 'bg-ananim-accent/10 text-white shadow-accent border border-ananim-accent/20'
                    : 'border border-transparent text-ananim-textSoft hover:border-white/10 hover:bg-white/[0.035] hover:text-white'
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                  location.pathname === item.path ? 'bg-ananim-accent/15 text-ananim-accent' : 'bg-white/[0.04] text-ananim-muted group-hover:text-white'
                }`}>
                  <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                </span>
                {sidebarOpen && <span className="truncate text-sm font-medium">{item.label}</span>}
              </Link>
            ))}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-white/10 bg-ananim-surface/60 px-4 py-4 backdrop-blur md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/95 overflow-hidden shadow-panel-sm">
               <img src="/logos/logo Ananim_Prancheta 1 cópia 6.png" alt="Ananim" className="h-full w-full object-cover" />
             </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-white md:text-lg">
                  Ananim Manager Painel
                  {appVersion ? <span className="ml-2 font-sans text-xs font-medium text-ananim-muted">v{appVersion}</span> : null}
                </h1>
                <p className="truncate text-xs uppercase tracking-[0.14em] text-ananim-muted">
                  Operações, serviços e infraestrutura
                </p>
              </div>
            </div>
          <div className="flex items-center gap-3">
            <div className="hidden rounded-2xl border border-white/10 bg-white/[0.025] px-3 py-2 md:block">
              <p className="text-[11px] uppercase tracking-[0.14em] text-ananim-muted">Bem-vindo</p>
              <p className="text-sm font-medium text-white">
                {user.name || 'Usuário'}
                {user?.role ? <span className="ml-2 text-xs font-normal text-ananim-muted">({user.role})</span> : null}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="ananim-btn-soft"
            >
              Sair
            </button>
          </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto px-4 py-5 md:px-6 md:py-6 lg:px-7">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
