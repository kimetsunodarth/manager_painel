import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';

const menuItems = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/servicos', label: 'Serviços', icon: '⚙️' },
  { path: '/backups', label: 'Detalhes / Backups', icon: '📋' },
  { path: '/programacao', label: 'Programação', icon: '📅', adminOnly: true },
  { path: '/extensao-horario', label: 'Extensão de horário', icon: '⏱️', adminOnly: true },
  { path: '/documentos', label: 'Documentos', icon: '📁' },
  { path: '/clientes', label: 'Clientes', icon: '🏢', adminOnly: true },
  { path: '/usuarios', label: 'Usuários', icon: '👥', adminOnly: true },
  { path: '/logs', label: 'Log de auditoria', icon: '📜', adminOnly: true },
];

function safeUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return { name: 'Usuário', role: '' };
  }
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const user = safeUser();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <aside
        className={`bg-gray-800 text-white transition-all duration-200 ${
          sidebarOpen ? 'w-56' : 'w-16'
        } flex flex-col`}
      >
        <div className="p-3 flex items-center justify-between border-b border-gray-700">
          <Link to="/" className="flex items-center min-w-0 flex-1">
            <img src="/ananim1.jpg" alt="Ananim" className={`object-contain ${sidebarOpen ? 'max-h-8 w-auto' : 'max-h-8 max-w-8 rounded'}`} />
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded hover:bg-gray-700"
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
            .filter((item) => !('adminOnly' in item && item.adminOnly) || user.role === 'admin')
            .map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-700 ${
                  location.pathname === item.path ? 'bg-gray-700 border-l-4 border-blue-500' : ''
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            ))}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/ananim1.jpg" alt="Ananim" className="h-8 w-auto object-contain" />
            <h1 className="text-lg font-medium text-gray-800">Ananim Manager Painel</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600 text-sm">Bem vindo, {user.name || 'Usuário'}!</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-blue-600 hover:underline"
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
