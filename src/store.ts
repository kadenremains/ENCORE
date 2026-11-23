import { create } from 'zustand';
import { buildLibrary, type AlbumArtistList, type Library } from './lib/library';
import { db, getMeta, getStoredUser, setMeta } from './lib/db';
import { fetchAlbumArtists, fetchAlbumTrackCount, fetchUserInfo, monthStart, reconcileWindow, syncScrobbles, type SyncProgress } from './lib/lastfm';
import { loadImageState, setImageHints } from './lib/images';
import type { RangeSpec, UserInfo } from './lib/types';
import { generateDemo } from './lib/demo';
import type { CompareMode } from './lib/range';
import { consumeAuthRedirect } from './lib/cloud';
import { bumpSettings } from './lib/changes';
import { API_URL } from './config';

function loadJSON<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

const LS = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) ?? '';
    } catch {
      return '';
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

export type View = 'loading' | 'onboard' | 'app';

interface AppState {
  view: View;
  username: string;
  apiKey: string;
  demo: boolean;
  user: UserInfo | null;
  lib: Library | null;
  sync: SyncProgress | null;
  syncError: string | null;
  authError: string | null;
  exploreRange: RangeSpec;
  compare: CompareMode;
  setView: (v: View) => void;
  setExploreRange: (r: RangeSpec) => void;
  setCompare: (c: CompareMode) => void;
  init: () => Promise<void>;
  connect: (username: string, apiKey: string) => Promise<void>;
  startDemo: () => Promise<void>;
  runSync: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** switch to a Last.fm account that just signed in (from another browser view) */
  adoptUser: (name: string) => Promise<void>;
  albumPrefs: AlbumPrefs;
  setAlbumPrefs: (p: AlbumPrefs, opts?: { fromSync?: boolean }) => Promise<void>;
  reloadLibrary: () => Promise<void>;
  /** background: ask Last.fm how many songs one-song albums really have */
  checkSingles: () => Promise<void>;
  /** progress of re-checking history for edits made on Last.fm */
  editCheck: { manual: boolean; running: boolean; done: number; total: number; changed: number } | null;
  /** re-read history from Last.fm and apply edits/deletions; manual = the whole history now */
  checkEdits: (manual?: boolean) => Promise<void>;
}

function installHints(lib: Library) {
  // album / track art from Last.fm, and an artist's top album as fallback artist art
  const albumIdx = new Map<string, number>();
  lib.albums.forEach((a, i) => albumIdx.set(`${lib.artists[a.artist].name.toLowerCase()}\u0000${a.name.toLowerCase()}`, i));
  const trackIdx = new Map<string, number>();
  lib.tracks.forEach((t, i) => trackIdx.set(`${lib.artists[t.artist].name.toLowerCase()}\u0000${t.name.toLowerCase()}`, i));
  let artistArt: Map<string, string> | null = null;
  const buildArtistArt = () => {
    const counts = new Int32Array(lib.albums.length);
    for (let i = 0; i < lib.n; i++) if (lib.album[i] >= 0) counts[lib.album[i]]++;
    const best = new Map<number, number>();
    lib.albums.forEach((a, i) => {
      if (!a.img) return;
      const cur = best.get(a.artist);
      if (cur === undefined || counts[i] > counts[cur]) best.set(a.artist, i);
    });
    artistArt = new Map();
    for (const [ar, al] of best) artistArt.set(lib.artists[ar].name.toLowerCase(), lib.albums[al].img!);
  };
  setImageHints((kind, name, artist) => {
    const a = artist.toLowerCase();
    if (kind === 'album') {
      const i = albumIdx.get(`${a}\u0000${name.toLowerCase()}`);
      return i !== undefined ? lib.albums[i].img : undefined;
    }
    if (kind === 'track') {
      const i = trackIdx.get(`${a}\u0000${name.toLowerCase()}`);
      if (i === undefined) return undefined;
      const al = lib.tracks[i].album;
      return al >= 0 ? lib.albums[al].img : lib.tracks[i].img; // singles keep their own cover
    }
    if (!artistArt) buildArtistArt();
    return artistArt!.get(a);
  }, (track, artist) => {
    const i = trackIdx.get(`${artist.toLowerCase()}\u0000${track.toLowerCase()}`);
    if (i === undefined) return undefined;
    const al = lib.tracks[i].album;
    return al >= 0 ? lib.albums[al].name : undefined;
  });
}

/** Album display preferences (synced): hide one-song releases, and the ones you chose to keep. */
export interface AlbumPrefs {
  hideSingles: boolean;
  keep: string[];
}

export function loadAlbumPrefs(): AlbumPrefs {
  try {
    const v = JSON.parse(localStorage.getItem('sw.albums') || 'null');
    if (v && typeof v.hideSingles === 'boolean' && Array.isArray(v.keep)) return v;
  } catch {
    /* default */
  }
  return { hideSingles: true, keep: [] };
}

type TrackCounts = Record<string, [number, number]>; // album key -> [songs on Last.fm or -1, fetched at]

async function loadLibraryFromDb(): Promise<Library> {
  const [rows, albumArtists, trackCounts] = await Promise.all([db.scrobbles.toArray(), getMeta<AlbumArtistList>('albumArtists'), getMeta<TrackCounts>('albumTrackCounts')]);
  const prefs = loadAlbumPrefs();
  const counts: Record<string, number> = {};
  for (const [k, [n]] of Object.entries(trackCounts ?? {})) counts[k] = n;
  const lib = buildLibrary(rows, { albumArtists, albumTrackCounts: counts, hideSingles: prefs.hideSingles, keepAlbums: new Set(prefs.keep) });
  installHints(lib);
  return lib;
}

let checkingSingles = false;
let checkingEdits = false;
let manualEditQueued = false;

export const useApp = create<AppState>((set, get) => ({
  view: 'loading',
  username: LS.get('sw.username'),
  apiKey: LS.get('sw.apiKey') || (import.meta.env.VITE_LASTFM_API_KEY as string | undefined) || '',
  demo: LS.get('sw.demo') === '1',
  user: null,
  lib: null,
  sync: null,
  syncError: null,
  authError: null,
  exploreRange: loadJSON<RangeSpec>('sw.range', { preset: 'this-year' }),
  compare: (LS.get('sw.compare') as CompareMode) || 'previous',

  setView: (view) => set({ view }),
  setExploreRange: (exploreRange) => {
    LS.set('sw.range', JSON.stringify(exploreRange));
    set({ exploreRange });
    bumpSettings();
  },
  setCompare: (compare) => {
    LS.set('sw.compare', compare);
    set({ compare });
    bumpSettings();
  },

  init: async () => {
    // back from "Sign in with Last.fm"?
    const auth = consumeAuthRedirect();
    if (auth?.error) set({ authError: auth.error });
    if (auth?.user) {
      const cur = get().username;
      if (get().demo || !cur || cur.toLowerCase() !== auth.user.toLowerCase()) {
        if (get().demo) {
          await db.scrobbles.clear();
          await db.meta.clear();
        }
        LS.set('sw.username', auth.user);
        LS.set('sw.demo', '0');
        set({ username: auth.user, demo: false });
      }
    }
    await loadImageState();
    const { username, demo } = get();
    if (!username && !demo) return set({ view: 'onboard' });
    const user = (await getStoredUser()) ?? null;
    const lib = await loadLibraryFromDb();
    set({ user, lib, view: 'app' });
    if (!demo && username) get().runSync();
  },

  connect: async (username, apiKey) => {
    set({ syncError: null });
    const user = await fetchUserInfo(username.trim(), apiKey.trim());
    LS.set('sw.username', user.name);
    LS.set('sw.apiKey', apiKey.trim());
    LS.set('sw.demo', '0');
    if (get().demo) await db.scrobbles.clear();
    await setMeta('user', user);
    set({ username: user.name, apiKey: apiKey.trim(), user, demo: false, view: 'app', lib: await loadLibraryFromDb() });
    await get().runSync();
  },

  startDemo: async () => {
    await db.scrobbles.clear();
    await db.meta.clear();
    const rows = generateDemo();
    await db.scrobbles.bulkAdd(rows);
    const user: UserInfo = { name: 'demo', playcount: rows.length, registered: rows[0].ts };
    await setMeta('user', user);
    LS.set('sw.demo', '1');
    set({ demo: true, user, lib: await loadLibraryFromDb(), view: 'app' });
  },

  runSync: async () => {
    const { username, apiKey, sync, demo } = get();
    if (demo || !username || (!apiKey && !API_URL)) return;
    if (sync && sync.phase !== 'done' && sync.phase !== 'error') return;
    set({ syncError: null });
    try {
      fetchUserInfo(username, apiKey)
        .then(async (user) => {
          await setMeta('user', user);
          set({ user });
        })
        .catch(() => {});
      let lastRefresh = Date.now();
      const added = await syncScrobbles(username, apiKey, (p) => {
        set({ sync: p });
        // refresh the in-memory library every so often during a long first sync
        if (p.phase === 'fetching' && Date.now() - lastRefresh > 15000) {
          lastRefresh = Date.now();
          loadLibraryFromDb().then((lib) => set({ lib }));
        }
      });
      // album artists (Last.fm's grouping) - refresh after new scrobbles, at most every 6 hours
      let albumsChanged = false;
      try {
        const at = (await getMeta<number>('albumArtistsAt')) ?? 0;
        if (!at || (added > 0 && Date.now() - at > 6 * 3600_000) || Date.now() - at > 3 * 86400_000) {
          const list = await fetchAlbumArtists(username, apiKey);
          await setMeta('albumArtists', list);
          await setMeta('albumArtistsAt', Date.now());
          albumsChanged = true;
        }
      } catch {
        /* not critical: albums fall back to the song artist */
      }
      if (added > 0 || albumsChanged || !get().lib?.n) set({ lib: await loadLibraryFromDb() });
      set({ sync: { phase: 'done', done: added, total: added } });
      void get().checkSingles();
      void get().checkEdits();
    } catch (e) {
      set({ sync: { phase: 'error', done: 0, total: 0 }, syncError: (e as Error).message });
    }
  },

  albumPrefs: loadAlbumPrefs(),
  editCheck: null,

  checkEdits: async (manual = false) => {
    const { username, apiKey, demo, lib } = get();
    if (demo || !username || (!apiKey && !API_URL) || !lib?.n) return;
    if (checkingEdits) {
      // a background check is mid-run: do the full pass right after it
      if (manual) {
        manualEditQueued = true;
        set({ editCheck: { manual: true, running: true, done: 0, total: 0, changed: 0 } });
      }
      return;
    }
    checkingEdits = true;
    const now = Math.floor(Date.now() / 1000);
    const firstTs = lib.ts[0];
    const recentFrom = now - 14 * 86400;
    let changed = 0;
    try {
      // 1) the last two weeks, every time (most edits happen soon after listening)
      if (await reconcileWindow(username, apiKey, recentFrom, now)) changed++;

      // 2) older history, a month at a time, newest first. In the background only a couple of
      //    months per sync, cycling through everything every few days; manual = all of it now.
      let cursor = (await getMeta<number>('editCursor')) ?? null;
      const passAt = (await getMeta<number>('editPassAt')) ?? 0;
      if (manual) cursor = recentFrom;
      else if (cursor === null && Date.now() - passAt > 3 * 86400_000) cursor = recentFrom;
      if (cursor !== null) {
        let months = 0;
        for (let c = cursor; c > firstTs; c = monthStart(c - 1)) months++;
        let done = 0;
        if (manual) set({ editCheck: { manual: true, running: true, done, total: months, changed } });
        let budget = manual ? Infinity : 2;
        while (cursor > firstTs && budget-- > 0) {
          const from = Math.max(monthStart(cursor - 1), firstTs);
          if (await reconcileWindow(username, apiKey, from, cursor - 1)) changed++;
          cursor = from;
          done++;
          await setMeta('editCursor', cursor);
          if (manual) set({ editCheck: { manual: true, running: true, done, total: months, changed } });
        }
        if (cursor <= firstTs) {
          await setMeta('editCursor', null);
          await setMeta('editPassAt', Date.now());
        }
      }
      if (changed) {
        // names changed: refresh Last.fm's album grouping too, then rebuild everything
        try {
          await setMeta('albumArtists', await fetchAlbumArtists(username, apiKey));
          await setMeta('albumArtistsAt', Date.now());
        } catch {
          /* rebuild with what we have */
        }
        set({ lib: await loadLibraryFromDb() });
        void get().checkSingles();
      }
      if (manual) set({ editCheck: { manual: true, running: false, done: get().editCheck?.total ?? 0, total: get().editCheck?.total ?? 0, changed } });
    } catch (e) {
      if (manual) set({ editCheck: null, syncError: `Couldn't finish checking for edits: ${(e as Error).message}` });
      console.warn('edit check failed', e);
    } finally {
      checkingEdits = false;
      if (manualEditQueued) {
        manualEditQueued = false;
        void get().checkEdits(true);
      }
    }
  },

  setAlbumPrefs: async (p, opts) => {
    try {
      localStorage.setItem('sw.albums', JSON.stringify(p));
    } catch {
      /* private mode */
    }
    set({ albumPrefs: p });
    if (!opts?.fromSync) bumpSettings();
    await get().reloadLibrary();
  },

  reloadLibrary: async () => {
    if (!get().lib) return;
    set({ lib: await loadLibraryFromDb() });
  },

  checkSingles: async () => {
    if (checkingSingles) return;
    const { username, apiKey, demo } = get();
    if (demo || !username || (!apiKey && !API_URL)) return;
    checkingSingles = true;
    try {
      const counts: TrackCounts = (await getMeta<TrackCounts>('albumTrackCounts')) ?? {};
      // re-ask about albums Last.fm didn't know after 30 days
      const stale = Date.now() - 30 * 86400_000;
      for (const [k, [n, at]] of Object.entries(counts)) if (n === -1 && at < stale) delete counts[k];
      const todo = (get().lib?.singleCandidates ?? []).filter((c) => !counts[c.key]);
      let sinceSave = 0;
      let next = 0;
      // two at a time with a pause each: ~4 requests/s, under Last.fm's 5/s guideline
      const worker = async () => {
        while (next < todo.length) {
          const c = todo[next++];
          try {
            counts[c.key] = [await fetchAlbumTrackCount(c.artist, c.name, apiKey), Date.now()];
          } catch {
            continue; // network / rate limit: try this one next time
          }
          await new Promise((r) => setTimeout(r, 300));
          if (++sinceSave >= 60) {
            sinceSave = 0;
            await setMeta('albumTrackCounts', counts);
            await get().reloadLibrary();
          }
        }
      };
      await Promise.all([worker(), worker()]);
      await setMeta('albumTrackCounts', counts);
      if (todo.length) await get().reloadLibrary();
    } finally {
      checkingSingles = false;
    }
  },

  adoptUser: async (name) => {
    const { username, demo } = get();
    if (!demo && username && username.toLowerCase() === name.toLowerCase()) return;
    if (demo) {
      await db.scrobbles.clear();
      await db.meta.clear();
    }
    LS.set('sw.username', name);
    LS.set('sw.demo', '0');
    set({ username: name, demo: false, user: null, view: 'app', lib: await loadLibraryFromDb() });
    await get().runSync();
  },

  disconnect: async () => {
    LS.set('sw.username', '');
    LS.set('sw.demo', '0');
    await db.scrobbles.clear();
    await db.meta.clear();
    set({ username: '', user: null, lib: null, demo: false, view: 'onboard', sync: null });
  },

}));
