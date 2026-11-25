import { useState } from 'react';
import { useApp } from '../store';
import { Logo } from '../ui/Logo';
import { confirmHandoff, continueSignInHere, handoffNeedsConfirm } from '../lib/cloud';

/**
 * The browser where a sign-in was approved, when another one (the iPhone home-screen app) started
 * it. iOS can't send you back to a home-screen app from a web page, so say where to go: the app picks
 * the sign-in up by itself. If the approval came from a different connection than the app's, the
 * server holds it until you confirm here: a sign-in link someone else made would sign *them* in.
 */
export function SignInHandoff() {
  const user = useApp((s) => s.handoffUser);
  const [ask, setAsk] = useState(handoffNeedsConfirm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="onboard">
      <div className="onboard-art" aria-hidden>
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>
      <div className="onboard-card grain handoff">
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner br" />
        <span className="corner bl" />
        <div className="brand big">
          <Logo /> Encore
        </div>
        {ask ? (
          <>
            <div className="handoff-check" aria-hidden>
              ?
            </div>
            <h2>Sign in your Encore app{user ? ` as ${user}` : ''}?</h2>
            <p>Only if you just tapped Sign in in your own Encore app. If someone sent you a link to sign in, close this page: it would sign <b>them</b> in as you.</p>
            <button
              className="btn primary big"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr('');
                try {
                  await confirmHandoff();
                  setAsk(false);
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Signing in…' : 'Yes, sign in my app'}
            </button>
            {err && <p className="error small">{err}</p>}
          </>
        ) : (
          <>
            <div className="handoff-check" aria-hidden>
              ✓
            </div>
            <h2>Signed in{user ? ` as ${user}` : ''}</h2>
            <p>
              Now switch back to <b>Encore on your home screen</b>: swipe up from the bottom and over to it, or open it from your home screen. It finishes signing in by itself.
            </p>
            <p className="muted small">iPhones don’t let a web page open a home-screen app, so this is the one step you do yourself. You can close this tab.</p>
          </>
        )}
        <button className="link small" onClick={continueSignInHere}>
          Use Encore here in this browser instead
        </button>
      </div>
    </div>
  );
}
