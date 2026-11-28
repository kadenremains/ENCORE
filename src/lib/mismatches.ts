import type { StoredScrobble } from './types';

/**
 * Mismatched scrobbles: the same song, album or artist scrobbled under different names
 * ("Song - Single" vs the album, "(Deluxe Edition)", curly vs straight apostrophes, "feat." in the
 * title, no album at all). Found from the raw history, and fixable two ways:
 *  - merge in Encore: a rule that renames them while the library is built (Last.fm is untouched)
 *  - edit on Last.fm (Pro), then "Check for Last.fm edits" picks the change up
 */

export type MismatchKind = 'song-albums' | 'album-names' | 'song-names' | 'artist-names';

/** Why a name looks like a variant (shown as small labels). */
export type Tag = 'single' | 'named-after-song' | 'ep' | 'deluxe' | 'remaster' | 'explicit' | 'version' | 'feat' | 'no-album' | 'spelling';

export const TAG_LABEL: Record<Tag, string> = {
  single: 'single',
  'named-after-song': 'named after the song',
  ep: 'EP',
  deluxe: 'edition',
  remaster: 'remaster',
  explicit: 'explicit',
  version: 'version',
  feat: 'feat.',
  'no-album': 'no album',
  spelling: 'spelling',
};

export interface Variant {
  /** as scrobbled (most recent spelling); '' = no album */
  name: string;
  /** lowercase name, what a fix matches on */
  key: string;
  plays: number;
  first: number;
  last: number;
  tags: Tag[];
  /**
   * song-albums: other editions of the same album the song was also scrobbled from ("bologna 2 -
   * Single" next to "bologna 2"). They count as this one here; which edition to keep is up to the
   * album's own card.
   */
  also?: { key: string; name: string; plays: number }[];
}

export interface Mismatch {
  /** stable id (kind + what's mismatched), used to mark it as fine */
  id: string;
  kind: MismatchKind;
  /** song artist (lowercase key for fixes, and as shown) */
  artistKey: string;
  artist: string;
  /** the song (song-albums), or the shared base name */
  title: string;
  /** song key for song-albums fixes */
  trackKey?: string;
  variants: Variant[];
  /** index of the name Encore suggests keeping */
  suggested: number;
  plays: number;
  /** plays under the other names (what merging would move) */
  off: number;
  /** changes when a new variant shows up, so something you marked as fine comes back */
  sig: string;
}

/** A merge you made in Encore: scrobbles matching `from` are counted as `to`. */
export interface Fix {
  k: 'artist' | 'album' | 'track' | 'song-album';
  /** song artist, lowercase (album / track / song-album) */
  a?: string;
  /** song, lowercase (song-album) */
  t?: string;
  /** lowercase name being replaced ('' = no album, for song-album) */
  from: string;
  to: string;
  /** the mismatch it came from (undo works per mismatch) */
  g: string;
  at: number;
  /** for the list of merges: what it was about, and the replaced name as scrobbled */
  n?: string;
  fn?: string;
}

/* ------------------------------------------------------------------ names */

const MARKS = /[̀-ͯ]/g;

