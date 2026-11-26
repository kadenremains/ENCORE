import { db, setMeta, getMeta } from './db';
import { scrobbleStore } from './scrobbleStore';
import type { StoredScrobble, UserInfo } from './types';
import { API_URL } from '../config';
import { fetchWithin } from './net';

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
  let body: { error?: number | string; message?: string; code?: string } & Record<string, unknown>;
  try {
    res = await fetchWithin(`${relay ? `${API_URL}/lastfm` : API}?${qs}`);
    body = await res.json().catch(() => (res.ok ? Promise.reject(new Error('cut off')) : {}));
  } catch {
    // no connection, no answer in time, or an answer cut off half way: try again a few times
    if (attempt < 5) {
      await sleep(800 * 2 ** attempt);
      return call(params, apiKey, attempt + 1);
    }
    throw new LastfmError('Network error talking to Last.fm');
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
  // profile links are only ever followed if they really point at Last.fm
  const url = /^https:\/\/(www\.)?last\.fm\//.test(u.url ?? '') ? u.url : undefined;
  return {
    name: u.name,
    realname: u.realname || undefined,
    playcount: Number(u.playcount) || 0,
    registered: Number(u.registered?.unixtime) || 0,
    image: img || undefined,
    url,
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
    await scrobbleStore.clear();
  }
  await setMeta('syncedUser', user);

  // Pages are fetched in parallel, so an interrupted sync leaves gaps. Roll it back.
  const pending = await getMeta<{ from: number }>('syncPending');
  if (pending) {
    await scrobbleStore.deleteFrom(pending.from);
  }

  const last = await scrobbleStore.last();
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
    if (rows.length) await scrobbleStore.add(rows);
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

/* ---------------- other people's profiles (Compare) ---------------- */

export type TopPeriod = '7day' | '1month' | '3month' | '6month' | '12month' | 'overall';
export interface TopEntry {
  name: string;
  artist: string; // '' for artists
  plays: number;
}

/** Someone's top artists / albums / songs for one of Last.fm's fixed periods (up to 1,000). */
export async function fetchTop(user: string, kind: 'artist' | 'album' | 'track', period: TopPeriod, apiKey: string): Promise<TopEntry[]> {
  const method = kind === 'artist' ? 'user.gettopartists' : kind === 'album' ? 'user.gettopalbums' : 'user.gettoptracks';
  const r = await call<Record<string, Record<string, unknown>>>({ method, user, period, limit: 1000 }, apiKey);
  const box = r[kind === 'artist' ? 'topartists' : kind === 'album' ? 'topalbums' : 'toptracks'] ?? {};
  const raw = box[kind];
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []) as { name?: string; playcount?: string; artist?: { name?: string } }[];
  return list.map((x) => ({ name: x.name ?? '', artist: kind === 'artist' ? '' : (x.artist?.name ?? ''), plays: Number(x.playcount) || 0 })).filter((x) => x.name && x.plays > 0);
}

/** Who someone follows on Last.fm (its API calls them friends), up to `maxPages` × 200. */
export async function fetchFollowing(user: string, apiKey: string, maxPages = 10): Promise<{ name: string; image?: string }[]> {
  const out: { name: string; image?: string }[] = [];
  for (let page = 1; page <= maxPages; page++) {
    let r: { friends?: { user?: { name?: string; image?: LfImage[] }[] | { name?: string; image?: LfImage[] }; '@attr'?: { totalPages?: string } } };
    try {
      r = await call(({ method: 'user.getfriends', user, limit: 200, page }), apiKey);
    } catch (e) {
      if (e instanceof LastfmError && e.code === 6) break; // follows nobody
      throw e;
    }
    const raw = r.friends?.user;
    for (const u of Array.isArray(raw) ? raw : raw ? [raw] : []) if (u.name) out.push({ name: u.name, image: u.image?.[u.image.length - 1]?.['#text'] || undefined });
    if (page >= (Number(r.friends?.['@attr']?.totalPages) || 1)) break;
  }
  return out;
}

/**
 * Someone's scrobbles from `from` on (all of them for 0), page by page. Hands each page to `onPage`
 * as it arrives; stops early when `signal.cancelled` is set.
 */
export async function fetchHistory(
  user: string,
  apiKey: string,
  from: number,
  onPage: (rows: StoredScrobble[], done: number, total: number) => Promise<void>,
  signal?: { cancelled: boolean },
): Promise<void> {
  const to = Math.floor(Date.now() / 1000);
  const base: Record<string, string | number> = { method: 'user.getrecenttracks', user, limit: 200, to };
  if (from) base.from = from;
  const first = await call<RecentResponse>({ ...base, page: 1 }, apiKey);
  const totalPages = Number(first.recenttracks['@attr']?.totalPages) || 0;
  const total = Number(first.recenttracks['@attr']?.total) || 0;
  let done = 0;
  const take = async (rows: StoredScrobble[]) => {
    done += rows.length;
    await onPage(rows, done, total);
  };
  await take(parseTracks(first));
  let next = 2;
  const worker = async () => {
    while (next <= totalPages) {
      if (signal?.cancelled) return;
      const page = next++;
      await take(parseTracks(await call<RecentResponse>({ ...base, page }, apiKey)));
      await sleep(150);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, Math.max(0, totalPages - 1)) }, worker));
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
  const local = await scrobbleStore.between(from, to);
  const a = remote.map(sig).sort();
  const b = local.map(sig).sort();
  if (a.length === b.length && a.every((x, i) => x === b[i])) return false;
  await scrobbleStore.replaceBetween(from, to, remote);
  return true;
}

/** Start of the calendar month containing `ts` (unix seconds). */
export function monthStart(ts: number) {
  const d = new Date(ts * 1000);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000);
}
