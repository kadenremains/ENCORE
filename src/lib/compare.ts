import { dayToDate, getStats, type Library } from './library';
import { albumBase, norm, trackBase } from './mismatches';
import type { TopEntry, TopPeriod } from './lastfm';
import type { TimeRange } from './types';

/**
 * Compare: two people's listening side by side. Each side is reduced to plays per artist, album and
 * song (names matched loosely across people: accents, apostrophes, "feat.", deluxe / single
 * versions), then compared. The match score is how much your listening overlaps: for every artist
 * you both play, the smaller of the two shares adds a little (Bhattacharyya overlap of the two
 * listening mixes), 0 = nothing in common, 100 = identical listening.
 */

export interface Item {
  name: string;
  artist: string; // '' for artists
  plays: number;
}

export interface Habits {
  plays: number;
  activeDays: number;
  perActiveDay: number;
  peakHour: number;
  busiestWeekday: number; // 0 = Monday
  /** different artists per 100 plays */
  variety: number;
  /** artists first played in this range */
  newArtists: number;
}

export interface Side {
  name: string;
  image?: string;
  total: number;
  artists: Map<string, Item>;
  albums: Map<string, Item>;
  tracks: Map<string, Item>;
  /** every artist they've ever played (exact with a full history; their top 1,000 otherwise) */
  ever: Set<string>;
  everExact: boolean;
  /** artist -> first play ever (full history only) */
  firstPlay?: Map<string, number>;
  /** first scrobble ever (full history only) */
  since?: number;
  /** month (year*12+month) -> artist -> plays (full history only) */
  monthly?: Map<number, Map<string, number>>;
  habits?: Habits;
}

export const artistKey = (name: string) => norm(name);
const albumKeyOf = (artist: string, album: string) => `${norm(artist)}\u0000${albumBase(album)}`;
const trackKeyOf = (artist: string, track: string) => `${norm(artist)}\u0000${trackBase(track)}`;

function add(m: Map<string, Item>, key: string, name: string, artist: string, plays: number) {
  const x = m.get(key);
  if (x) {
    // keep the most played spelling
    if (plays > x.plays) {
      x.name = name;
      x.artist = artist;
    }
    x.plays += plays;
  } else m.set(key, { name, artist, plays });
}

/* ---------------- building a side ---------------- */