/** Lowercase, no accents, one kind of apostrophe / quote / dash, single spaces. */
export function norm(s: string) {
  return s
    .normalize('NFKD')
    .replace(MARKS, '')
    .toLowerCase()
    .replace(/[‘’‛`´′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+&\s+/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PAREN = (words: string) => new RegExp(`\\s*[([][^()[\\]]*\\b(${words})\\b[^()[\\]]*[)\\]]$`);
const DASH = (words: string) => new RegExp(`\\s+-\\s+[^-]*\\b(${words})\\b[^-]*$`);

const ALBUM_EDITION = 'deluxe|edition|expanded|anniversary|bonus|reissue|special|complete|remaster|remastered|explicit|clean|version';
const ALBUM_STRIP = [/\s*[-:]\s*(single|ep)$/, /\s*[([]\s*(single|ep)\s*[)\]]$/, /\s+ep$/, PAREN(ALBUM_EDITION), DASH(ALBUM_EDITION)];

const TRACK_EXTRA = 'remaster|remastered|explicit|clean|single version|album version|radio version';
const FEAT_PAREN = /\s*[([]\s*(feat\.?|ft\.?|featuring|with)\s[^()[\]]*[)\]]$/;
const FEAT_TAIL = /\s+(feat\.?|ft\.?|featuring)\s.*$/;
const TRACK_STRIP = [FEAT_PAREN, FEAT_TAIL, PAREN(TRACK_EXTRA), DASH(TRACK_EXTRA)];

function stripAll(s: string, patterns: RegExp[]) {
  let cur = s;
  for (let guard = 0; guard < 6; guard++) {
    let next = cur;
    for (const p of patterns) next = next.replace(p, '').trim();
    if (next === cur) break;
    cur = next;
  }
  return cur || s;
}

export const albumBase = (name: string) => stripAll(norm(name), ALBUM_STRIP);
export const trackBase = (name: string) => stripAll(norm(name), TRACK_STRIP);

const FEAT_ARTIST = /\s+(feat\.?|ft\.?|featuring)\s.*$/i;
/** "The Weeknd" / "the weeknd" / "Weeknd, The"; "Beyoncé" / "Beyonce"; "Drake feat. Future" → Drake. */
export function artistBase(name: string) {
  const main = norm(name).replace(FEAT_ARTIST, '').replace(/,\s*the$/, '').replace(/^the\s+/, '');
  return main.replace(/[^\p{L}\p{N}]+/gu, '') || norm(name);
}

function albumTags(name: string, track?: string): Tag[] {
  if (!name) return ['no-album'];
  const n = norm(name);
  const tags: Tag[] = [];
  if (/[-:]\s*single$|[([]\s*single\s*[)\]]$/.test(n)) tags.push('single');
  else if (track && n === norm(track)) tags.push('named-after-song');
  if (/[-:]\s*ep$|[([]\s*ep\s*[)\]]$|\sep$/.test(n)) tags.push('ep');
  if (/\b(deluxe|edition|expanded|anniversary|bonus|reissue|special|complete)\b/.test(n)) tags.push('deluxe');
  if (/\bremaster/.test(n)) tags.push('remaster');
  if (/[([-][^()]*\b(explicit|clean)\b/.test(n)) tags.push('explicit');
  return tags;
}

function trackTags(name: string): Tag[] {
  const n = norm(name);
  const tags: Tag[] = [];
  if (FEAT_PAREN.test(n) || FEAT_TAIL.test(n) || /[([]\s*(feat\.?|ft\.?|featuring|with)\s/.test(n)) tags.push('feat');
  if (/\bremaster/.test(n)) tags.push('remaster');
  if (/\b(explicit|clean)\b/.test(n)) tags.push('explicit');
  if (/\b(single|album|radio) version\b/.test(n)) tags.push('version');
  return tags;
}

/* ------------------------------------------------------------------ merges */

/**
 * Apply your merges to the raw history. Returns new objects only for scrobbles that change, so the
 * stored history is never modified (undoing a merge just rebuilds without it).
 */
export function applyFixes(rows: StoredScrobble[], fixes: Fix[] | undefined): StoredScrobble[] {
  if (!fixes?.length) return rows;
  const artist = new Map<string, string>();
  const track = new Map<string, string>();
  const album = new Map<string, string>();
  const songAlbum = new Map<string, string>();
  for (const f of fixes) {
    if (f.k === 'artist') artist.set(f.from, f.to);
    else if (f.k === 'track') track.set(`${f.a}\0${f.from}`, f.to);
    else if (f.k === 'album') album.set(`${f.a}\0${f.from}`, f.to);
    else songAlbum.set(`${f.a}\0${f.t}\0${f.from}`, f.to);
  }
  // follow chains (A → B, then later B → C) so a scrobble ends on the last name
  const follow = (m: Map<string, string>, key: string, rekey: (to: string) => string) => {
    let to = m.get(key);
    for (let i = 0; to !== undefined && i < 8; i++) {
      const next = m.get(rekey(to));
      if (next === undefined || next === to) break;
      to = next;
    }
    return to;
  };
  const out = new Array<StoredScrobble>(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let ar = r.ar;
    let tr = r.tr;
    let al = r.al;
    if (artist.size) ar = follow(artist, ar.toLowerCase(), (x) => x.toLowerCase()) ?? ar;
    const a = ar.toLowerCase();
    if (track.size) tr = follow(track, `${a}\0${tr.toLowerCase()}`, (x) => `${a}\0${x.toLowerCase()}`) ?? tr;
    if (album.size && al) al = follow(album, `${a}\0${al.toLowerCase()}`, (x) => `${a}\0${x.toLowerCase()}`) ?? al;
    if (songAlbum.size) {
      const t = tr.toLowerCase();
      al = follow(songAlbum, `${a}\0${t}\0${al.toLowerCase()}`, (x) => `${a}\0${t}\0${x.toLowerCase()}`) ?? al;
    }
    if (ar === r.ar && tr === r.tr && al === r.al) out[i] = r;
    else {
      const c: StoredScrobble = { ...r, ar, tr, al, orig: { ...(r.orig ?? { ar: r.ar, tr: r.tr, al: r.al }), merged: true } };
      if (al !== r.al) delete c.img; // the old release's cover doesn't belong to the new one
      out[i] = c;
    }
  }
  return out;
}

/** The merges that fix a mismatch by keeping variant `keep`. */
export function fixesFor(m: Mismatch, keep: number): Fix[] {
  const to = m.variants[keep];
  const base = { g: m.id, at: Date.now(), to: to.name, n: m.kind === 'artist-names' ? '' : `${m.title} · ${m.artist}` };
  return m.variants
    .filter((_, i) => i !== keep)
    .flatMap((v) => [{ key: v.key, name: v.name }, ...(v.also ?? [])])
    .filter((v) => !(m.kind === 'song-albums' && v.key === to.key))
    .map((v): Fix => {
      const f = { ...base, from: v.key, fn: v.name };
      switch (m.kind) {
        case 'artist-names':
          return { ...f, k: 'artist' };
        case 'album-names':
          return { ...f, k: 'album', a: m.artistKey };
        case 'song-names':
          return { ...f, k: 'track', a: m.artistKey };
        case 'song-albums':
          return { ...f, k: 'song-album', a: m.artistKey, t: m.trackKey };
      }
    });
}

/* ------------------------------------------------------------------ finding them */

interface Acc {
  name: string;
  plays: number;
  first: number;
  last: number;
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const sum = (vs: Variant[]) => vs.reduce((s, v) => s + v.plays, 0);

function pickBest(vs: Variant[], score: (v: Variant) => number) {
  let best = 0;
  for (let i = 1; i < vs.length; i++) {
    const a = score(vs[i]);
    const b = score(vs[best]);
    if (a > b || (a === b && vs[i].plays > vs[best].plays)) best = i;
  }
  return best;
}

const ALBUM_RANK: Partial<Record<Tag, number>> = { 'no-album': -10, single: -6, 'named-after-song': -5, ep: -3, deluxe: -1, remaster: -1, explicit: -0.5 };
const albumScore = (v: Variant) => v.tags.reduce((s, t) => s + (ALBUM_RANK[t] ?? 0), 0);

function make(kind: MismatchKind, key: string, artistKey: string, artist: string, title: string, variants: Variant[], score: (v: Variant) => number, trackKey?: string): Mismatch {
  variants.sort((a, b) => b.plays - a.plays);
  let suggested = pickBest(variants, score);
  // a song you mostly play from its single: don't suggest an album you've barely played it from
  if (kind === 'song-albums' && variants[suggested].plays * 4 < variants[0].plays && variants[0].name) suggested = 0;
  // nothing but spelling apart (accents, apostrophes, punctuation): say so on the odd ones out
  if (kind !== 'song-albums' && variants.every((v) => !v.tags.length)) variants.forEach((v, i) => i !== suggested && v.tags.push('spelling'));
  return {
    id: `${kind}:${key}`,
    kind,
    artistKey,
    artist,
    title,
    trackKey,
    variants,
    suggested,
    plays: sum(variants),
    off: sum(variants) - variants[suggested].plays,
    sig: hash(variants.flatMap((v) => [v.key, ...(v.also ?? []).map((a) => a.key)]).sort().join('\n')),
  };
}

/** Every mismatch in the history (after your merges), biggest first. */
export function findMismatches(rows: StoredScrobble[]): Mismatch[] {
  const artists = new Map<string, Acc>();
  const albums = new Map<string, Acc>(); // artist \0 album
  const songs = new Map<string, { name: string; artist: string; albums: Map<string, Acc> }>(); // artist \0 song

  // Count each artist / song / album combination first (the same few come up over and over), then
  // do the name work once per combination. Entries are created in the order they were first played
  // and named after the latest play, exactly as going play by play would.
  type Combo = { ar: string; tr: string; al: string; plays: number; first: number; last: number; lastAt: number };
  const combos: Combo[] = [];
  const seen = new Map<string, Map<string, Map<string, Combo>>>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let byTrack = seen.get(r.ar);
    if (!byTrack) seen.set(r.ar, (byTrack = new Map()));
    let byAlbum = byTrack.get(r.tr);
    if (!byAlbum) byTrack.set(r.tr, (byAlbum = new Map()));
    const c = byAlbum.get(r.al);
    if (c) {
      c.plays++;
      if (r.ts < c.first) c.first = r.ts;
      if (r.ts > c.last) c.last = r.ts;
      c.lastAt = i;
    } else {
      const nc = { ar: r.ar, tr: r.tr, al: r.al, plays: 1, first: r.ts, last: r.ts, lastAt: i };
      byAlbum.set(r.al, nc);
      combos.push(nc);
    }
  }
  const keys = combos.map((c) => {
    const ak = c.ar.toLowerCase();
    const alk = c.al.toLowerCase();
    return { ak, alk, albumKey: `${ak}\0${alk}`, sk: `${ak}\0${c.tr.toLowerCase()}` };
  });
  const fresh = (name: string): Acc => ({ name, plays: 0, first: Infinity, last: -Infinity });
  // in order of first play: create the entries (their order, and a song's first artist spelling)
  combos.forEach((c, i) => {
    const k = keys[i];
    if (!artists.has(k.ak)) artists.set(k.ak, fresh(c.ar));
    if (c.al && !albums.has(k.albumKey)) albums.set(k.albumKey, fresh(c.al));
    let s = songs.get(k.sk);
    if (!s) songs.set(k.sk, (s = { name: c.tr, artist: c.ar, albums: new Map() }));
    if (!s.albums.has(k.alk)) s.albums.set(k.alk, fresh(c.al));
  });
  // in order of latest play: add up, and keep the most recent spelling
  const add = (x: Acc, c: Combo, name: string) => {
    x.plays += c.plays;
    x.name = name;
    if (c.first < x.first) x.first = c.first;
    if (c.last > x.last) x.last = c.last;
  };
  for (const i of combos.map((_, i) => i).sort((a, b) => combos[a].lastAt - combos[b].lastAt)) {
    const c = combos[i];
    const k = keys[i];
    add(artists.get(k.ak)!, c, c.ar);
    if (c.al) add(albums.get(k.albumKey)!, c, c.al);
    const s = songs.get(k.sk)!;
    s.name = c.tr;
    add(s.albums.get(k.alk)!, c, c.al);
  }
  const artistName = (ak: string) => artists.get(ak)?.name ?? ak;
  const out: Mismatch[] = [];

  // 1) one song, several albums (or none): "Song - Single", the album, a compilation, no album.
  //    Editions of one album ("bologna 2" / "bologna 2 - Single") count as one here: telling those
  //    apart is the album's own card, so the song isn't listed a second time for it.
  for (const [sk, s] of songs) {
    if (s.albums.size < 2) continue;
    const editions = new Map<string, { key: string; x: Acc }[]>();
    for (const [key, x] of s.albums) {
      const g = key ? `album:${albumBase(x.name)}` : 'none';
      const list = editions.get(g);
      if (list) list.push({ key, x });
      else editions.set(g, [{ key, x }]);
    }
    if (editions.size < 2) continue;
    const [ak, tk] = sk.split('\0');
    const variants = [...editions.values()].map((eds): Variant => {
      eds.sort((a, b) => b.x.plays - a.x.plays);
      const [top, ...rest] = eds;
      return {
        name: top.x.name,
        key: top.key,
        plays: eds.reduce((n, e) => n + e.x.plays, 0),
        first: Math.min(...eds.map((e) => e.x.first)),
        last: Math.max(...eds.map((e) => e.x.last)),
        tags: albumTags(top.x.name, s.name),
        ...(rest.length ? { also: rest.map((e) => ({ key: e.key, name: e.x.name, plays: e.x.plays })) } : {}),
      };
    });
    out.push(make('song-albums', sk, ak, artistName(ak), s.name, variants, albumScore, tk));
  }

  // 2) one album, several names: "Album" / "Album (Deluxe Edition)" / "Album - EP"
  const albumGroups = new Map<string, { key: string; x: Acc }[]>();
  for (const [key, x] of albums) {
    const ak = key.slice(0, key.indexOf('\0'));
    const g = `${ak}\0${albumBase(x.name)}`;
    let arr = albumGroups.get(g);
    if (!arr) albumGroups.set(g, (arr = []));
    arr.push({ key, x });
  }
  for (const [g, arr] of albumGroups) {
    if (arr.length < 2) continue;
    const ak = g.slice(0, g.indexOf('\0'));
    const variants = arr.map(({ key, x }): Variant => {
      const tags = albumTags(x.name);
      return { name: x.name, key: key.slice(ak.length + 1), plays: x.plays, first: x.first, last: x.last, tags };
    });
    const v = make('album-names', g, ak, artistName(ak), '', variants, albumScore);
    v.title = v.variants[v.suggested].name;
    out.push(v);
  }

  // 3) one song, several names: "Song (feat. X)", "Song - Remastered 2011", Don’t / Don't
  const songGroups = new Map<string, { key: string; name: string; plays: number; first: number; last: number }[]>();
  for (const [sk, s] of songs) {
    const ak = sk.slice(0, sk.indexOf('\0'));
    const g = `${ak}\0${trackBase(s.name)}`;
    let plays = 0;
    let first = Infinity;
    let last = 0;
    for (const x of s.albums.values()) {
      plays += x.plays;
      first = Math.min(first, x.first);
      last = Math.max(last, x.last);
    }
    let arr = songGroups.get(g);
    if (!arr) songGroups.set(g, (arr = []));
    arr.push({ key: sk.slice(ak.length + 1), name: s.name, plays, first, last });
  }
  for (const [g, arr] of songGroups) {
    if (arr.length < 2) continue;
    const ak = g.slice(0, g.indexOf('\0'));
    const variants = arr.map((x): Variant => {
      const tags = trackTags(x.name);
      return { name: x.name, key: x.key, plays: x.plays, first: x.first, last: x.last, tags };
    });
    // the plain title wins over remaster / explicit / version labels; otherwise the most played
    const v = make('song-names', g, ak, artistName(ak), '', variants, (x) => (x.tags.some((t) => t === 'remaster' || t === 'explicit' || t === 'version') ? 0 : 1));
    v.title = v.variants[v.suggested].name;
    out.push(v);
  }

  // 4) one artist, several names: Beyoncé / Beyonce, "Drake feat. Future" / Drake
  const artistGroups = new Map<string, { key: string; x: Acc }[]>();
  for (const [key, x] of artists) {
    const g = artistBase(x.name);
    let arr = artistGroups.get(g);
    if (!arr) artistGroups.set(g, (arr = []));
    arr.push({ key, x });
  }
  for (const [g, arr] of artistGroups) {
    if (arr.length < 2) continue;
    const variants = arr.map(({ key, x }): Variant => ({ name: x.name, key, plays: x.plays, first: x.first, last: x.last, tags: FEAT_ARTIST.test(x.name) ? ['feat'] : [] }));
    const v = make('artist-names', g, '', '', '', variants, (x) => (x.tags.includes('feat') ? 0 : 1));
    v.title = v.artist = v.variants[v.suggested].name;
    v.artistKey = v.variants[v.suggested].key;
    out.push(v);
  }

  // most misplaced plays first
  return out.sort((a, b) => b.off - a.off || b.plays - a.plays);
}

/** Mismatches you haven't marked as fine (marking only lasts until a new variant appears). */
export function openMismatches(all: Mismatch[], fine: string[]): Mismatch[] {
  if (!fine.length) return all;
  const ok = new Set(fine);
  return all.filter((m) => !ok.has(`${m.id}#${m.sig}`));
}

export const fineKey = (m: Mismatch) => `${m.id}#${m.sig}`;

export const KIND_LABEL: Record<MismatchKind, string> = {
  'song-albums': 'Songs on several albums',
  'album-names': 'Album names',
  'song-names': 'Song names',
  'artist-names': 'Artist names',
};

/** The mismatches that involve one song, album or artist page. */
export function mismatchesFor(list: Mismatch[], kind: 'artist' | 'album' | 'track', name: string, artist: string): Mismatch[] {
  const n = name.toLowerCase();
  const a = artist.toLowerCase();
  return list.filter((m) => {
    if (kind === 'track') return m.artistKey === a && (m.kind === 'song-albums' ? m.trackKey === n : m.kind === 'song-names' && m.variants.some((v) => v.key === n));
    if (kind === 'album') return m.artistKey === a && (m.kind === 'album-names' || m.kind === 'song-albums') && m.variants.some((v) => v.key === n);
    return m.kind === 'artist-names' ? m.variants.some((v) => v.key === n) : m.artistKey === n;
  });
}

/** Search: title, artist or any of the names. */
export function matchesSearch(m: Mismatch, needle: string) {
  if (!needle) return true;
  if (m.title.toLowerCase().includes(needle) || m.artist.toLowerCase().includes(needle)) return true;
  return m.variants.some((v) => v.name.toLowerCase().includes(needle) || v.also?.some((a) => a.name.toLowerCase().includes(needle)));
}

/** A page in your Last.fm library, where Last.fm Pro lets you edit those scrobbles. */
export function lastfmLibraryUrl(user: string, artist: string, album?: string, track?: string) {
  // Last.fm's own path style: spaces as "+", a slash double-encoded
  const seg = (s: string) => encodeURIComponent(s.replace(/\//g, '%2F')).replace(/%20/g, '+');
  let url = `https://www.last.fm/user/${seg(user)}/library/music/${seg(artist)}`;
  if (track) url += `/_/${seg(track)}`;
  else if (album) url += `/${seg(album)}`;
  return url;
}

/** Can every other name be folded into the suggested one without a second thought? (singles, no album) */
export function isObviousSingle(m: Mismatch) {
  if (m.kind !== 'song-albums') return false;
  const keep = m.variants[m.suggested];
  if (keep.tags.some((t) => t === 'no-album' || t === 'single' || t === 'named-after-song')) return false;
  // played more as a single than from the album (say a single tacked onto a deluxe you played once): ask, don't assume
  if (keep.plays < m.plays - keep.plays) return false;
  return m.variants.every((v, i) => i === m.suggested || v.tags.some((t) => t === 'single' || t === 'named-after-song' || t === 'no-album'));
}
