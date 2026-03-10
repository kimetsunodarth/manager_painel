import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, getApiBaseUrl } from '../api/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user } = await auth.login(email, password);
      localStorage.setItem('user', JSON.stringify(user));
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Falha no login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md w-full max-w-sm p-8">
        <div className="flex justify-center mb-4">
          <img src="/ananim1.jpg" alt="Ananim" className="max-h-16 w-auto object-contain" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Ananim Manager Painel</h1>
        <p className="text-gray-600 text-sm mb-6">Acesso ao painel Huawei / SAP B1</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded space-y-1">
              <p>{error}</p>
                  {(error.includes('inacessível') || error.includes('requisição')) && (
                <p className="text-xs mt-1 text-red-600">
                  {getApiBaseUrl() ? (
                    <>Verifique se a API está acessível em <strong>{getApiBaseUrl()}</strong>. Veja CONFIG-README.txt na pasta de instalação.</>
                  ) : (
                    <>Se o backend estiver na porta 3002, pare o frontend (Ctrl+C) e rode: <strong>npm run dev:3002</strong></>
                  )}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <p className="text-gray-500 text-xs mt-4 text-center">
          Demo: joao@example.com / admin123
        </p>
      </div>
    </div>
  );
}
