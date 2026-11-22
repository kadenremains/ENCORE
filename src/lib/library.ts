import type { EntityKind, RankedItem, StoredScrobble, TimeRange } from './types';

/**
 * Compact, column-oriented, in-memory view of the whole scrobble history.
 * Strings are interned, so aggregations are integer counting over typed arrays.
 */
export interface Library {
  version: number;
  n: number;
  ts: Float64Array; // ascending unix seconds
  day: Int32Array; // local day number (days since epoch in local time)
  hour: Uint8Array;
  weekday: Uint8Array; // 0 = Monday
  artist: Int32Array;
  track: Int32Array;
  album: Int32Array; // -1 when no album
  artists: { name: string }[];
  tracks: { name: string; artist: number; album: number }[];
  albums: { name: string; artist: number; img?: string }[];
  firstSeen: Record<EntityKind, Float64Array>;
  /** lowercase lookup keys -> index */
  keys: { artist: Map<string, number>; album: Map<string, number>; track: Map<string, number> };
}

let versionCounter = 1;

export function buildLibrary(rows: StoredScrobble[]): Library {
  rows.sort((a, b) => a.ts - b.ts);
  const n = rows.length;
  const ts = new Float64Array(n);
  const day = new Int32Array(n);
  const hour = new Uint8Array(n);
  const weekday = new Uint8Array(n);
  const artist = new Int32Array(n);
  const track = new Int32Array(n);
  const album = new Int32Array(n);
  const artists: Library['artists'] = [];
  const tracks: Library['tracks'] = [];
  const albums: Library['albums'] = [];
  const aMap = new Map<string, number>();
  const tMap = new Map<string, number>();
  const alMap = new Map<string, number>();
  const aFirst: number[] = [];
  const tFirst: number[] = [];
  const alFirst: number[] = [];

  for (let i = 0; i < n; i++) {
    const r = rows[i];
    ts[i] = r.ts;
    const d = new Date(r.ts * 1000);
    day[i] = Math.floor((r.ts * 1000 - d.getTimezoneOffset() * 60000) / 86400000);
    hour[i] = d.getHours();
    weekday[i] = (d.getDay() + 6) % 7;

    const ak = r.ar.toLowerCase();
    let ai = aMap.get(ak);
    if (ai === undefined) {
      ai = artists.length;
      aMap.set(ak, ai);
      artists.push({ name: r.ar });
      aFirst.push(r.ts);
    } else artists[ai].name = r.ar; // keep most recent casing
    artist[i] = ai;

    let ali = -1;
    if (r.al) {
      const k = ak + '\u0000' + r.al.toLowerCase();
      let x = alMap.get(k);
      if (x === undefined) {
        x = albums.length;
        alMap.set(k, x);
        albums.push({ name: r.al, artist: ai });
        alFirst.push(r.ts);
      } else albums[x].name = r.al;
      if (r.img) albums[x].img = r.img;
      ali = x;
    }
    album[i] = ali;

    const tk = ak + '\u0000' + r.tr.toLowerCase();
    let ti = tMap.get(tk);
    if (ti === undefined) {
      ti = tracks.length;
      tMap.set(tk, ti);
      tracks.push({ name: r.tr, artist: ai, album: ali });
      tFirst.push(r.ts);
    } else {
      tracks[ti].name = r.tr;
      if (ali >= 0) tracks[ti].album = ali;
    }
    track[i] = ti;
  }

  return {
    version: versionCounter++,
    n,
    ts,
    day,
    hour,
    weekday,
    artist,
    track,
    album,
    artists,
    tracks,
    albums,
    firstSeen: { artist: Float64Array.from(aFirst), track: Float64Array.from(tFirst), album: Float64Array.from(alFirst) },
    keys: { artist: aMap, album: alMap, track: tMap },
  };
}

