import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useApp } from '../store';
import { navigate, parseRoute, routePath } from '../router';
import { LibScope, useRangeStats, withoutBreaks } from './stats/useRangeStats';
import { useFriendHistory } from './useFriendHistory';
import { EntityView } from './stats/EntityView';
import { BarChart, CalendarHeatmap, Kpi, Ledger, Panel, Punchcard, fmtDay, type LedgerItem } from '../ui/charts';
import { fmtNum } from '../render/primitives';
import { fmtHourPref } from '../lib/prefs';
import { getStats, type RangeStats } from '../lib/library';
import { PERIOD_LABEL, nearestPeriod } from '../lib/compare';
import {
  addFriend,
  fetchFriendInfo,
  quickLists,
  refreshFriendImage,
  removeFriend,
  syncLastfmFriends,
  useFriendSync,
  useFriends,
  type QuickLists,
} from '../lib/friends';
import type { TopEntry } from '../lib/lastfm';
import type { EntityKind, UserInfo } from '../lib/types';
import { FriendAvatar } from './FriendBits';

/* ------------------------------------------------------------------ #/friends */

/** Your friends, and looking anyone up. Tap a name for their stats; Compare for you vs them. */
export function Friends() {
  const demo = useApp((s) => s.demo);
  const me = useApp((s) => s.username);
  const apiKey = useApp((s) => s.apiKey);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const look = async () => {
    const n = name.trim();
    if (!/^[\w.-]{2,30}$/.test(n)) return setErr('That isn’t a Last.fm username.');
    if (n.toLowerCase() === me.toLowerCase()) return setErr('That’s you: your own stats are everywhere else in Encore.');
    setBusy(true);
    setErr('');
    try {
      const info = await fetchFriendInfo(n, apiKey);
      navigate({ name: 'friend', who: info.name });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page friends">
      <div className="page-head">
        <div>
          <div className="eyebrow">Their stats, and you vs them</div>
          <h1 className="page-title">Friends</h1>
        </div>
      </div>
      {demo ? (
        <p className="empty">Friends works with your own Last.fm account. Connect it from the start screen.</p>
      ) : (
        <>
          <FriendsList />
          <Panel title="Look someone up">
            <form
              className="row gap compare-form"
              onSubmit={(e) => {
                e.preventDefault();
                void look();
              }}
            >
              <input className="text-input" placeholder="Any Last.fm username" value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              <button className="btn primary" disabled={busy || !name.trim()}>
                {busy ? 'Looking…' : 'Look up'}
              </button>
            </form>
            {err && <p className="error small">{err}</p>}
            <p className="muted small">Last.fm profiles are public, so they don’t need Encore. Looking someone up doesn’t add them to your friends, and what Encore downloads about them stays on this device for a day.</p>
          </Panel>
        </>
      )}
    </div>
  );
}

function FriendsList() {
  const list = useFriends((s) => s.list);
  const sync = useFriendSync();
  const username = useApp((s) => s.username);
  const apiKey = useApp((s) => s.apiKey);
  return (
    <Panel
      title="Your friends"
      right={
        <button className="mini-btn" disabled={sync.running} onClick={() => void syncLastfmFriends(username, apiKey)}>
          {sync.running ? 'Checking Last.fm…' : 'Refresh from Last.fm'}
        </button>
      }
    >
      <p className="muted small">
        People you follow on Last.fm who follow you back show up here by themselves{sync.at ? ` (checked ${new Date(sync.at).toLocaleDateString()})` : ''}. Add anyone else from their page.
      </p>
      {sync.error && <p className="error small">{sync.error}</p>}
      {!list.length ? (
        <p className="empty">{sync.running ? 'Looking for your Last.fm friends…' : 'No friends yet.'}</p>
      ) : (
        <ul className="friend-list">
          {list.map((f) => (
            <li key={f.name}>
              <a href={routePath({ name: 'friend', who: f.name })} title={`${f.name}’s stats`}>
                <FriendAvatar f={f} size={36} />
                <span>{f.name}</span>
                <span className="muted small">{f.source === 'lastfm' ? 'Last.fm friend' : 'added by you'}</span>
              </a>
              <a className="btn small" href={routePath({ name: 'compare', friend: f.name })}>
                ⇄ Compare
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ #/friend/<name>: their stats */

/**
 * Someone's stats for the range you've picked: straight away from Last.fm's top lists, and all of it
 * once their history has downloaded (started by itself; kept a day after you last look).
 */
export function FriendProfile({ name }: { name: string }) {
  const me = useApp((s) => s.username);
  if (name.toLowerCase() === me.toLowerCase()) return <ItsYou />;
  return <TheirProfile name={name} />;
}

/** Someone's page opened for your own name: your stats are the rest of the app. */
export function ItsYou() {
  return (
    <div className="page">
      <p className="empty">That’s you: your own stats are everywhere else in Encore.</p>
      <div className="row center">
        <a className="btn" href={routePath({ name: 'overview' })}>
          Your overview
        </a>
      </div>
    </div>
  );
}

function TheirProfile({ name }: { name: string }) {
  const { range, label } = useRangeStats();
  const apiKey = useApp((s) => s.apiKey);
  const friend = useFriends((s) => s.list.find((f) => f.name.toLowerCase() === name.toLowerCase()));
  const history = useFriendHistory(name, true);
  const [info, setInfo] = useState<UserInfo | null>(null);
  const [quick, setQuick] = useState<QuickLists | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchFriendInfo(name, apiKey)
      .then((i) => {
        if (!live) return;
        setInfo(i);
        refreshFriendImage(i.name, i.image);
      })
      .catch((e) => live && setErr((e as Error).message));
    return () => {
      live = false;
    };
  }, [name, apiKey]);

  // until their history is in (or if you stopped it): Last.fm's top lists for the nearest period
  const near = useMemo(() => nearestPeriod(range), [range]);
  useEffect(() => {
    if (history.lib || !info) return;
    let live = true;
    quickLists(name, near.period, apiKey)
      .then((q) => live && setQuick(q))
      .catch((e) => live && setErr((e as Error).message));
    return () => {
      live = false;
    };
  }, [history.lib, info, name, near.period, apiKey]);

  // your "skip breaks" setting doesn't cut their stats
  const stats = useMemo(() => (history.lib ? getStats(history.lib, withoutBreaks(range)) : null), [history.lib, range]);

  if (err && !info) {
    return (
      <div className="page">
        <p className="empty">{err}</p>
        <div className="row center">
          <a className="btn" href={routePath({ name: 'friends' })}>
            Back to friends
          </a>
        </div>
      </div>
    );
  }
  const shownName = info?.name ?? name;
  // their artists, albums and songs open their own pages (their history, as if it were their account)
  const theirLink: LinkFor = (kind, n, a) => routePath({ name: 'friendEntity', who: shownName, kind, artist: a, title: n });

  return (
    <div className="page friend-profile">
      <section className="friend-head">
        <FriendAvatar f={{ name: shownName, image: info?.image }} size={72} />
        <div className="friend-head-text">
          <div className="eyebrow">{friend ? (friend.source === 'lastfm' ? 'Last.fm friend' : 'Friend') : 'On Last.fm'}</div>
          <h1 className="page-title">{shownName}</h1>
          {info && (
            <div className="muted small">
              {fmtNum(info.playcount)} scrobbles{info.registered ? ` · since ${new Date(info.registered * 1000).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : ''}
            </div>
          )}
        </div>
        <div className="row gap wrap friend-head-actions">
          <a className="btn primary small" href={routePath({ name: 'compare', friend: shownName })}>
            ⇄ Compare
          </a>
          {!friend ? (
            <button className="btn small" onClick={() => addFriend({ name: shownName, image: info?.image })}>
              ＋ Add to friends
            </button>
          ) : friend.source === 'you' ? (
            <button className="btn small ghost" onClick={() => void removeFriend(shownName)}>
              Remove friend
            </button>
          ) : null}
          {info?.url && (
            <a className="btn small ghost" href={info.url} target="_blank" rel="noreferrer">
              Last.fm ↗
            </a>
          )}
        </div>
      </section>

      <HistoryStatus name={shownName} history={history} />
      {(history.err || (err && info)) && <p className="error small">{history.err ?? err}</p>}

      {stats ? (
        <FullStats stats={stats} label={label} link={theirLink} />
      ) : quick ? (
        <QuickStats q={quick} note={near.exact ? PERIOD_LABEL[near.period] : `${PERIOD_LABEL[near.period]} (Last.fm’s nearest to ${label})`} link={theirLink} />
      ) : (
        <div className="center-screen">
          <span className="spinner big" />
        </div>
      )}
    </div>
  );
}

function HistoryStatus({ name, history }: { name: string; history: ReturnType<typeof useFriendHistory> }) {
  const { hist, running, stopped } = history;
  if (running)
    return (
      <div className="history-status">
        <span className="small">
          Loading all of {name}’s stats… {running.total ? `${fmtNum(running.done)} of ${fmtNum(running.total)} scrobbles` : ''}
        </span>
        <span className="progress">
          <span style={{ width: `${running.total ? (running.done / running.total) * 100 : 3}%` }} />
        </span>
        <button className="mini-btn" onClick={history.stop}>
          Stop
        </button>
      </div>
    );
  if (!hist)
    return (
      <div className="history-status">
        <span className="muted small">{stopped || history.err ? `Showing ${name}’s top lists only.` : `Getting ${name}’s history…`}</span>
        {(stopped || history.err) && (
          <button className="mini-btn" onClick={history.load}>
            Load all their stats
          </button>
        )}
      </div>
    );
  return (
    <div className="history-status">
      <span className="muted small">
        All {fmtNum(hist.plays)} scrobbles, as of {new Date(hist.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Deleted from this device a day after you last look.
      </span>
      <span className="row gap">
        <button className="mini-btn" onClick={history.update}>
          Update
        </button>
        <button className="mini-btn" onClick={() => void history.remove()}>
          Delete now
        </button>
      </span>
    </div>
  );
}

type LinkFor = (kind: EntityKind, name: string, artist: string) => string;

function itemsFromStats(stats: RangeStats, kind: EntityKind, n: number, link: LinkFor): LedgerItem[] {
  const lib = stats.lib;
  const rows = stats.ranking(kind).slice(0, n);
  const max = rows[0]?.count ?? 1;
  return rows.map((r, i) => {
    const name = kind === 'artist' ? lib.artists[r.idx].name : kind === 'album' ? lib.albums[r.idx].name : lib.tracks[r.idx].name;
    const artist = kind === 'artist' ? name : kind === 'album' ? lib.artists[lib.albums[r.idx].artist].name : lib.artists[lib.tracks[r.idx].artist].name;
    return { key: `${kind}${r.idx}`, rank: i + 1, kind, name, artist, meta: kind === 'artist' ? `${((r.count / Math.max(1, stats.total)) * 100).toFixed(1)}% of plays` : artist, value: r.count, frac: r.count / max, href: link(kind, name, artist) };
  });
}

function itemsFromTop(list: TopEntry[], kind: EntityKind, n: number, link: LinkFor): LedgerItem[] {
  const max = list[0]?.plays ?? 1;
  return list.slice(0, n).map((x, i) => {
    const artist = kind === 'artist' ? x.name : x.artist;
    return { key: `${kind}${i}`, rank: i + 1, kind, name: x.name, artist, meta: kind === 'artist' ? undefined : artist, value: x.plays, frac: x.plays / max, href: link(kind, x.name, artist) };
  });
}

function TopPanels({ items }: { items: (n: number) => Record<EntityKind, LedgerItem[]> }) {
  const [n, setN] = useState(10);
  const lists = items(n);
  const titles: Record<EntityKind, string> = { artist: 'Top artists', album: 'Top albums', track: 'Top songs' };
  return (
    <>
      <div className="grid3">
        {(['artist', 'album', 'track'] as EntityKind[]).map((k) => (
          <Panel key={k} title={titles[k]}>
            <Ledger compact items={lists[k]} />
          </Panel>
        ))}
      </div>
      {n < 50 && (
        <button className="more" onClick={() => setN(50)}>
          Show top 50
        </button>
      )}
    </>
  );
}

function FullStats({ stats, label, link }: { stats: RangeStats; label: string; link: LinkFor }) {
  if (!stats.total) return <p className="empty">No scrobbles in {label}.</p>;
  const tl = stats.timeline('auto');
  const streak = stats.longestStreak();
  const busiest = stats.busiestDay();
  const peak = stats.byHour().reduce((b, v, h, a) => (v > a[b] ? h : b), 0);
  const heatEnd = stats.lastDay;
  const heatStart = Math.max(stats.firstDay, heatEnd - 370);
  return (
    <>
      <div className="eyebrow friend-range">{label}</div>
      <div className="stats-row">
        <Kpi value={fmtNum(stats.total)} label="Scrobbles" />
        <Kpi value={fmtNum(stats.unique('artist'))} label="Artists" />
        <Kpi value={fmtNum(stats.unique('album'))} label="Albums" />
        <Kpi value={fmtNum(stats.unique('track'))} label="Songs" />
        <Kpi value={(stats.total / Math.max(1, stats.spanDays)).toFixed(1)} label="Per day" />
        <Kpi value={fmtNum(stats.activeDays)} label="Days with music" />
        <Kpi value={fmtNum(stats.discoveries('artist').length)} label="New artists" />
        <Kpi value={fmtHourPref(peak)} label="Favourite hour" />
      </div>
      <TopPanels items={(n) => ({ artist: itemsFromStats(stats, 'artist', n, link), album: itemsFromStats(stats, 'album', n, link), track: itemsFromStats(stats, 'track', n, link) })} />
      <Panel title="Over time">
        <BarChart height={160} data={tl.map((t, i) => ({ label: t.label, value: t.value, axis: i % Math.max(1, Math.ceil(tl.length / 8)) === 0 ? t.label : '' }))} />
      </Panel>
      <div className="grid2">
        <Panel title="Hour × weekday">
          <Punchcard matrix={stats.hourWeekday()} />
        </Panel>
        <Panel title="Records">
          <table className="table">
            <tbody>
              {busiest && (
                <tr>
                  <td className="t-muted">Biggest day</td>
                  <td>{fmtDay(busiest.day)}</td>
                  <td className="num">{fmtNum(busiest.count)}</td>
                </tr>
              )}
              {streak && (
                <tr>
                  <td className="t-muted">Longest streak</td>
                  <td>
                    {fmtDay(streak.start, { month: 'short', day: 'numeric' })} – {fmtDay(streak.end, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="num">{fmtNum(streak.days)} days</td>
                </tr>
              )}
              <tr>
                <td className="t-muted">Plays per day with music</td>
                <td />
                <td className="num">{(stats.total / Math.max(1, stats.activeDays)).toFixed(1)}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>
      <Panel title="Every day">
        <CalendarHeatmap counts={stats.dayCounts()} startDay={heatStart} endDay={heatEnd} />
      </Panel>
    </>
  );
}

function QuickStats({ q, note, link }: { q: QuickLists; note: string; link: LinkFor }) {
  const plays = q.artists.reduce((n, a) => n + a.plays, 0);
  return (
    <>
      <div className="eyebrow friend-range">{note} · from their Last.fm top lists</div>
      <div className="stats-row">
        <Kpi value={fmtNum(plays)} label="Scrobbles" />
        <Kpi value={fmtNum(q.artists.length)} label="Artists" sub={q.artists.length >= 1000 ? 'top 1,000' : undefined} />
        <Kpi value={fmtNum(q.albums.length)} label="Albums" sub={q.albums.length >= 1000 ? 'top 1,000' : undefined} />
        <Kpi value={fmtNum(q.tracks.length)} label="Songs" sub={q.tracks.length >= 1000 ? 'top 1,000' : undefined} />
      </div>
      <TopPanels items={(n) => ({ artist: itemsFromTop(q.artists, 'artist', n, link), album: itemsFromTop(q.albums, 'album', n, link), track: itemsFromTop(q.tracks, 'track', n, link) })} />
    </>
  );
}

/* ------------------------------------------------------------------ #/friend/<who>/artist|album|song/…: their pages */

/**
 * One of their artists, albums or songs, shown with the same page as yours but from their history
 * (as if it were their account). Links on the page stay in their account; your own settings, Clean
 * up notes and friends' plays are left off.
 */
export function FriendEntity(props: { who: string; kind: EntityKind; artist: string; title: string }) {
  const me = useApp((s) => s.username);
  // your own name: your own page
  if (props.who.toLowerCase() === me.toLowerCase()) return <EntityView kind={props.kind} title={props.title} artist={props.artist} />;
  return <TheirEntity {...props} />;
}

function TheirEntity({ who, kind, artist, title }: { who: string; kind: EntityKind; artist: string; title: string }) {
  const { lib, running, err } = useFriendHistory(who, true);

  // links to artist / album / song pages stay in their account
  const stayInTheirs = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element | null)?.closest?.('a[href^="#/"]');
    if (!a) return;
    const r = parseRoute(a.getAttribute('href') ?? '');
    if (r.name !== 'entity') return;
    e.preventDefault();
    navigate({ name: 'friendEntity', who, kind: r.kind, artist: r.artist, title: r.title });
  };

  return (
    <>
      <div className="friend-scope">
        <a href={routePath({ name: 'friend', who })}>
          ← <b>{who}</b>’s stats
        </a>
        <span className="muted small">their history, not yours</span>
      </div>
      {err ? (
        <p className="empty">{err}</p>
      ) : !lib ? (
        <div className="center-screen">
          <span className="spinner big" />
          <p className="muted small">{running?.total ? `Loading ${who}’s history… ${fmtNum(running.done)} of ${fmtNum(running.total)}` : `Loading ${who}’s history…`}</p>
        </div>
      ) : (
        <LibScope.Provider value={{ lib, who }}>
          <div onClickCapture={stayInTheirs}>
            <EntityView kind={kind} title={title} artist={artist} />
          </div>
        </LibScope.Provider>
      )}
    </>
  );
}
