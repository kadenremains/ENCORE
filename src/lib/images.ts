import { useEffect, useSyncExternalStore } from 'react';
import { db, entityKey, type ImageOverride } from './db';
import type { EntityKind } from './types';
import { clearTombstone, localChanged, markDeleted } from './changes';
import { getPrefs } from './prefs';

/* ---------------- in-memory state + subscriptions ---------------- */

const overrides = new Map<string, ImageOverride>();
const resolved = new Map<string, string>(); // key -> url ('' = none)
const inflight = new Map<string, Promise<string>>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribeImages(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export async function loadImageState() {
  const [ov, cache] = await Promise.all([db.overrides.toArray(), db.imgcache.toArray()]);
  ov.forEach((o) => overrides.set(o.key, o));
  const staleBefore = Date.now() - 1000 * 60 * 60 * 24 * 14; // retry misses after 2 weeks
  cache.forEach((c) => {
    if (c.url || c.fetched > staleBefore) resolved.set(c.key, c.url);
  });
  emit();
}

export function getOverride(key: string) {
  return overrides.get(key);
}

export function allOverrides() {
  return [...overrides.values()];
}

export async function setOverride(o: Omit<ImageOverride, 'updated'>) {
  const full = { ...o, updated: Date.now() };
  overrides.set(o.key, full);
  emit();
  await db.overrides.put(full);
  clearTombstone('image', o.key);
  localChanged();
}

export async function removeOverride(key: string) {
  overrides.delete(key);
  emit();
  await db.overrides.delete(key);
  markDeleted('image', key);
}

/** Apply an image change that came from another device (keeps its timestamp). */
export async function applyRemoteOverride(o: ImageOverride) {
  const local = overrides.get(o.key);
  if (local && local.updated >= o.updated) return;
  overrides.set(o.key, o);
  emit();
  await db.overrides.put(o);
}

export async function applyRemoteRemoval(key: string, updated: number) {
  const local = overrides.get(key);
  if (!local || local.updated > updated) return;
  overrides.delete(key);
  emit();
  await db.overrides.delete(key);
}

/* ---------------- library hints (Last.fm art already in scrobbles) ---------------- */

type HintFn = (kind: EntityKind, name: string, artist: string) => string | undefined;
let hintFn: HintFn = () => undefined;
/** The album a song belongs to, credited to its album artist (can differ from the song's artist). */
type AlbumOfFn = (track: string, artist: string) => { name: string; artist: string } | undefined;
let albumOf: AlbumOfFn = () => undefined;
export function setImageHints(fn: HintFn, albumFn?: AlbumOfFn) {
  hintFn = fn;
  if (albumFn) albumOf = albumFn;
  emit();
}

/* ---------------- remote lookups ---------------- */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function similar(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

let jsonpCounter = 0;
function jsonp<T>(url: string, timeout = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cb = `__sw_jsonp_${Date.now()}_${jsonpCounter++}`;
    const script = document.createElement('script');
    const w = window as unknown as Record<string, unknown>;
    const cleanup = () => {
      // a reply that arrives after we gave up still calls the callback: leave a no-op for it
      w[cb] = () => {};
      setTimeout(() => delete w[cb], 120_000);
      script.remove();
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('jsonp timeout'));
    }, timeout);
    w[cb] = (data: T) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('jsonp error'));
    };
    script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`;
    document.head.appendChild(script);
  });
}

interface DeezerArtist {
  name: string;
  picture_xl?: string;
}
interface DeezerAlbum {
  title: string;
  cover_xl?: string;
  artist: { name: string };
}
interface DeezerTrack {
  title: string;
  artist: { name: string };
  album: { cover_xl?: string };
}

async function deezerArtist(artist: string): Promise<string> {
  const r = await jsonp<{ data?: DeezerArtist[] }>(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=5`);
  const hit = r.data?.find((a) => norm(a.name) === norm(artist)) ?? r.data?.find((a) => similar(a.name, artist));
  const url = hit?.picture_xl ?? '';
  return url.includes('/artist//') ? '' : url; // empty hash = Deezer placeholder
}

async function deezerAlbum(name: string, artist: string): Promise<string> {
  const r = await jsonp<{ data?: DeezerAlbum[] }>(`https://api.deezer.com/search/album?q=${encodeURIComponent(`artist:"${artist}" album:"${name}"`)}&limit=5`);
  const hit = r.data?.find((a) => similar(a.artist.name, artist) && similar(a.title, name));
  return hit?.cover_xl ?? '';
}

async function deezerTrack(name: string, artist: string): Promise<string> {
  const r = await jsonp<{ data?: DeezerTrack[] }>(`https://api.deezer.com/search/track?q=${encodeURIComponent(`artist:"${artist}" track:"${name}"`)}&limit=5`);
  const hit = r.data?.find((a) => similar(a.artist.name, artist) && similar(a.title, name));
  return hit?.album.cover_xl ?? '';
}

