import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../api/client';

const menuItems = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/servicos', label: 'Serviços', icon: '⚙️' },
  { path: '/backups', label: 'Detalhes / Backups', icon: '📋' },
  { path: '/programacao', label: 'Programação', icon: '📅', adminOnly: true },
  { path: '/extensao-horario', label: 'Extensão de horário', icon: '⏱️', adminOnly: true },
  { path: '/documentos', label: 'Documentos', icon: '📁' },
  { path: '/clientes', label: 'Clientes', icon: '🏢', adminOnly: true },
  { path: '/usuarios', label: 'Usuários', icon: '👥', permission: 'users:*' },
  { path: '/logs', label: 'Log de auditoria', icon: '📜', adminOnly: true },
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
  const list = Array.isArray(u.permissions) ? u.permissions : [];
  return list.includes(perm);
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const user = safeUser();

  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await auth.logout();
    } catch (err) {
      console.warn('Erro ao chamar logout na API:', err);
    }
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-ananim-bg text-ananim-text flex">
      <aside
        className={`bg-ananim-surface text-white border-r border-white/10 transition-all duration-200 ${
          sidebarOpen ? 'w-56' : 'w-16'
        } flex flex-col`}
      >
        <div className="p-3 flex items-center justify-between border-b border-white/10">
          <Link to="/" className="flex items-center min-w-0 flex-1">
            <img
              src="/ananim-logo.png"
              alt="Ananim"
              className={`object-contain ${sidebarOpen ? 'max-h-8 w-auto' : 'max-h-8 max-w-8 rounded'}`}
            />
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded hover:bg-white/[0.06] border border-transparent hover:border-white/10"
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
        <nav className="flex-1 py-2">
          {menuItems
            .filter((item: any) => {
              if (item.adminOnly) return user.role === 'admin';
              if (item.permission) return hasPermission(user, item.permission);
              return true;
            })
            .map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.06] ${
                  location.pathname === item.path ? 'bg-white/[0.06] border-l-4 border-ananim-accent' : ''
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            ))}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-ananim-surface/60 backdrop-blur border-b border-white/10 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/ananim-mark.png" alt="Ananim" className="h-8 w-8 object-contain" />
            <h1 className="text-lg font-medium font-display text-white">Ananim Manager Painel</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-300 text-sm">Bem vindo, {user.name || 'Usuário'}!</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-ananim-accent hover:underline"
            >
              Sair
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
