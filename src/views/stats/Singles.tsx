import { useState } from 'react';
import { useApp } from '../../store';
import { Toggle } from '../../ui/controls';
import { EntityImg, fmtNum } from '../../render/primitives';
import { entityPath, routePath } from '../../router';
import type { SingleInfo } from '../../lib/library';

/** Bottom of the Albums page: how many releases are treated as singles, and where to change it. */
export function SinglesLink() {
  const lib = useApp((s) => s.lib);
  const prefs = useApp((s) => s.albumPrefs);
  if (!lib) return null;
  const hidden = lib.singles.filter((x) => x.hidden).length;
  return (
    <p className="singles-link muted small">
      {prefs.hideSingles ? `${fmtNum(hidden)} one-song releases are treated as singles and left out of albums.` : 'One-song releases are counted as albums.'}{' '}
      <a href={routePath({ name: 'settings', tab: 'albums' })}>Change in Settings →</a>
    </p>
  );
}

/** Settings → Albums & singles: the switch, plus every single, hidden or kept. */
export function SinglesSettings() {
  const lib = useApp((s) => s.lib);
  const prefs = useApp((s) => s.albumPrefs);
  const setPrefs = useApp((s) => s.setAlbumPrefs);
  const [view, setView] = useState<'hidden' | 'kept'>('hidden');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  if (!lib) return null;
  const hidden = lib.singles.filter((x) => x.hidden);
  // kept = singles you chose to count as albums (or all of them while the switch is off)
  const kept = lib.singles.filter((x) => !x.hidden);
  const checking = lib.singleCandidates.length;
  const source = view === 'hidden' ? hidden : kept;
  const needle = q.trim().toLowerCase();
  const list = needle ? source.filter((x) => `${x.name} ${x.artist} ${x.track}`.toLowerCase().includes(needle)) : source;

  return (
    <>
      <Toggle value={prefs.hideSingles} onChange={(v) => void setPrefs({ ...prefs, hideSingles: v })} label="Don't count one-song releases as albums" />
      <p className="muted small singles-help">
        A release counts as a single when Last.fm lists only one song on it, or when Last.fm doesn't know it and you've only ever played one song from it. Singles are left out of album charts and stats, and their songs don't show a “from” album. Play a second song from one and it becomes an album again automatically.
        {checking > 0 && ` Checking ${fmtNum(checking)} more with Last.fm in the background…`}
      </p>
      {lib.singles.length > 0 && (
        <>
          <div className="row gap wrap settings-listbar">
            <div className="segmented">
              <button type="button" className={view === 'hidden' ? 'on' : ''} onClick={() => setView('hidden')}>
                Treated as singles · {fmtNum(hidden.length)}
              </button>
              <button type="button" className={view === 'kept' ? 'on' : ''} onClick={() => setView('kept')}>
                {prefs.hideSingles ? 'Kept as albums' : 'Counted as albums'} · {fmtNum(kept.length)}
              </button>
            </div>
            <input className="text-input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!list.length ? (
            <p className="empty">{needle ? `Nothing matches “${q}”.` : view === 'hidden' ? 'Nothing is treated as a single.' : 'You haven\'t kept any singles as albums.'}</p>
          ) : (
            <ol className="ledger compact">
              {list.slice(0, limit).map((x) => (
                <SingleRow key={x.key} x={x} />
              ))}
            </ol>
          )}
          {list.length > limit && (
            <button className="more" onClick={() => setLimit(limit + 200)}>
              Show more · {fmtNum(list.length - limit)} left
            </button>
          )}
        </>
      )}
    </>
  );
}

function SingleRow({ x }: { x: SingleInfo }) {
  const prefs = useApp((s) => s.albumPrefs);
  const setPrefs = useApp((s) => s.setAlbumPrefs);
  const toggle = () => {
    const keep = new Set(prefs.keep);
    if (keep.has(x.key)) keep.delete(x.key);
    else keep.add(x.key);
    void setPrefs({ ...prefs, keep: [...keep] });
  };
  return (
    <li>
      <div className="ledger-row single-row">
        <span />
        <EntityImg kind="track" name={x.track} artist={x.artist} size={38} shape="square" />
        <span className="ledger-main">
          <a className="ledger-ttl" href={x.hidden ? entityPath('track', x.track, x.artist) : entityPath('album', x.name, x.artist)}>
            {x.name}
          </a>
          <span className="ledger-meta">
            {x.artist} · {fmtNum(x.plays)} plays · {x.source === 'lastfm' ? '1 song on Last.fm' : 'only 1 song scrobbled'}
          </span>
        </span>
        {(x.hidden || prefs.keep.includes(x.key)) && (
          <button className="mini-btn" onClick={toggle}>
            {x.hidden ? 'Count as album' : 'Treat as single'}
          </button>
        )}
      </div>
    </li>
  );
}

/** Small note at the bottom of a song page when its release is hidden as a single. */
export function SingleNote({ singleKey }: { singleKey: string }) {
  const lib = useApp((s) => s.lib);
  const prefs = useApp((s) => s.albumPrefs);
  const setPrefs = useApp((s) => s.setAlbumPrefs);
  const x = lib?.singles.find((s) => s.key === singleKey);
  if (!x || !x.hidden) return null;
  return (
    <p className="single-note muted small">
      Released as a single (“{x.name}”), so it isn't counted as an album.{' '}
      <button className="link" onClick={() => void setPrefs({ ...prefs, keep: [...new Set([...prefs.keep, x.key])] })}>
        Count it as an album
      </button>
    </p>
  );
}
