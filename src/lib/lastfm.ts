import { db, setMeta, getMeta } from './db';
import type { StoredScrobble, UserInfo } from './types';
import { API_URL } from '../config';

const API = 'https://ws.audioscrobbler.com/2.0/';
export const LASTFM_PLACEHOLDER = '2a96cbd8b46e442fc41c2b86b821562f';

export class LastfmError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(params: Record<string, string | number>, apiKey: string, attempt = 0): Promise<T> {
  // no key of our own -> go through Encore's relay, which adds the key server-side
  const relay = !apiKey && !!API_URL;
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), ...(relay ? {} : { api_key: apiKey }), format: 'json' });
  let res: Response;
  try {
    res = await fetch(`${relay ? `${API_URL}/lastfm` : API}?${qs}`);
  } catch {
    if (attempt < 5) {
      await sleep(800 * 2 ** attempt);
      return call(params, apiKey, attempt + 1);
    }
    throw new LastfmError('Network error talking to Last.fm');
  }
  let body: { error?: number | string; message?: string; code?: string } & Record<string, unknown>;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (typeof body.error === 'string') {
    throw new LastfmError(body.code === 'NO_KEY' ? "This site isn't set up with a shared Last.fm key yet. Use your own API key below." : body.error);
  }
  if (body.error) {
    // 29 = rate limit, 8/11/16 = transient backend errors
    if (typeof body.error === 'number' && [8, 11, 16, 29].includes(body.error) && attempt < 6) {
      await sleep(1000 * 2 ** attempt);
      return call(params, apiKey, attempt + 1);
    }
    throw new LastfmError(body.message || 'Last.fm error', typeof body.error === 'number' ? body.error : undefined);
  }
  if (!res.ok) {
    if (attempt < 5) {
      await sleep(800 * 2 ** attempt);
      return call(params, apiKey, attempt + 1);
    }
    throw new LastfmError(`Last.fm returned ${res.status}`);
  }
  return body as T;
}

interface LfImage {
  '#text': string;
  size: string;
}

export function bestImage(images?: LfImage[]): string | undefined {
  if (!images?.length) return undefined;
  const url = images[images.length - 1]['#text'] || images.find((i) => i['#text'])?.['#text'];
  if (!url || url.includes(LASTFM_PLACEHOLDER)) return undefined;
  // upgrade to a larger rendition (Last.fm can't resize animated GIFs, so those stay as they are)
  return /\.gif$/i.test(url) ? url : url.replace(/\/i\/u\/[^/]+\//, '/i/u/600x600/');
}

export async function fetchUserInfo(user: string, apiKey: string): Promise<UserInfo> {
  const r = await call<{ user: { name: string; realname: string; playcount: string; registered: { unixtime: string }; image: LfImage[]; url: string } }>(
    { method: 'user.getinfo', user },
    apiKey,
  );
  const u = r.user;
  const img = u.image?.[u.image.length - 1]?.['#text'];
  return {
    name: u.name,
    realname: u.realname || undefined,
    playcount: Number(u.playcount) || 0,
    registered: Number(u.registered?.unixtime) || 0,
    image: img || undefined,
    url: u.url,
  };
}

interface RecentTrack {
  artist: { '#text': string };
  name: string;
  album: { '#text': string };
  image: LfImage[];
  date?: { uts: string };
  '@attr'?: { nowplaying?: string };
}

interface RecentResponse {
  recenttracks: {
    track: RecentTrack[] | RecentTrack;
    '@attr': { totalPages: string; total: string; page: string };
  };
}

function parseTracks(r: RecentResponse): StoredScrobble[] {
  const raw = r.recenttracks.track;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: StoredScrobble[] = [];
  for (const t of list) {
    if (t['@attr']?.nowplaying || !t.date) continue;
    const s: StoredScrobble = {
      ts: Number(t.date.uts),
      ar: t.artist?.['#text'] ?? '',
      tr: t.name ?? '',
      al: t.album?.['#text'] ?? '',
    };
    const img = bestImage(t.image);
    if (img) s.img = img;
    out.push(s);
  }
  return out;
}

export interface SyncProgress {
  phase: 'starting' | 'fetching' | 'saving' | 'done' | 'error';
  done: number;
  total: number;
  message?: string;
}

/**
 * Pulls the scrobble history into IndexedDB. If there's existing data it only fetches
 * scrobbles newer than the last stored one.
 */
export async function syncScrobbles(user: string, apiKey: string, onProgress: (p: SyncProgress) => void, signal?: { cancelled: boolean }) {
  onProgress({ phase: 'starting', done: 0, total: 0 });
  const storedUser = await getMeta<string>('syncedUser');
  if (storedUser && storedUser.toLowerCase() !== user.toLowerCase()) {
    await db.scrobbles.clear();
  }
  await setMeta('syncedUser', user);

  // Pages are fetched in parallel, so an interrupted sync leaves gaps. Roll it back.
  const pending = await getMeta<{ from: number }>('syncPending');
  if (pending) {
    await db.scrobbles.where('ts').aboveOrEqual(pending.from).delete();
  }

  const last = await db.scrobbles.orderBy('ts').last();
  const from = last ? last.ts + 1 : 0;
  await setMeta('syncPending', { from });
  const to = Math.floor(Date.now() / 1000);
  const base: Record<string, string | number> = { method: 'user.getrecenttracks', user, limit: 200, to };
  if (from) base.from = from;

  const first = await call<RecentResponse>({ ...base, page: 1 }, apiKey);
  const totalPages = Number(first.recenttracks['@attr']?.totalPages) || 0;
  const total = Number(first.recenttracks['@attr']?.total) || 0;
  let done = 0;
  const save = async (rows: StoredScrobble[]) => {
    if (rows.length) await db.scrobbles.bulkAdd(rows);
    done += rows.length;
    onProgress({ phase: 'fetching', done, total });
  };
  await save(parseTracks(first));

  const pages: number[] = [];
  for (let p = 2; p <= totalPages; p++) pages.push(p);
  const CONCURRENCY = 4;
  let cursor = 0;
  const worker = async () => {
    while (cursor < pages.length) {
      if (signal?.cancelled) return;
      const page = pages[cursor++];
      const r = await call<RecentResponse>({ ...base, page }, apiKey);
      await save(parseTracks(r));
      await sleep(120); // stay polite (~5 req/s across workers)
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages.length) }, worker));
  if (signal?.cancelled) return done;
  await db.meta.delete('syncPending');
  await setMeta('lastSync', Date.now());
  onProgress({ phase: 'done', done, total });
  return done;
}