interface ItunesResult {
  artistName: string;
  collectionName?: string;
  trackName?: string;
  artworkUrl100?: string;
}

async function itunes(kind: 'album' | 'track', name: string, artist: string): Promise<string> {
  const entity = kind === 'album' ? 'album' : 'song';
  const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${name}`)}&entity=${entity}&limit=8`);
  if (!res.ok) return '';
  const r: { results?: ItunesResult[] } = await res.json();
  const hit = r.results?.find((x) => similar(x.artistName, artist) && similar((kind === 'album' ? x.collectionName : x.trackName) ?? '', name));
  return hit?.artworkUrl100?.replace(/\/\d+x\d+bb\./, '/1200x1200bb.') ?? '';
}

/**
 * Try each source in turn. `failed` means every source errored (offline, rate limited), so the
 * miss shouldn't be remembered; a real "not found" is cached so we don't keep asking.
 */
async function firstOf(...fns: (() => Promise<string>)[]): Promise<{ url: string; failed: boolean }> {
  let failures = 0;
  for (const fn of fns) {
    try {
      const u = await fn();
      if (u) return { url: u, failed: false };
    } catch {
      failures++; // network error / rate limit: try next source
    }
  }
  return { url: '', failed: failures === fns.length };
}

/* simple concurrency-limited queue so we don't hammer the APIs */
let active = 0;
const queue: (() => void)[] = [];
function schedule<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          // pace requests: Deezer allows ~50 per 5s, Apple far fewer
          setTimeout(() => {
            active--;
            queue.shift()?.();
          }, 150);
        });
    };
    if (active < 3) run();
    else queue.push(run);
  });
}

export function lookupImage(kind: EntityKind, name: string, artist: string): Promise<string> {
  const key = entityKey(kind, name, artist);
  if (resolved.has(key)) return Promise.resolve(resolved.get(key)!);
  if (!getPrefs().onlineArt) return Promise.resolve(''); // Settings → Images: don't look pictures up online
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = schedule(async () => {
    try {
      let res: { url: string; failed: boolean };
      if (kind === 'artist') res = await firstOf(() => deezerArtist(artist));
      else if (kind === 'album') res = await firstOf(() => deezerAlbum(name, artist), () => itunes('album', name, artist));
      else {
        res = await firstOf(() => deezerTrack(name, artist), () => itunes('track', name, artist));
        // fall back to the art of the album the song was scrobbled from
        const album = albumOf(name, artist);
        if (!res.url && album) {
          const a = await lookupAlbumDirect(album.name, album.artist);
          if (a.url || !a.failed) res = a;
        }
      }
      if (!res.url && res.failed) {
        // transient failure: back off for this session, but don't persist the miss
        resolved.set(key, '');
        setTimeout(() => resolved.delete(key), 60_000);
      } else {
        resolved.set(key, res.url);
        db.imgcache.put({ key, url: res.url, fetched: Date.now() }).catch(() => {});
      }
      emit();
      return res.url;
    } finally {
      inflight.delete(key);
    }
  });
  inflight.set(key, p);
  return p;
}

/** Album lookup usable from inside a queued job (doesn't re-enter the queue). */
async function lookupAlbumDirect(album: string, artist: string): Promise<{ url: string; failed: boolean }> {
  const k = entityKey('album', album, artist);
  const hint = hintFn('album', album, artist);
  if (hint) return { url: hint, failed: false };
  const custom = overrides.get(k);
  if (custom) return { url: custom.src, failed: false };
  if (resolved.has(k)) return { url: resolved.get(k)!, failed: false };
  const res = await firstOf(() => deezerAlbum(album, artist), () => itunes('album', album, artist));
  if (res.failed) return res;
  resolved.set(k, res.url);
  db.imgcache.put({ key: k, url: res.url, fetched: Date.now() }).catch(() => {});
  return res;
}

export interface ResolvedImage {
  src: string;
  zoom: number;
  x: number;
  y: number;
  custom: boolean;
}

/** The image we'll show for an entity right now, without triggering lookups. */
export function currentImage(kind: EntityKind, name: string, artist: string): ResolvedImage | null {
  const key = entityKey(kind, name, artist);
  const o = overrides.get(key);
  if (o) return { src: o.src, zoom: o.zoom, x: o.x, y: o.y, custom: true };
  // a custom album image also covers that album's songs
  if (kind === 'track') {
    const album = albumOf(name, artist);
    const ao = album ? overrides.get(entityKey('album', album.name, album.artist)) : undefined;
    if (ao) return { src: ao.src, zoom: ao.zoom, x: ao.x, y: ao.y, custom: false };
  }
  // Last.fm art for albums is the most accurate; for tracks it's the album art.
  if (kind !== 'artist') {
    const hint = hintFn(kind, name, artist);
    if (hint) return { src: hint, zoom: 1, x: 50, y: 50, custom: false };
  }
  const r = resolved.get(key);
  if (r) return { src: r, zoom: 1, x: 50, y: 50, custom: false };
  if (kind === 'artist' && resolved.get(key) === '') {
    const hint = hintFn(kind, name, artist); // fall back to their top album art
    if (hint) return { src: hint, zoom: 1, x: 50, y: 50, custom: false };
  }
  return null;
}

