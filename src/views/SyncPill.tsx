import { useApp } from '../store';
import { fmtNum } from '../render/primitives';
import { LASTFM_DOWN } from '../lib/lastfm';

export function SyncPill() {
  const { sync, syncError, runSync, demo, editCheck } = useApp();
  if (demo) return null;
  if (editCheck?.manual && editCheck.running) {
    const pct = editCheck.total ? Math.min(100, (editCheck.done / editCheck.total) * 100) : 0;
    return (
      <span className="pill syncing">
        <span className="spinner" />
        Checking for edits {editCheck.done}/{editCheck.total} months
        <span className="pill-bar" style={{ width: `${pct}%` }} />
      </span>
    );
  }
  if (editCheck?.manual && !editCheck.running)
    return (
      <button className="pill" onClick={() => useApp.setState({ editCheck: null })} title="Dismiss">
        ✓ {editCheck.changed ? `Edits applied in ${editCheck.changed} month${editCheck.changed > 1 ? 's' : ''}` : 'No edits found, all up to date'}
      </button>
    );
  if (syncError)
    return (
      <button className="pill error" onClick={() => runSync()} title={syncError}>
        {syncError === LASTFM_DOWN ? 'Last.fm is down · retry' : 'Sync failed · retry'}
      </button>
    );
  if (sync && (sync.phase === 'fetching' || sync.phase === 'starting')) {
    const pct = sync.total ? Math.min(100, (sync.done / sync.total) * 100) : 0;
    return (
      <span className="pill syncing">
        <span className="spinner" />
        {sync.total ? `Syncing ${fmtNum(sync.done)} / ${fmtNum(sync.total)}` : 'Checking for new scrobbles…'}
        {sync.total > 0 && <span className="pill-bar" style={{ width: `${pct}%` }} />}
      </span>
    );
  }
  return (
    <button className="pill" onClick={() => runSync()} title="Fetch new scrobbles">
      ✓ Up to date{sync?.phase === 'done' && sync.done > 0 ? ` · +${fmtNum(sync.done)}` : ''}
    </button>
  );
}
