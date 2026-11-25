import Dexie, { type Table } from 'dexie';
import type { StoredScrobble, UserInfo } from './types';
import type { Project } from '../editor/model';

export interface ImageOverride {
  key: string; // entity key, see entityKey()
  src: string; // data url or remote url
  zoom: number; // 1 = cover
  x: number; // focal point 0..100
  y: number; // focal point 0..100
  updated: number;
}

export interface ImageCacheEntry {
  key: string;
  url: string; // '' = looked up, nothing found
  fetched: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

/**
 * A month of scrobbles, packed: each name is written once in `names`, and every play is a time plus
 * numbers pointing into that list. Far smaller and faster to load than one record per play.
 * See scrobbleStore.ts.
 */
export interface MonthChunk {
  k: number; // UTC year * 12 + month
  n: number;
  ts: Uint32Array; // unix seconds, ascending
  names: string[];
  ar: Uint16Array | Uint32Array;
  tr: Uint16Array | Uint32Array;
  al: Uint16Array | Uint32Array;
  im: Uint16Array | Uint32Array; // '' = no picture
}

/** A picture, stored once however many wrappeds and custom pictures use it (see picStore.ts). */
export interface StoredPic {
  id: string; // SHA-256 of the image bytes (hex, 40 chars)
  mime: string;
  bytes: Uint8Array;
}

class WrappedDB extends Dexie {
  /** the old one-record-per-play format; emptied when it's moved into `months` */
  scrobbles!: Table<StoredScrobble, number>;
  months!: Table<MonthChunk, number>;
  pics!: Table<StoredPic, string>;
  overrides!: Table<ImageOverride, string>;
  imgcache!: Table<ImageCacheEntry, string>;
  projects!: Table<Project, string>;
  meta!: Table<MetaEntry, string>;

  constructor() {
    super('scrobble-wrapped');
    this.version(1).stores({
      scrobbles: '++id, ts',
      overrides: 'key',
      imgcache: 'key',
      projects: 'id, updated',
      meta: 'key',
    });
    this.version(2).stores({ months: 'k' });
    this.version(3).stores({ pics: 'id' });
  }
}

export const db = new WrappedDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}

export async function getStoredUser(): Promise<UserInfo | undefined> {
  return getMeta<UserInfo>('user');
}

/** Stable key for an entity, used for image overrides and caches. */
export function entityKey(kind: string, name: string, artist: string) {
  const n = name.trim().toLowerCase();
  const a = artist.trim().toLowerCase();
  return kind === 'artist' ? `artist:${a}` : `${kind}:${a}|${n}`;
}
