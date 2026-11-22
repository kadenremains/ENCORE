import { useEffect, useSyncExternalStore } from 'react';
import { db, entityKey, type ImageOverride } from './db';
import type { EntityKind } from './types';

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
}

export async function removeOverride(key: string) {
  overrides.delete(key);
  emit();
  await db.overrides.delete(key);
}

/* ---------------- library hints (Last.fm art already in scrobbles) ---------------- */

type HintFn = (kind: EntityKind, name: string, artist: string) => string | undefined;
let hintFn: HintFn = () => undefined;
type AlbumOfFn = (track: string, artist: string) => string | undefined;
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
      delete w[cb];
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

let lastLookupFailed = false;
async function firstOf(...fns: (() => Promise<string>)[]) {
  let failures = 0;
  for (const fn of fns) {
    try {
      const u = await fn();
      if (u) {
        lastLookupFailed = false;
        return u;
      }
    } catch {
      failures++; // network error / rate limit: try next source
    }
  }
  // only a real "not found" should be remembered; errors get retried next time
  lastLookupFailed = failures === fns.length;
  return '';
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
          active--;
          queue.shift()?.();
        });
    };
    if (active < 3) run();
    else queue.push(run);
  });
}

export function lookupImage(kind: EntityKind, name: string, artist: string): Promise<string> {
  const key = entityKey(kind, name, artist);
  if (resolved.has(key)) return Promise.resolve(resolved.get(key)!);
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = schedule(async () => {
    let url = '';
    if (kind === 'artist') url = await firstOf(() => deezerArtist(artist));
    else if (kind === 'album') url = await firstOf(() => deezerAlbum(name, artist), () => itunes('album', name, artist));
    else {
      url = await firstOf(() => deezerTrack(name, artist), () => itunes('track', name, artist));
      // fall back to the art of the album the song was scrobbled from
      const album = albumOf(name, artist);
      if (!url && album) {
        url = (await lookupAlbumDirect(album, artist)) || '';
      }
    }
    inflight.delete(key);
    if (!url && lastLookupFailed) {
      // transient failure: back off for this session, but don't persist the miss
      resolved.set(key, '');
      setTimeout(() => resolved.delete(key), 60_000);
      emit();
      return url;
    }
    resolved.set(key, url);
    db.imgcache.put({ key, url, fetched: Date.now() }).catch(() => {});
    emit();
    return url;
  });
  inflight.set(key, p);
  return p;
}

/** Album lookup usable from inside a queued job (doesn't re-enter the queue). */
async function lookupAlbumDirect(album: string, artist: string): Promise<string> {
  const k = entityKey('album', album, artist);
  const hint = hintFn('album', album, artist);
  if (hint) return hint;
  const custom = overrides.get(k);
  if (custom) return custom.src;
  if (resolved.has(k)) return resolved.get(k)!;
  const url = await firstOf(() => deezerAlbum(album, artist), () => itunes('album', album, artist));
  if (!url && lastLookupFailed) return '';
  resolved.set(k, url);
  db.imgcache.put({ key: k, url, fetched: Date.now() }).catch(() => {});
  return url;
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
    const ao = album ? overrides.get(entityKey('album', album, artist)) : undefined;
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

export function useImagesVersion() {
  return useSyncExternalStore(subscribeImages, () => version);
}

/** Read a user file, downscale to keep IndexedDB lean, return a data URL. */
export async function fileToDataUrl(file: File, max = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const png = file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp';
    return c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}
