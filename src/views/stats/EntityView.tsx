import { useState } from 'react';
import { useRangeStats } from './useRangeStats';
import { KIND_LABEL, fmtPct, pct } from './helpers';
import { AreaSpark, BarChart, CalendarHeatmap, Delta, Kpi, Ledger, Move, Panel, WEEKDAYS, fmtDate, fmtDay, fmtHour, type LedgerItem } from '../../ui/charts';
import { EntityImg, fmtNum } from '../../render/primitives';
import { entityPath, routePath } from '../../router';
import { dayToDate, entityAllTime, entityRangeStats, findEntity, getStats, type Library } from '../../lib/library';
import type { EntityKind } from '../../lib/types';
import { ImageEditor } from '../../ui/ImageEditor';
import { SingleNote } from './Singles';
import { useApp } from '../../store';
import { albumKey } from '../../lib/library';

export function EntityView({ kind, title, artist }: { kind: EntityKind; title: string; artist: string }) {
  const { lib, stats, prev, label, cmpLabel, range } = useRangeStats();
  const [editImg, setEditImg] = useState(false);
  const idx = findEntity(lib, kind, title, artist);
  if (idx < 0 && kind === 'album') return <HiddenSingleAlbum title={title} artist={artist} />;
  if (idx < 0)
    return (
      <div className="page">
        <p className="empty">Couldn't find “{title}” in your history.</p>
        <a className="more" href={routePath({ name: 'top', kind })}>
          Back to {KIND_LABEL[kind].many}
        </a>
      </div>
    );

  const name = kind === 'artist' ? lib.artists[idx].name : kind === 'album' ? lib.albums[idx].name : lib.tracks[idx].name;
  const artistIdx = kind === 'artist' ? idx : kind === 'album' ? lib.albums[idx].artist : lib.tracks[idx].artist;
  const artistName = lib.artists[artistIdx].name;
  const albumIdx = kind === 'track' ? lib.tracks[idx].album : -1;
  const er = entityRangeStats(lib, kind, idx, range);
  const at = entityAllTime(lib, kind, idx);
  const rank = stats.rankMap(kind).get(idx)?.rank;
  const prevRank = prev ? (prev.rankMap(kind).get(idx)?.rank ?? null) : undefined;
  const prevPlays = prev ? (prev.rankMap(kind).get(idx)?.count ?? 0) : undefined;
  const allRank = getStats(lib, { from: 0, to: Infinity }).rankMap(kind).get(idx)?.rank;

  // bucket this entity's days into the same buckets as the range timeline
  const tl = stats.timeline('auto');
  const buckets = tl.map((t) => ({ ...t, value: 0 }));
  if (buckets.length) {
    const starts = buckets.map((b) => b.start.getTime());
    for (const [d, c] of er.dayCounts) {
      const t = dayToDate(d).getTime();
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= t) lo = mid;
        else hi = mid - 1;
      }
      buckets[lo].value += c;
    }
  }

  const heatEnd = stats.lastDay;
  const heatStart = Math.max(stats.firstDay, heatEnd - 370);

  return (
    <div className="page">
      <a className="back" href={routePath({ name: 'top', kind })}>
        ← {KIND_LABEL[kind].many}
      </a>
      <section className="entity-head grain">
        <div className="hero-art" aria-hidden>
          <EntityImg kind={kind} name={name} artist={artistName} />
        </div>
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner br" />
        <span className="corner bl" />
        <button className="entity-img" onClick={() => setEditImg(true)} title="Change image">
          <EntityImg kind={kind} name={name} artist={artistName} shape="square" />
          <span className="top-edit">✎</span>
        </button>
        <div className="entity-info">
          <div className="eyebrow">
            {KIND_LABEL[kind].one}
            {rank ? ` · No. ${String(rank).padStart(2, '0')} in ${label}` : ` · not played in ${label}`}
          </div>
          <h1 className="entity-name">{name}</h1>
          {kind !== 'artist' && (
            <div className="entity-by">
              by <a href={entityPath('artist', artistName, artistName)}>{artistName}</a>
              {albumIdx >= 0 && (
                <>
                  {' '}
                  · from <a href={entityPath('album', lib.albums[albumIdx].name, lib.artists[lib.albums[albumIdx].artist].name)}>{lib.albums[albumIdx].name}</a>
                </>
              )}
            </div>
          )}
          <div className="entity-big">
            <span className="entity-plays">{fmtNum(er.plays)}</span>
            <span className="muted">
              plays in {label} <Delta cur={er.plays} prev={prevPlays} />
            </span>
          </div>
        </div>
      </section>

      <div className="stats-row">
        <Kpi value={rank ? `#${rank}` : '—'} label={`Rank in ${label}`} delta={rank ? <Move rank={rank} prev={prevRank} /> : null} sub={cmpLabel || undefined} />
        <Kpi value={fmtPct(pct(er.plays, stats.total))} label="Of your plays" />
        <Kpi value={fmtNum(er.days)} label="Days listened" sub={er.streak && er.streak.days > 1 ? `best streak ${er.streak.days} days` : undefined} />
        <Kpi value={er.busiestDay ? fmtNum(er.busiestDay.count) : '—'} label="Biggest day" sub={er.busiestDay ? fmtDay(er.busiestDay.day, { month: 'short', day: 'numeric', year: 'numeric' }) : undefined} />
      </div>
      <div className="stats-row">
        <Kpi value={fmtNum(at.plays)} label="All-time plays" sub={allRank ? `#${fmtNum(allRank)} all time` : undefined} />
        <Kpi value={at.first ? fmtDate(at.first, { month: 'short', year: 'numeric' }) : '—'} label="First listen" sub={at.first ? fmtDate(at.first) : undefined} />
        <Kpi value={at.last ? fmtDate(at.last, { month: 'short', day: 'numeric' }) : '—'} label="Last listen" sub={at.last ? fmtDate(at.last, { year: 'numeric', hour: 'numeric', minute: '2-digit' }) : undefined} />
        <Kpi value={er.byHour.some(Boolean) ? fmtHour(er.byHour.indexOf(Math.max(...er.byHour))) : '—'} label="Favourite hour" sub={er.byWeekday.some(Boolean) ? `mostly on ${WEEKDAYS[er.byWeekday.indexOf(Math.max(...er.byWeekday))]}` : undefined} />
      </div>

      <Panel title="All time, month by month" right={<span className="muted small">shaded: {label}</span>}>
        <AreaSpark data={at.months} highlight={range} />
      </Panel>

      {kind === 'artist' && <CreditedAlbums artistIdx={idx} name={name} />}

      {kind !== 'track' && (
        <div className="grid2">
          <SubList title={kind === 'artist' ? 'Songs' : 'Songs on this album'} itemKind="track" ownerKind={kind} ownerIdx={idx} />
          {kind === 'artist' && <SubList title="Albums" itemKind="album" ownerKind={kind} ownerIdx={idx} />}
        </div>
      )}

      {er.plays > 0 && (
        <>
          <Panel title={`In ${label}`}>
            <BarChart
              height={150}
              data={buckets.map((t, i) => ({ label: t.label, value: t.value, axis: i % Math.max(1, Math.ceil(buckets.length / 8)) === 0 ? t.label : '' }))}
            />
          </Panel>

          <div className="grid2">
            <Panel title="Hour of day">
              <BarChart height={120} data={er.byHour.map((v, h) => ({ label: fmtHour(h), value: v, axis: h % 6 === 0 ? fmtHour(h) : '' }))} />
            </Panel>
            <Panel title="Day of week">
              <BarChart height={120} data={er.byWeekday.map((v, i) => ({ label: WEEKDAYS[i], value: v, axis: WEEKDAYS[i] }))} />
            </Panel>
          </div>

          <Panel title="Every day">
            <CalendarHeatmap counts={er.dayCounts} startDay={heatStart} endDay={heatEnd} />
          </Panel>
        </>
      )}

      {kind === 'track' && lib.tracks[idx].single && <SingleNote singleKey={lib.tracks[idx].single!} />}

      {editImg && <ImageEditor entity={{ kind, name, artist: artistName }} onClose={() => setEditImg(false)} />}
    </div>
  );
}