function lowerBound(arr: Float64Array, x: number) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function dayToDate(dayNum: number) {
  const d = new Date(dayNum * 86400000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface Ranked {
  idx: number;
  count: number;
}

export interface Streak {
  days: number;
  start: number; // day number
  end: number;
}

/** Lazily computed statistics for one time range. */
export class RangeStats {
  readonly lib: Library;
  readonly range: TimeRange;
  readonly lo: number;
  readonly hi: number;
  private cache = new Map<string, unknown>();

  constructor(lib: Library, range: TimeRange) {
    this.lib = lib;
    this.range = range;
    this.lo = lowerBound(lib.ts, range.from);
    this.hi = lowerBound(lib.ts, range.to);
  }

  private memo<T>(key: string, fn: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key) as T;
  }

  get total() {
    return this.hi - this.lo;
  }

  private column(kind: EntityKind) {
    return kind === 'artist' ? this.lib.artist : kind === 'album' ? this.lib.album : this.lib.track;
  }

  private size(kind: EntityKind) {
    return kind === 'artist' ? this.lib.artists.length : kind === 'album' ? this.lib.albums.length : this.lib.tracks.length;
  }

  ranking(kind: EntityKind): Ranked[] {
    return this.memo(`rank:${kind}`, () => {
      const col = this.column(kind);
      const counts = new Int32Array(this.size(kind));
      // last play position, used as a tie-breaker (who got there first wins)
      const firstPos = new Int32Array(this.size(kind)).fill(-1);
      for (let i = this.lo; i < this.hi; i++) {
        const v = col[i];
        if (v < 0) continue;
        counts[v]++;
        if (firstPos[v] < 0) firstPos[v] = i;
      }
      const out: Ranked[] = [];
      for (let i = 0; i < counts.length; i++) if (counts[i] > 0) out.push({ idx: i, count: counts[i] });
      out.sort((a, b) => b.count - a.count || firstPos[a.idx] - firstPos[b.idx]);
      return out;
    });
  }

  /** Entities whose first-ever scrobble falls inside this range. */
  discoveries(kind: EntityKind): Ranked[] {
    return this.memo(`disc:${kind}`, () => {
      const first = this.lib.firstSeen[kind];
      return this.ranking(kind).filter((r) => first[r.idx] >= this.range.from);
    });
  }

  unique(kind: EntityKind) {
    return this.ranking(kind).length;
  }

  item(kind: EntityKind, r: Ranked, rank: number): RankedItem {
    const lib = this.lib;
    if (kind === 'artist') return { kind, idx: r.idx, name: lib.artists[r.idx].name, artist: lib.artists[r.idx].name, count: r.count, rank };
    if (kind === 'album') {
      const a = lib.albums[r.idx];
      return { kind, idx: r.idx, name: a.name, artist: lib.artists[a.artist].name, count: r.count, rank };
    }
    const t = lib.tracks[r.idx];
    return { kind, idx: r.idx, name: t.name, artist: lib.artists[t.artist].name, album: t.album >= 0 ? lib.albums[t.album].name : undefined, count: r.count, rank };
  }

  top(kind: EntityKind, n: number, opts: { discoveriesOnly?: boolean; offset?: number } = {}): RankedItem[] {
    const list = opts.discoveriesOnly ? this.discoveries(kind) : this.ranking(kind);
    const off = opts.offset ?? 0;
    return list.slice(off, off + n).map((r, i) => this.item(kind, r, off + i + 1));
  }

  rankMap(kind: EntityKind): Map<number, { rank: number; count: number }> {
    return this.memo(`rankmap:${kind}`, () => {
      const m = new Map<number, { rank: number; count: number }>();
      this.ranking(kind).forEach((r, i) => m.set(r.idx, { rank: i + 1, count: r.count }));
      return m;
    });
  }

  byHour(): number[] {
    return this.memo('hour', () => {
      const out = new Array(24).fill(0);
      for (let i = this.lo; i < this.hi; i++) out[this.lib.hour[i]]++;
      return out;
    });
  }

  byWeekday(): number[] {
    return this.memo('weekday', () => {
      const out = new Array(7).fill(0);
      for (let i = this.lo; i < this.hi; i++) out[this.lib.weekday[i]]++;
      return out;
    });
  }

  /** Map day number -> scrobbles. */
  dayCounts(): Map<number, number> {
    return this.memo('days', () => {
      const m = new Map<number, number>();
      for (let i = this.lo; i < this.hi; i++) {
        const d = this.lib.day[i];
        m.set(d, (m.get(d) ?? 0) + 1);
      }
      return m;
    });
  }

  get firstDay() {
    return this.total ? this.lib.day[this.lo] : 0;
  }

  get lastDay() {
    return this.total ? this.lib.day[this.hi - 1] : 0;
  }

  /** Number of calendar days the range spans (clamped to the data). */
  get spanDays() {
    const startDay = Math.max(this.dayOf(this.range.from), this.lib.n ? this.lib.day[0] : 0);
    const endDay = Math.min(this.dayOf(this.range.to - 1), this.dayOf(Date.now() / 1000));
    return Math.max(1, endDay - startDay + 1);
  }

  private dayOf(tsSec: number) {
    const d = new Date(tsSec * 1000);
    return Math.floor((tsSec * 1000 - d.getTimezoneOffset() * 60000) / 86400000);
  }

  get activeDays() {
    return this.dayCounts().size;
  }

  busiestDay(): { day: number; count: number } | null {
    return this.memo('busiest', () => {
      let best: { day: number; count: number } | null = null;
      for (const [day, count] of this.dayCounts()) if (!best || count > best.count) best = { day, count };
      return best;
    });
  }

  longestStreak(): Streak | null {
    return this.memo('streak', () => {
      const days = [...this.dayCounts().keys()].sort((a, b) => a - b);
      if (!days.length) return null;
      let best: Streak = { days: 1, start: days[0], end: days[0] };
      let cur: Streak = { ...best };
      for (let i = 1; i < days.length; i++) {
        if (days[i] === days[i - 1] + 1) {
          cur.days++;
          cur.end = days[i];
        } else cur = { days: 1, start: days[i], end: days[i] };
        if (cur.days > best.days) best = { ...cur };
      }
      return best;
    });
  }

  /** Longest run of consecutive days with at least one play of a given artist. */
  artistStreak(): { artist: number; streak: Streak } | null {
    return this.memo('artistStreak', () => {
      const lastDay = new Map<number, number>();
      const cur = new Map<number, Streak>();
      let best: { artist: number; streak: Streak } | null = null;
      for (let i = this.lo; i < this.hi; i++) {
        const a = this.lib.artist[i];
        const d = this.lib.day[i];
        const ld = lastDay.get(a);
        if (ld === d) continue;
        let s = cur.get(a);
        if (ld !== undefined && ld === d - 1 && s) {
          s.days++;
          s.end = d;
        } else {
          s = { days: 1, start: d, end: d };
          cur.set(a, s);
        }
        lastDay.set(a, d);
        if (!best || s.days > best.streak.days) best = { artist: a, streak: { ...s } };
      }
      return best;
    });
  }

  /** The most plays of one track in a single day. */
  obsession(): { track: number; day: number; count: number } | null {
    return this.memo('obsession', () => {
      const m = new Map<number, number>();
      let best: { track: number; day: number; count: number } | null = null;
      for (let i = this.lo; i < this.hi; i++) {
        const key = this.lib.day[i] * 4194304 + this.lib.track[i]; // safe combo while tracks < 4M
        const c = (m.get(key) ?? 0) + 1;
        m.set(key, c);
        if (!best || c > best.count) best = { track: this.lib.track[i], day: this.lib.day[i], count: c };
      }
      return best;
    });
  }

  peakHour() {
    const h = this.byHour();
    let best = 0;
    for (let i = 1; i < 24; i++) if (h[i] > h[best]) best = i;
    return best;
  }

  /** Bucketed series for timeline charts. */
  timeline(bucket: 'day' | 'week' | 'month' | 'year' | 'auto'): { label: string; start: Date; value: number }[] {
    return this.memo(`tl:${bucket}`, () => {
      if (!this.total) return [];
      const span = this.spanDays;
      const b = bucket === 'auto' ? (span <= 45 ? 'day' : span <= 200 ? 'week' : span <= 1500 ? 'month' : 'year') : bucket;
      const startDate = new Date(Math.max(this.range.from, this.lib.ts[0]) * 1000);
      const endDate = new Date(Math.min(this.range.to * 1000 - 1, Date.now()));
      const keyOf = (d: Date) => {
        if (b === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (b === 'week') {
          const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
          return x;
        }
        if (b === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
        return new Date(d.getFullYear(), 0, 1);
      };
      const next = (d: Date) => {
        const x = new Date(d);
        if (b === 'day') x.setDate(x.getDate() + 1);
        else if (b === 'week') x.setDate(x.getDate() + 7);
        else if (b === 'month') x.setMonth(x.getMonth() + 1);
        else x.setFullYear(x.getFullYear() + 1);
        return x;
      };
      const buckets: { label: string; start: Date; value: number }[] = [];
      const index = new Map<number, number>();
      for (let d = keyOf(startDate); d <= endDate; d = next(d)) {
        index.set(d.getTime(), buckets.length);
        const label =
          b === 'year'
            ? String(d.getFullYear())
            : b === 'month'
              ? d.toLocaleDateString(undefined, { month: 'short' })
              : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        buckets.push({ label, start: d, value: 0 });
      }
      for (const [dayNum, c] of this.dayCounts()) {
        const k = keyOf(dayToDate(dayNum)).getTime();
        const i = index.get(k);
        if (i !== undefined) buckets[i].value += c;
      }
      return buckets;
    });
  }

  /** #1 entity of each month in the range. */
  topPerMonth(kind: EntityKind): { month: Date; item: RankedItem | null; count: number }[] {
    return this.memo(`tpm:${kind}`, () => {
      const col = this.column(kind);
      const months = new Map<number, Map<number, number>>();
      for (let i = this.lo; i < this.hi; i++) {
        const v = col[i];
        if (v < 0) continue;
        const d = dayToDate(this.lib.day[i]);
        const mk = d.getFullYear() * 12 + d.getMonth();
        let m = months.get(mk);
        if (!m) months.set(mk, (m = new Map()));
        m.set(v, (m.get(v) ?? 0) + 1);
      }
      return [...months.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([mk, m]) => {
          let best = -1;
          let bc = 0;
          for (const [k, c] of m) if (c > bc) ((best = k), (bc = c));
          return { month: new Date(Math.floor(mk / 12), mk % 12, 1), item: best >= 0 ? this.item(kind, { idx: best, count: bc }, 1) : null, count: bc };
        });
    });
  }

  /** 7×24 matrix of plays, [weekday Mon..Sun][hour] */
  hourWeekday(): number[][] {
    return this.memo('hw', () => {
      const m = Array.from({ length: 7 }, () => new Array(24).fill(0));
      for (let i = this.lo; i < this.hi; i++) m[this.lib.weekday[i]][this.lib.hour[i]]++;
      return m;
    });
  }

  topDays(n: number): { day: number; count: number }[] {
    return [...this.dayCounts().entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => b.count - a.count || a.day - b.day)
      .slice(0, n);
  }

  /** Per-month summary rows (oldest first). */
  monthTable(): { month: Date; plays: number; artists: number; top: RankedItem | null; topTrack: RankedItem | null }[] {
    return this.memo('monthTable', () => {
      const rows = new Map<number, { plays: number; artists: Map<number, number>; tracks: Map<number, number> }>();
      for (let i = this.lo; i < this.hi; i++) {
        const d = dayToDate(this.lib.day[i]);
        const mk = d.getFullYear() * 12 + d.getMonth();
        let r = rows.get(mk);
        if (!r) rows.set(mk, (r = { plays: 0, artists: new Map(), tracks: new Map() }));
        r.plays++;
        const a = this.lib.artist[i];
        r.artists.set(a, (r.artists.get(a) ?? 0) + 1);
        const t = this.lib.track[i];
        r.tracks.set(t, (r.tracks.get(t) ?? 0) + 1);
      }
      const best = (m: Map<number, number>) => {
        let bi = -1;
        let bc = 0;
        for (const [k, c] of m) if (c > bc) ((bi = k), (bc = c));
        return { idx: bi, count: bc };
      };
      return [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([mk, r]) => {
          const ba = best(r.artists);
          const bt = best(r.tracks);
          return {
            month: new Date(Math.floor(mk / 12), mk % 12, 1),
            plays: r.plays,
            artists: r.artists.size,
            top: ba.idx >= 0 ? this.item('artist', ba, 1) : null,
            topTrack: bt.idx >= 0 ? this.item('track', bt, 1) : null,
          };
        });
    });
  }

  /** Biggest calendar week / month / year in the range. */
  biggestPeriod(bucket: 'week' | 'month' | 'year'): { start: Date; value: number } | null {
    const tl = this.timeline(bucket);
    let best: { start: Date; value: number } | null = null;
    for (const t of tl) if (!best || t.value > best.value) best = { start: t.start, value: t.value };
    return best && best.value > 0 ? best : null;
  }


  countOf(kind: EntityKind, idx: number) {
    return this.rankMap(kind).get(idx)?.count ?? 0;
  }
}

const statsCache = new Map<string, RangeStats>();

export function getStats(lib: Library, range: TimeRange): RangeStats {
  const key = `${lib.version}:${range.from}:${range.to}`;
  let s = statsCache.get(key);
  if (!s) {
    if (statsCache.size > 40) statsCache.clear();
    s = new RangeStats(lib, range);
    statsCache.set(key, s);
  }
  return s;
}

/* ---------------- entity lookups & per-entity stats ---------------- */

export function findEntity(lib: Library, kind: EntityKind, name: string, artist: string): number {
  const a = artist.toLowerCase();
  if (kind === 'artist') return lib.keys.artist.get(a) ?? -1;
  return lib.keys[kind].get(a + '\u0000' + name.toLowerCase()) ?? -1;
}

export interface EntityRangeStats {
  plays: number;
  days: number;
  first: number | null; // ts within range
  last: number | null;
  byHour: number[];
  byWeekday: number[];
  dayCounts: Map<number, number>;
  busiestDay: { day: number; count: number } | null;
  streak: Streak | null;
  tracks: Ranked[]; // songs within this artist / album
  albums: Ranked[]; // albums within this artist
  artistsOf: Ranked[]; // (unused for artists) artist breakdown
}

export interface EntityAllTime {
  plays: number;
  first: number;
  last: number;
  months: { month: Date; value: number }[];
}

function columnOf(lib: Library, kind: EntityKind) {
  return kind === 'artist' ? lib.artist : kind === 'album' ? lib.album : lib.track;
}

const entityCache = new Map<string, unknown>();
function ememo<T>(key: string, fn: () => T): T {
  if (!entityCache.has(key)) {
    if (entityCache.size > 200) entityCache.clear();
    entityCache.set(key, fn());
  }
  return entityCache.get(key) as T;
}

export function entityRangeStats(lib: Library, kind: EntityKind, idx: number, range: TimeRange): EntityRangeStats {
  return ememo(`er:${lib.version}:${kind}:${idx}:${range.from}:${range.to}`, () => {
    const col = columnOf(lib, kind);
    const lo = lowerBound(lib.ts, range.from);
    const hi = lowerBound(lib.ts, range.to);
    const byHour = new Array(24).fill(0);
    const byWeekday = new Array(7).fill(0);
    const dayCounts = new Map<number, number>();
    const tracks = new Map<number, number>();
    const albums = new Map<number, number>();
    let plays = 0;
    let first: number | null = null;
    let last: number | null = null;
    for (let i = lo; i < hi; i++) {
      if (col[i] !== idx) continue;
      plays++;
      if (first === null) first = lib.ts[i];
      last = lib.ts[i];
      byHour[lib.hour[i]]++;
      byWeekday[lib.weekday[i]]++;
      const d = lib.day[i];
      dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
      tracks.set(lib.track[i], (tracks.get(lib.track[i]) ?? 0) + 1);
      if (lib.album[i] >= 0) albums.set(lib.album[i], (albums.get(lib.album[i]) ?? 0) + 1);
    }
    let busiestDay: { day: number; count: number } | null = null;
    for (const [day, count] of dayCounts) if (!busiestDay || count > busiestDay.count) busiestDay = { day, count };
    const days = [...dayCounts.keys()].sort((a, b) => a - b);
    let streak: Streak | null = null;
    if (days.length) {
      let cur: Streak = { days: 1, start: days[0], end: days[0] };
      streak = { ...cur };
      for (let i = 1; i < days.length; i++) {
        if (days[i] === days[i - 1] + 1) ((cur.days += 1), (cur.end = days[i]));
        else cur = { days: 1, start: days[i], end: days[i] };
        if (cur.days > streak.days) streak = { ...cur };
      }
    }
    const rank = (m: Map<number, number>) => [...m.entries()].map(([i, c]) => ({ idx: i, count: c })).sort((a, b) => b.count - a.count);
    return { plays, days: dayCounts.size, first, last, byHour, byWeekday, dayCounts, busiestDay, streak, tracks: rank(tracks), albums: rank(albums), artistsOf: [] };
  });
}

export function entityAllTime(lib: Library, kind: EntityKind, idx: number): EntityAllTime {
  return ememo(`ea:${lib.version}:${kind}:${idx}`, () => {
    const col = columnOf(lib, kind);
    let plays = 0;
    let first = 0;
    let last = 0;
    const months = new Map<number, number>();
    for (let i = 0; i < lib.n; i++) {
      if (col[i] !== idx) continue;
      if (!plays) first = lib.ts[i];
      plays++;
      last = lib.ts[i];
      const d = dayToDate(lib.day[i]);
      const mk = d.getFullYear() * 12 + d.getMonth();
      months.set(mk, (months.get(mk) ?? 0) + 1);
    }
    // continuous monthly series from first play to now
    const out: { month: Date; value: number }[] = [];
    if (plays) {
      const s = new Date(first * 1000);
      const e = new Date();
      for (let y = s.getFullYear(), m = s.getMonth(); y < e.getFullYear() || (y === e.getFullYear() && m <= e.getMonth()); m === 11 ? ((m = 0), y++) : m++) {
        out.push({ month: new Date(y, m, 1), value: months.get(y * 12 + m) ?? 0 });
      }
    }
    return { plays, first, last, months: out };
  });
}

/** The scrobble that hit each round-number milestone. */
export function milestones(lib: Library): { n: number; ts: number; track: number }[] {
  const marks = [1, 100, 500, 1000, 2500, 5000, 10000, 15000, 20000, 25000];
  for (let m = 50000; m <= lib.n; m += 25000) marks.push(m);
  return marks.filter((m) => m <= lib.n).map((m) => ({ n: m, ts: lib.ts[m - 1], track: lib.track[m - 1] }));
}
