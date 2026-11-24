export type EntityKind = 'artist' | 'album' | 'track';

/** Raw scrobble as stored in IndexedDB. Short keys keep the DB small. */
export interface StoredScrobble {
  id?: number;
  ts: number; // unix seconds
  ar: string; // artist
  tr: string; // track
  al: string; // album ('' if none)
  img?: string; // last.fm album image url (only stored when present)
}

export interface UserInfo {
  name: string;
  realname?: string;
  playcount: number;
  registered: number; // unix seconds
  image?: string;
  url?: string;
}

/** A time range in unix seconds, [from, to). */
export interface TimeRange {
  from: number;
  to: number;
  /** skip stretches of at least this many days with no scrobbles (breaks) */
  gapDays?: number;
}

export type RangePreset =
  | 'all'
  | 'this-year'
  | 'last-year'
  | 'this-month'
  | 'last-month'
  | 'last-7'
  | 'last-30'
  | 'last-90'
  | 'last-365'
  | 'year'
  | 'month'
  | 'custom';

export interface RangeSpec {
  preset: RangePreset;
  /** for presets 'year' and 'month' */
  year?: number;
  /** for preset 'month': 0 = January */
  month?: number;
  /** skip breaks: stretches of at least this many days with no scrobbles */
  gapDays?: number;
  /** ISO date strings (yyyy-mm-dd), inclusive, used for custom */
  start?: string;
  end?: string;
}

export interface RankedItem {
  kind: EntityKind;
  idx: number;
  name: string;
  artist: string; // for artists this equals name
  album?: string;
  count: number;
  rank: number;
  /** previous-period rank (leaderboards) */
  prevRank?: number | null;
  prevCount?: number;
}
