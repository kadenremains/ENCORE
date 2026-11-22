import { useEffect, useState } from 'react';
import { Logo } from '../ui/Logo';
import { useApp } from '../store';
import { checkHealth, startSignIn, useCloud } from '../lib/cloud';
import { API_URL } from '../config';

const AUTH_ERRORS: Record<string, string> = {
  not_configured: "Sign-in isn't switched on for this site yet. You can still connect with just your username.",
  missing_token: 'Last.fm sign-in was cancelled.',
  bad_response: 'Sign-in failed. Please try again.',
};

export function Onboard() {
  const { connect, startDemo, username: savedUser, apiKey: savedKey, authError } = useApp();
  const available = useCloud((s) => s.available);
  const builtInKey = (import.meta.env.VITE_LASTFM_API_KEY as string | undefined) || '';
  const [username, setUsername] = useState(savedUser);
  const [apiKey, setApiKey] = useState(savedKey || builtInKey);
  const [ownKey, setOwnKey] = useState(!!savedKey && savedKey !== builtInKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(authError ? (AUTH_ERRORS[authError] ?? `Sign-in failed: ${authError}`) : null);

  useEffect(() => {
    if (API_URL && !available) void checkHealth();
  }, [available]);

  // a key is only needed when neither the relay nor a built-in key can cover it
  const relayOk = !!available?.lastfm;
  const needKey = ownKey || (!relayOk && !builtInKey && (available !== null || !API_URL));
  const signIn = !!available?.signIn;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await connect(username, needKey ? apiKey : builtInKey);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboard">
      <div className="onboard-art" aria-hidden>
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>
      <div className="onboard-card grain">
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner br" />
        <span className="corner bl" />
        <div className="brand big">
          <Logo /> Encore
        </div>
        <h1>
          Your Last.fm,
          <br />
          wrapped your way
        </h1>
        <p className="lead">Any date range. Every stat. Fully custom, shareable graphics.</p>

        {signIn && (
          <>
            <button className="btn primary big" onClick={startSignIn}>
              Sign in with Last.fm
            </button>
            <p className="muted small" style={{ margin: 0 }}>
              Syncs your wrappeds, pictures and settings across your devices.
            </p>
            <div className="onboard-or">or just look someone up</div>
          </>
        )}

        <form onSubmit={submit} className="onboard-form">
          <label className="field">
            <span className="field-label">Last.fm username</span>
            <input className="text-input big" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your-username" autoCapitalize="off" autoCorrect="off" required />
          </label>
          {needKey ? (
            <label className="field">
              <span className="field-label">Last.fm API key</span>
              <input className="text-input big mono" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="32-character key" autoCapitalize="off" autoCorrect="off" required />
              <span className="field-hint">
                Free, takes 30 seconds:{' '}
                <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer">
                  create an API account
                </a>{' '}
                (any app name, leave callback blank) and copy the “API key”.
              </span>
            </label>
          ) : (
            <button
              type="button"
              className="link small-link"
              onClick={() => {
                setOwnKey(true);
                setApiKey('');
              }}
            >
              Use my own API key instead
            </button>
          )}
          {error && <p className="error">{error}</p>}
          <button className={`btn ${signIn ? '' : 'primary'} big`} disabled={busy}>
            {busy ? 'Connecting…' : signIn ? 'Continue without signing in' : 'Connect & download history'}
          </button>
        </form>
        <button className="link" onClick={() => startDemo()}>
          or try it with demo data first →
        </button>
        <p className="muted small">Your listening history is stored in your browser. Signing in only syncs what you create.</p>
      </div>
    </div>
  );
}
