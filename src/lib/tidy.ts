import type { StoredScrobble } from './types';

/**
 * Tidying the raw history before stats are built (the stored history stays exactly as Last.fm has
 * it, so edit checks keep comparing like with like):
 *  - names some scrobblers send with escapes left in ("Soda & Syrup", "&amp;")
 *  - batch-scrobbled plays: runs of scrobbles seconds apart, which aren't listens (songs skipped
 *    through, or a whole playlist sent at once by an import or scrobbling tool)
 */

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
const NEEDS_DECODE = /\\u[0-9a-fA-F]{4}|&(#\d+|#x[0-9a-fA-F]+|amp|quot|apos|lt|gt|nbsp);/;

export function decodeName(s: string): string {
  if (!NEEDS_DECODE.test(s)) return s;
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&(#\d+|#x[0-9a-fA-F]+|amp|quot|apos|lt|gt|nbsp);/g, (m, e: string) => {
      if (e[0] !== '#') return ENTITIES[e] ?? m;
      const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    });
}

/** A scrobble whose names came with codes left in: as it is on Last.fm, and what it should say. */
export interface Garbled {
  ts: number;
  raw: { ar: string; tr: string; al: string };
  fixed: { ar: string; tr: string; al: string };
}

/**
 * Rows with escaped names decoded (new objects only where something changes). Each garbled
 * scrobble is added to `found`, so Clean up can point them out for fixing on Last.fm.
 */
export function decodeNames(rows: StoredScrobble[], found?: Garbled[]): StoredScrobble[] {
  let out: StoredScrobble[] | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const ar = decodeName(r.ar);
    const tr = decodeName(r.tr);
    const al = decodeName(r.al);
    if (ar === r.ar && tr === r.tr && al === r.al) continue;
    out ??= rows.slice();
    out[i] = { ...r, ar, tr, al };
    found?.push({ ts: r.ts, raw: { ar: r.ar, tr: r.tr, al: r.al }, fixed: { ar, tr, al } });
  }
  return out ?? rows;
}

export interface BatchRun {
  from: number; // unix seconds
  to: number;
  /** typical gap between them, in seconds */
  gap: number;
  plays: { ar: string; tr: string; al: string }[];
}

export interface Batches {
  runs: BatchRun[];
  /** plays in all runs */
  total: number;
  /** whether they were left out of this library */
  skipped: boolean;
}

/** A song can't be listened to in under ~30 s (Last.fm won't scrobble anything shorter). */
const MAX_GAP = 35;
/** this many in a row, each within MAX_GAP of the last, is a batch, not listening */
const MIN_RUN = 4;

/**
 * Find batch-scrobbled runs in history sorted by time. With `skip`, they're removed from the rows
 * that stats are built from.
 */
export function findBatches(rows: StoredScrobble[], skip: boolean): { rows: StoredScrobble[]; batches: Batches } {
  const runs: BatchRun[] = [];
  const drop: [number, number][] = [];
  let start = 0;
  for (let i = 1; i <= rows.length; i++) {
    if (i < rows.length && rows[i].ts - rows[i - 1].ts <= MAX_GAP) continue;
    if (i - start >= MIN_RUN) {
      const gaps = [];
      for (let k = start + 1; k < i; k++) gaps.push(rows[k].ts - rows[k - 1].ts);
      gaps.sort((a, b) => a - b);
      runs.push({ from: rows[start].ts, to: rows[i - 1].ts, gap: gaps[gaps.length >> 1], plays: rows.slice(start, i).map((r) => ({ ar: r.ar, tr: r.tr, al: r.al })) });
      drop.push([start, i]);
    }
    start = i;
  }
  const total = runs.reduce((n, r) => n + r.plays.length, 0);
  if (!skip || !drop.length) return { rows, batches: { runs, total, skipped: false } };
  const kept: StoredScrobble[] = [];
  let at = 0;
  for (const [a, b] of drop) {
    for (let k = at; k < a; k++) kept.push(rows[k]);
    at = b;
  }
  for (let k = at; k < rows.length; k++) kept.push(rows[k]);
  return { rows: kept, batches: { runs, total, skipped: true } };
}
