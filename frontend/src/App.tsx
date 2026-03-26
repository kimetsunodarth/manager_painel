import { Component, ReactNode, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Servicos from './pages/Servicos';
import DetalhesBackups from './pages/DetalhesBackups';
import Licencas from './pages/Licencas';
import Programacao from './pages/Programacao';
import ExtensaoHorario from './pages/ExtensaoHorario';
import Documentos from './pages/Documentos';
import Clientes from './pages/Clientes';
import Usuarios from './pages/Usuarios';
import Logs from './pages/Logs';
import { api } from './api/client';

function PrivateRoute({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'invalid'>(() =>
    localStorage.getItem('user') ? 'loading' : 'invalid'
  );

  useEffect(() => {
    api<{ ok: boolean }>('/auth/me', { skipGlobalErrorHandler: true })
      .then(() => setStatus('ok'))
      .catch(() => {
        localStorage.removeItem('user');
        setStatus('invalid');
      });
    // Run only once on mount
  }, []);

  if (status === 'loading') return null;
  if (status === 'invalid') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Unhandled React error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
          <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-md text-center">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Algo deu errado</h2>
            <p className="text-gray-600 text-sm mb-4">
              A página não pôde ser exibida. Verifique se o backend está rodando. Se no terminal do backend aparecer outra porta (ex.: 3002), reinicie o frontend com <code className="bg-gray-200 px-1 rounded text-xs">set VITE_API_PORT=3002 &amp;&amp; npm run dev</code>.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="servicos" element={<Servicos />} />
        <Route path="backups" element={<DetalhesBackups />} />
        <Route path="licencas" element={<Licencas />} />
        <Route path="programacao" element={<Programacao />} />
        <Route path="extensao-horario" element={<ExtensaoHorario />} />
        <Route path="documentos" element={<Documentos />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="logs" element={<Logs />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
  );
}
