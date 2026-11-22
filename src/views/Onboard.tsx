import { Logo } from '../ui/Logo';
import { useState } from 'react';
import { useApp } from '../store';

export function Onboard() {
  const { connect, startDemo, username: savedUser, apiKey: savedKey, sync, view } = useApp();
  const [username, setUsername] = useState(savedUser);
  const builtInKey = (import.meta.env.VITE_LASTFM_API_KEY as string | undefined) || '';
  const [apiKey, setApiKey] = useState(savedKey || builtInKey);
  const [ownKey, setOwnKey] = useState(!builtInKey || (!!savedKey && savedKey !== builtInKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await connect(username, apiKey);
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
        <form onSubmit={submit} className="onboard-form">
          <label className="field">
            <span className="field-label">Last.fm username</span>
            <input className="text-input big" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your-username" autoCapitalize="off" autoCorrect="off" required />
          </label>
          {ownKey ? (
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
          <button className="btn primary big" disabled={busy || view === 'loading'}>
            {busy ? (sync?.total ? `Downloading history… ${Math.round((sync.done / sync.total) * 100)}%` : 'Connecting…') : 'Connect & download my history'}
          </button>
        </form>
        <button className="link" onClick={() => startDemo()}>
          or try it with demo data first →
        </button>
        <p className="muted small">Everything is stored in your browser. Nothing goes to any server except Last.fm and the image lookups.</p>
      </div>
    </div>
  );
}
