import { db, type ImageOverride, type StoredPic } from './db';
import type { Project } from '../editor/model';

/**
 * Pictures inside wrappeds and custom pictures are kept once each, as plain image data, in the
 * `pics` table. What's stored in a wrapped or a custom picture is a short reference to it
 * ("encore-pic:<fingerprint>"); everything else in the app sees ordinary picture data, exactly as
 * before: references are swapped back when anything is read (projects / overrides below).
 *
 * The fingerprint is a hash of the picture's bytes, so the same picture used by four wrappeds is
 * stored once, and a picture that's no longer used anywhere is removed.
 */

const DATA_URL = /data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)/g;
const REF = /encore-pic:([0-9a-f]{40})/g;

/* ---------------- base64 that copes with multi-megabyte pictures ---------------- */

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/* ---------------- the pictures, in memory once loaded ---------------- */

const cache = new Map<string, { mime: string; bytes: Uint8Array; url?: string }>();
let loaded: Promise<void> | null = null;
const load = () =>
  (loaded ??= db.pics.toArray().then((all) => {
    for (const p of all) if (!cache.has(p.id)) cache.set(p.id, { mime: p.mime, bytes: p.bytes });
  }));

const urlOf = (id: string) => {
  const p = cache.get(id);
  if (!p) return null;
  return (p.url ??= `data:${p.mime};base64,${toB64(p.bytes)}`);
};

/** Pictures already fingerprinted this session (the editor saves the same ones again and again). */
const seenUrls = new Map<string, StoredPic>();

