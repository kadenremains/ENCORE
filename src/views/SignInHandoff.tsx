import { useApp } from '../store';
import { Logo } from '../ui/Logo';
import { continueSignInHere } from '../lib/cloud';

/**
 * Safari, after approving a sign-in that the iPhone home-screen app started. iOS can't send you back
 * to a home-screen app from a web page, so say where to go: the app picks the sign-in up by itself.
 */
export function SignInHandoff() {
  const user = useApp((s) => s.handoffUser);
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
        <div className="handoff-check" aria-hidden>
          ✓
        </div>
        <h2>Signed in{user ? ` as ${user}` : ''}</h2>
        <p>
          Now switch back to <b>Encore on your home screen</b>: swipe up from the bottom and over to it, or open it from your home screen. It finishes signing in by itself.
        </p>
        <p className="muted small">iPhones don’t let a web page open a home-screen app, so this is the one step you do yourself. You can close this tab.</p>
        <button className="link small" onClick={continueSignInHere}>
          Use Encore here in Safari instead
        </button>
      </div>
    </div>
  );
}