/** From a downloaded history (yours, or a friend's full history), for a date range. */
export function sideFromLibrary(lib: Library, range: TimeRange, name: string, image?: string): Side {
  const st = getStats(lib, range);
  const artists = new Map<string, Item>();
  const albums = new Map<string, Item>();
  const tracks = new Map<string, Item>();
  for (const r of st.ranking('artist')) add(artists, artistKey(lib.artists[r.idx].name), lib.artists[r.idx].name, '', r.count);
  for (const r of st.ranking('album')) {
    const al = lib.albums[r.idx];
    const ar = lib.artists[al.artist].name;
    add(albums, albumKeyOf(ar, al.name), al.name, ar, r.count);
  }
  for (const r of st.ranking('track')) {
    const t = lib.tracks[r.idx];
    const ar = lib.artists[t.artist].name;
    add(tracks, trackKeyOf(ar, t.name), t.name, ar, r.count);
  }
  const ever = new Set<string>();
  const firstPlay = new Map<string, number>();
  lib.artists.forEach((a, i) => {
    const k = artistKey(a.name);
    ever.add(k);
    const f = lib.firstSeen.artist[i];
    if (Number.isFinite(f) && (!firstPlay.has(k) || f < firstPlay.get(k)!)) firstPlay.set(k, f);
  });
  // plays per artist, month by month (for "match over time")
  const monthly = new Map<number, Map<string, number>>();
  const keyOfArtist = lib.artists.map((a) => artistKey(a.name));
  let lastDay = NaN;
  let month = 0;
  for (let i = st.lo; i < st.hi; i++) {
    if (lib.day[i] !== lastDay) {
      lastDay = lib.day[i];
      const d = dayToDate(lastDay);
      month = d.getFullYear() * 12 + d.getMonth();
    }
    let m = monthly.get(month);
    if (!m) monthly.set(month, (m = new Map()));
    const k = keyOfArtist[lib.artist[i]];
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const wd = st.byWeekday();
  const total = st.total;
  return {
    name,
    image,
    total,
    artists,
    albums,
    tracks,
    ever,
    everExact: true,
    firstPlay,
    since: lib.n ? lib.ts[0] : undefined,
    monthly,
    habits: total
      ? {
          plays: total,
          activeDays: st.activeDays,
          perActiveDay: total / Math.max(1, st.activeDays),
          peakHour: st.byHour().reduce((best, v, h, a) => (v > a[best] ? h : best), 0),
          busiestWeekday: wd.reduce((best, v, d, a) => (v > a[best] ? d : best), 0),
          variety: (artists.size / total) * 100,
          newArtists: st.discoveries('artist').length,
        }
      : undefined,
  };
}

/** From Last.fm's top lists (quick: no download needed). */
export function sideFromTop(name: string, lists: { artists: TopEntry[]; albums: TopEntry[]; tracks: TopEntry[]; allArtists: TopEntry[] }, image?: string): Side {
  const artists = new Map<string, Item>();
  const albums = new Map<string, Item>();
  const tracks = new Map<string, Item>();
  for (const a of lists.artists) add(artists, artistKey(a.name), a.name, '', a.plays);
  for (const a of lists.albums) add(albums, albumKeyOf(a.artist, a.name), a.name, a.artist, a.plays);
  for (const t of lists.tracks) add(tracks, trackKeyOf(t.artist, t.name), t.name, t.artist, t.plays);
  let total = 0;
  for (const a of artists.values()) total += a.plays;
  return { name, image, total, artists, albums, tracks, ever: new Set(lists.allArtists.map((a) => artistKey(a.name)).concat([...artists.keys()])), everExact: false };
}

/* ---------------- Last.fm's fixed periods ---------------- */

const PERIOD_DAYS: [TopPeriod, number][] = [
  ['7day', 7],
  ['1month', 30],
  ['3month', 90],
  ['6month', 180],
  ['12month', 365],
];
export const PERIOD_LABEL: Record<TopPeriod, string> = { '7day': 'Last 7 days', '1month': 'Last 30 days', '3month': 'Last 3 months', '6month': 'Last 6 months', '12month': 'Last 12 months', overall: 'All time' };

/**
 * The nearest of Last.fm's fixed periods to a range (top lists only come in those), and the matching
 * window for your side so both are counted over the same stretch.
 */
export function nearestPeriod(range: TimeRange, nowSec = Date.now() / 1000): { period: TopPeriod; window: TimeRange; exact: boolean } {
  const to = Math.min(range.to, nowSec);
  const days = (to - range.from) / 86400;
  const endsNow = nowSec - to < 2 * 86400;
  if (!endsNow || days > 400 || range.from <= 0) return { period: 'overall', window: { from: 0, to: Infinity }, exact: range.from <= 0 && endsNow };
  let best = PERIOD_DAYS[0];
  for (const p of PERIOD_DAYS) if (Math.abs(p[1] - days) < Math.abs(best[1] - days)) best = p;
  return { period: best[0], window: { from: nowSec - best[1] * 86400, to: Infinity }, exact: Math.abs(best[1] - days) <= 2 };
}

/* ---------------- comparing ---------------- */

export interface Shared {
  key: string;
  name: string;
  artist: string;
  mine: number;
  theirs: number;
  /** how much of the overlap this one is (the smaller of the two shares) */
  weight: number;
}

export interface FirstFind {
  name: string;
  mine: number;
  theirs: number;
  /** who heard it first */
  first: 'me' | 'them' | 'same';
  days: number;
  /** the earlier play happened before the other person's history starts (so it may not be a real "first") */
  beforeOther: boolean;
}

export interface Comparison {
  score: number;
  label: string;
  line: string;
  sharedArtists: Shared[];
  sharedAlbums: Shared[];
  sharedTracks: Shared[];
  /** their artists you've never played */
  onlyThem: Item[];
  /** your artists they've never played (or that aren't in their top 1,000, without their full history) */
  onlyMe: Item[];
  onlyMeExact: boolean;
  firsts: FirstFind[] | null;
  overTime: { month: Date; score: number }[] | null;
}

const LABELS: [number, string][] = [
  [70, 'Practically the same person'],
  [50, 'Very similar'],
  [30, 'A lot in common'],
  [15, 'Some overlap'],
  [5, 'A little overlap'],
  [0, 'Different worlds'],
];
export const scoreLabel = (s: number) => LABELS.find(([min]) => s >= min)![1];

function overlap(a: Map<string, number>, at: number, b: Map<string, number>, bt: number): number {
  if (!at || !bt) return 0;
  let bc = 0;
  for (const [k, n] of a) {
    const m = b.get(k);
    if (m) bc += Math.sqrt((n / at) * (m / bt));
  }
  return bc;
}

const playsOf = (m: Map<string, Item>) => new Map([...m].map(([k, v]) => [k, v.plays]));

function shared(me: Map<string, Item>, meTotal: number, them: Map<string, Item>, themTotal: number): Shared[] {
  const out: Shared[] = [];
  for (const [k, a] of me) {
    const b = them.get(k);
    if (!b) continue;
    out.push({ key: k, name: a.name, artist: a.artist, mine: a.plays, theirs: b.plays, weight: Math.min(a.plays / meTotal, b.plays / themTotal) });
  }
  return out.sort((x, y) => y.weight - x.weight || y.mine + y.theirs - (x.mine + x.theirs));
}

export function compare(me: Side, them: Side): Comparison {
  const score = Math.round(100 * overlap(playsOf(me.artists), me.total, playsOf(them.artists), them.total));
  const sharedArtists = shared(me.artists, me.total, them.artists, them.total);
  const tTot = (m: Map<string, Item>) => [...m.values()].reduce((n, x) => n + x.plays, 0) || 1;
  const sharedAlbums = shared(me.albums, tTot(me.albums), them.albums, tTot(them.albums));
  const sharedTracks = shared(me.tracks, tTot(me.tracks), them.tracks, tTot(them.tracks));
  const byPlays = (m: Map<string, Item>) => [...m.entries()].sort((a, b) => b[1].plays - a[1].plays);
  const onlyThem = byPlays(them.artists)
    .filter(([k]) => !me.ever.has(k))
    .slice(0, 25)
    .map(([, v]) => v);
  const onlyMe = byPlays(me.artists)
    .filter(([k]) => !them.ever.has(k))
    .slice(0, 25)
    .map(([, v]) => v);

  let firsts: FirstFind[] | null = null;
  if (me.firstPlay && them.firstPlay) {
    firsts = [];
    for (const s of sharedArtists) {
      const a = me.firstPlay.get(s.key);
      const b = them.firstPlay.get(s.key);
      if (a === undefined || b === undefined) continue;
      const days = Math.round(Math.abs(a - b) / 86400);
      const first = days < 1 ? 'same' : a < b ? 'me' : 'them';
      // the earlier play is from before the other person started scrobbling: they may have known it already
      const beforeOther = first === 'me' ? (them.since ?? 0) > a : first === 'them' ? (me.since ?? 0) > b : false;
      firsts.push({ name: s.name, mine: a, theirs: b, first, days, beforeOther });
    }
  }

  let overTime: Comparison['overTime'] = null;
  if (me.monthly && them.monthly) {
    overTime = [];
    const months = [...me.monthly.keys()].filter((m) => them.monthly!.has(m)).sort((a, b) => a - b);
    for (const m of months) {
      const a = me.monthly.get(m)!;
      const b = them.monthly.get(m)!;
      const at = [...a.values()].reduce((n, x) => n + x, 0);
      const bt = [...b.values()].reduce((n, x) => n + x, 0);
      if (at < 20 || bt < 20) continue; // too little to say
      overTime.push({ month: new Date(Math.floor(m / 12), m % 12, 1), score: Math.round(100 * overlap(a, at, b, bt)) });
    }
    if (overTime.length < 2) overTime = null;
  }

  const top = sharedArtists[0];
  const line = !sharedArtists.length
    ? 'Not a single artist in common here.'
    : `${sharedArtists.length.toLocaleString()} artist${sharedArtists.length === 1 ? '' : 's'} in common · you meet most on ${top.name}`;
  return { score, label: scoreLabel(score), line, sharedArtists, sharedAlbums, sharedTracks, onlyThem, onlyMe, onlyMeExact: them.everExact, firsts, overTime };
}
