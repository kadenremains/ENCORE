import { useMemo, useState, type ReactNode } from 'react';
import { useRangeStats } from './useRangeStats';
import { Patterns } from './Patterns';
import { EntityImg, fmtNum } from '../../render/primitives';
import { entityPath, routePath } from '../../router';
import { usePrefs } from '../../lib/prefs';
import type { Library } from '../../lib/library';
import type { EntityKind } from '../../lib/types';

/** History: every scrobble in the range (Scrobbles), and when you listen (Patterns). */
export function History({ view }: { view: 'scrobbles' | 'patterns' }) {
  const { label, stats } = useRangeStats();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {label} · {view === 'patterns' ? 'when you listen' : `${fmtNum(stats.total)} scrobbles`}
          </div>
          <h1 className="page-title">History</h1>
        </div>
        <div className="seg history-switch">
          <a href={routePath({ name: 'history', view: 'scrobbles' })} aria-current={view === 'scrobbles' ? 'page' : undefined}>
            Scrobbles
          </a>
          <a href={routePath({ name: 'history', view: 'patterns' })} aria-current={view === 'patterns' ? 'page' : undefined}>
            Patterns
          </a>
        </div>
      </div>
      {view === 'patterns' ? <Patterns /> : <AllScrobbles />}
    </div>
  );
}

function AllScrobbles() {
  const { stats, label } = useRangeStats();
  const [q, setQ] = useState('');
  const [jump, setJump] = useState('');
  return (
    <>
      <div className="tools history-tools">
        <input className="text-input" placeholder="Search songs, artists, albums…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="history-jump">
          <span className="muted small">Jump to</span>
          <input className="text-input" type="date" value={jump} onChange={(e) => setJump(e.target.value)} aria-label="Jump to date" />
        </label>
        {jump && (
          <button className="mini-btn" onClick={() => setJump('')}>
            Back to newest
          </button>
        )}
      </div>
      {/* a new search / jump / range starts from the top of the list again */}
      <ScrobbleList key={`${stats.lo}|${stats.hi}|${q}|${jump}`} lo={stats.lo} hi={stats.hi} q={q} jump={jump} empty={q ? `No scrobbles match “${q}” in ${label}.` : `No scrobbles in ${label} yet. Pick another range above.`} />
    </>
  );
}

/** On a song, album or artist page: your plays of it in the range. */
export function PlaysList({ kind, idx }: { kind: EntityKind; idx: number }) {
  const { stats, label } = useRangeStats();
  return <ScrobbleList key={`${stats.lo}|${stats.hi}|${kind}|${idx}`} lo={stats.lo} hi={stats.hi} kind={kind} idx={idx} pageSize={50} empty={`No plays in ${label}.`} showArtist={kind !== 'artist'} />;
}

/* ------------------------------------------------------------------ the list */

const fmtTime = (ts: number, hour12: boolean) => new Date(ts * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12 });

const fmtDayHead = (ts: number) => {
  const d = new Date(ts * 1000);
  const today = new Date();
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtDuration = (min: number) => {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return m ? `${h} h ${m} min` : `${h} h`;
};

/** Which scrobbles match a search: by song, artist or album name (checked per name, not per play). */
function searchMatcher(lib: Library, q: string): ((i: number) => boolean) | null {
  const needle = q.trim().toLowerCase();
  if (!needle) return null;
  const artists = lib.artists.map((a) => a.name.toLowerCase().includes(needle));
  const tracks = lib.tracks.map((t) => t.name.toLowerCase().includes(needle));
  const albums = lib.albums.map((a) => a.name.toLowerCase().includes(needle));
  return (i) => tracks[lib.track[i]] || artists[lib.artist[i]] || (lib.album[i] >= 0 && albums[lib.album[i]]);
}

/** Batch-scrobbled runs (when they're counted): is this play in one? */
function batchChecker(lib: Library): (ts: number) => boolean {
  const runs = lib.batches && !lib.batches.skipped ? lib.batches.runs : [];
  if (!runs.length) return () => false;
  return (ts) => {
    let lo = 0;
    let hi = runs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ts < runs[mid].from) hi = mid - 1;
      else if (ts > runs[mid].to) lo = mid + 1;
      else return true;
    }
    return false;
  };
}

