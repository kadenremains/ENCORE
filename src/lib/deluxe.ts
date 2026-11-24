import type { StoredScrobble } from './types';
import { trackBase } from './mismatches';

/**
 * Deluxe editions often pad the album with songs released on their own months later. Last.fm's
 * tracklists for the deluxe and the standard edition tell which songs the deluxe added; with the
 * setting on, plays of those songs from the deluxe count on their own instead of toward the album.
 */

const EDITION = 'deluxe|expanded|anniversary|bonus|edition|complete|special|reissue';
const PAREN = new RegExp(`\\s*[([][^()[\\]]*\\b(${EDITION})\\b[^()[\\]]*[)\\]]\\s*$`, 'i');
const DASH = new RegExp(`\\s+[-\\u2010-\\u2015]\\s+[^-\\u2010-\\u2015]*\\b(${EDITION})\\b[^-\\u2010-\\u2015]*$`, 'i');

/** "Colors (Deluxe Edition)" → "Colors"; null when it isn't a deluxe-style name. */
export function standardName(album: string): string | null {
  if (!album) return null;
  const s = album.replace(PAREN, '').replace(DASH, '').trim();
  return s && s !== album.trim() ? s : null;
}

export const deluxeKey = (artist: string, album: string) => `${artist.toLowerCase()}|${album.toLowerCase()}`;

export interface DeluxeCandidate {
  key: string;
  artist: string;
  album: string;
  standard: string;
}

/** Tracklist comparison, cached: the deluxe's added songs (trackBase names), or null if Last.fm can't tell. */
export type DeluxeCache = Record<string, { added: string[] | null; at: number }>;

export interface DeluxeInfo extends DeluxeCandidate {
  /** songs the deluxe adds that you've played from it */
  added: { name: string; plays: number }[];
  /** their plays count on their own (setting on, and not kept with the album) */
  apart: boolean;
}

const QUICK = new RegExp(`\\b(${EDITION})\\b`, 'i');

export function deluxeCandidates(rows: StoredScrobble[]): DeluxeCandidate[] {
  const seen = new Map<string, DeluxeCandidate | null>();
  for (const r of rows) {
    if (!r.al || !QUICK.test(r.al)) continue;
    const key = deluxeKey(r.ar, r.al);
    if (seen.has(key)) continue;
    const standard = standardName(r.al);
    seen.set(key, standard ? { key, artist: r.ar, album: r.al, standard } : null);
  }
  return [...seen.values()].filter((c): c is DeluxeCandidate => !!c);
}

/** Compare titles loosely: "Marvin's Room" / "Marvins Room", "(feat. …)" or not. */
const songId = (t: string) => {
  const b = trackBase(t.replace(/\s*[([]\s*bonus(\s+track)?\s*[)\]]/gi, '').replace(/\s+-\s+bonus(\s+track)?\s*$/i, ''));
  return b.replace(/[^\p{L}\p{N}]+/gu, '') || b;
};

/** Which deluxe tracks aren't on the standard edition. Null when the lists don't look like two editions of one album. */
export function addedTracks(deluxe: string[], standard: string[]): string[] | null {
  // Last.fm sometimes lists two songs as one track ("Marvins Room / Buried Alive (Interlude)")
  const std = new Set(standard.flatMap((t) => [t, ...t.split(/\s+\/\s+/)]).map(songId));
  const added = [...new Set(deluxe.map(songId).filter((t) => !std.has(t)))];
  // a "deluxe" that shares hardly anything with the standard is something else (sped up, remixes)
  const shared = deluxe.length - added.length;
  if (shared < Math.min(3, standard.length) || added.length > deluxe.length * 0.7) return null;
  return added;
}

export function applyDeluxe(rows: StoredScrobble[], candidates: DeluxeCandidate[], cache: DeluxeCache, apart: boolean, keep: Set<string>): { rows: StoredScrobble[]; info: DeluxeInfo[] } {
  const known = new Map<string, { c: DeluxeCandidate; added: Set<string>; plays: Map<string, { name: string; plays: number }> }>();
  for (const c of candidates) {
    const a = cache[c.key]?.added;
    if (a?.length) known.set(c.key, { c, added: new Set(a), plays: new Map() });
  }
  if (!known.size) return { rows, info: [] };
  let out: StoredScrobble[] | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.al) continue;
    const k = known.get(deluxeKey(r.ar, r.al));
    if (!k) continue;
    const tb = songId(r.tr);
    if (!k.added.has(tb)) continue;
    const p = k.plays.get(tb);
    if (p) {
      p.plays++;
      p.name = r.tr;
    } else k.plays.set(tb, { name: r.tr, plays: 1 });
    if (apart && !keep.has(k.c.key)) {
      out ??= rows.slice();
      out[i] = { ...r, al: '' }; // on its own: no album (it keeps the deluxe's cover via the artwork lookup)
    }
  }
  const info: DeluxeInfo[] = [];
  for (const k of known.values()) {
    if (!k.plays.size) continue;
    info.push({ ...k.c, added: [...k.plays.values()].sort((a, b) => b.plays - a.plays), apart: apart && !keep.has(k.c.key) });
  }
  info.sort((a, b) => b.added.reduce((n, x) => n + x.plays, 0) - a.added.reduce((n, x) => n + x.plays, 0));
  return { rows: out ?? rows, info };
}
