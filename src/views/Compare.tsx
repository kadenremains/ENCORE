import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { navigate, routePath, entityPath } from '../router';
import { useRangeStats } from './stats/useRangeStats';
import { EntityImg, fmtNum } from '../render/primitives';
import { BarChart, Panel } from '../ui/charts';
import { usePrefs, fmtHourPref } from '../lib/prefs';
import { WEEKDAYS } from '../ui/charts';
import {
  FriendError,
  KEEP_FOR,
  cancelDownload,
  downloadHistory,
  addFriend,
  historyState,
  refreshFriendImage,
  removeFriend,
  removeHistory,
  useDownloads,
  useFriends,
  type HistoryState,
} from '../lib/friends';
import { type Comparison, type Habits, type Side } from '../lib/compare';
import { runComparison, type ComparisonResult } from '../lib/compareRun';
import { FriendAvatar } from './FriendStrip';
import { fillVersus, makeVersusProject } from '../editor/versus';
import { openVersusFilled } from '../editor/versusOpen';
import { projectsDb } from '../lib/picStore';
import { localChanged } from '../lib/changes';

/** You vs someone: #/compare/<name>. Picking someone is on the Friends page (#/friends). */
export function Compare({ friend }: { friend?: string }) {
  useEffect(() => {
    if (!friend) navigate({ name: 'friends' });
  }, [friend]);
  return friend ? <Versus name={friend} /> : null;
}

/* ------------------------------------------------------------------ you vs them */