const PREVIEW = 15;

/** An artist's songs or albums, or an album's songs, in the selected range: the top 15, expandable to all of them. */
function SubList({ title, itemKind, ownerKind, ownerIdx }: { title: string; itemKind: 'track' | 'album'; ownerKind: EntityKind; ownerIdx: number }) {
  const { lib, stats, range } = useRangeStats();
  const er = entityRangeStats(lib, ownerKind, ownerIdx, range);
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState('');
  const rows = itemKind === 'track' ? er.tracks : er.albums;
  const ranked = rows.map((r, i) => ({ r, rank: i + 1 }));
  const needle = q.trim().toLowerCase();
  const filtered = needle ? ranked.filter(({ r }) => nameOf(lib, itemKind, r.idx).toLowerCase().includes(needle)) : ranked;
  const shown = expanded ? filtered : filtered.slice(0, PREVIEW);
  const max = rows[0]?.count ?? 1;
  const whose = ownerKind === 'album' ? "of the album's plays" : 'of their plays';
  const items: LedgerItem[] = shown.map(({ r, rank }) => {
    const it = stats.item(itemKind, r, rank);
    return { key: `${itemKind}${r.idx}`, rank, kind: itemKind, name: it.name, artist: it.artist, meta: `${fmtPct(pct(r.count, er.plays))} ${whose}`, value: r.count, frac: r.count / max, href: entityPath(itemKind, it.name, it.artist) };
  });
  const noun = itemKind === 'track' ? 'songs' : 'albums';
  if (!rows.length) return null;
  return (
    <Panel
      className={expanded ? 'span-all' : ''}
      title={title}
      right={
        <span className="muted small">
          {fmtNum(rows.length)} {noun}
        </span>
      }
    >
      {expanded && rows.length > PREVIEW && <input className="text-input sublist-search" placeholder={`Search ${noun}…`} value={q} onChange={(e) => setQ(e.target.value)} />}
      <Ledger compact items={items} empty={`No ${noun} match “${q}”.`} />
      {filtered.length > PREVIEW && (
        <button type="button" className="more sublist-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show top 15' : `Show all ${fmtNum(filtered.length)} ${noun}`}
        </button>
      )}
    </Panel>
  );
}

