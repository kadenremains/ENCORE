import { create } from 'zustand';
import { buildLibrary, type Library } from './lib/library';
import { db, getStoredUser, setMeta } from './lib/db';
import { fetchUserInfo, syncScrobbles, type SyncProgress } from './lib/lastfm';
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
      return al >= 0 ? lib.albums[al].img : undefined;
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

async function loadLibraryFromDb(): Promise<Library> {
  const rows = await db.scrobbles.toArray();
  const lib = buildLibrary(rows);
  installHints(lib);
  return lib;
}

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
      if (added > 0 || !get().lib?.n) set({ lib: await loadLibraryFromDb() });
      set({ sync: { phase: 'done', done: added, total: added } });
    } catch (e) {
      set({ sync: { phase: 'error', done: 0, total: 0 }, syncError: (e as Error).message });
    }
  },

  disconnect: async () => {
    LS.set('sw.username', '');
    LS.set('sw.demo', '0');
    await db.scrobbles.clear();
    await db.meta.clear();
    set({ username: '', user: null, lib: null, demo: false, view: 'onboard', sync: null });
  },

}));
