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

class WrappedDB extends Dexie {
  scrobbles!: Table<StoredScrobble, number>;
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
