import { sanitizeAlbumPrefs, useApp, type AlbumPrefs } from '../store';
import type { CompareMode } from './range';
import type { RangeSpec } from './types';
import { applyRemotePrefs, getPrefs } from './prefs';
import { MILESTONE_KEY } from './milestonePrefs';
import { markLookChosen } from './look';
import { applyRemoteFriends, useFriends } from './friends';

/** Every synced setting in one object: date range, comparison, milestones, album prefs, Settings page. */
export function getAppSettings() {
  const { exploreRange, compare, albumPrefs } = useApp.getState();
  let milestones: unknown = null;
  try {
    milestones = JSON.parse(localStorage.getItem(MILESTONE_KEY) || 'null');
  } catch {
    /* ignore */
  }
  return { range: exploreRange, compare, milestones, albums: albumPrefs, prefs: getPrefs(), friends: useFriends.getState().list };
}

/** Apply settings from another device or a backup. */
export function applyAppSettings(raw: unknown) {
  const d = (raw ?? {}) as { range?: RangeSpec; compare?: CompareMode; milestones?: unknown; albums?: AlbumPrefs; prefs?: unknown; friends?: unknown };
  if (d.friends) applyRemoteFriends(d.friends);
  try {
    if (d.range) localStorage.setItem('sw.range', JSON.stringify(d.range));
    if (d.compare) localStorage.setItem('sw.compare', d.compare);
    if (d.milestones) localStorage.setItem(MILESTONE_KEY, JSON.stringify(d.milestones));
  } catch {
    /* private mode */
  }
  const skipBefore = getPrefs().skipBatches;
  if (d.prefs) {
    applyRemotePrefs(d.prefs);
    // leaving batch-scrobbled plays in or out changes every number: rebuild
    if (getPrefs().skipBatches !== skipBefore) void useApp.getState().reloadLibrary();
    markLookChosen(true); // an account with settings already has its look
  }
  useApp.setState({ ...(d.range ? { exploreRange: d.range } : {}), ...(d.compare ? { compare: d.compare } : {}) });
  const albums = sanitizeAlbumPrefs(d.albums);
  const cur = useApp.getState().albumPrefs;
  if (!albums || JSON.stringify(albums) === JSON.stringify(cur)) return;
  // only the "looks fine" list changed: nothing to rebuild
  if (JSON.stringify({ ...albums, fine: [] }) === JSON.stringify({ ...cur, fine: [] })) {
    try {
      localStorage.setItem('sw.albums', JSON.stringify(albums));
    } catch {
      /* private mode */
    }
    useApp.setState({ albumPrefs: albums });
  } else void useApp.getState().setAlbumPrefs(albums, { fromSync: true });
}