function nameOf(lib: Library, kind: 'track' | 'album', idx: number) {
  return kind === 'track' ? lib.tracks[idx].name : lib.albums[idx].name;
}

/** Albums filed under this artist (as album artist), e.g. compilations or albums sung by others. */
function CreditedAlbums({ artistIdx, name }: { artistIdx: number; name: string }) {
  const { lib, stats, label } = useRangeStats();
  const rows = stats.ranking('album').filter((r) => lib.albums[r.idx].artist === artistIdx);
  // only worth a section when someone else sings on them
  const byOthers = rows.filter((r) => {
    for (const t of lib.tracks) if (t.album === r.idx && t.artist !== artistIdx) return true;
    return false;
  });
  if (!byOthers.length) return null;
  const max = byOthers[0].count;
  const items: LedgerItem[] = byOthers.slice(0, 20).map((r, i) => {
    const it = stats.item('album', r, i + 1);
    return { key: `al${r.idx}`, rank: i + 1, kind: 'album', name: it.name, artist: it.artist, meta: `album artist · ${label}`, value: r.count, frac: r.count / max, href: entityPath('album', it.name, it.artist) };
  });
  return (
    <Panel title={`Albums credited to ${name}`} right={<span className="muted small">songs on these may be by other artists</span>}>
      <Ledger compact items={items} />
    </Panel>
  );
}

/** An old link to an album that's now hidden as a single. */
function HiddenSingleAlbum({ title, artist }: { title: string; artist: string }) {
  const lib = useApp((s) => s.lib)!;
  const prefs = useApp((s) => s.albumPrefs);
  const setPrefs = useApp((s) => s.setAlbumPrefs);
  const x = lib.singles.find((s) => s.key === albumKey(artist, title));
  return (
    <div className="page">
      {x ? (
        <div className="empty big">
          <div className="eyebrow">Single</div>
          <p>
            “{x.name}” by {x.artist} only has one song ({x.track}), so it isn't counted as an album.
          </p>
          <div className="row gap" style={{ justifyContent: 'center' }}>
            <a className="btn" href={entityPath('track', x.track, x.artist)}>
              Open the song
            </a>
            <button className="btn primary" onClick={() => void setPrefs({ ...prefs, keep: [...new Set([...prefs.keep, x.key])] })}>
              Count it as an album
            </button>
          </div>
        </div>
      ) : (
        <p className="empty">Couldn't find “{title}” in your history.</p>
      )}
    </div>
  );
}
