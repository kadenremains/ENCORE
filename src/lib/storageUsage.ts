import { db } from './db';

/**
 * What Encore keeps in this browser, measured from the data itself (bytes of text and numbers), so
 * Settings can show where the space goes. The browser's own total is usually higher: it adds its
 * own bookkeeping, and space from deleted data isn't always handed back straight away.
 */
export interface StorageUse {
  scrobbles: number;
  pictures: number;
  pictureCount: number;
  /** pictures still kept inside wrappeds / custom pictures (older format, until they're moved out) */
  inlinePictures: number;
  wrappeds: number;
  lookups: number;
  other: number;
  /** the browser's own figure for everything this site stores, if it says */
  browserTotal?: number;
}

const enc = new TextEncoder();
const textBytes = (s: string) => enc.encode(s).length;
const DATA_URL = /data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g;

export async function measureStorage(): Promise<StorageUse> {
  const u: StorageUse = { scrobbles: 0, pictures: 0, pictureCount: 0, inlinePictures: 0, wrappeds: 0, lookups: 0, other: 0 };
  await db.months.each((c) => {
    u.scrobbles += c.ts.byteLength + c.ar.byteLength + c.tr.byteLength + c.al.byteLength + c.im.byteLength;
    for (const n of c.names) u.scrobbles += textBytes(n);
  });
  await db.scrobbles.each((r) => {
    u.scrobbles += textBytes(JSON.stringify(r));
  });
  await db.pics.each((p) => {
    u.pictures += p.bytes.byteLength;
    u.pictureCount++;
  });
  // wrappeds and custom pictures: their own data, and any pictures still inside them
  const split = (v: unknown) => {
    const text = JSON.stringify(v);
    let inline = 0;
    for (const m of text.matchAll(DATA_URL)) inline += m[0].length;
    u.inlinePictures += inline;
    return text.length - inline;
  };
  await db.projects.each((p) => {
    u.wrappeds += split(p);
  });
  await db.overrides.each((o) => {
    u.wrappeds += split(o);
  });
  await db.imgcache.each((c) => {
    u.lookups += textBytes(JSON.stringify(c));
  });
  await db.meta.each((m) => {
    u.other += textBytes(JSON.stringify(m));
  });
  try {
    u.browserTotal = (await navigator.storage?.estimate?.())?.usage;
  } catch {
    /* not available */
  }
  return u;
}
