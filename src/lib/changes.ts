/**
 * Local change tracking for cloud sync. Kept dependency-free so any module can report changes
 * without importing the sync engine (avoids import cycles).
 */
let listener: (() => void) | null = null;

export function setChangeListener(l: (() => void) | null) {
  listener = l;
}

/** Something the user made or edited locally changed; sync soon. */
export function localChanged() {
  listener?.();
}

const TOMB = 'sw.tombstones';

export function tombstones(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(TOMB) || '{}');
  } catch {
    return {};
  }
}

function saveTombstones(t: Record<string, number>) {
  try {
    localStorage.setItem(TOMB, JSON.stringify(t));
  } catch {
    /* private mode */
  }
}

/** Remember a deletion so it can be synced to other devices. */
export function markDeleted(kind: 'project' | 'image', id: string) {
  const t = tombstones();
  t[`${kind}:${id}`] = Date.now();
  // keep the list bounded
  const entries = Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 500);
  saveTombstones(Object.fromEntries(entries));
  localChanged();
}

export function clearTombstone(kind: 'project' | 'image', id: string) {
  const t = tombstones();
  if (t[`${kind}:${id}`]) {
    delete t[`${kind}:${id}`];
    saveTombstones(t);
  }
}

/** Settings that sync: date range, compare mode, milestone prefs. */
export function bumpSettings() {
  try {
    localStorage.setItem('sw.settings.updated', String(Date.now()));
  } catch {
    /* private mode */
  }
  localChanged();
}