function Versus({ name }: { name: string }) {
  const { lib, spec, label } = useRangeStats();
  const apiKey = useApp((s) => s.apiKey);
  const fixes = useApp((s) => s.albumPrefs.fixes);
  const running = useDownloads((s) => s.running[name.toLowerCase()]);
  const [hist, setHist] = useState<HistoryState | null | undefined>(undefined);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [err, setErr] = useState<FriendError | Error | null>(null);
  const [reload, setReload] = useState(0);

  // (re-read when a download of their history finishes, wherever it was started)
  useEffect(() => {
    if (running) return;
    let live = true;
    void historyState(name).then((h) => live && setHist(h ?? null));
    return () => {
      live = false;
    };
  }, [name, reload, running]);

  // their full history if you downloaded it (any range), else Last.fm's top lists
  useEffect(() => {
    if (hist === undefined || running) return;
    let live = true;
    runComparison(name, spec)
      .then((r) => {
        if (!live) return;
        setResult(r);
        setErr(null);
        refreshFriendImage(r.info.name, r.info.image); // only if they're already a friend
      })
      .catch((e) => live && setErr(e as Error));
    return () => {
      live = false;
    };
  }, [hist, running, lib, spec, name, apiKey, fixes, reload]);

  const getFull = async () => {
    try {
      await downloadHistory(name, apiKey);
      setHist((await historyState(name)) ?? null);
    } catch (e) {
      setErr(e as Error);
    }
  };

  if (err && !result) {
    return (
      <div className="page compare">
        <p className="empty">{err.message}</p>
        <div className="row gap center">
          <a className="btn" href={routePath({ name: 'friends' })}>
            Back to friends
          </a>
          {(err as FriendError).kind === 'network' && (
            <button className="btn" onClick={() => setReload(reload + 1)}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="page compare">
        <div className="center-screen">
          <span className="spinner big" />
          <p className="muted small">Comparing you and {name}…</p>
        </div>
      </div>
    );
  }
  const { cmp, me, them, full, note } = result;

  return (
    <div className="page compare">
      <section className="vs-head grain">
        <div className="vs-people">
          <Person side={me} />
          <ScoreRing score={cmp.score} />
          <Person side={them} />
        </div>
        <h1 className="vs-label">{cmp.label}</h1>
        <p className="vs-line">{cmp.line}</p>
        <p className="muted small vs-range">
          {note} · {fmtNum(me.total)} plays vs {fmtNum(them.total)}
          {full ? '' : ' (their top lists)'}
        </p>
        <div className="row gap wrap center">
          <button
            className="btn primary small"
            onClick={async () => {
              // only who it compares you with is saved; opening it loads the comparison again
              const p = makeVersusProject(me.name, them.name);
              await projectsDb.put(p);
              localChanged();
              openVersusFilled(p.id, fillVersus(p, cmp, me, them, note));
              navigate({ name: 'edit', id: p.id });
            }}
          >
            Make a wrapped
          </button>
          <FriendButton name={them.name} image={them.image} />
          <FullHistoryButton name={name} hist={hist ?? null} running={running} onGet={getFull} onRemoved={() => setHist(null)} />
          <a className="btn small ghost" href={routePath({ name: 'friend', who: them.name })}>
            {them.name}’s stats
          </a>
        </div>
        <p className="muted small vs-explain">Everything Encore downloads about {them.name} stays on this device and is deleted {KEEP_FOR / 3600_000} hours after you last open this comparison.</p>
        <p className="muted small vs-explain">The score is how much your listening overlaps: every artist you both play adds the smaller of your two shares of it. 100 is identical listening, 0 nothing in common.</p>
      </section>

      <Panel title="Shared artists" right={<span className="muted small">{fmtNum(cmp.sharedArtists.length)} in common</span>}>
        <SharedList items={cmp.sharedArtists} kind="artist" me={me.name} them={them.name} />
      </Panel>

      <Panel title="Who found it first">
        {cmp.firsts ? <Firsts firsts={cmp.firsts} them={them.name} /> : <NeedsFull text={`Needs ${them.name}’s full history: their first play of each artist.`} name={name} running={running} onGet={getFull} />}
      </Panel>

      <div className="grid2">
        <Panel title={`Only ${them.name} plays`} right={<span className="muted small">try these</span>}>
          <OnlyList items={cmp.onlyThem} who={them.name} empty="Nothing: you’ve played every artist they play here." link />
        </Panel>
        <Panel title="Only you play" right={<span className="muted small">put them on</span>}>
          <OnlyList items={cmp.onlyMe} who="you" empty={`${them.name} has played every one of your artists.`} />
          {!cmp.onlyMeExact && cmp.onlyMe.length > 0 && <p className="muted small">Not in their top 1,000 artists of all time. Their full history would say for sure.</p>}
        </Panel>
      </div>

      <div className="grid2">
        <Panel title="Songs you both have on repeat">
          <SharedList items={cmp.sharedTracks.slice(0, 12)} kind="track" me={me.name} them={them.name} compact />
        </Panel>
        <Panel title="Albums you both love">
          <SharedList items={cmp.sharedAlbums.slice(0, 10)} kind="album" me={me.name} them={them.name} compact />
        </Panel>
      </div>

      <Panel title="Habits side by side">
        {me.habits && them.habits ? <HabitsTable a={me.habits} b={them.habits} them={them.name} /> : <NeedsFull text={`Needs ${them.name}’s full history: when and how they listen.`} name={name} running={running} onGet={getFull} />}
      </Panel>

      <Panel title="Match over time">
        {cmp.overTime ? (
          <BarChart height={140} data={cmp.overTime.map((m, i) => ({ label: m.month.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), value: m.score, axis: i % Math.max(1, Math.ceil(cmp.overTime!.length / 8)) === 0 ? m.month.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : '', tip: `${m.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · ${m.score}% match` }))} />
        ) : full ? (
          <p className="muted small">Not enough months where you both listened in {label}.</p>
        ) : (
          <NeedsFull text={`Needs ${them.name}’s full history: month by month, when your tastes met and split.`} name={name} running={running} onGet={getFull} />
        )}
      </Panel>
    </div>
  );
}

/** Add someone to your friends: only ever when you tap it. */
function FriendButton({ name, image }: { name: string; image?: string }) {
  const f = useFriends((s) => s.list.find((x) => x.name.toLowerCase() === name.toLowerCase()));
  if (!f)
    return (
      <button className="btn small" onClick={() => addFriend({ name, image })}>
        ＋ Add to friends
      </button>
    );
  if (f.source === 'lastfm') return <span className="muted small">★ Last.fm friend</span>;
  return (
    <button className="btn small ghost" onClick={() => void removeFriend(name)} title="Remove from your friends">
      ★ Friend · remove
    </button>
  );
}

function Person({ side }: { side: Side }) {
  return (
    <div className="vs-person">
      <FriendAvatar f={side} size={64} />
      <b>{side.name}</b>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="vs-ring" aria-label={`${score}% match`}>
      <svg viewBox="0 0 110 110" width="110" height="110">
        <circle cx="55" cy="55" r={r} className="vs-ring-bg" />
        <circle cx="55" cy="55" r={r} className="vs-ring-fg" strokeDasharray={`${(c * score) / 100} ${c}`} transform="rotate(-90 55 55)" />
      </svg>
      <span>
        {score}
        <small>%</small>
      </span>
    </div>
  );
}

function FullHistoryButton({ name, hist, running, onGet, onRemoved }: { name: string; hist: HistoryState | null; running?: { done: number; total: number }; onGet: () => void; onRemoved: () => void }) {
  if (running)
    return (
      <span className="row gap">
        <span className="muted small">
          Downloading {name}’s history… {running.total ? `${Math.round((running.done / running.total) * 100)}%` : ''}
        </span>
        <button className="mini-btn" onClick={() => cancelDownload(name)}>
          Stop
        </button>
      </span>
    );
  if (!hist)
    return (
      <button className="btn small" onClick={onGet}>
        Get their full history
      </button>
    );
  return (
    <span className="row gap">
      <button className="btn small" onClick={onGet} title={`${fmtNum(hist.plays)} plays, updated ${new Date(hist.at).toLocaleDateString()}`}>
        Update their history
      </button>
      <button
        className="mini-btn"
        onClick={async () => {
          if (!confirm(`Delete ${name}’s downloaded history from this device?`)) return;
          await removeHistory(name);
          onRemoved();
        }}
      >
        Remove it
      </button>
    </span>
  );
}

function NeedsFull({ text, name, running, onGet }: { text: string; name: string; running?: { done: number; total: number }; onGet: () => void }) {
  return (
    <div className="needs-full">
      <p className="muted small">{text}</p>
      {!running && (
        <button className="btn small" onClick={onGet}>
          Get {name}’s full history
        </button>
      )}
    </div>
  );
}

function SharedList({ items, kind, me, them, compact }: { items: Comparison['sharedArtists']; kind: 'artist' | 'album' | 'track'; me: string; them: string; compact?: boolean }) {
  const [limit, setLimit] = useState(compact ? 12 : 15);
  const listImages = usePrefs((p) => p.listImages);
  const maxMe = Math.max(1, ...items.map((x) => x.mine));
  const maxThem = Math.max(1, ...items.map((x) => x.theirs));
  if (!items.length) return <p className="empty">Nothing in common here.</p>;
  return (
    <>
      <ol className="vs-shared">
        {items.slice(0, limit).map((x, i) => (
          <li key={x.key}>
            <span className="vs-rank muted small">{i + 1}</span>
            {listImages && <EntityImg kind={kind} name={x.name} artist={x.artist || x.name} size={34} shape={kind === 'artist' ? 'circle' : 'square'} />}
            <span className="vs-shared-main">
              <a href={entityPath(kind, x.name, x.artist || x.name)}>{x.name}</a>
              {x.artist && <span className="muted small">{x.artist}</span>}
              <span className="vs-bars">
                <span className="vs-bar me" style={{ width: `${(x.mine / maxMe) * 100}%` }} title={`${me}: ${fmtNum(x.mine)}`} />
                <span className="vs-bar them" style={{ width: `${(x.theirs / maxThem) * 100}%` }} title={`${them}: ${fmtNum(x.theirs)}`} />
              </span>
            </span>
            <span className="vs-nums small">
              <span>{fmtNum(x.mine)}</span>
              <span className="muted">{fmtNum(x.theirs)}</span>
            </span>
          </li>
        ))}
      </ol>
      {items.length > limit && (
        <button className="more" onClick={() => setLimit(limit + 30)}>
          Show more · {fmtNum(items.length - limit)} left
        </button>
      )}
    </>
  );
}

function OnlyList({ items, who, empty, link }: { items: { name: string; plays: number }[]; who: string; empty: string; link?: boolean }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <ol className="vs-only">
      {items.slice(0, 15).map((x) => (
        <li key={x.name}>
          {link ? (
            <a href={`https://www.last.fm/music/${encodeURIComponent(x.name).replace(/%20/g, '+')}`} target="_blank" rel="noreferrer">
              {x.name} ↗
            </a>
          ) : (
            <a href={entityPath('artist', x.name, x.name)}>{x.name}</a>
          )}
          <span className="muted small">
            {fmtNum(x.plays)} plays {who === 'you' ? '' : `by ${who}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Firsts({ firsts, them }: { firsts: NonNullable<Comparison['firsts']>; them: string }) {
  const mine = firsts.filter((f) => f.first === 'me').length;
  const theirs = firsts.filter((f) => f.first === 'them').length;
  const date = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const gap = (d: number) => (d >= 60 ? `${Math.round(d / 30)} months` : `${d} day${d === 1 ? '' : 's'}`);
  const shown = useMemo(() => firsts.slice(0, 12), [firsts]);
  if (!firsts.length) return <p className="empty">No shared artists to compare.</p>;
  return (
    <>
      <p className="small">
        Of your top {firsts.length} shared artists, <b>you</b> found {mine} first and <b>{them}</b> found {theirs} first.
      </p>
      <ol className="vs-firsts">
        {shown.map((f) => (
          <li key={f.name}>
            <a href={entityPath('artist', f.name, f.name)}>{f.name}</a>
            <span className="small">
              {f.first === 'same' ? 'Same day' : `${f.first === 'me' ? 'You' : them}, ${gap(f.days)} earlier`}
              {f.beforeOther && <span className="muted"> (before {f.first === 'me' ? them : 'you'} started scrobbling)</span>}
            </span>
            <span className="muted small">
              you {date(f.mine)} · {them} {date(f.theirs)}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

function HabitsTable({ a, b, them }: { a: Habits; b: Habits; them: string }) {
  const rows: [string, string, string][] = [
    ['Plays', fmtNum(a.plays), fmtNum(b.plays)],
    ['Days with music', fmtNum(a.activeDays), fmtNum(b.activeDays)],
    ['Plays per day with music', a.perActiveDay.toFixed(1), b.perActiveDay.toFixed(1)],
    ['Favourite hour', fmtHourPref(a.peakHour), fmtHourPref(b.peakHour)],
    ['Busiest day', WEEKDAYS[a.busiestWeekday], WEEKDAYS[b.busiestWeekday]],
    ['Different artists per 100 plays', a.variety.toFixed(1), b.variety.toFixed(1)],
    ['New artists', fmtNum(a.newArtists), fmtNum(b.newArtists)],
  ];
  return (
    <table className="table vs-habits">
      <thead>
        <tr>
          <th />
          <th>You</th>
          <th>{them}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, x, y]) => (
          <tr key={k}>
            <td className="t-muted">{k}</td>
            <td className="num">{x}</td>
            <td className="num">{y}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
