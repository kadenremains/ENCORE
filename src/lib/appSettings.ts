import { useApp, type AlbumPrefs } from '../store';
import type { CompareMode } from './range';
import type { RangeSpec } from './types';
import { applyRemotePrefs, getPrefs } from './prefs';
import { MILESTONE_KEY } from './milestonePrefs';
import { markLookChosen } from './look';

/** Every synced setting in one object: date range, comparison, milestones, album prefs, Settings page. */
export function getAppSettings() {
  const { exploreRange, compare, albumPrefs } = useApp.getState();
  let milestones: unknown = null;
  try {
    milestones = JSON.parse(localStorage.getItem(MILESTONE_KEY) || 'null');
  } catch {
    /* ignore */
  }
  return { range: exploreRange, compare, milestones, albums: albumPrefs, prefs: getPrefs() };
}

/** Apply settings from another device or a backup. */
export function applyAppSettings(raw: unknown) {
  const d = (raw ?? {}) as { range?: RangeSpec; compare?: CompareMode; milestones?: unknown; albums?: AlbumPrefs; prefs?: unknown };
  try {
    if (d.range) localStorage.setItem('sw.range', JSON.stringify(d.range));
    if (d.compare) localStorage.setItem('sw.compare', d.compare);
    if (d.milestones) localStorage.setItem(MILESTONE_KEY, JSON.stringify(d.milestones));
  } catch {
    /* private mode */
  }
  if (d.prefs) {
    applyRemotePrefs(d.prefs);
    markLookChosen(true); // an account with settings already has its look
  }
  useApp.setState({ ...(d.range ? { exploreRange: d.range } : {}), ...(d.compare ? { compare: d.compare } : {}) });
  if (d.albums && JSON.stringify(d.albums) !== JSON.stringify(useApp.getState().albumPrefs)) void useApp.getState().setAlbumPrefs(d.albums, { fromSync: true });
}