export function useEntityImage(kind: EntityKind, name: string, artist: string): ResolvedImage | null {
  useSyncExternalStore(subscribeImages, () => version);
  const img = currentImage(kind, name, artist);
  const key = entityKey(kind, name, artist);
  const needsLookup = !img && !!name && !resolved.has(key);
  useEffect(() => {
    if (needsLookup) lookupImage(kind, name, artist).catch(() => {});
  }, [needsLookup, kind, name, artist]);
  return img;
}

/** Forget every picture looked up online, so they're fetched fresh (custom pictures are kept). */
export async function clearLookupCache() {
  resolved.clear();
  await db.imgcache.clear();
  emit();
}

export function useImagesVersion() {
  return useSyncExternalStore(subscribeImages, () => version);
}

/** Downscale + re-encode an image source until it's under `target` characters (keeps PNG only for transparency). */
async function shrinkImage(src: string, opts: { max?: number; target?: number; maybeAlpha?: boolean } = {}): Promise<string> {
  const { max = 1600, target = 700_000, maybeAlpha = true } = opts;
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const draw = (limit: number) => {
    const scale = Math.min(1, limit / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  };
  let c = draw(max);
  let alpha = false;
  if (maybeAlpha) {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 16)
      if (d[i] < 250) {
        alpha = true;
        break;
      }
  }
  let q = 0.9;
  let limit = max;
  let out = alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q);
  for (let tries = 0; out.length > target && tries < 8; tries++) {
    if (!alpha && q > 0.72) q -= 0.06;
    else {
      limit = Math.round(limit * 0.8);
      c = draw(limit);
    }
    out = alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q);
  }
  return out;
}

export async function fileToDataUrl(file: File, max = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    return await shrinkImage(url, { max, maybeAlpha: file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shrink an already-stored data URL if it's bigger than `over` characters; returns it unchanged otherwise. */
export async function shrinkDataUrl(src: string, over = 900_000): Promise<string> {
  if (!src.startsWith('data:image') || src.length <= over) return src;
  try {
    const out = await shrinkImage(src, { maybeAlpha: src.startsWith('data:image/png') || src.startsWith('data:image/webp') || src.startsWith('data:image/gif') });
    return out.length < src.length ? out : src;
  } catch {
    return src;
  }
}

/**
 * Download a picture from a link and keep our own copy (as a data URL), so exports and other
 * devices don't depend on the original site. Returns null if the site doesn't allow it.
 */
export async function urlToDataUrl(url: string): Promise<{ src: string; width: number; height: number } | null> {
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) return null;
    const blob = await r.blob();
    if (!blob.type.startsWith('image/')) return null;
    const obj = URL.createObjectURL(blob);
    try {
      const dims = await new Promise<{ width: number; height: number }>((res, rej) => {
        const i = new Image();
        i.onload = () => res({ width: i.naturalWidth, height: i.naturalHeight });
        i.onerror = rej;
        i.src = obj;
      });
      const src = await shrinkImage(obj, { maybeAlpha: blob.type === 'image/png' || blob.type === 'image/webp' || blob.type === 'image/gif' });
      return { src, ...dims };
    } finally {
      URL.revokeObjectURL(obj);
    }
  } catch {
    return null;
  }
}

/** One-time: replace custom pictures that point at other websites with our own saved copy. */
export async function embedLinkedOverrides(): Promise<number> {
  let changed = 0;
  for (const o of await db.overrides.toArray()) {
    if (!/^https?:/.test(o.src)) continue;
    const got = await urlToDataUrl(o.src);
    if (!got) continue;
    const next = { ...o, src: got.src, updated: Date.now() };
    overrides.set(o.key, next);
    await db.overrides.put(next);
    changed++;
  }
  if (changed) {
    emit();
    localChanged();
  }
  return changed;
}

/** One-time cleanup: shrink oversized custom pictures saved before uploads were compressed. */
export async function shrinkStoredOverrides(): Promise<number> {
  let changed = 0;
  for (const o of await db.overrides.toArray()) {
    const src = await shrinkDataUrl(o.src);
    if (src !== o.src) {
      const next = { ...o, src, updated: Date.now() };
      overrides.set(o.key, next);
      await db.overrides.put(next);
      changed++;
    }
  }
  if (changed) {
    emit();
    localChanged();
  }
  return changed;
}

/** Your own background picture: one per account, synced, reused by every wrapped that picks "My picture". */
export const ACCOUNT_BG_KEY = 'account:background';

/** Last.fm profile picture at a bigger size. */
export function bigAvatar(url?: string) {
  return url ? url.replace(/\/i\/u\/[^/]+\//, '/i/u/600x600/') : undefined;
}
