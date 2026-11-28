import type { StoredScrobble } from './types';

/**
 * Tidying the raw history before stats are built (the stored history stays exactly as Last.fm has
 * it, so edit checks keep comparing like with like):
 *  - names some scrobblers send with escapes left in ("Soda & Syrup", "&amp;")
 *  - one name written with different capitals ("London" / "LONDON"), joined under the spelling
 *    played most
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
    out[i] = { ...r, ar, tr, al, orig: { ar: r.ar, tr: r.tr, al: r.al, merged: false } };
    found?.push({ ts: r.ts, raw: { ar: r.ar, tr: r.tr, al: r.al }, fixed: { ar, tr, al } });
  }
  return out ?? rows;
}

/**
 * Names that differ only in capitals ("London" / "LONDON") are one artist, album or song: Last.fm
 * treats them as the same, and won't let you edit just the capitals. Every play gets the spelling
 * played most (the newest one on a tie), so stats, Clean up and History all show that one. Plays
 * that change are marked as merged, so History can still show what Last.fm has. Expects rows
 * sorted by time.
 */
export function unifyCasing(rows: StoredScrobble[]): StoredScrobble[] {
  // Every album and song name, per artist spelling. One lookup per play, mostly skipped: plays in
  // a row are usually by the same artist.
  const byArtist = new Map<string, { al: Set<string>; tr: Set<string> }>();
  let names: { al: Set<string>; tr: Set<string> } | undefined;
  let prevArtist: string | undefined;
  for (const r of rows) {
    if (r.ar !== prevArtist || !names) {
      names = byArtist.get(r.ar);
      if (!names) byArtist.set(r.ar, (names = { al: new Set(), tr: new Set() }));
      prevArtist = r.ar;
    }
    names.al.add(r.al);
    names.tr.add(r.tr);
  }

  // Per artist (ignoring capitals): which of its names come in more than one spelling. The same
  // name by two different artists ("Wake Up" / "wake up") is two songs, and isn't touched. Usually
  // nothing clashes, and that's the end of it.
  const clashing = (all: Iterable<string>) => {
    const byLower = new Map<string, string>();
    const out = new Set<string>();
    for (const n of all) {
      const k = n.toLowerCase();
      const other = byLower.get(k);
      if (other === undefined) byLower.set(k, n);
      else out.add(n).add(other);
    }
    return out;
  };
  const artistSpellings = new Map<string, string[]>();
  for (const ar of byArtist.keys()) {
    const k = ar.toLowerCase();
    const list = artistSpellings.get(k);
    if (list) list.push(ar);
    else artistSpellings.set(k, [ar]);
  }
  type Clash = { artist: boolean; al: Set<string>; tr: Set<string> };
  const clashes = new Map<string, Clash>(); // by artist spelling
  for (const spellings of artistSpellings.values()) {
    const al = clashing(spellings.flatMap((s) => [...byArtist.get(s)!.al]));
    const tr = clashing(spellings.flatMap((s) => [...byArtist.get(s)!.tr]));
    if (spellings.length < 2 && !al.size && !tr.size) continue;
    const c = { artist: spellings.length > 1, al, tr };
    for (const s of spellings) clashes.set(s, c);
  }
  if (!clashes.size) return rows;

  // The spelling played most (newest on a tie) for each clashing artist, album and song.
  const keyOf = (r: StoredScrobble, field: 'ar' | 'al' | 'tr') => (field === 'ar' ? r.ar.toLowerCase() : `${r.ar.toLowerCase()}\u0000${r[field].toLowerCase()}`);
  const isClash = (c: Clash, r: StoredScrobble, field: 'ar' | 'al' | 'tr') => (field === 'ar' ? c.artist : c[field].has(r[field]));
  const tally = new Map<string, Map<string, { plays: number; last: number }>>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const c = clashes.get(r.ar);
    if (!c) continue;
    for (const field of ['ar', 'al', 'tr'] as const) {
      if (!isClash(c, r, field)) continue;
      const k = `${field}\u0000${keyOf(r, field)}`;
      let spellings = tally.get(k);
      if (!spellings) tally.set(k, (spellings = new Map()));
      const x = spellings.get(r[field]);
      if (x) {
        x.plays++;
        x.last = i;
      } else spellings.set(r[field], { plays: 1, last: i });
    }
  }
  const pick = new Map<string, string>();
  for (const [k, spellings] of tally) {
    let best = '';
    let top = { plays: -1, last: -1 };
    for (const [name, x] of spellings) if (x.plays > top.plays || (x.plays === top.plays && x.last > top.last)) [best, top] = [name, x];
    pick.set(k, best);
  }

  let out: StoredScrobble[] | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const c = clashes.get(r.ar);
    if (!c) continue;
    const spelling = (field: 'ar' | 'al' | 'tr') => (isClash(c, r, field) ? (pick.get(`${field}\u0000${keyOf(r, field)}`) ?? r[field]) : r[field]);
    const ar = spelling('ar');
    const al = spelling('al');
    const tr = spelling('tr');
    if (ar === r.ar && al === r.al && tr === r.tr) continue;
    out ??= rows.slice();
    out[i] = { ...r, ar, al, tr, orig: r.orig ?? { ar: r.ar, tr: r.tr, al: r.al, merged: true } };
  }
  return out ?? rows;
}

/** Everything about names, in order: escapes decoded (garbled ones noted in `found`), then capitals joined. */
export const tidyNames = (rows: StoredScrobble[], found?: Garbled[]) => unifyCasing(decodeNames(rows, found));

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
