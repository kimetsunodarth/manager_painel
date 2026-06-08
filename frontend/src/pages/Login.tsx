import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, getApiBaseUrl } from '../api/client';
import { getErrorMessage } from '../utils/errorMessage';
const AUTH_TOKEN_KEY = 'auth_token';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [delivery, setDelivery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await auth.login(email, password);
      if (res.mfaSetupRequired && res.setupToken) {
        setSetupToken(res.setupToken);
        setQrDataUrl(res.qrDataUrl || '');
        setManualKey(res.manualKey || '');
        return;
      }
      if (res.mfaRequired && res.challengeToken) {
        setChallengeToken(res.challengeToken);
        setDelivery(res.delivery || '');
        return;
      }
      if (res.user) {
        if (res.token) localStorage.setItem(AUTH_TOKEN_KEY, res.token);
        localStorage.setItem('user', JSON.stringify(res.user));
        navigate('/');
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user, token } = await auth.verifyMfaSetup(setupToken, mfaCode);
      if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem('user', JSON.stringify(user));
      navigate('/');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user, token } = await auth.verifyMfa(challengeToken, mfaCode);
      if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
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

      <div className="relative ananim-card w-full max-w-md p-8 shadow-lg shadow-black/30 border border-cyan-400/20">
        <div className="flex justify-center mb-5">
          <div className="inline-flex items-center justify-center bg-[#061225] rounded-xl overflow-hidden h-16 px-3 border border-cyan-400/30">
            <img src="/logos/logo Ananim_Prancheta 1 cópia 10.png" alt="Ananim" className="h-12 w-auto object-contain" />
          </div>
        </div>
        <h1 className="text-3xl font-semibold font-display text-white mb-2">Ananim Manager Painel</h1>
        <p className="text-gray-300 text-sm mb-6">{setupToken ? 'Escaneie o QR Code no Microsoft/Google Authenticator' : challengeToken ? `MFA: ${delivery || 'Authenticator App'}` : 'Acesso ao painel Huawei / SAP B1'}</p>
        {!challengeToken && !setupToken ? <form onSubmit={handleSubmit} className="space-y-4">
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
            className="w-full ananim-btn-primary py-2 text-black font-semibold"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form> : setupToken ? (
          <form onSubmit={handleMfaSetupSubmit} className="space-y-4">
            {error ? <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-sm p-3 rounded-lg">{error}</div> : null}
            {qrDataUrl ? <div className="bg-white p-3 rounded-lg flex justify-center"><img src={qrDataUrl} alt="QR Code MFA" className="w-56 h-56" /></div> : null}
            {manualKey ? <p className="text-xs text-cyan-300">Chave manual: <strong>{manualKey}</strong></p> : null}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">Código do app autenticador</label>
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="ananim-input text-center tracking-[0.4em] text-lg"
                required
                minLength={6}
                maxLength={6}
                autoFocus
              />
            </div>
            <button type="submit" disabled={loading} className="w-full ananim-btn-primary py-2 text-black font-semibold">
              {loading ? 'Ativando...' : 'Ativar MFA e entrar'}
            </button>
            <button type="button" onClick={() => { setSetupToken(''); setMfaCode(''); setQrDataUrl(''); setManualKey(''); }} className="w-full ananim-btn-ghost py-2">
              Voltar
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            {error ? <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-sm p-3 rounded-lg">{error}</div> : null}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">Código MFA</label>
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="ananim-input text-center tracking-[0.4em] text-lg"
                required
                minLength={6}
                maxLength={6}
                autoFocus
              />
            </div>
            <button type="submit" disabled={loading} className="w-full ananim-btn-primary py-2 text-black font-semibold">
              {loading ? 'Validando...' : 'Validar e entrar'}
            </button>
            <button type="button" onClick={() => { setChallengeToken(''); setMfaCode(''); }} className="w-full ananim-btn-ghost py-2">
              Voltar
            </button>
          </form>
        )}
        {import.meta.env.VITE_SHOW_DEMO_CREDENTIALS === 'true' && (
          <p className="text-gray-400 text-xs mt-4 text-center">
            Demo: joao@example.com / admin123
          </p>
        )}
      </div>
    </div>
  );
}
