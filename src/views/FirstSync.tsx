import { useApp } from '../store';
import { Logo } from '../ui/Logo';
import { fmtNum } from '../render/primitives';

/** Shown while a brand-new account's history downloads for the first time. */
export function FirstSync() {
  const { sync, syncError, runSync, disconnect, username } = useApp();
  const pct = sync?.total ? Math.min(100, (sync.done / sync.total) * 100) : 0;
  return (
    <div className="onboard">
      <div className="onboard-card grain">
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner br" />
        <span className="corner bl" />
        <div className="brand big">
          <Logo /> Encore
        </div>
        {syncError ? (
          <>
            <h1>Couldn't download</h1>
            <p className="error">{syncError}</p>
            <div className="row gap">
              <button className="btn primary" onClick={() => runSync()}>
                Try again
              </button>
              <button className="btn" onClick={() => disconnect()}>
                Start over
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="eyebrow">{username}</div>
            <h1>Downloading your history</h1>
            <p className="lead">This happens once. After that, only new scrobbles are fetched.</p>
            <div className="first-sync-bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="muted small">{sync?.total ? `${fmtNum(sync.done)} of ${fmtNum(sync.total)} scrobbles` : 'Connecting to Last.fm…'}</div>
          </>
        )}
      </div>
    </div>
  );
}
