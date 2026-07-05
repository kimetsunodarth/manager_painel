/**
 * Sessão de navegador: força novo login quando o navegador foi fechado e reaberto,
 * mesmo que o navegador restaure os cookies de sessão ("continuar de onde parou").
 *
 * Estratégia: marcador em sessionStorage (por aba) + BroadcastChannel para que uma
 * aba nova "adote" a sessão de outra aba já logada (não desloga em multi-abas).
 * Se nenhuma aba responde e este marcador não existe, é uma sessão nova de
 * navegador → o PrivateRoute descarta o cookie e exige credenciais.
 */

const FLAG_KEY = 'ananim_browser_session';
const CHANNEL_NAME = 'ananim-session';
const PEER_TIMEOUT_MS = 250;

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

// Abas com sessão ativa respondem ao ping de abas novas.
channel?.addEventListener('message', (ev: MessageEvent) => {
  if (ev.data === 'ping' && hasBrowserSessionFlag()) {
    channel.postMessage('pong');
  }
});

export function hasBrowserSessionFlag(): boolean {
  try {
    return sessionStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/** Marca a sessão como ativa nesta aba. Chamar após login bem-sucedido. */
export function markBrowserSessionActive(): void {
  try {
    sessionStorage.setItem(FLAG_KEY, '1');
  } catch (_) {}
}

/** Remove o marcador. Chamar no logout. */
export function clearBrowserSession(): void {
  try {
    sessionStorage.removeItem(FLAG_KEY);
  } catch (_) {}
}

/**
 * true = sessão de navegador ativa (esta aba já logou, ou outra aba aberta está logada).
 * false = sessão nova de navegador → exigir credenciais.
 */
export function ensureBrowserSession(): Promise<boolean> {
  if (hasBrowserSessionFlag()) return Promise.resolve(true);
  if (!channel) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      channel.removeEventListener('message', onMessage);
      clearTimeout(timer);
      if (ok) markBrowserSessionActive();
      resolve(ok);
    };
    const onMessage = (ev: MessageEvent) => {
      if (ev.data === 'pong') done(true);
    };
    const timer = setTimeout(() => done(false), PEER_TIMEOUT_MS);
    channel.addEventListener('message', onMessage);
    channel.postMessage('ping');
  });
}
