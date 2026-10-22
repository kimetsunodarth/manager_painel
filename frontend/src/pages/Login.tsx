import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { auth, getApiBaseUrl } from '../api/client';
import { getErrorMessage } from '../utils/errorMessage';
import { markBrowserSessionActive } from '../utils/browserSession';

const DESTAQUES = [
  { titulo: 'Serviços dos seus servidores, num clique.', texto: 'Inicie, pare e reinicie só o que foi liberado para você, pelo conector instalado em cada servidor.' },
  { titulo: 'Sem porta aberta, sem senha centralizada.', texto: 'O conector sai do servidor até o painel; cada pedido é assinado pela chave da máquina e fica na auditoria.' },
  { titulo: 'Horário, extensões e backups no mesmo lugar.', texto: 'Ligar fora do horário vira extensão monitorada; detalhes e backups de cada ambiente à mão.' },
];

export default function Login() {
  const [destaque, setDestaque] = useState(0);
  useEffect(() => {
    // Título alterna a cada 5 s, como no Cofre; parado para quem prefere menos movimento.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setDestaque((i) => (i + 1) % DESTAQUES.length), 5000);
    return () => clearInterval(t);
  }, []);
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
        markBrowserSessionActive();
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
      markBrowserSessionActive();
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
      markBrowserSessionActive();
      navigate('/');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-ananim-bg text-ananim-text">
      {/* Painel esquerdo, como no login do Cofre */}
      <aside className="relative hidden w-[51vw] flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{ background: 'radial-gradient(circle at 25% 20%, rgba(0,229,255,0.22), transparent 45%), radial-gradient(circle at 80% 90%, rgba(20,184,166,0.18), transparent 45%), #05080f' }}>
        <div className="flex items-center gap-3">
          <img src="/logos/logo Ananim_Prancheta 1 cópia 6.png" alt="Ananim" className="h-10 w-auto object-contain" />
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-ananim-accent">Ananim · Manager Painel</span>
        </div>
        <div className="max-w-[30rem]">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-ananim-accent">Operações em nuvem</p>
          <h1 className="mt-3 min-h-[2.3em] font-display text-[clamp(30px,3.4vw,42px)] font-bold leading-[1.12] tracking-[-0.01em] text-white" aria-live="polite">
            {DESTAQUES[destaque].titulo}
          </h1>
          <p className="mt-2 min-h-[3.2em] max-w-[430px] text-[15px] leading-relaxed text-ananim-muted">{DESTAQUES[destaque].texto}</p>
          <div className="mt-5 flex gap-2" role="tablist" aria-label="Destaques">
            {DESTAQUES.map((d, i) => (
              <button key={d.titulo} type="button" role="tab" aria-selected={i === destaque} aria-label={`Destaque ${i + 1}`}
                onClick={() => setDestaque(i)}
                className={`h-1.5 w-7 rounded-full transition-colors ${i === destaque ? 'bg-ananim-accent' : 'bg-white/20 hover:bg-white/35'}`} />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2.5">
            <span className="ananim-chip"><span className="h-2 w-2 rounded-full bg-ananim-teal" aria-hidden="true" /><b className="font-semibold text-white">MFA</b> obrigatório</span>
            <span className="ananim-chip"><b className="font-semibold text-white">Conector</b> sem porta aberta</span>
            <span className="ananim-chip"><b className="font-semibold text-white">Auditoria</b> de cada ação</span>
          </div>
          <p className="text-[12.5px] text-ananim-muted">Ananim Cloud · Huawei e SAP Business One</p>
        </div>
      </aside>

      {/* Coluna direita com o cartão de acesso */}
      <div className="flex flex-1 items-center justify-center px-4 py-10" style={{ background: '#0b0f18' }}>
        <div className="w-full max-w-[420px]">
          <div className="rounded-3xl border border-white/10 bg-ananim-surface p-7 shadow-panel">
            <div className="mb-5 flex flex-col items-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-ananim-accent/30 bg-ananim-accent/10 text-ananim-accent">
                {setupToken ? <KeyRound className="h-5 w-5" aria-hidden="true" /> : challengeToken ? <ShieldCheck className="h-5 w-5" aria-hidden="true" /> : <LockKeyhole className="h-5 w-5" aria-hidden="true" />}
              </div>
              <p className="text-sm text-ananim-muted">Ananim Manager Painel</p>
              <h2 className="mt-1 font-display text-[28px] font-semibold text-white">
                {setupToken ? 'Ativar MFA' : challengeToken ? 'Confirmar acesso' : 'Entrar no painel'}
              </h2>
            </div>

            <p className="mb-6 text-center text-sm leading-6 text-ananim-muted">
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
