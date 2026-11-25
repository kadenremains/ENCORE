import { create } from 'zustand';
import { db, getMeta, setMeta } from './db';
import { fetchHistory, fetchTop, fetchUserInfo, LastfmError, type TopEntry, type TopPeriod } from './lastfm';
import { monthKey, pack, unpack } from './scrobbleStore';
import { buildLibrary, type Library } from './library';
import { applyFixes, type Fix } from './mismatches';
import { decodeNames } from './tidy';
import { bumpSettings } from './changes';
import type { StoredScrobble, UserInfo } from './types';

/**
 * Friends for Compare. Their Last.fm profiles are public, so nothing is asked of them: their top
 * lists come straight from Last.fm, and their whole history can be downloaded (kept only on this
 * device, packed like yours). The list of friends you've compared with syncs; their data doesn't.
 */

export interface Friend {
  name: string; // as Last.fm spells it
  image?: string;
  at: number; // last compared
}

const LS = 'sw.friends';
const MAX = 30;

function loadList(): Friend[] {
  try {
    return sanitizeFriends(JSON.parse(localStorage.getItem(LS) || '[]'));
  } catch {
    return [];
  }
}

export function sanitizeFriends(raw: unknown): Friend[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Friend => !!f && typeof f.name === 'string' && /^[\w.-]{2,30}$/.test(f.name) && typeof f.at === 'number')
    .map((f) => ({ name: f.name, at: f.at, ...(typeof f.image === 'string' && /^https:\/\//.test(f.image) ? { image: f.image } : {}) }))
    .slice(0, MAX);
}

export const useFriends = create<{ list: Friend[] }>(() => ({ list: loadList() }));

function saveList(list: Friend[], sync = true) {
  useFriends.setState({ list });
  try {
    localStorage.setItem(LS, JSON.stringify(list));
  } catch {
    /* private mode */
  }
  if (sync) bumpSettings();
}

/** Remember a friend (most recent first). */
export function rememberFriend(f: Omit<Friend, 'at'>) {
  const cur = useFriends.getState().list;
  // already at the top and compared in the last hour: nothing to save (or sync)
  if (cur[0]?.name.toLowerCase() === f.name.toLowerCase() && cur[0].image === f.image && Date.now() - cur[0].at < 3600_000) return;
  const list = cur.filter((x) => x.name.toLowerCase() !== f.name.toLowerCase());
  saveList([{ ...f, at: Date.now() }, ...list].slice(0, MAX));
}

export async function forgetFriend(name: string) {
  saveList(useFriends.getState().list.filter((x) => x.name.toLowerCase() !== name.toLowerCase()));
  await removeHistory(name);
}

/** The list from another device (merged: most recently compared wins). */
export function applyRemoteFriends(raw: unknown) {
  const byName = new Map<string, Friend>();
  for (const f of [...sanitizeFriends(raw), ...useFriends.getState().list]) {
    const k = f.name.toLowerCase();
    const cur = byName.get(k);
    if (!cur || f.at > cur.at) byName.set(k, f);
  }
  saveList([...byName.values()].sort((a, b) => b.at - a.at).slice(0, MAX), false);
}

/* ---------------- profile and quick top lists ---------------- */

export class FriendError extends Error {
  kind: 'not-found' | 'hidden' | 'network';
  constructor(message: string, kind: 'not-found' | 'hidden' | 'network') {
    super(message);
    this.kind = kind;
  }
}

const explain = (e: unknown, name: string): FriendError => {
  if (e instanceof FriendError) return e;
  const code = e instanceof LastfmError ? e.code : undefined;
  if (code === 6) return new FriendError(`There's no Last.fm user called “${name}”.`, 'not-found');
  if (code === 17) return new FriendError(`${name} keeps their listening private on Last.fm, so it can't be compared.`, 'hidden');
  return new FriendError(`Couldn't reach Last.fm: ${(e as Error).message}`, 'network');
};

export async function fetchFriendInfo(name: string, apiKey: string): Promise<UserInfo> {
  try {
    return await fetchUserInfo(name, apiKey);
  } catch (e) {
    throw explain(e, name);
  }
}

export interface QuickLists {
  period: TopPeriod;
  at: number;
  artists: TopEntry[];
  albums: TopEntry[];
  tracks: TopEntry[];
  /** their all-time top artists (to tell "never played" apart from "not this period") */
  allArtists: TopEntry[];
}

const FRESH = 6 * 3600_000;
const quickKey = (name: string, period: TopPeriod) => `friendTop:${name.toLowerCase()}:${period}`;

/** Their top lists for a period, cached for a few hours. */
export async function quickLists(name: string, period: TopPeriod, apiKey: string, force = false): Promise<QuickLists> {
  const cached = await getMeta<QuickLists>(quickKey(name, period));
  if (cached && !force && Date.now() - cached.at < FRESH) return cached;
  try {
    const [artists, albums, tracks, allArtists] = await Promise.all([
      fetchTop(name, 'artist', period, apiKey),
      fetchTop(name, 'album', period, apiKey),
      fetchTop(name, 'track', period, apiKey),
      period === 'overall' ? Promise.resolve(null) : fetchTop(name, 'artist', 'overall', apiKey),
    ]);
    const q: QuickLists = { period, at: Date.now(), artists, albums, tracks, allArtists: allArtists ?? artists };
    await setMeta(quickKey(name, period), q);
    await setMeta(allArtistsKey(name), { at: q.at, artists: q.allArtists });
    return q;
  } catch (e) {
    if (cached) return cached; // offline: what we had
    throw explain(e, name);
  }
}

const allArtistsKey = (name: string) => `friendAllArtists:${name.toLowerCase()}`;

/** Their cached all-time artists, if any (for "vs friends" on artist pages; never fetches). */
export async function cachedAllArtists(name: string): Promise<TopEntry[] | null> {
  return (await getMeta<{ artists: TopEntry[] }>(allArtistsKey(name)))?.artists ?? null;
}

/* ---------------- full history (optional, this device only) ---------------- */

export interface HistoryState {
  plays: number;
  through: number; // newest play stored (unix seconds)
  at: number; // when it was last brought up to date
}
const historyKey = (name: string) => `friendHistory:${name.toLowerCase()}`;
export const historyState = (name: string) => getMeta<HistoryState>(historyKey(name));

export const useDownloads = create<{ running: Record<string, { done: number; total: number }> }>(() => ({ running: {} }));
const cancels = new Map<string, { cancelled: boolean }>();

async function addRows(u: string, rows: StoredScrobble[]) {
  const by = new Map<number, StoredScrobble[]>();
  for (const r of rows) {
    const k = monthKey(r.ts);
    const a = by.get(k);
    const c: StoredScrobble = { ts: r.ts, ar: r.ar, tr: r.tr, al: r.al };
    if (a) a.push(c);
    else by.set(k, [c]);
  }
  await db.transaction('rw', db.friendMonths, async () => {
    for (const [k, add] of by) {
      const cur = await db.friendMonths.get([u, k]);
      const all = (cur ? unpack(cur) : []).concat(add).sort((a, b) => a.ts - b.ts);
      await db.friendMonths.put({ ...pack(k, all), u });
    }
  });
}

/**
 * Download (or bring up to date) a friend's whole history. Cut short (closed, cancelled), it starts
 * over cleanly next time: anything past the last complete download is dropped first.
 */
export async function downloadHistory(name: string, apiKey: string): Promise<void> {
  const u = name.toLowerCase();
  if (useDownloads.getState().running[u]) return;
  const signal = { cancelled: false };
  cancels.set(u, signal);
  const setRun = (v: { done: number; total: number } | null) =>
    useDownloads.setState((s) => {
      const running = { ...s.running };
      if (v) running[u] = v;
      else delete running[u];
      return { running };
    });
  setRun({ done: 0, total: 0 });
  try {
    const prev = await historyState(name);
    const from = prev ? prev.through + 1 : 0;
    // drop anything an interrupted download left past the last complete one
    await dropFrom(u, from);
    let newest = prev?.through ?? 0;
    await fetchHistory(
      name,
      apiKey,
      from,
      async (rows, done, total) => {
        if (signal.cancelled) return;
        await addRows(u, rows);
        for (const r of rows) if (r.ts > newest) newest = r.ts;
        setRun({ done, total });
      },
      signal,
    );
    if (signal.cancelled) {
      await dropFrom(u, from);
      return;
    }
    let plays = 0;
    await db.friendMonths.where('u').equals(u).each((c) => {
      plays += c.n;
    });
    await setMeta(historyKey(name), { plays, through: newest, at: Date.now() } satisfies HistoryState);
    libs.delete(u);
  } catch (e) {
    await dropFrom(u, (await historyState(name))?.through ?? 0).catch(() => {});
    throw explain(e, name);
  } finally {
    cancels.delete(u);
    setRun(null);
  }
}

export function cancelDownload(name: string) {
  const s = cancels.get(name.toLowerCase());
  if (s) s.cancelled = true;
}

async function dropFrom(u: string, from: number) {
  await db.transaction('rw', db.friendMonths, async () => {
    for (const c of await db.friendMonths.where('u').equals(u).toArray()) {
      if (c.k < monthKey(from)) continue;
      const keep = unpack(c).filter((r) => r.ts < from);
      if (keep.length) await db.friendMonths.put({ ...pack(c.k, keep), u });
      else await db.friendMonths.delete([u, c.k]);
    }
  });
}

export async function removeHistory(name: string) {
  const u = name.toLowerCase();
  cancelDownload(name);
  await db.friendMonths.where('u').equals(u).delete();
  await db.meta.bulkDelete([historyKey(name), allArtistsKey(name), quickKey(name, '7day'), quickKey(name, '1month'), quickKey(name, '3month'), quickKey(name, '6month'), quickKey(name, '12month'), quickKey(name, 'overall')]);
  libs.delete(u);
}

/** Their downloaded history as a library, with your Clean up merges applied so names line up. */
const libs = new Map<string, { fixes: string; lib: Library }>();
export async function friendLibrary(name: string, fixes: Fix[] | undefined): Promise<Library | null> {
  const u = name.toLowerCase();
  const sig = JSON.stringify(fixes ?? []);
  const hit = libs.get(u);
  if (hit && hit.fixes === sig) return hit.lib;
  const chunks = await db.friendMonths.where('u').equals(u).toArray();
  if (!chunks.length) return null;
  const rows: StoredScrobble[] = [];
  for (const c of chunks.sort((a, b) => a.k - b.k)) unpack(c, rows);
  const lib = buildLibrary(applyFixes(decodeNames(rows), fixes), {});
  libs.set(u, { fixes: sig, lib });
  return lib;
}

/** Bytes of friends' downloaded histories (Settings → Data & storage). */
export async function friendBytes(): Promise<number> {
  let n = 0;
  const enc = new TextEncoder();
  await db.friendMonths.each((c) => {
    n += c.ts.byteLength + c.ar.byteLength + c.tr.byteLength + c.al.byteLength + c.im.byteLength;
    for (const s of c.names) n += enc.encode(s).length;
  });
  return n;
}