/** Pictures in a value become references; returns the new value and the pictures to store. */
async function lift<T>(value: T): Promise<{ value: T; pics: StoredPic[] }> {
  const text = JSON.stringify(value);
  if (!text.includes('data:image')) return { value, pics: [] };
  const pics = new Map<string, StoredPic>();
  const parts: string[] = [];
  let last = 0;
  for (const m of text.matchAll(DATA_URL)) {
    const known = seenUrls.get(m[0]);
    if (known) {
      pics.set(known.id, known);
      parts.push(text.slice(last, m.index), `encore-pic:${known.id}`);
      last = m.index! + m[0].length;
      continue;
    }
    const bytes = fromB64(m[2]);
    // fingerprint of type + bytes: identical pictures share one copy, and come back labelled the same
    const tagged = new Uint8Array(m[1].length + 1 + bytes.length);
    tagged.set(new TextEncoder().encode(m[1] + '\0'), 0);
    tagged.set(bytes, m[1].length + 1);
    const id = hex(await crypto.subtle.digest('SHA-256', tagged)).slice(0, 40);
    const pic = { id, mime: m[1], bytes };
    pics.set(id, pic);
    seenUrls.set(m[0], pic);
    if (seenUrls.size > 100) seenUrls.delete(seenUrls.keys().next().value!);
    parts.push(text.slice(last, m.index), `encore-pic:${id}`);
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return { value: JSON.parse(parts.join('')) as T, pics: [...pics.values()] };
}

/** References become pictures again (exactly the data that went in). */
function restoreNow<T>(value: T): T {
  if (value === undefined || value === null) return value;
  const text = JSON.stringify(value);
  if (!text.includes('encore-pic:')) return value;
  return JSON.parse(text.replace(REF, (ref, id: string) => urlOf(id) ?? ref)) as T;
}

/** Same, first fetching any picture this tab hasn't seen yet (another tab may have just saved it). */
async function restore<T>(value: T): Promise<T> {
  if (value === undefined || value === null) return value;
  const text = JSON.stringify(value);
  if (!text.includes('encore-pic:')) return value;
  const missing = [...new Set([...text.matchAll(REF)].map((m) => m[1]))].filter((id) => !cache.has(id));
  if (missing.length) for (const p of await db.pics.bulkGet(missing)) if (p) cache.set(p.id, { mime: p.mime, bytes: p.bytes });
  return restoreNow(value);
}
const restoreAll = <T,>(rows: T[]) => Promise.all(rows.map((r) => restore(r)));

/**
 * Saves are numbered per record: splitting the pictures out takes a moment, so a save could finish
 * after a newer one. Only the newest save of a record is written.
 */
let saves = 0;
const newest = new Map<string, number>();

/** Stores a record with its pictures split out, in one transaction (so they can't drift apart). */
async function putWithPics<T>(table: 'projects' | 'overrides', key: string, value: T, save = ++saves) {
  newest.set(`${table}:${key}`, save);
  const { value: stored, pics } = await lift(value);
  await db.transaction('rw', db.table(table), db.pics, async () => {
    if (newest.get(`${table}:${key}`) !== save) return; // a newer save of this record came along
    if (pics.length) await db.pics.bulkPut(pics);
    await db.table(table).put(stored);
  });
  for (const p of pics) if (!cache.has(p.id)) cache.set(p.id, { mime: p.mime, bytes: p.bytes });
  scheduleCleanup();
}

/* ---------------- the two tables that hold pictures ---------------- */

export const projectsDb = {
  async get(id: string): Promise<Project | undefined> {
    await moveIn();
    return restore(await db.projects.get(id));
  },
  async all(): Promise<Project[]> {
    await moveIn();
    return restoreAll(await db.projects.toArray());
  },
  async newestFirst(): Promise<Project[]> {
    await moveIn();
    return restoreAll(await db.projects.orderBy('updated').reverse().toArray());
  },
  put: (p: Project) => {
    const save = ++saves;
    newest.set(`projects:${p.id}`, save);
    return moveIn().then(() => putWithPics('projects', p.id, p, save));
  },
  /**
   * Leaving the app: write it this instant, pictures and all (no time to split them out), then split
   * them out if the app is still around. Either way it's readable: inline pictures work as they are.
   */
  putNow(p: Project) {
    const save = ++saves;
    newest.set(`projects:${p.id}`, save);
    const written = db.projects.put(p);
    void written.then(() => putWithPics('projects', p.id, p, save)).catch(() => {});
    return written;
  },
  async delete(id: string) {
    await db.projects.delete(id);
    scheduleCleanup();
  },
  count: () => db.projects.count(),
};

export const overridesDb = {
  async all(): Promise<ImageOverride[]> {
    await moveIn();
    return restoreAll(await db.overrides.toArray());
  },
  put: (o: ImageOverride) => {
    const save = ++saves;
    newest.set(`overrides:${o.key}`, save);
    return moveIn().then(() => putWithPics('overrides', o.key, o, save));
  },
  async delete(key: string) {
    await db.overrides.delete(key);
    scheduleCleanup();
  },
  keys: () => db.overrides.toCollection().primaryKeys() as Promise<string[]>,
  count: () => db.overrides.count(),
};

/* ---------------- removing pictures nothing uses any more ---------------- */

let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleCleanup() {
  clearTimeout(cleanupTimer);
  cleanupTimer = setTimeout(() => void cleanUp().catch(() => {}), 3000);
}

/** Delete pictures no wrapped or custom picture refers to. One transaction, so nothing new slips in meanwhile. */
export async function cleanUp(): Promise<number> {
  let removed = 0;
  await db.transaction('rw', db.projects, db.overrides, db.pics, async () => {
    const used = new Set<string>();
    const scan = (v: unknown) => {
      for (const m of JSON.stringify(v).matchAll(REF)) used.add(m[1]);
    };
    await db.projects.each(scan);
    await db.overrides.each(scan);
    const all = (await db.pics.toCollection().primaryKeys()) as string[];
    const unused = all.filter((id) => !used.has(id));
    if (unused.length) await db.pics.bulkDelete(unused);
    removed = unused.length;
  });
  return removed;
}

/* ---------------- moving pictures out of older records, once ---------------- */

let moving: Promise<void> | null = null;

/**
 * Wrappeds and custom pictures saved by older versions carry their pictures inside. Each one is
 * rewritten with references, after checking that putting the pictures back gives exactly what was
 * stored; record and pictures are written in one transaction. Anything that doesn't check out is
 * left as it was (it still works: references are only swapped in where they exist).
 */
export function moveIn(): Promise<void> {
  moving ??= (async () => {
    await load();
    for (const table of ['projects', 'overrides'] as const) {
      const rows = (await db.table(table).toArray()) as unknown[];
      for (const row of rows) {
        const before = JSON.stringify(row);
        if (!before.includes('data:image')) continue;
        const { value, pics } = await lift(row);
        for (const p of pics) if (!cache.has(p.id)) cache.set(p.id, { mime: p.mime, bytes: p.bytes });
        if (JSON.stringify(restoreNow(value)) !== before) continue; // doesn't come back identical: leave it
        await db.transaction('rw', db.table(table), db.pics, async () => {
          // only if nobody changed it meanwhile
          const now = await db.table(table).get(table === 'projects' ? (row as Project).id : (row as ImageOverride).key);
          if (JSON.stringify(now) !== before) return;
          await db.pics.bulkPut(pics);
          await db.table(table).put(value);
        });
      }
    }
    await cleanUp();
  })().catch((e) => {
    console.warn('moving pictures out of wrappeds failed', e);
  });
  return moving.then(load);
}

/* ---------------- sizes, for Settings → Data & storage ---------------- */

export async function picBytes(): Promise<{ count: number; bytes: number }> {
  let count = 0;
  let bytes = 0;
  await db.pics.each((p) => {
    count++;
    bytes += p.bytes.byteLength;
  });
  return { count, bytes };
}