/** Albums as Last.fm groups them (by album artist), for crediting albums correctly. */
export async function fetchAlbumArtists(user: string, apiKey: string): Promise<[string, string, number][]> {
  const out: [string, string, number][] = [];
  let page = 1;
  let pages = 1;
  do {
    const r = await call<{ topalbums: { album: { name: string; playcount: string; artist: { name: string } }[] | { name: string; playcount: string; artist: { name: string } }; '@attr': { totalPages: string } } }>(
      { method: 'user.gettopalbums', user, period: 'overall', limit: 1000, page },
      apiKey,
    );
    const list = r.topalbums.album;
    for (const a of Array.isArray(list) ? list : list ? [list] : []) out.push([a.name, a.artist?.name ?? '', Number(a.playcount) || 0]);
    pages = Math.min(60, Number(r.topalbums['@attr']?.totalPages) || 1);
    page++;
  } while (page <= pages);
  return out;
}

/** How many songs Last.fm lists on an album; -1 if Last.fm doesn't know the album (or has no tracklist). */
export async function fetchAlbumTrackCount(artist: string, album: string, apiKey: string): Promise<number> {
  try {
    const r = await call<{ album?: { tracks?: { track?: unknown[] | Record<string, unknown> } } }>({ method: 'album.getinfo', artist, album, autocorrect: 1 }, apiKey);
    const t = r.album?.tracks?.track;
    const n = Array.isArray(t) ? t.length : t ? 1 : 0;
    return n > 0 ? n : -1;
  } catch (e) {
    if (e instanceof LastfmError && e.code === 6) return -1; // "Album not found"
    throw e;
  }
}

/* ---------------- picking up edits made on Last.fm (Pro scrobble editing) ---------------- */

/** All scrobbles in [from, to] (unix seconds, inclusive) straight from Last.fm. */
async function fetchWindow(user: string, apiKey: string, from: number, to: number): Promise<StoredScrobble[]> {
  const base = { method: 'user.getrecenttracks', user, limit: 200, from, to };
  const first = await call<RecentResponse>({ ...base, page: 1 }, apiKey);
  const pages = Number(first.recenttracks['@attr']?.totalPages) || 0;
  const out = parseTracks(first);
  let next = 2;
  const worker = async () => {
    while (next <= pages) {
      const page = next++;
      out.push(...parseTracks(await call<RecentResponse>({ ...base, page }, apiKey)));
      await sleep(150);
    }
  };
  await Promise.all([worker(), worker()]);
  return out.filter((s) => s.ts >= from && s.ts <= to);
}

const sig = (s: StoredScrobble) => `${s.ts}\u0001${s.ar}\u0001${s.tr}\u0001${s.al}`;

/**
 * Re-read a stretch of history from Last.fm and replace what's stored if anything differs
 * (renamed artists/songs/albums, deleted scrobbles). Returns whether something changed.
 */
export async function reconcileWindow(user: string, apiKey: string, from: number, to: number): Promise<boolean> {
  const remote = await fetchWindow(user, apiKey, from, to);
  const local = await db.scrobbles.where('ts').between(from, to, true, true).toArray();
  const a = remote.map(sig).sort();
  const b = local.map(sig).sort();
  if (a.length === b.length && a.every((x, i) => x === b[i])) return false;
  await db.transaction('rw', db.scrobbles, async () => {
    await db.scrobbles.where('ts').between(from, to, true, true).delete();
    if (remote.length) await db.scrobbles.bulkAdd(remote);
  });
  return true;
}

/** Start of the calendar month containing `ts` (unix seconds). */
export function monthStart(ts: number) {
  const d = new Date(ts * 1000);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000);
}
