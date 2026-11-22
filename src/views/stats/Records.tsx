import { useMemo, useState } from 'react';
import { bumpSettings } from '../../lib/changes';
import { useApp } from '../../store';
import { getStats, milestones, type MilestoneStep } from '../../lib/library';
import { Panel, fmtDate, fmtDay } from '../../ui/charts';
import { EntityImg, fmtNum } from '../../render/primitives';
import { entityPath } from '../../router';

/** All-time records: ignores the selected range on purpose. */
export function Records() {
  const lib = useApp((s) => s.lib)!;
  const data = useMemo(() => {
    const all = getStats(lib, { from: 0, to: Infinity });
    const years = all.timeline('year').map((y) => {
      const s = getStats(lib, { from: y.start.getTime() / 1000, to: new Date(y.start.getFullYear() + 1, 0, 1).getTime() / 1000 });
      return {
        year: y.start.getFullYear(),
        plays: s.total,
        artists: s.unique('artist'),
        newArtists: s.discoveries('artist').length,
        artist: s.top('artist', 1)[0],
        album: s.top('album', 1)[0],
        track: s.top('track', 1)[0],
      };
    });
    return {
      all,
      years: years.filter((y) => y.plays > 0).reverse(),
      day: all.busiestDay(),
      week: all.biggestPeriod('week'),
      month: all.biggestPeriod('month'),
      year: all.biggestPeriod('year'),
      streak: all.longestStreak(),
      aStreak: all.artistStreak(),
      obs: all.obsession(),
      eras: all.topPerMonth('artist'),
    };
  }, [lib]);
  if (!lib.n) return null;
  const { all } = data;
  const maxYear = Math.max(1, ...data.years.map((y) => y.plays));
  const tr = (i: number) => lib.tracks[i];
  const ar = (i: number) => lib.artists[i].name;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">All time · since {fmtDate(lib.ts[0], { month: 'long', year: 'numeric' })}</div>
          <h1 className="page-title">Records</h1>
        </div>
      </div>

      <div className="records">
        <Rec label="Total scrobbles" value={fmtNum(all.total)} sub={`${fmtNum(all.unique('artist'))} artists · ${fmtNum(all.unique('track'))} songs`} />
        {data.day && <Rec label="Biggest day" value={fmtNum(data.day.count)} sub={fmtDay(data.day.day)} />}
        {data.week && <Rec label="Biggest week" value={fmtNum(data.week.value)} sub={`week of ${data.week.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`} />}
        {data.month && <Rec label="Biggest month" value={fmtNum(data.month.value)} sub={data.month.start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} />}
        {data.year && <Rec label="Biggest year" value={fmtNum(data.year.value)} sub={String(data.year.start.getFullYear())} />}
        {data.streak && <Rec label="Longest streak" value={`${fmtNum(data.streak.days)} days`} sub={`${fmtDay(data.streak.start, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmtDay(data.streak.end, { month: 'short', day: 'numeric', year: 'numeric' })}`} />}
        {data.aStreak && <Rec label="Longest artist streak" value={`${fmtNum(data.aStreak.streak.days)} days`} sub={ar(data.aStreak.artist)} href={entityPath('artist', ar(data.aStreak.artist), ar(data.aStreak.artist))} />}
        {data.obs && (
          <Rec
            label="Most plays of one song in a day"
            value={fmtNum(data.obs.count)}
            sub={`${tr(data.obs.track).name} · ${fmtDay(data.obs.day, { month: 'short', day: 'numeric', year: 'numeric' })}`}
            href={entityPath('track', tr(data.obs.track).name, ar(tr(data.obs.track).artist))}
          />
        )}
      </div>

      <Panel title="Year by year">
        <div className="table-scroll">
          <table className="table years">
            <thead>
              <tr>
                <th>Year</th>
                <th className="num">Plays</th>
                <th className="num">Artists</th>
                <th className="num">New</th>
                <th>#1 artist</th>
                <th>#1 song</th>
                <th>#1 album</th>
              </tr>
            </thead>
            <tbody>
              {data.years.map((y) => (
                <tr key={y.year}>
                  <td className="disp">{y.year}</td>
                  <td className="num">
                    {fmtNum(y.plays)}
                    <span className="tbar" style={{ width: `${(y.plays / maxYear) * 100}%` }} />
                  </td>
                  <td className="num">{fmtNum(y.artists)}</td>
                  <td className="num">{fmtNum(y.newArtists)}</td>
                  <td>{y.artist && <a href={entityPath('artist', y.artist.name, y.artist.artist)}>{y.artist.name}</a>}</td>
                  <td>{y.track && <a href={entityPath('track', y.track.name, y.track.artist)}>{y.track.name}</a>}</td>
                  <td>{y.album && <a href={entityPath('album', y.album.name, y.album.artist)}>{y.album.name}</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid2">
        <Milestones />
        <Panel title="Eras · your #1 artist every month">
          <div className="eras tall">
            {[...data.eras].reverse().map((m) =>
              m.item ? (
                <a key={m.month.getTime()} className="era" href={entityPath('artist', m.item.name, m.item.artist)}>
                  <EntityImg kind="artist" name={m.item.name} artist={m.item.artist} shape="square" />
                  <span className="era-month">{m.month.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}</span>
                  <span className="era-name">{m.item.name}</span>
                </a>
              ) : null,
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Rec({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <span className="eyebrow">{label}</span>
      <span className="hl-value">{value}</span>
      {sub && <span className="hl-sub">{sub}</span>}
    </>
  );
  return href ? (
    <a className="hl" href={href}>
      {body}
    </a>
  ) : (
    <div className="hl">{body}</div>
  );
}

const LS_KEY = 'sw.milestones';
const STEP_OPTIONS: { value: string; label: string }[] = [
  { value: 'classic', label: 'Classic (1, 100, 1K, 5K, 10K…)' },
  { value: '100', label: 'Every 100' },
  { value: '500', label: 'Every 500' },
  { value: '1000', label: 'Every 1,000' },
  { value: '5000', label: 'Every 5,000' },
  { value: '10000', label: 'Every 10,000' },
  { value: '25000', label: 'Every 25,000' },
  { value: '50000', label: 'Every 50,000' },
  { value: '100000', label: 'Every 100,000' },
  { value: 'custom', label: 'Custom interval…' },
];

function loadPrefs(): { step: string; custom: number; artist: string; order: 'newest' | 'oldest' } {
  try {
    return { step: 'classic', custom: 2000, artist: '', order: 'newest', ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') };
  } catch {
    return { step: 'classic', custom: 2000, artist: '', order: 'newest' };
  }
}

const shortN = (n: number) => (n >= 1000 && n % 10 === 0 ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}K` : fmtNum(n));

function Milestones() {
  const lib = useApp((s) => s.lib)!;
  const [prefs, setPrefsState] = useState(loadPrefs);
  const setPrefs = (p: Partial<typeof prefs>) => {
    const next = { ...prefs, ...p };
    setPrefsState(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    bumpSettings();
  };
  const topArtists = useMemo(() => getStats(lib, { from: 0, to: Infinity }).ranking('artist').slice(0, 100), [lib]);
  const artistIdx = prefs.artist ? (lib.keys.artist.get(prefs.artist.toLowerCase()) ?? -1) : -1;
  const step: MilestoneStep = prefs.step === 'classic' ? 'classic' : prefs.step === 'custom' ? Math.max(1, prefs.custom || 1) : Number(prefs.step);
  const data = useMemo(() => milestones(lib, step, artistIdx), [lib, step, artistIdx]);
  const rows = prefs.order === 'newest' ? [...data.hit].reverse() : data.hit;
  const who = artistIdx >= 0 ? lib.artists[artistIdx].name : '';
  const tr = (i: number) => lib.tracks[i];
  const ar = (i: number) => lib.artists[i].name;

  return (
    <Panel title="Milestones" right={<span className="muted small">{fmtNum(data.hit.length)} reached</span>}>
      <div className="milestone-tools">
        <select className="select" value={prefs.step} onChange={(e) => setPrefs({ step: e.target.value })}>
          {STEP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {prefs.step === 'custom' && (
          <input
            className="text-input"
            type="number"
            min={1}
            value={prefs.custom}
            onChange={(e) => setPrefs({ custom: Number(e.target.value) })}
            placeholder="e.g. 2000"
            title="Interval"
          />
        )}
        <select className="select" value={prefs.artist} onChange={(e) => setPrefs({ artist: e.target.value })}>
          <option value="">All scrobbles</option>
          <optgroup label="Plays of one artist">
            {topArtists.map((r) => (
              <option key={r.idx} value={lib.artists[r.idx].name}>
                {lib.artists[r.idx].name} ({fmtNum(r.count)})
              </option>
            ))}
          </optgroup>
        </select>
        <div className="seg">
          <button aria-pressed={prefs.order === 'newest'} onClick={() => setPrefs({ order: 'newest' })}>
            Newest
          </button>
          <button aria-pressed={prefs.order === 'oldest'} onClick={() => setPrefs({ order: 'oldest' })}>
            Oldest
          </button>
        </div>
      </div>
      {data.next !== null && (
        <div className="milestone-next">
          <span className="eyebrow">Next up</span>
          <span>
            {who ? `${who} play` : 'Scrobble'} <b>#{fmtNum(data.next)}</b> in <b>{fmtNum(data.next - data.total)}</b> more
          </span>
          <span className="milestone-progress">
            <i style={{ width: `${Math.min(100, (data.total / data.next) * 100)}%` }} />
          </span>
        </div>
      )}
      <ol className="ledger compact milestones-list">
        {rows.map((m) => {
          const t = tr(m.track);
          return (
            <li key={m.n}>
              <a className="ledger-row milestone" href={entityPath('track', t.name, ar(t.artist))}>
                <span className="ledger-rk" title={`#${fmtNum(m.n)}`}>
                  #{shortN(m.n)}
                </span>
                <EntityImg kind="track" name={t.name} artist={ar(t.artist)} size={38} shape="square" />
                <span className="ledger-main">
                  <span className="ledger-ttl">{t.name}</span>
                  <span className="ledger-meta">
                    {ar(t.artist)} · {fmtDate(m.ts)}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
