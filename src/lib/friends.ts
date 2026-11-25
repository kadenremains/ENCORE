import { create } from 'zustand';
import { db, getMeta, setMeta } from './db';
import { fetchFollowing, fetchHistory, fetchTop, fetchUserInfo, LastfmError, type TopEntry, type TopPeriod } from './lastfm';
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
  at: number; // when they became a friend here
  /** 'lastfm': your friend on Last.fm (kept in step by itself); 'you': you added them */
  source: 'lastfm' | 'you';
  /** removed (kept a while so other devices learn about it instead of bringing them back) */
  gone?: boolean;
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
    .map((f) => ({ name: f.name, at: f.at, source: f.source === 'lastfm' ? ('lastfm' as const) : ('you' as const), ...(f.gone ? { gone: true } : {}), ...(typeof f.image === 'string' && /^https:\/\//.test(f.image) ? { image: f.image } : {}) }))
    // removals are remembered for 60 days, then forgotten
    .filter((f) => !f.gone || Date.now() - f.at < 60 * 86400_000)
    .slice(0, MAX * 2);
}

/** `list`: your friends; `all`: plus removals other devices still need to hear about. */
const visible = (all: Friend[]) => all.filter((f) => !f.gone).slice(0, MAX);
const initial = loadList();
export const useFriends = create<{ list: Friend[]; all: Friend[] }>(() => ({ list: visible(initial), all: initial }));

function saveList(all: Friend[], sync = true) {
  useFriends.setState({ list: visible(all), all });
  try {
    localStorage.setItem(LS, JSON.stringify(all));
  } catch {
    /* private mode */
  }
  if (sync) bumpSettings();
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export const isFriend = (name: string) => useFriends.getState().list.some((f) => same(f.name, name));

/** Add someone you compared with (only ever when you ask). */
export function addFriend(f: { name: string; image?: string }) {
  if (isFriend(f.name)) return;
  const rest = useFriends.getState().all.filter((x) => !same(x.name, f.name));
  saveList([{ name: f.name, image: f.image, at: Date.now(), source: 'you' as const }, ...rest]);
}

/** Remove someone you added (Last.fm friends come and go with Last.fm). Their data goes on the usual day timer. */
export async function removeFriend(name: string) {
  saveList(useFriends.getState().all.map((x) => (same(x.name, name) && x.source === 'you' ? { ...x, gone: true, at: Date.now() } : x)));
}

/** A friend's picture changed (seen while comparing): keep the list current, without syncing for it. */
export function refreshFriendImage(name: string, image?: string) {
  const list = useFriends.getState().all;
  const i = list.findIndex((f) => same(f.name, name) && !f.gone);
  if (i < 0 || list[i].image === image) return;
  const next = list.slice();
  next[i] = { ...next[i], name, image };
  saveList(next, false);
}

/* ---------------- your Last.fm friends: people you follow who follow you back ---------------- */

const SYNCED = 'friendsSyncedAt2'; // (2: friends now come straight from Last.fm's list; check again right away)
export const useFriendSync = create<{ running: boolean; at: number | null; error: string | null }>(() => ({ running: false, at: null, error: null }));

/**
 * Who you follow on Last.fm, kept to those who follow you back. Last.fm friends are replaced by the
 * current mutuals; people you added yourself stay.
 */
export async function syncLastfmFriends(me: string, apiKey: string): Promise<void> {
  if (useFriendSync.getState().running) return;
  useFriendSync.setState({ running: true, error: null });
  try {
    // Last.fm's own friends list. (Checking each one's list for you as well isn't reliable: Last.fm
    // often returns nothing for the other side.)
    const lastfm = await fetchFollowing(me, apiKey);
    const cur = useFriends.getState().all;
    const now = Date.now();
    const fromLastfm = lastfm.map((m): Friend => ({ name: m.name, image: m.image || cur.find((f) => same(f.name, m.name))?.image, source: 'lastfm', at: cur.find((f) => same(f.name, m.name) && !f.gone)?.at ?? now }));
    // Last.fm friends that are no longer on Last.fm: removed (and other devices told)
    const dropped = cur.filter((f) => f.source === 'lastfm' && !f.gone && !lastfm.some((m) => same(m.name, f.name))).map((f) => ({ ...f, gone: true, at: now }));
    const others = cur.filter((f) => !lastfm.some((m) => same(m.name, f.name)) && !(f.source === 'lastfm' && !f.gone));
    const next = [...fromLastfm.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), ...others, ...dropped];
    if (JSON.stringify(next) !== JSON.stringify(cur)) saveList(next);
    await setMeta(SYNCED, Date.now());
    useFriendSync.setState({ at: Date.now() });
  } catch (e) {
    useFriendSync.setState({ error: `Couldn't get your Last.fm friends: ${(e as Error).message}` });
  } finally {
    useFriendSync.setState({ running: false });
  }
}

/** Once a day, in the background. */
export async function maybeSyncLastfmFriends(me: string, apiKey: string) {
  const at = (await getMeta<number>(SYNCED)) ?? null;
  useFriendSync.setState({ at });
  if (!at || Date.now() - at > 24 * 3600_000) await syncLastfmFriends(me, apiKey);
}

/** The list from another device (merged: the newer entry for each name wins). */
export function applyRemoteFriends(raw: unknown) {
  const remote = sanitizeFriends(raw);
  const byName = new Map<string, Friend>();
  for (const f of [...remote, ...useFriends.getState().all]) {
    const k = f.name.toLowerCase();
    const cur = byName.get(k);
    if (!cur || f.at > cur.at || (f.at === cur.at && f.gone && !cur.gone)) byName.set(k, f);
  }
  const merged = [...byName.values()].sort((a, b) => Number(!!a.gone) - Number(!!b.gone) || (a.source === b.source ? 0 : a.source === 'lastfm' ? -1 : 1) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const key = (l: Friend[]) => JSON.stringify([...l].sort((a, b) => a.name.localeCompare(b.name)).map((f) => [f.name.toLowerCase(), f.at, !!f.gone]));
  // this device knew something the other didn't: send the merged list back so both end up the same
  saveList(merged, key(merged) !== key(remote));
}

/* ---------------- not keeping other people's data for long ---------------- */

/** Everything downloaded about someone is deleted this long after you last looked at the comparison. */
export const KEEP_FOR = 24 * 3600_000;
const viewedKey = (name: string) => `friendViewed:${name.toLowerCase()}`;

export async function markViewed(name: string) {
  await setMeta(viewedKey(name), Date.now());
}

/** Delete friends' data (top lists, full histories) not looked at in the last KEEP_FOR. */
export async function purgeStaleFriends(): Promise<number> {
  const names = new Set<string>();
  for (const k of (await db.meta.toCollection().primaryKeys()) as string[]) {
    const m = /^friend(?:Top|AllArtists|History|Viewed):([^:]+)/.exec(k);
    if (m) names.add(m[1]);
  }
  for (const u of (await db.friendMonths.orderBy('u').uniqueKeys()) as string[]) names.add(u);
  let removed = 0;
  for (const u of names) {
    if (useDownloads.getState().running[u]) continue;
    const seen = await getMeta<number>(viewedKey(u));
    if (seen && Date.now() - seen < KEEP_FOR) continue;
    await removeHistory(u);
    await db.meta.delete(viewedKey(u));
    removed++;
  }
  return removed;
}

let purging: ReturnType<typeof setInterval> | undefined;
/** On start, then every hour while the app is open. */
export function startFriendCleanup() {
  if (purging) return;
  void purgeStaleFriends().catch(() => {});
  purging = setInterval(() => void purgeStaleFriends().catch(() => {}), 3600_000);
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