function ScrobbleList({
  lo,
  hi,
  kind,
  idx,
  q = '',
  jump = '',
  pageSize = 150,
  empty,
  showArtist = true,
}: {
  lo: number;
  hi: number;
  kind?: EntityKind;
  idx?: number;
  q?: string;
  jump?: string;
  pageSize?: number;
  empty: string;
  showArtist?: boolean;
}) {
  const { lib } = useRangeStats();
  const hour12 = usePrefs((p) => p.hour12);
  const listImages = usePrefs((p) => p.listImages);
  const perPlay = usePrefs((p) => p.minutesPerScrobble);
  const [limit, setLimit] = useState(pageSize);

  // the plays to list, newest first, plus how many fall on each day (for the day headings)
  const { plays, perDay, start } = useMemo(() => {
    const col = kind === 'artist' ? lib.artist : kind === 'album' ? lib.album : kind === 'track' ? lib.track : null;
    const match = searchMatcher(lib, q);
    const out: number[] = [];
    const perDay = new Map<number, number>();
    for (let i = hi - 1; i >= lo; i--) {
      if (col && col[i] !== idx) continue;
      if (match && !match(i)) continue;
      out.push(i);
      perDay.set(lib.day[i], (perDay.get(lib.day[i]) ?? 0) + 1);
    }
    // jump: start the list at the end of that day
    let start = 0;
    if (jump) {
      // the end of that day, local time (a day isn't always 24 hours: clock changes)
      const [y, m, d] = jump.split('-').map(Number);
      const end = new Date(y, m - 1, d + 1).getTime() / 1000;
      while (start < out.length && lib.ts[out[start]] >= end) start++;
    }
    return { plays: out, perDay, start };
  }, [lib, lo, hi, kind, idx, q, jump]);

  const inBatch = useMemo(() => batchChecker(lib), [lib]);

  if (!plays.length) return <p className="empty">{empty}</p>;
  if (start >= plays.length) return <p className="empty">Nothing on or before that day here.</p>;

  const shown = plays.slice(start, start + limit);
  const rows: ReactNode[] = [];
  let lastDay = NaN;
  for (const i of shown) {
    const d = lib.day[i];
    if (d !== lastDay) {
      lastDay = d;
      const n = perDay.get(d) ?? 0;
      rows.push(
        <li key={`d${d}`} className="hist-day">
          <span>{fmtDayHead(lib.ts[i])}</span>
          <span className="muted small">
            {fmtNum(n)} {n === 1 ? 'play' : 'plays'} · {fmtDuration(n * perPlay)}
          </span>
        </li>,
      );
    }
    rows.push(<ScrobbleRow key={i} lib={lib} i={i} hour12={hour12} image={listImages} showArtist={showArtist} batch={inBatch(lib.ts[i])} />);
  }

  return (
    <>
      <ol className="hist-list">{rows}</ol>
      {plays.length - start > limit && (
        <button className="more" onClick={() => setLimit(limit + pageSize * 2)}>
          Show more · {fmtNum(plays.length - start - limit)} older
        </button>
      )}
    </>
  );
}

function ScrobbleRow({ lib, i, hour12, image, showArtist, batch }: { lib: Library; i: number; hour12: boolean; image: boolean; showArtist: boolean; batch: boolean }) {
  const t = lib.tracks[lib.track[i]];
  const artist = lib.artists[lib.artist[i]].name;
  const al = lib.album[i];
  const album = al >= 0 ? lib.albums[al] : null;
  const albumArtist = album ? lib.artists[album.artist].name : '';
  const o = lib.orig?.get(i);
  // what Last.fm has, where Encore shows it differently
  const was = o ? [o.tr, o.ar, o.al !== undefined && (o.al || 'no album')].filter(Boolean).join(' · ') : '';
  return (
    <li className={`hist-row ${image ? '' : 'no-img'}`}>
      <span className="hist-time muted small">{fmtTime(lib.ts[i], hour12)}</span>
      {image && <EntityImg kind="track" name={t.name} artist={artist} size={34} />}
      <span className="hist-main">
        <a className="hist-title" href={entityPath('track', t.name, artist)}>
          {t.name}
        </a>
        <span className="hist-meta muted small">
          {showArtist && (
            <>
              <a href={entityPath('artist', artist, artist)}>{artist}</a>
              {' · '}
            </>
          )}
          {album ? <a href={entityPath('album', album.name, albumArtist)}>{album.name}</a> : <i>{t.single ? 'single' : 'no album'}</i>}
        </span>
        {(was || batch) && (
          <span className="hist-flags small">
            {o && (
              <span className="mm-tag" title={`On Last.fm: ${o.tr ?? t.name} · ${o.ar ?? artist} · ${(o.al ?? album?.name) || 'no album'}`}>
                {o.merged ? 'merged' : 'fixed'}
              </span>
            )}
            {batch && (
              <span className="mm-tag" title="Scrobbled seconds after the one before: skipped through, or sent in a batch">
                batch
              </span>
            )}
            {was && <span className="muted"> was {was}</span>}
          </span>
        )}
      </span>
    </li>
  );
}
