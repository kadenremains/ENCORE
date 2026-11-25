import { db, type MonthChunk } from './db';
import type { StoredScrobble } from './types';

/**
 * The downloaded scrobble history, packed a month per record (see MonthChunk). What goes in comes
 * back out exactly (time, artist, song, album, picture), in the same order; only the storage
 * changes. Every change runs in one database transaction, and the browser runs those one at a time,
 * so saves that happen side by side (a sync saves pages in parallel) can't overwrite each other.
 */

export const monthKey = (ts: number) => {
  const d = new Date(ts * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

const byTime = (a: StoredScrobble, b: StoredScrobble) => a.ts - b.ts; // stable: equal times keep their order

export function pack(k: number, rows: StoredScrobble[]): MonthChunk {
  const names: string[] = [];
  const index = new Map<string, number>();
  const id = (s: string) => {
    let i = index.get(s);
    if (i === undefined) {
      i = names.length;
      index.set(s, i);
      names.push(s);
    }
    return i;
  };
  const n = rows.length;
  const ts = new Uint32Array(n);
  const ar = new Uint32Array(n);
  const tr = new Uint32Array(n);
  const al = new Uint32Array(n);
  const im = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    ts[i] = r.ts;
    ar[i] = id(r.ar);
    tr[i] = id(r.tr);
    al[i] = id(r.al);
    im[i] = id(r.img ?? '');
  }
  const small = names.length <= 0xffff;
  const fit = (a: Uint32Array) => (small ? Uint16Array.from(a) : a);
  return { k, n, ts, names, ar: fit(ar), tr: fit(tr), al: fit(al), im: fit(im) };
}

export function unpack(c: MonthChunk, out: StoredScrobble[] = []): StoredScrobble[] {
  const { names } = c;
  for (let i = 0; i < c.n; i++) {
    const r: StoredScrobble = { ts: c.ts[i], ar: names[c.ar[i]], tr: names[c.tr[i]], al: names[c.al[i]] };
    const img = names[c.im[i]];
    if (img) r.img = img;
    out.push(r);
  }
  return out;
}

const clean = (r: StoredScrobble): StoredScrobble => {
  const c: StoredScrobble = { ts: r.ts, ar: r.ar, tr: r.tr, al: r.al };
  if (r.img) c.img = r.img;
  return c;
};

function groupByMonth(rows: StoredScrobble[]) {
  const by = new Map<number, StoredScrobble[]>();
  for (const r of rows) {
    const k = monthKey(r.ts);
    const a = by.get(k);
    if (a) a.push(clean(r));
    else by.set(k, [clean(r)]);
  }
  return by;
}

/** Rewrite one month: put it back packed, or remove it when nothing is left. */
async function write(k: number, rows: StoredScrobble[]) {
  if (rows.length) await db.months.put(pack(k, rows.sort(byTime)));
  else await db.months.delete(k);
}

/* ------------------------------------------------------------------ moving from the old format */

const sig = (r: StoredScrobble) => `${r.ts}\u0001${r.ar}\u0001${r.tr}\u0001${r.al}\u0001${r.img ?? ''}`;

let moved: Promise<void> | null = null;

/**
 * Histories saved by older versions (a record per play) move into the packed format once. It's
 * checked first (packed and unpacked again, it has to come back identical), then written and the old
 * records removed in one transaction, so it either happens completely or not at all. Until it
 * succeeds the old records stay where they are and keep being read.
 */
export function moveOldFormat(): Promise<void> {
  moved ??= (async () => {
    if (!(await db.scrobbles.count())) return;
    const old = (await db.scrobbles.toArray()).map(clean).sort(byTime);
    const chunks = [...groupByMonth(old)].map(([k, rows]) => pack(k, rows));
    const back: StoredScrobble[] = [];
    for (const c of chunks.sort((a, b) => a.k - b.k)) unpack(c, back);
    if (back.length !== old.length || back.some((r, i) => sig(r) !== sig(old[i]))) throw new Error('packed history did not match');
    await db.transaction('rw', db.months, db.scrobbles, async () => {
      if (await db.months.count()) {
        // already moved before (e.g. an older version wrote again since): keep every play once
        const have = new Map<number, StoredScrobble[]>();
        for (const c of await db.months.toArray()) have.set(c.k, unpack(c));
        for (const [k, rows] of groupByMonth(old)) {
          const cur = have.get(k) ?? [];
          const count = new Map<string, number>();
          for (const r of cur) count.set(sig(r), (count.get(sig(r)) ?? 0) + 1);
          for (const r of rows) {
            const s = sig(r);
            const c = count.get(s) ?? 0;
            if (c > 0) count.set(s, c - 1);
            else cur.push(r);
          }
          await write(k, cur);
        }
      } else await db.months.bulkPut(chunks);
      // Read it back from the database itself before removing anything: every old play has to be
      // there. If not (a browser storing something oddly), this throws and the whole step is undone.
      const stored = new Map<string, number>();
      for (const c of await db.months.toArray()) for (const r of unpack(c)) stored.set(sig(r), (stored.get(sig(r)) ?? 0) + 1);
      for (const r of old) {
        const n = stored.get(sig(r)) ?? 0;
        if (!n) throw new Error('packed history is missing plays');
        stored.set(sig(r), n - 1);
      }
      await db.scrobbles.clear();
    });
  })().catch((e) => {
    // the old records stay and keep being read (every call below covers both); next app start tries again
    console.warn('moving scrobbles to the packed format failed', e);
  });
  return moved;
}

/* ------------------------------------------------------------------ the store */

export const scrobbleStore = {
  /** Every scrobble, oldest first. */
  async all(): Promise<StoredScrobble[]> {
    await moveOldFormat();
    const [chunks, leftover] = await Promise.all([db.months.toArray(), db.scrobbles.toArray()]);
    const out: StoredScrobble[] = [];
    for (const c of chunks.sort((a, b) => a.k - b.k)) unpack(c, out);
    // only if moving failed: the old records are still the history
    if (leftover.length) return [...out, ...leftover.map(clean)].sort(byTime);
    return out;
  },

  async count(): Promise<number> {
    await moveOldFormat();
    let n = await db.scrobbles.count();
    await db.months.each((c) => {
      n += c.n;
    });
    return n;
  },

  /** The newest scrobble. */
  async last(): Promise<StoredScrobble | undefined> {
    await moveOldFormat();
    const c = await db.months.orderBy('k').last();
    const old = await db.scrobbles.orderBy('ts').last();
    const newest = c ? unpack(c)[c.n - 1] : undefined;
    if (old && (!newest || old.ts > newest.ts)) return clean(old);
    return newest;
  },

  /** Add scrobbles (any order). */
  async add(rows: StoredScrobble[]) {
    if (!rows.length) return;
    await moveOldFormat();
    const by = groupByMonth(rows);
    await db.transaction('rw', db.months, async () => {
      for (const [k, add] of by) {
        const cur = await db.months.get(k);
        await write(k, cur ? [...unpack(cur), ...add] : add);
      }
    });
  },

  /** Scrobbles with from <= ts <= to, oldest first. */
  async between(from: number, to: number): Promise<StoredScrobble[]> {
    await moveOldFormat();
    const [chunks, leftover] = await Promise.all([db.months.where('k').between(monthKey(from), monthKey(to), true, true).toArray(), db.scrobbles.where('ts').between(from, to, true, true).toArray()]);
    const out: StoredScrobble[] = [];
    for (const c of chunks.sort((a, b) => a.k - b.k)) for (const r of unpack(c)) if (r.ts >= from && r.ts <= to) out.push(r);
    return leftover.length ? [...out, ...leftover.map(clean)].sort(byTime) : out;
  },

  /** Replace everything with from <= ts <= to by `rows` (an edit check found changes there). */
  async replaceBetween(from: number, to: number, rows: StoredScrobble[]) {
    await moveOldFormat();
    const by = groupByMonth(rows.filter((r) => r.ts >= from && r.ts <= to));
    const ks = new Set<number>(by.keys());
    for (let k = monthKey(from); k <= monthKey(to); k++) ks.add(k);
    await db.transaction('rw', db.months, db.scrobbles, async () => {
      await db.scrobbles.where('ts').between(from, to, true, true).delete();
      for (const k of ks) {
        const cur = await db.months.get(k);
        const kept = cur ? unpack(cur).filter((r) => r.ts < from || r.ts > to) : [];
        await write(k, [...kept, ...(by.get(k) ?? [])]);
      }
    });
  },

  /** Remove everything from `from` on (rolling back an interrupted sync). */
  async deleteFrom(from: number) {
    await moveOldFormat();
    await db.transaction('rw', db.months, db.scrobbles, async () => {
      await db.scrobbles.where('ts').aboveOrEqual(from).delete();
      for (const c of await db.months.where('k').aboveOrEqual(monthKey(from)).toArray()) {
        await write(
          c.k,
          unpack(c).filter((r) => r.ts < from),
        );
      }
    });
  },

  async clear() {
    await db.transaction('rw', db.months, db.scrobbles, async () => {
      await db.months.clear();
      await db.scrobbles.clear();
    });
  },
};
