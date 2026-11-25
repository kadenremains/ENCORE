import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../store';
import { routePath, type Route } from '../router';
import { Logo } from '../ui/Logo';
import { RangePicker } from '../ui/controls';
import { SyncPill } from './SyncPill';
import { useRangeStats } from './stats/useRangeStats';
import { dayToDate } from '../lib/library';
import type { CompareMode } from '../lib/range';
import { cancelSignIn, isHomeScreenApp, pollPending, syncNow, useCloud } from '../lib/cloud';

function ago(t: number | null) {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

const TABS: { label: string; short: string; route: Route; match: (r: Route) => boolean; icon: string }[] = [
  { label: 'Overview', short: 'Overview', route: { name: 'overview' }, match: (r) => r.name === 'overview', icon: '◐' },
  { label: 'Artists', short: 'Charts', route: { name: 'top', kind: 'artist' }, match: (r) => (r.name === 'top' || r.name === 'entity') && r.kind === 'artist', icon: '≡' },
  { label: 'Albums', short: 'Albums', route: { name: 'top', kind: 'album' }, match: (r) => (r.name === 'top' || r.name === 'entity') && r.kind === 'album', icon: '▣' },
  { label: 'Songs', short: 'Songs', route: { name: 'top', kind: 'track' }, match: (r) => (r.name === 'top' || r.name === 'entity') && r.kind === 'track', icon: '♪' },
  { label: 'History', short: 'History', route: { name: 'history', view: 'scrobbles' }, match: (r) => r.name === 'history', icon: '▤' },
  { label: 'Records', short: 'Records', route: { name: 'records' }, match: (r) => r.name === 'records', icon: '★' },
  { label: 'Create', short: 'Create', route: { name: 'create' }, match: (r) => r.name === 'create', icon: '✦' },
];

const MOBILE_TABS = [0, 1, 4, 5, 6];

export function Shell({ route, children, showRange = true }: { route: Route; children: ReactNode; showRange?: boolean }) {
  const { user, username, demo, disconnect, exploreRange, setExploreRange, compare, setCompare } = useApp();
  const { label, stats } = useRangeStats();
  const gaps = stats.gaps();
  const gapDaysTotal = gaps.reduce((n, g) => n + g.end - g.start + 1, 0);
  // the menu remembers which page it was opened on, so changing page closes it
  const routeKey = JSON.stringify(route);
  const [menuOn, setMenuOn] = useState<string | null>(null);
  const menu = menuOn === routeKey;
  const setMenu = (open: boolean) => setMenuOn(open ? routeKey : null);
  const menuRef = useRef<HTMLDivElement>(null);
  // close the menu on a tap outside it, and when the page changes
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOn(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);
  const cloud = useCloud();
  const dot = cloud.token ? (cloud.status === 'syncing' || cloud.privacy === 'setup' ? 'busy' : cloud.status === 'error' || cloud.error || cloud.privacy === 'locked' ? 'err' : cloud.dirty ? 'dirty' : 'ok') : '';
  const [hideErr, setHideErr] = useState<string | null>(null);
  const isChartTab = (r: Route) => (r.name === 'top' || r.name === 'entity');

  return (
    <div className="shell">
      <header className="shell-head">
        <div className="shell-head-row">
          <a className="brand" href="#/">
            <Logo /> Encore
          </a>
          <div className="row gap">
            <SyncPill />
            <div className="user-menu" ref={menuRef}>
              <button className="user-btn" onClick={() => setMenu(!menu)}>
                {user?.image ? <img src={user.image} alt="" /> : <span className="avatar">{(user?.name ?? username ?? '?')[0]?.toUpperCase()}</span>}
                {dot && <span className={`cloud-dot ${dot}`} title={cloud.status === 'error' ? (cloud.error ?? 'Sync error') : 'Synced'} />}
                <span className="user-name">{demo ? 'Demo data' : (user?.name ?? username)}</span>
              </button>
              {menu && (
                <div className="menu" onMouseLeave={() => setMenu(false)} onClick={() => setMenu(false)}>
                  {cloud.token ? (
                    <div className="menu-section">
                      <span className={`cloud-dot ${dot}`} />
                      Syncing as <b>{cloud.user}</b>
                      <br />
                      {cloud.status === 'syncing' ? 'Syncing…' : cloud.status === 'error' ? cloud.error : cloud.dirty ? 'Changes waiting to upload…' : `All changes synced · ${ago(cloud.lastSync)}`}
                      {cloud.error && cloud.status !== 'error' && (
                        <>
                          <br />
                          {cloud.error}
                        </>
                      )}
                    </div>
                  ) : null}
                  {cloud.token && <button onClick={() => void syncNow()}>Sync now</button>}
                  {!demo && <button onClick={() => void useApp.getState().checkEdits(true)}>Check for Last.fm edits</button>}
                  {user?.url && !demo && (
                    <a href={user.url} target="_blank" rel="noreferrer">
                      Open Last.fm profile ↗
                    </a>
                  )}
                  {demo && <button onClick={() => disconnect()}>Connect my Last.fm</button>}
                  <a href={routePath({ name: 'settings', tab: 'account' })} className="menu-settings">
                    Settings
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <a key={t.label} href={routePath(t.route)} aria-current={t.match(route) ? 'page' : undefined} className={t.route.name === 'create' ? 'tab-create' : ''}>
              {t.label}
            </a>
          ))}
        </nav>
      </header>

      {cloud.waiting && !cloud.token && (
        <div className="demo-banner notice">
          <span className="cloud-dot busy" /> Approve Encore on Last.fm{isHomeScreenApp() ? ' in Safari' : ''}, then come back here. It signs in automatically.{' '}
          <button className="link" onClick={() => void pollPending()}>
            Check now
          </button>{' '}
          ·{' '}
          <button className="link" onClick={cancelSignIn}>
            Cancel
          </button>
        </div>
      )}
      {cloud.error && hideErr !== cloud.error && (
        <div className="demo-banner notice err">
          <span>{cloud.error}</span>{' '}
          <button className="link" onClick={() => void syncNow()}>
            Retry
          </button>{' '}
          ·{' '}
          <button className="link" onClick={() => setHideErr(cloud.error)}>
            Dismiss
          </button>
        </div>
      )}
      {demo && (
        <div className="demo-banner">
          You're looking at <b>demo data</b>.{' '}
          <button className="link" onClick={() => disconnect()}>
            Connect your Last.fm →
          </button>
        </div>
      )}

      {showRange && (
        <div className="rangebar">
          <div className="rangebar-label">
            <span className="eyebrow">Showing</span>
            <strong>{label}</strong>
            {gaps.length > 0 && (
              <a
                className="gap-note"
                href={routePath({ name: 'settings', tab: 'stats' })}
                title={gaps.map((g) => `${dayToDate(g.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${dayToDate(g.end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`).join('\n')}
              >
                skipping {gaps.length} break{gaps.length > 1 ? 's' : ''} · {gapDaysTotal} days
              </a>
            )}
          </div>
          <div className="rangebar-controls">
            <RangePicker value={exploreRange} onChange={setExploreRange} gaps={false} />
            <select className="select compare-select" value={compare} onChange={(e) => setCompare(e.target.value as CompareMode)} title="Compare against">
              <option value="previous">vs previous period</option>
              <option value="lastYear">vs same time last year</option>
              <option value="none">no comparison</option>
            </select>
          </div>
        </div>
      )}

      <main className="shell-main">{children}</main>

      <nav className="bottom-tabs">
        {MOBILE_TABS.map((i) => {
          const t = TABS[i];
          const on = i === 1 ? isChartTab(route) : t.match(route);
          return (
            <a key={t.label} href={routePath(t.route)} className={on ? 'on' : ''}>
              <span className="bt-icon">{t.icon}</span>
              <span>{t.short}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
