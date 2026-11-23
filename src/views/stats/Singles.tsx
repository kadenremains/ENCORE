import { useState } from 'react';
import { useApp } from '../../store';
import { Toggle } from '../../ui/controls';
import { EntityImg, fmtNum } from '../../render/primitives';
import { entityPath } from '../../router';
import type { SingleInfo } from '../../lib/library';

/** Bottom-of-the-Albums-page controls for one-song releases. */
export function SinglesSection() {
  const lib = useApp((s) => s.lib);
  const prefs = useApp((s) => s.albumPrefs);
  const setPrefs = useApp((s) => s.setAlbumPrefs);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  if (!lib) return null;
  const hidden = lib.singles.filter((x) => x.hidden);
  const kept = lib.singles.filter((x) => !x.hidden && prefs.keep.includes(x.key));
  const checking = lib.singleCandidates.length;
  const list = (open ? lib.singles : []).filter((x) => !q || `${x.name} ${x.artist} ${x.track}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <section className="panel-box singles">
      <div className="panel-box-head">
        <h3>Singles</h3>
        <span className="muted small">
          {prefs.hideSingles ? `${fmtNum(hidden.length)} hidden from albums` : 'off'}
          {kept.length ? ` · ${fmtNum(kept.length)} kept as albums` : ''}
        </span>
      </div>
      <Toggle value={prefs.hideSingles} onChange={(v) => void setPrefs({ ...prefs, hideSingles: v })} label="Don't count one-song releases as albums" />
      <p className="muted small singles-help">
        A release counts as a single when Last.fm lists only one song on it, or when Last.fm doesn't know it and you've only ever played one song from it. Singles are left out of album charts and stats, and their songs don't show a “from” album. Play a second song from one and it becomes an album again automatically.
        {checking > 0 && ` Checking ${fmtNum(checking)} more with Last.fm in the background…`}
      </p>
      {lib.singles.length > 0 && (
        <button className="more" onClick={() => setOpen(!open)}>
          {open ? 'Hide list' : `Show all ${fmtNum(lib.singles.length)}`}
        </button>
      )}
      {open && (
        <>
          <input className="text-input" placeholder="Search singles…" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: '12px 0' }} />
          <ol className="ledger compact">
            {list.slice(0, 300).map((x) => (
              <SingleRow key={x.key} x={x} />
            ))}
          </ol>
        </>
      )}
    </section>
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
        <button className="mini-btn" onClick={toggle}>
          {x.hidden ? 'Show as album' : 'Hide again'}
        </button>
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
