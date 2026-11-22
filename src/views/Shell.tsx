import { useState, type ReactNode } from 'react';
import { useApp } from '../store';
import { routePath, type Route } from '../router';
import { Logo } from '../ui/Logo';
import { RangePicker } from '../ui/controls';
import { SyncPill } from './SyncPill';
import { useRangeStats } from './stats/useRangeStats';
import type { CompareMode } from '../lib/range';
import { signOut, startSignIn, syncNow, useCloud } from '../lib/cloud';

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
  { label: 'Listening', short: 'Listening', route: { name: 'listening' }, match: (r) => r.name === 'listening', icon: '▦' },
  { label: 'Records', short: 'Records', route: { name: 'records' }, match: (r) => r.name === 'records', icon: '★' },
  { label: 'Create', short: 'Create', route: { name: 'create' }, match: (r) => r.name === 'create', icon: '✦' },
];

const MOBILE_TABS = [0, 1, 4, 5, 6];

export function Shell({ route, children, showRange = true }: { route: Route; children: ReactNode; showRange?: boolean }) {
  const { user, username, demo, disconnect, exploreRange, setExploreRange, compare, setCompare } = useApp();
  const { label } = useRangeStats();
  const [menu, setMenu] = useState(false);
  const cloud = useCloud();
  const dot = cloud.token ? (cloud.status === 'syncing' ? 'busy' : cloud.status === 'error' ? 'err' : 'ok') : '';
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
            <div className="user-menu">
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
                      {cloud.status === 'syncing' ? 'Syncing…' : cloud.status === 'error' ? cloud.error : `Last synced ${ago(cloud.lastSync)}`}
                      {cloud.error && cloud.status !== 'error' && (
                        <>
                          <br />
                          {cloud.error}
                        </>
                      )}
                    </div>
                  ) : null}
                  {cloud.token ? (
                    <button onClick={() => void syncNow()}>Sync now</button>
                  ) : (
                    cloud.available?.signIn && <button onClick={startSignIn}>Sign in to sync devices</button>
                  )}
                  <a href="#/images">Manage images</a>
                  {user?.url && !demo && (
                    <a href={user.url} target="_blank" rel="noreferrer">
                      Open Last.fm profile ↗
                    </a>
                  )}
                  {demo ? (
                    <button onClick={() => disconnect()}>Connect my Last.fm</button>
                  ) : (
                    <>
                      {cloud.token && <button onClick={() => void signOut()}>Turn off sync on this device</button>}
                      <button
                        onClick={() => {
                          if (confirm('Disconnect and delete the downloaded history from this browser? (Your wrappeds and images stay.)')) disconnect();
                        }}
                      >
                        Disconnect
                      </button>
                    </>
                  )}
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
          </div>
          <div className="rangebar-controls">
            <RangePicker value={exploreRange} onChange={setExploreRange} />
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
