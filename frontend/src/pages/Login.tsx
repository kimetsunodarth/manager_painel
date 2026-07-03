import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { auth, getApiBaseUrl } from '../api/client';
import { getErrorMessage } from '../utils/errorMessage';

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
      const { user } = await auth.verifyMfaSetup(setupToken, mfaCode);
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
      const { user } = await auth.verifyMfa(challengeToken, mfaCode);
      localStorage.setItem('user', JSON.stringify(user));
      navigate('/');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-ananim-bg text-ananim-text">
      <div className="absolute inset-0 bg-ananim-grid bg-[size:26px_26px] opacity-[0.08] pointer-events-none" />
      <div className="absolute inset-0 bg-ananim-glow opacity-80 pointer-events-none" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[1.1fr_minmax(420px,520px)] lg:gap-10 lg:px-8">
        <section className="hidden lg:block">
          <div className="max-w-xl space-y-6">
            <span className="ananim-page-eyebrow">Painel enterprise</span>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold leading-tight text-white xl:text-5xl">
                Operação Huawei e SAP com visual mais claro, seguro e técnico.
              </h1>
              <p className="text-base leading-7 text-ananim-textSoft">
                A nova direção visual segue a identidade dark da Ananim, melhora leitura de formulários e deixa o fluxo de autenticação mais confiável para uso diário.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="ananim-metric">
                <p className="ananim-metric-label">Segurança</p>
                <p className="ananim-metric-value">MFA guiado</p>
              </div>
              <div className="ananim-metric">
                <p className="ananim-metric-label">Tipografia</p>
                <p className="ananim-metric-value">Leitura técnica</p>
              </div>
              <div className="ananim-metric">
                <p className="ananim-metric-label">Acesso</p>
                <p className="ananim-metric-value">Estados claros</p>
              </div>
            </div>
          </div>
        </section>

        <div className="relative w-full max-w-lg">
          <div className="absolute -inset-1 rounded-[28px] bg-gradient-to-br from-ananim-accent/20 via-transparent to-sky-400/10 blur-2xl" />
          <div className="relative ananim-card border-white/10 p-6 sm:p-8 lg:p-9">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-ananim-accent/20 bg-white/[0.04] shadow-panel-sm">
                  <img src="/logos/logo Ananim_Prancheta 1 cópia 10.png" alt="Ananim" className="h-11 w-auto object-contain" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ananim-accent">Ananim Manager</p>
                  <h2 className="mt-2 text-3xl font-semibold text-white">Entrar no painel</h2>
                </div>
              </div>
              <div className="hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-ananim-accent sm:block">
                {setupToken ? <KeyRound className="h-5 w-5" /> : challengeToken ? <ShieldCheck className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
              </div>
            </div>

            <p className="mb-6 text-sm leading-6 text-ananim-textSoft">
              {setupToken
                ? 'Escaneie o QR Code no Microsoft ou Google Authenticator e confirme o código para concluir a ativação.'
                : challengeToken
                  ? `Valide o MFA via ${delivery || 'Authenticator App'} para liberar o acesso.`
                  : 'Use suas credenciais para acessar o painel Huawei / SAP B1 com autenticação reforçada.'}
            </p>

            {!challengeToken && !setupToken ? <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="ananim-alert-danger space-y-1">
                  <p>{error}</p>
                    {(error.includes('inacessível') || error.includes('requisição')) && (
                  <p className="text-xs text-red-100/90">
                    {getApiBaseUrl() ? (
                      <>Verifique se a API está acessível em <strong>{getApiBaseUrl()}</strong>. Veja `CONFIG-README.txt` na pasta de instalação.</>
                    ) : (
                      <>Se o backend estiver na porta 3002, pare o frontend e rode <span className="ananim-kbd">npm run dev:3002</span>.</>
                    )}
                  </p>
                )}
                </div>
              )}
              <div>
                <label className="ananim-label">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ananim-input"
                  required
                  autoComplete="email"
                  placeholder="voce@empresa.com"
                />
              </div>
              <div>
                <label className="ananim-label">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ananim-input"
                  required
                  autoComplete="current-password"
                  placeholder="Sua senha de acesso"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full ananim-btn-primary"
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form> : setupToken ? (
              <form onSubmit={handleMfaSetupSubmit} className="space-y-4">
                {error ? <div className="ananim-alert-danger">{error}</div> : null}
                {qrDataUrl ? (
                  <div className="rounded-3xl border border-white/10 bg-white p-4 shadow-panel-sm">
                    <img src={qrDataUrl} alt="QR Code MFA" className="mx-auto h-56 w-56" />
                  </div>
                ) : null}
                {manualKey ? (
                  <div className="rounded-2xl border border-ananim-accent/20 bg-ananim-accent/10 p-3 text-sm text-ananim-textSoft">
                    <p className="ananim-metric-label">Chave manual</p>
                    <p className="mt-2 break-all font-mono text-sm text-ananim-accent">{manualKey}</p>
                  </div>
                ) : null}
                <div>
                  <label className="ananim-label">Código do app autenticador</label>
                  <input
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="ananim-input text-center font-mono text-xl tracking-[0.45em]"
                    required
                    minLength={6}
                    maxLength={6}
                    autoFocus
                    inputMode="numeric"
                    placeholder="000000"
                  />
                </div>
                <button type="submit" disabled={loading} className="w-full ananim-btn-primary">
                  {loading ? 'Ativando...' : 'Ativar MFA e entrar'}
                </button>
                <button type="button" onClick={() => { setSetupToken(''); setMfaCode(''); setQrDataUrl(''); setManualKey(''); }} className="w-full ananim-btn-ghost">
                  Voltar
                </button>
              </form>
            ) : (
              <form onSubmit={handleMfaSubmit} className="space-y-4">
                {error ? <div className="ananim-alert-danger">{error}</div> : null}
                <div>
                  <label className="ananim-label">Código MFA</label>
                  <input
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="ananim-input text-center font-mono text-xl tracking-[0.45em]"
                    required
                    minLength={6}
                    maxLength={6}
                    autoFocus
                    inputMode="numeric"
                    placeholder="000000"
                  />
                </div>
                <button type="submit" disabled={loading} className="w-full ananim-btn-primary">
                  {loading ? 'Validando...' : 'Validar e entrar'}
                </button>
                <button type="button" onClick={() => { setChallengeToken(''); setMfaCode(''); }} className="w-full ananim-btn-ghost">
                  Voltar
                </button>
              </form>
            )}
            {import.meta.env.VITE_SHOW_DEMO_CREDENTIALS === 'true' && (
              <p className="mt-5 text-center text-xs text-ananim-muted">
                Demo: joao@example.com / admin123
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
