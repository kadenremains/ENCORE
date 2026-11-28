import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { usePrefs } from '../lib/prefs';
import { EntityImg, fmtNum } from '../render/primitives';
import { entityPath, routePath } from '../router';
import { KIND_LABEL, TAG_LABEL, isObviousSingle, lastfmLibraryUrl, matchesSearch, mismatchesFor, openMismatches, type Fix, type Mismatch, type MismatchKind, type Variant } from '../lib/mismatches';
import type { EntityKind } from '../lib/types';
import { nameDiff, type NameDiff } from '../lib/nameDiff';

const yearSpan = (v: Variant) => {
  const a = new Date(v.first * 1000).getFullYear();
  const b = new Date(v.last * 1000).getFullYear();
  return a === b ? `${a}` : `${a}–${b}`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${fmtNum(n)} ${n === 1 ? one : many}`;

/** Open mismatches (not marked as fine), or null while they're still being found. */
export function useOpenMismatches() {
  const all = useApp((s) => s.mismatches);
  const fine = useApp((s) => s.albumPrefs.fine);
  return useMemo(() => (all ? openMismatches(all, fine ?? []) : null), [all, fine]);
}

/* ------------------------------------------------------------------ Settings → Clean up */

export function CleanupTab({ q: initialQ }: { q?: string }) {
  const open = useOpenMismatches();
  const all = useApp((s) => s.mismatches);
  const { demo, username, albumPrefs, mergeMismatches, undoMerges, markFine } = useApp();
  const [kind, setKind] = useState<MismatchKind | 'all'>('all');
  const [q, setQ] = useState(initialQ ?? '');
  const [limit, setLimit] = useState(25);
  const [busy, setBusy] = useState(false);
  const lastfmUser = demo ? '' : username;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of open ?? []) c[m.kind] = (c[m.kind] ?? 0) + 1;
    return c;
  }, [open]);
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => (open ?? []).filter((m) => (kind === 'all' || m.kind === kind) && matchesSearch(m, needle)), [open, kind, needle]);
  const obvious = useMemo(() => (open ?? []).filter(isObviousSingle), [open]);
  const fineCount = (all?.length ?? 0) - (open?.length ?? 0);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <GarbledGroup lastfmUser={lastfmUser} />
      <section className="panel-box settings-group">
        <div className="panel-box-head">
          <h3>Mismatched scrobbles</h3>
          {open && <div className="panel-box-right muted small">{plural(open.length, 'to review', 'to review')}</div>}
        </div>
        <p className="muted small settings-desc">
          The same song, album or artist scrobbled under different names: a single and its album, a deluxe edition, “feat.” in the title, a different apostrophe, no album at all. Each one is split in your stats. <b>Merge</b> counts them as one in Encore (your Last.fm stays as it is), or open it on Last.fm to fix it there.
        </p>

        <BatchNote />
        {!open ? (
          <p className="empty">Looking through your history…</p>
        ) : !all?.length ? (
          <p className="empty">Nothing mismatched. Every song, album and artist goes by one name.</p>
        ) : (
          <>
            {obvious.length > 0 && (
              <div className="mm-bulk">
                <span className="small">
                  {plural(obvious.length, 'song')} {obvious.length === 1 ? 'was' : 'were'} also scrobbled as a single or with no album.
                </span>
                <button className="btn small primary" disabled={busy} onClick={() => void run(() => mergeMismatches(obvious.map((m) => [m, m.suggested])))}>
                  Merge {obvious.length === 1 ? 'it' : 'all'} into {obvious.length === 1 ? 'its album' : 'their albums'}
                </button>
              </div>
            )}

            <div className="row gap wrap settings-listbar">
              <select className="select" value={kind} onChange={(e) => (setKind(e.target.value as MismatchKind | 'all'), setLimit(25))} aria-label="Show">
                <option value="all">Everything · {fmtNum(open.length)}</option>
                {(Object.keys(KIND_LABEL) as MismatchKind[]).map((k) => (
                  <option key={k} value={k} disabled={!counts[k]}>
                    {KIND_LABEL[k]} · {fmtNum(counts[k] ?? 0)}
                  </option>
                ))}
              </select>
              <input className="text-input" placeholder="Search…" value={q} onChange={(e) => (setQ(e.target.value), setLimit(25))} />
            </div>

            {!list.length ? (
              <p className="empty">{needle ? `Nothing to review matches “${q}”.` : 'All done here.'}</p>
            ) : (
              <div className="mm-list">
                {list.slice(0, limit).map((m) => (
                  <MismatchCard key={m.id} m={m} lastfmUser={lastfmUser} busy={busy} onMerge={(i) => void run(() => mergeMismatches([[m, i]]))} onFine={() => void markFine([m])} />
                ))}
              </div>
            )}
            {list.length > limit && (
              <button className="more" onClick={() => setLimit(limit + 50)}>
                Show more · {fmtNum(list.length - limit)} left
              </button>
            )}
            {fineCount > 0 && (
              <p className="muted small mm-foot">
                {plural(fineCount, 'mismatch', 'mismatches')} marked as fine.{' '}
                <button className="link" onClick={() => void markFine('reset')}>
                  Show {fineCount === 1 ? 'it' : 'them'} again
                </button>
              </p>
            )}
          </>
        )}
      </section>

      <Merged fixes={albumPrefs.fixes ?? []} busy={busy} onUndo={(ids) => void run(() => undoMerges(ids))} />

      {!demo && (
        <section className="panel-box settings-group">
          <div className="panel-box-head">
            <h3>Fixing them on Last.fm</h3>
          </div>
          <p className="muted small settings-desc">
            Last.fm Pro lets you edit scrobbles. Use <b>Last.fm ↗</b> on a mismatch to open those scrobbles in your Last.fm library, edit them there, then choose <b>Check for Last.fm edits</b> in the menu. Encore picks the change up and the mismatch goes away by itself. Merges you made in Encore keep working either way.
          </p>
        </section>
      )}
    </>
  );
}

/** Scrobbles whose names came with codes left in ("\u0026" for "&"): shown fixed in Encore, listed to fix on Last.fm. */
function GarbledGroup({ lastfmUser }: { lastfmUser: string }) {
  const list = useApp((s) => s.lib?.garbled);
  const hour12 = usePrefs((p) => p.hour12);
  if (!list?.length) return null;
  const when = (t: number) => new Date(t * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12 });
  const field = (raw: string, fixed: string) =>
    raw === fixed ? (
      <span>{fixed || <i className="muted">no album</i>}</span>
    ) : (
      <span>
        <s className="garbled-raw">{raw}</s> → <b>{fixed}</b>
      </span>
    );
  return (
    <section className="panel-box settings-group">
      <div className="panel-box-head">
        <h3>Garbled names</h3>
        <div className="panel-box-right muted small">{plural(list.length, 'scrobble')}</div>
      </div>
      <p className="muted small settings-desc">
        These came from your scrobbler with codes in place of characters (“\u0026” instead of “&”). Encore already shows and counts them correctly; on Last.fm they stay garbled until you edit them{lastfmUser ? ' (Last.fm ↗ opens each one)' : ''}. Once fixed there, “Check for Last.fm edits” clears them from this list.
      </p>
      <ol className="garbled-list">
        {list.map((g) => (
          <li key={`${g.ts}|${g.raw.tr}`}>
            <div className="garbled-main small">
              <div>
                <span className="muted">Song </span>
                {field(g.raw.tr, g.fixed.tr)}
              </div>
              <div>
                <span className="muted">Artist </span>
                {field(g.raw.ar, g.fixed.ar)}
              </div>
              <div>
                <span className="muted">Album </span>
                {field(g.raw.al, g.fixed.al)}
              </div>
              <div className="muted">Scrobbled {when(g.ts)}</div>
            </div>
            {lastfmUser && (
              <a className="btn small ghost" href={lastfmLibraryUrl(lastfmUser, g.raw.ar, undefined, g.raw.tr)} target="_blank" rel="noreferrer">
                Last.fm ↗
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Plays that are only batch-scrobbled don't show up here when they're left out of stats. */
function BatchNote() {
  const b = useApp((s) => s.lib?.batches);
  if (!b?.total) return null;
  return (
    <p className="muted small settings-desc">
      {b.skipped
        ? `${plural(b.total, 'batch-scrobbled play')} (skipped songs or imports, seconds apart) ${b.total === 1 ? 'is' : 'are'} left out, so ${b.total === 1 ? 'it doesn’t' : 'they don’t'} show up here.`
        : `${plural(b.total, 'batch-scrobbled play')} (skipped songs or imports, seconds apart) ${b.total === 1 ? 'is' : 'are'} counted, so some names here may come from songs you never heard.`}{' '}
      <a href={routePath({ name: 'settings', tab: 'stats' })}>Change in Settings → Stats</a>
    </p>
  );
}

/** A name with the characters that differ from its look-alike highlighted (and gaps where one is missing). */
function LookAlike({ name, diff }: { name: string; diff: NameDiff | null }) {
  if (!diff) return <span>{name}</span>;
  return (
    <span>
      {diff.parts.map((p, i) =>
        'missing' in p ? (
          <mark key={i} className="mm-diff gap" title={`no ${p.missing} here`} />
        ) : p.differs ? (
          <mark key={i} className="mm-diff">
            {p.text}
          </mark>
        ) : (
          p.text
        ),
      )}
    </span>
  );
}

function MismatchCard({ m, lastfmUser, busy, onMerge, onFine }: { m: Mismatch; lastfmUser: string; busy: boolean; onMerge: (keep: number) => void; onFine: () => void }) {
  const [keep, setKeep] = useState(m.suggested);
  const target = m.variants[keep];
  // near-identical spellings: what sets each apart from the one being kept (for the kept one, from
  // the first look-alike), so a curly apostrophe or a capital doesn't go unnoticed
  const diffs = m.variants.map((v, i) => {
    if (!v.name) return null;
    if (i !== keep) return target.name ? nameDiff(target.name, v.name) : null;
    for (const other of m.variants) if (other !== v && other.name) {
      const d = nameDiff(other.name, v.name);
      if (d) return d;
    }
    return null;
  });
  const imgKind: EntityKind = m.kind === 'artist-names' ? 'artist' : m.kind === 'album-names' ? 'album' : 'track';
  const what =
    m.kind === 'song-albums'
      ? `song on ${m.variants.length} albums`
      : m.kind === 'album-names'
        ? `album under ${m.variants.length} names`
        : m.kind === 'song-names'
          ? `song under ${m.variants.length} names`
          : `artist under ${m.variants.length} names`;
  const href = m.kind === 'artist-names' ? entityPath('artist', m.artist, m.artist) : m.kind === 'album-names' ? entityPath('album', m.title, m.artist) : entityPath('track', m.title, m.artist);
  const link = (v: Variant) => {
    if (!lastfmUser) return null;
    if (m.kind === 'song-albums') return null; // one link for the whole song, below
    const url = m.kind === 'artist-names' ? lastfmLibraryUrl(lastfmUser, v.name) : m.kind === 'album-names' ? lastfmLibraryUrl(lastfmUser, m.artist, v.name) : lastfmLibraryUrl(lastfmUser, m.artist, undefined, v.name);
    return (
      <a className="mm-lfm" href={url} target="_blank" rel="noreferrer" title="Open these scrobbles on Last.fm" onClick={(e) => e.stopPropagation()}>
        ↗
      </a>
    );
  };
  return (
    <article className="mm-card">
      <div className="mm-head">
        <EntityImg kind={imgKind} name={imgKind === 'artist' ? m.artist : m.title} artist={m.artist} size={40} shape={imgKind === 'artist' ? 'circle' : 'square'} />
        <div className="mm-title">
          <a href={href} className="mm-name">
            {m.title}
          </a>
          <span className="muted small">
            {m.kind !== 'artist-names' && `${m.artist} · `}
            {what} · {plural(m.off, 'play')} to move
          </span>
        </div>
      </div>
      <div className="mm-variants" role="radiogroup" aria-label="Name to keep">
        {m.variants.map((v, i) => (
          <label key={v.key || '-'} className={`mm-var ${i === keep ? 'keep' : ''}`}>
            <input type="radio" name={m.id} checked={i === keep} onChange={() => setKeep(i)} />
            <span className="mm-var-name">
              {v.name ? <LookAlike name={v.name} diff={diffs[i]} /> : <i className="muted">No album</i>}
              {diffs[i]?.kinds.map((k) => (
                <span key={k} className="mm-tag diff">
                  {k}
                </span>
              ))}
              {v.tags
                .filter((t) => t !== 'no-album')
                .map((t) => (
                  <span key={t} className="mm-tag">
                    {TAG_LABEL[t]}
                  </span>
                ))}
              {i === m.suggested && <span className="mm-tag suggested">suggested</span>}
              {v.also && (
                // other editions of this album: counted with it here, sorted out on the album's own card
                <span className="mm-also muted small">also as {v.also.map((x) => `“${x.name}”`).join(', ')}</span>
              )}
            </span>
            <span className="mm-var-meta muted small">
              {plural(v.plays, 'play')} · {yearSpan(v)}
            </span>
            {link(v)}
          </label>
        ))}
      </div>
      <div className="mm-actions">
        <button className="btn small primary" disabled={busy} onClick={() => onMerge(keep)}>
          Merge into “{target.name || 'No album'}”
        </button>
        <button className="btn small ghost" disabled={busy} onClick={onFine} title="Leave these as they are and stop listing them">
          They’re fine
        </button>
        {lastfmUser && m.kind === 'song-albums' && (
          <a className="btn small ghost" href={lastfmLibraryUrl(lastfmUser, m.artist, undefined, m.title)} target="_blank" rel="noreferrer">
            Last.fm ↗
          </a>
        )}
      </div>
    </article>
  );
}

/** Merges you've made, one line per mismatch, each with undo. */
function Merged({ fixes, busy, onUndo }: { fixes: Fix[]; busy: boolean; onUndo: (ids: string[] | 'all') => void }) {
  const [limit, setLimit] = useState(20);
  const groups = useMemo(() => {
    const by = new Map<string, Fix[]>();
    for (const f of fixes) {
      const arr = by.get(f.g);
      if (arr) arr.push(f);
      else by.set(f.g, [f]);
    }
    return [...by.values()].sort((a, b) => b[0].at - a[0].at);
  }, [fixes]);
  if (!groups.length) return null;
  return (
    <section className="panel-box settings-group">
      <div className="panel-box-head">
        <h3>Merged in Encore</h3>
        <div className="panel-box-right">
          <button
            className="mini-btn"
            disabled={busy}
            onClick={() => {
              if (confirm(`Undo all ${groups.length} merges? Those scrobbles go back to the names they have on Last.fm.`)) onUndo('all');
            }}
          >
            Undo all
          </button>
        </div>
      </div>
      <p className="muted small settings-desc">Only Encore counts these as one; your Last.fm history is unchanged. Merges sync to your other devices.</p>
      <ol className="mm-merged">
        {groups.slice(0, limit).map((g) => {
          const f = g[0];
          const kind = f.g.slice(0, f.g.indexOf(':')) as MismatchKind;
          return (
            <li key={f.g}>
              <span className="mm-merged-text">
                <span className="small">
                  {g.map((x) => x.fn ?? x.from).map((n, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      {n || <i>No album</i>}
                    </span>
                  ))}{' '}
                  → <b>{f.to}</b>
                </span>
                <span className="muted small">
                  {KIND_LABEL[kind] ?? 'Merge'}
                  {f.n ? ` · ${f.n}` : ''}
                </span>
              </span>
              <button className="mini-btn" disabled={busy} onClick={() => onUndo([f.g])}>
                Undo
              </button>
            </li>
          );
        })}
      </ol>
      {groups.length > limit && (
        <button className="more" onClick={() => setLimit(limit + 50)}>
          Show more · {fmtNum(groups.length - limit)} left
        </button>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ links from the stats pages */

/** Bottom of the Artists / Albums / Songs pages: how many mismatches there are, and where to review them. */
export function MismatchLink({ kind }: { kind: EntityKind }) {
  const open = useOpenMismatches();
  if (!open?.length) return null;
  const relevant = open.filter((m) => (kind === 'artist' ? m.kind === 'artist-names' : kind === 'album' ? m.kind === 'album-names' || m.kind === 'song-albums' : m.kind === 'song-names' || m.kind === 'song-albums'));
  if (!relevant.length) return null;
  const text =
    kind === 'artist'
      ? `${plural(relevant.length, 'artist')} scrobbled under more than one name.`
      : kind === 'album'
        ? `${plural(relevant.length, 'album or song', 'albums and songs')} scrobbled under more than one album name.`
        : `${plural(relevant.length, 'song')} scrobbled under more than one name or album.`;
  return (
    <p className="singles-link muted small">
      {text} <a href={routePath({ name: 'settings', tab: 'cleanup' })}>Review in Clean up →</a>
    </p>
  );
}

/** On a song, album or artist page: this one is split across names. */
export function MismatchNote({ kind, name, artist }: { kind: EntityKind; name: string; artist: string }) {
  const open = useOpenMismatches();
  if (!open?.length) return null;
  const mine = mismatchesFor(open, kind, name, artist);
  if (!mine.length) return null;
  let text: string;
  const songAlbums = mine.find((m) => m.kind === 'song-albums');
  const names = mine.find((m) => (kind === 'artist' ? m.kind === 'artist-names' : m.kind !== 'song-albums'));
  if (kind === 'track' && songAlbums && !names) text = `Scrobbled under ${plural(songAlbums.variants.length, 'album')}: ${songAlbums.variants.map((v) => v.name || 'no album').join(', ')}.`;
  else if (kind === 'track' && names) text = `Also scrobbled as ${names.variants.filter((v) => v.key !== name.toLowerCase()).map((v) => `“${v.name}”`).join(', ')}${songAlbums ? `, and under ${plural(songAlbums.variants.length, 'album')}` : ''}.`;
  else if (kind === 'album' && names) text = `Also scrobbled as ${names.variants.filter((v) => v.key !== name.toLowerCase()).map((v) => `“${v.name}”`).join(', ')}.`;
  else if (kind === 'album') text = `${plural(mine.length, 'song')} from this album ${mine.length === 1 ? 'was' : 'were'} also scrobbled under another album or none.`;
  else if (names) text = `Also scrobbled as ${names.variants.filter((v) => v.key !== name.toLowerCase()).map((v) => `“${v.name}”`).join(', ')}.`;
  else text = `${plural(mine.length, 'song or album', 'songs and albums')} by ${artist} ${mine.length === 1 ? 'is' : 'are'} scrobbled under more than one name.`;
  return (
    <p className="single-note muted small">
      {text} <a href={routePath({ name: 'settings', tab: 'cleanup', q: kind === 'artist' ? artist : name })}>Review in Clean up →</a>
    </p>
  );
}
