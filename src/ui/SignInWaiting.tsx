import { cancelSignIn, isHomeScreenApp, pollPending, signInHereInstead } from '../lib/cloud';

/** While a Last.fm sign-in is waiting to be approved (start screen and Settings). */
export function SignInWaiting() {
  const app = isHomeScreenApp();
  return (
    <div className="waiting-box">
      <span className="cloud-dot busy" /> {app ? 'Approve Encore on Last.fm in Safari, then come back here. It signs in by itself.' : 'Approve Encore on Last.fm, then come back here. It signs in by itself.'}
      <div className="row gap wrap" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={() => void pollPending()}>
          I approved it
        </button>
        <button className="btn" onClick={cancelSignIn}>
          Cancel
        </button>
      </div>
      {app && (
        <button className="link small waiting-fallback" onClick={signInHereInstead}>
          Safari didn’t open? Sign in here instead
        </button>
      )}
    </div>
  );
}
