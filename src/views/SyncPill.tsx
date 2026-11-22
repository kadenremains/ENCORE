import { useApp } from '../store';
import { fmtNum } from '../render/primitives';

export function SyncPill() {
  const { sync, syncError, runSync, demo } = useApp();
  if (demo) return null;
  if (syncError)
    return (
      <button className="pill error" onClick={() => runSync()} title={syncError}>
        Sync failed · retry
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
