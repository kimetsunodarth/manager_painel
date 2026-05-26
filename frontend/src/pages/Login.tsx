import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, getApiBaseUrl } from '../api/client';
import { getErrorMessage } from '../utils/errorMessage';

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
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ananim-bg text-ananim-text flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 opacity-60 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl bg-ananim-accent/20" />
        <div className="absolute -bottom-24 -right-24 w-[30rem] h-[30rem] rounded-full blur-3xl bg-purple-500/10" />
      </div>

      <div className="relative ananim-card w-full max-w-sm p-8 shadow-lg shadow-black/30">
        <div className="flex justify-center mb-5">
          <div className="inline-flex items-center justify-center bg-white/95 rounded overflow-hidden h-14">
            <img src="/ananim-logo.png" alt="Ananim" className="h-14 w-auto object-cover px-3" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold font-display text-white mb-2">Ananim Manager Painel</h1>
        <p className="text-gray-300 text-sm mb-6">Acesso ao painel Huawei / SAP B1</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-sm p-3 rounded-lg space-y-1">
              <p>{error}</p>
                  {(error.includes('inacessível') || error.includes('requisição')) && (
                <p className="text-xs mt-1 text-red-200/80">
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
            <label className="block text-sm font-medium text-gray-200 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ananim-input"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ananim-input"
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full ananim-btn-primary py-2"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        {import.meta.env.VITE_SHOW_DEMO_CREDENTIALS === 'true' && (
          <p className="text-gray-400 text-xs mt-4 text-center">
            Demo: joao@example.com / admin123
          </p>
        )}
      </div>
    </div>
  );
}
