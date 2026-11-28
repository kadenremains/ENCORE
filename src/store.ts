import { create } from 'zustand';
import { buildLibrary, type AlbumArtistList, type Library } from './lib/library';
import { db, getMeta, getStoredUser, setMeta } from './lib/db';
import { scrobbleStore } from './lib/scrobbleStore';
import { fetchAlbumArtists, fetchAlbumTrackCount, fetchUserInfo, monthStart, reconcileWindow, syncScrobbles, type SyncProgress } from './lib/lastfm';
import { loadImageState, setImageHints } from './lib/images';
import type { RangeSpec, StoredScrobble, UserInfo } from './lib/types';
import type { CompareMode } from './lib/range';
import { consumeAuthRedirect, formerNames } from './lib/cloud';
import { bumpSettings } from './lib/changes';
import { API_URL } from './config';
import { getPrefs } from './lib/prefs';
import { findBatches, tidyNames, type Garbled } from './lib/tidy';
import { resetFriends } from './lib/friends';
import { applyFixes, findMismatches, fineKey, fixesFor, type Fix, type Mismatch } from './lib/mismatches';

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

/** handoff: a sign-in started in the iPhone home-screen app finished here in Safari */
export type View = 'loading' | 'onboard' | 'app' | 'handoff';

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
  /** the account a home-screen-app sign-in finished for (view 'handoff') */
  handoffUser: string;
  /** why we're on the start screen (e.g. signed out) */
  notice: string | null;
  /** signed out of sync: back to the start screen until they sign in or choose to continue without */
  signedOut: (why: string) => void;
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
  /** mismatched scrobbles (null while they're still being found) */
  mismatches: Mismatch[] | null;
  /** merge mismatches in Encore: [mismatch, index of the name to keep] */
  mergeMismatches: (list: [Mismatch, number][]) => Promise<void>;
  /** undo merges (by mismatch id), or all of them */
  undoMerges: (ids: string[] | 'all') => Promise<void>;
  /** mark mismatches as fine, or bring every one back ('reset') */
  markFine: (list: Mismatch[] | 'reset') => Promise<void>;
  reloadLibrary: () => Promise<void>;
  /** background: ask Last.fm how many songs one-song albums really have */
  checkSingles: () => Promise<void>;
  /** progress of re-checking history for edits made on Last.fm */
  editCheck: { manual: boolean; running: boolean; done: number; total: number; changed: number } | null;
  /** re-read history from Last.fm and apply edits/deletions; manual = the whole history now */
  checkEdits: (manual?: boolean) => Promise<void>;
  /** use your own Last.fm API key ('' = go through Encore's server); checks the key first */
  setApiKey: (key: string) => Promise<void>;
  /** throw away the downloaded history and download it all again */
  redownloadHistory: () => Promise<void>;
  /** ask Last.fm again how it groups your albums (album artists) */
  refreshAlbumGrouping: () => Promise<void>;
  /** forget what Last.fm said about one-song albums and ask again */
  recheckSingles: () => Promise<void>;
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
    return al >= 0 ? { name: lib.albums[al].name, artist: lib.artists[lib.albums[al].artist].name } : undefined;
  });
}

/**
 * Album display preferences (synced): hide one-song releases, the ones you chose to keep, and how
 * you've cleaned up mismatched scrobbles (merges, and the ones you said are fine).
 */
export interface AlbumPrefs {
  hideSingles: boolean;
  keep: string[];
  fixes?: Fix[];
  fine?: string[];
}

const isFix = (f: unknown): f is Fix => {
  const x = f as Fix;
  return !!x && typeof x === 'object' && ['artist', 'album', 'track', 'song-album'].includes(x.k) && typeof x.from === 'string' && typeof x.to === 'string' && typeof x.g === 'string';
};

export function sanitizeAlbumPrefs(v: unknown): AlbumPrefs | null {
  const x = v as AlbumPrefs | null;
  if (!x || typeof x.hideSingles !== 'boolean' || !Array.isArray(x.keep)) return null;
  return {
    hideSingles: x.hideSingles,
    keep: x.keep.filter((k) => typeof k === 'string'),
    fixes: Array.isArray(x.fixes) ? x.fixes.filter(isFix) : [],
    fine: Array.isArray(x.fine) ? x.fine.filter((k) => typeof k === 'string') : [],
  };
}

export function loadAlbumPrefs(): AlbumPrefs {
  try {
    const v = sanitizeAlbumPrefs(JSON.parse(localStorage.getItem('sw.albums') || 'null'));
    if (v) return v;
  } catch {
    /* default */
  }
  return { hideSingles: true, keep: [], fixes: [], fine: [] };
}

/**
 * Finding mismatches reads the whole history (~0.2 s for 150k plays), so it runs after the library
 * is on screen, when the browser is idle. A newer load cancels an older one.
 */
let mismatchRun = 0;
function findMismatchesLater(rows: StoredScrobble[]) {
  const run = ++mismatchRun;
  const go = () => {
    if (run !== mismatchRun) return;
    useApp.setState({ mismatches: findMismatches(rows) });
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(go, { timeout: 2000 });
  else setTimeout(go, 400);
}

type TrackCounts = Record<string, [number, number]>; // album key -> [songs on Last.fm or -1, fetched at]

/** The demo while it's still being saved in the background: rebuilds read this, not a half-saved history. */
let unsavedDemo: StoredScrobble[] | null = null;

async function loadLibraryFromDb(rowsInMemory?: StoredScrobble[]): Promise<Library> {
  const inMemory = rowsInMemory ?? (unsavedDemo && useApp.getState().demo ? [...unsavedDemo] : null);
  const [rows, albumArtists, trackCounts] = await Promise.all([inMemory ?? scrobbleStore.all(), getMeta<AlbumArtistList>('albumArtists'), getMeta<TrackCounts>('albumTrackCounts')]);
  const prefs = loadAlbumPrefs();
  const counts: Record<string, number> = {};
  for (const [k, [n]] of Object.entries(trackCounts ?? {})) counts[k] = n;
  // tidy, then your merges from Clean up; the stored history stays exactly as Last.fm has it
  rows.sort((a, b) => a.ts - b.ts);
  const garbled: Garbled[] = [];
  const { rows: listened, batches } = findBatches(tidyNames(rows, garbled), getPrefs().skipBatches);
  const fixed = applyFixes(listened, prefs.fixes);
  const lib = buildLibrary(fixed, { albumArtists, albumTrackCounts: counts, hideSingles: prefs.hideSingles, keepAlbums: new Set(prefs.keep) });
  lib.batches = batches;
  lib.garbled = garbled.reverse(); // newest first
  const orig: NonNullable<Library['orig']> = new Map();
  for (let i = 0; i < fixed.length; i++) {
    const o = fixed[i].orig;
    if (!o) continue;
    const r = fixed[i];
    // only the names that differ from what's shown (Last.fm's spelling of them)
    const d: { ar?: string; tr?: string; al?: string; merged: boolean } = { merged: o.merged };
    if (o.ar !== r.ar) d.ar = o.ar;
    if (o.tr !== r.tr) d.tr = o.tr;
    if (o.al !== r.al) d.al = o.al;
    if (d.ar !== undefined || d.tr !== undefined || d.al !== undefined) orig.set(i, d);
  }
  lib.orig = orig;
  installHints(lib);
  findMismatchesLater(fixed);
  return lib;
}

/**
 * Make this browser's downloaded data belong to `name`. Demo data, or another account's history
 * and caches (album grouping, edit-check progress, profile), are wiped first; the same account
 * under a new Last.fm name (the server knows its former names) keeps everything.
 */
async function claimLocalData(name: string, wasDemo: boolean) {
  const owner = (await getMeta<string>('syncedUser')) ?? (await getStoredUser())?.name;
  if (!wasDemo && owner && owner.toLowerCase() !== name.toLowerCase() && (await formerNames()).includes(owner.toLowerCase())) {
    // the same Last.fm account under its new name: everything here is still theirs
    await setMeta('syncedUser', name);
    return;
  }
  if (wasDemo || (owner && owner.toLowerCase() !== name.toLowerCase())) {
    await scrobbleStore.clear();
    await db.meta.clear();
    await resetFriends(); // the other account's friends aren't this one's
  }
}

/**
 * Downloads and edit checks both rewrite the stored history. Run them one at a time, or a sync
 * that lands while an edit check is replacing the same days would store those scrobbles twice.
 */
let historyQueue: Promise<unknown> = Promise.resolve();
function withHistory<T>(fn: () => Promise<T>): Promise<T> {
  const run = historyQueue.then(fn, fn);
  historyQueue = run.catch(() => {});
  return run;
}

function clearSignedOut(set: (s: Partial<AppState>) => void) {
  LS.set('sw.signedOut', '');
  set({ notice: null });
}

let checkingSingles = false;
let checkingEdits = false;
let manualEditQueued = false;

export const useApp = create<AppState>((set, get) => ({
  view: 'loading',
  username: LS.get('sw.username'),
  apiKey: LS.get('sw.apiKey'),
  demo: LS.get('sw.demo') === '1',
  user: null,
  lib: null,
  sync: null,
  syncError: null,
  authError: null,
  handoffUser: '',
  notice: LS.get('sw.signedOut') || null,
  exploreRange: loadJSON<RangeSpec>('sw.range', { preset: 'this-year' }),
  compare: (LS.get('sw.compare') as CompareMode) || 'previous',

  setView: (view) => set({ view }),

  signedOut: (why) => {
    LS.set('sw.signedOut', why);
    set({ view: 'onboard', notice: why });
  },
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
    if (auth?.handoff) return set({ view: 'handoff', handoffUser: auth.user ?? '' });
    if (auth?.error) set({ authError: auth.error });
    if (auth?.user) {
      const cur = get().username;
      if (get().demo || !cur || cur.toLowerCase() !== auth.user.toLowerCase()) {
        await claimLocalData(auth.user, get().demo);
        LS.set('sw.username', auth.user);
        LS.set('sw.demo', '0');
        set({ username: auth.user, demo: false });
      }
    }
    if (get().demo && !(await getMeta<boolean>('demoSaved'))) {
      await loadImageState();
      return get().startDemo(); // the demo was closed before it finished saving
    }
    const { username, demo } = get();
    // signed out of sync earlier and hasn't chosen how to continue: start screen again
    if (get().notice && !auth?.user) {
      await loadImageState();
      return set({ view: 'onboard' });
    }
    if (auth?.user) clearSignedOut(set);
    if (!username && !demo) {
      await loadImageState();
      return set({ view: 'onboard' });
    }
    // these don't depend on each other: read them side by side
    const [, user, lib] = await Promise.all([loadImageState(), getStoredUser(), loadLibraryFromDb()]);
    set({ user: user ?? null, lib, view: 'app' });
    if (!demo && username) get().runSync();
  },

  connect: async (username, apiKey) => {
    set({ syncError: null });
    clearSignedOut(set);
    const user = await fetchUserInfo(username.trim(), apiKey.trim());
    LS.set('sw.username', user.name);
    LS.set('sw.apiKey', apiKey.trim());
    LS.set('sw.demo', '0');
    await claimLocalData(user.name, get().demo);
    await setMeta('user', user);
    set({ username: user.name, apiKey: apiKey.trim(), user, demo: false, view: 'app', lib: await loadLibraryFromDb() });
    await get().runSync();
  },

  startDemo: async () => {
    clearSignedOut(set);
    await scrobbleStore.clear();
    await db.meta.clear();
    // the demo's catalog only downloads when someone opens the demo
    const { generateDemo } = await import('./lib/demo');
    const rows = generateDemo();
    const user: UserInfo = { name: 'demo', playcount: rows.length, registered: rows[0].ts };
    await setMeta('user', user);
    LS.set('sw.demo', '1');
    // show it straight from memory; saving ~150k scrobbles to storage happens in the background
    unsavedDemo = rows;
    set({ demo: true, user, lib: await loadLibraryFromDb([...rows]), view: 'app' });
    void (async () => {
      try {
        if (!get().demo) return; // left the demo meanwhile
        await scrobbleStore.add(rows); // packed, it's one quick write
        await setMeta('demoSaved', true);
      } finally {
        if (unsavedDemo === rows) unsavedDemo = null;
      }
    })();
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
      const added = await withHistory(() => syncScrobbles(username, apiKey, (p) => {
        set({ sync: p });
        // refresh the in-memory library every so often during a long first sync
        if (p.phase === 'fetching' && Date.now() - lastRefresh > 15000) {
          lastRefresh = Date.now();
          loadLibraryFromDb().then((lib) => set({ lib }));
        }
      }));
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
      if (getPrefs().autoEditCheck) void get().checkEdits();
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
      if (await withHistory(() => reconcileWindow(username, apiKey, recentFrom, now))) changed++;

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
          const end = cursor - 1;
          if (await withHistory(() => reconcileWindow(username, apiKey, from, end))) changed++;
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

  mismatches: null,

  mergeMismatches: async (list) => {
    const p = get().albumPrefs;
    const ids = new Set(list.map(([m]) => m.id));
    // merging again replaces an earlier merge of the same mismatch
    const keep = (p.fixes ?? []).filter((f) => !ids.has(f.g));
    set({ mismatches: get().mismatches?.filter((m) => !ids.has(m.id)) ?? null }); // gone straight away; the rebuild confirms it
    await get().setAlbumPrefs({ ...p, fixes: [...keep, ...list.flatMap(([m, i]) => fixesFor(m, i))] });
  },

  undoMerges: async (ids) => {
    const p = get().albumPrefs;
    const drop = ids === 'all' ? null : new Set(ids);
    await get().setAlbumPrefs({ ...p, fixes: drop ? (p.fixes ?? []).filter((f) => !drop.has(f.g)) : [] });
  },

  markFine: async (list) => {
    const p = get().albumPrefs;
    const fine = list === 'reset' ? [] : [...new Set([...(p.fine ?? []), ...list.map(fineKey)])];
    // marking as fine doesn't change any numbers: save and sync without rebuilding
    try {
      localStorage.setItem('sw.albums', JSON.stringify({ ...p, fine }));
    } catch {
      /* private mode */
    }
    set({ albumPrefs: { ...p, fine } });
    bumpSettings();
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
      let becameAlbums = 0;
      // two at a time with a pause each: ~4 requests/s, under Last.fm's 5/s guideline
      const worker = async () => {
        while (next < todo.length) {
          const c = todo[next++];
          try {
            const n = await fetchAlbumTrackCount(c.artist, c.name, apiKey);
            counts[c.key] = [n, Date.now()];
            if (n >= 2) becameAlbums++; // Last.fm says it's a real album: it shows up in albums again
          } catch {
            continue; // network / rate limit: try this one next time
          }
          await new Promise((r) => setTimeout(r, 300));
          if (++sinceSave >= 60) {
            sinceSave = 0;
            await setMeta('albumTrackCounts', counts);
            // rebuilding only matters when something changed on screen
            if (becameAlbums) {
              becameAlbums = 0;
              await get().reloadLibrary();
            }
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
    clearSignedOut(set);
    // same account signing back in (e.g. from the start screen): straight back into the app
    if (!demo && username && username.toLowerCase() === name.toLowerCase()) {
      if (get().view !== 'app') set({ view: 'app', lib: get().lib ?? (await loadLibraryFromDb()) });
      return;
    }
    await claimLocalData(name, demo);
    LS.set('sw.username', name);
    LS.set('sw.demo', '0');
    set({ username: name, demo: false, user: null, view: 'app', lib: await loadLibraryFromDb() });
    await get().runSync();
  },

  setApiKey: async (key) => {
    const k = key.trim();
    if (k && !/^[0-9a-f]{32}$/i.test(k)) throw new Error('A Last.fm API key is 32 characters of letters a–f and numbers.');
    const { username, demo } = get();
    if (k && username && !demo) await fetchUserInfo(username, k); // throws if Last.fm refuses the key
    LS.set('sw.apiKey', k);
    set({ apiKey: k });
  },

  redownloadHistory: async () => {
    const { demo, username } = get();
    if (demo || !username) return;
    await withHistory(async () => {
      await scrobbleStore.clear();
      for (const k of ['syncPending', 'lastSync', 'editCursor', 'editPassAt']) await db.meta.delete(k);
    });
    set({ lib: await loadLibraryFromDb(), sync: null, syncError: null });
    await get().runSync();
  },

  refreshAlbumGrouping: async () => {
    const { username, apiKey, demo } = get();
    if (demo || !username) return;
    await setMeta('albumArtists', await fetchAlbumArtists(username, apiKey));
    await setMeta('albumArtistsAt', Date.now());
    await get().reloadLibrary();
  },

  recheckSingles: async () => {
    await setMeta('albumTrackCounts', {});
    await get().reloadLibrary();
    await get().checkSingles();
  },

  disconnect: async () => {
    LS.set('sw.username', '');
    LS.set('sw.demo', '0');
    await scrobbleStore.clear();
    await db.meta.clear();
    await resetFriends();
    set({ username: '', user: null, lib: null, mismatches: null, demo: false, view: 'onboard', sync: null });
  },

}));
