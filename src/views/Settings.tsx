import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../store';
import { routePath, type SettingsTab } from '../router';
import { Segmented, Slider, Toggle } from '../ui/controls';
import { Logo } from '../ui/Logo';
import { fmtNum } from '../render/primitives';
import { dayToDate } from '../lib/library';
import { GAP_OPTIONS, type CompareMode } from '../lib/range';
import { useRangeStats } from './stats/useRangeStats';
import { DEFAULT_PREFS, resetPrefs, setPrefs, usePrefs, type Prefs } from '../lib/prefs';
import { STEP_OPTIONS, loadMilestonePrefs, saveMilestonePrefs } from '../lib/milestonePrefs';
import { cancelSignIn, forceFullSync, pollPending, signOut, startSignIn, syncNow, useCloud } from '../lib/cloud';
import { allOverrides, bigAvatar, clearLookupCache, useImagesVersion } from '../lib/images';
import { db, getMeta } from '../lib/db';
import { makeBackup, restoreBackup } from '../lib/backup';
import { deliverFiles } from '../lib/export';
import { buildId, checkForUpdate } from '../lib/updates';
import { API_URL } from '../config';
import { SinglesSettings } from './stats/Singles';
import { ImagesManager } from './ImagesManager';
import { MyPictureControls } from '../ui/MyPicture';

const TABS: { id: SettingsTab; label: string; icon: string; desc: string }[] = [
  { id: 'account', label: 'Account & sync', icon: '◉', desc: 'Last.fm, devices, API key' },
  { id: 'stats', label: 'Stats', icon: '≡', desc: 'Breaks, comparisons, clock' },
  { id: 'albums', label: 'Albums & singles', icon: '▣', desc: 'One-song releases, album artists' },
  { id: 'images', label: 'Images', icon: '◩', desc: 'Artwork and your pictures' },
  { id: 'appearance', label: 'Appearance', icon: '◐', desc: 'Palette, accent, text size' },
  { id: 'data', label: 'Data & storage', icon: '⛁', desc: 'Backups, history, caches' },
  { id: 'about', label: 'About', icon: 'ⓘ', desc: 'Version, sources, shortcuts' },
];

export function Settings({ tab }: { tab: SettingsTab }) {
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  return (
    <div className="page settings">
      <div className="page-head">
        <div>
          <div className="eyebrow">{current.desc}</div>
          <h1 className="page-title">Settings</h1>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {TABS.map((t) => (
            <a key={t.id} href={routePath({ name: 'settings', tab: t.id })} aria-current={t.id === current.id ? 'page' : undefined}>
              <span className="settings-nav-icon" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </a>
          ))}
        </nav>
        <div className="settings-body">
          {current.id === 'account' && <AccountTab />}
          {current.id === 'stats' && <StatsTab />}
          {current.id === 'albums' && <AlbumsTab />}
          {current.id === 'images' && <ImagesTab />}
          {current.id === 'appearance' && <AppearanceTab />}
          {current.id === 'data' && <DataTab />}
          {current.id === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ building blocks */

function Group({ title, desc, right, children }: { title: string; desc?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel-box settings-group">
      <div className="panel-box-head">
        <h3>{title}</h3>
        {right && <div className="panel-box-right">{right}</div>}
      </div>
      {desc && <p className="muted small settings-desc">{desc}</p>}
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        {hint && <div className="setting-hint">{hint}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

/** A button that shows "working…" and then a short result while it runs an async job. */
function ActionButton({ children, run, danger, confirmText }: { children: ReactNode; run: () => Promise<string | void>; danger?: boolean; confirmText?: string }) {
  const [state, setState] = useState<{ busy: boolean; msg?: string; err?: boolean }>({ busy: false });
  return (
    <span className="action-btn">
      <button
        className={`btn ${danger ? 'danger' : ''}`}
        disabled={state.busy}
        onClick={async () => {
          if (confirmText && !confirm(confirmText)) return;
          setState({ busy: true });
          try {
            const msg = await run();
            setState({ busy: false, msg: msg || 'Done' });
          } catch (e) {
            setState({ busy: false, msg: (e as Error).message, err: true });
          }
        }}
      >
        {state.busy ? 'Working…' : children}
      </button>
      {state.msg && <span className={`small ${state.err ? 'error' : 'muted'}`}>{state.msg}</span>}
    </span>
  );
}

function ago(t: number | null | undefined) {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ------------------------------------------------------------------ account */

function AccountTab() {
  const { user, username, demo, apiKey, lib, disconnect, setApiKey } = useApp();
  const cloud = useCloud();
  const [key, setKey] = useState('');
  const [keyMsg, setKeyMsg] = useState<{ text: string; err?: boolean } | null>(null);

  if (demo)
    return (
      <Group title="Last.fm account" desc="You're looking at demo data. Connect your Last.fm to see your own stats and make wrappeds from them.">
        <button className="btn primary" onClick={() => void disconnect()}>
          Connect my Last.fm
        </button>
      </Group>
    );

  return (
    <>
      <Group title="Last.fm account">
        <div className="profile-card">
          {user?.image ? <img src={bigAvatar(user.image)} alt="" /> : <span className="avatar big">{(user?.name ?? username ?? '?')[0]?.toUpperCase()}</span>}
          <div>
            <div className="profile-name">{user?.name ?? username}</div>
            {user?.realname && <div className="muted small">{user.realname}</div>}
            <div className="muted small">
              {user?.registered ? `Scrobbling since ${new Date(user.registered * 1000).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : ''}
              {user?.playcount ? ` · ${fmtNum(user.playcount)} scrobbles on Last.fm` : ''}
            </div>
            <div className="muted small">{fmtNum(lib?.n ?? 0)} downloaded to this device</div>
          </div>
        </div>
        {user?.url && (
          <a className="btn" href={user.url} target="_blank" rel="noreferrer">
            Open Last.fm profile ↗
          </a>
        )}
      </Group>

      <Group
        title="Sync across devices"
        desc="Signing in with Last.fm backs up your wrappeds, custom pictures and settings, and keeps your phone and computer in step. Your scrobbles always come straight from Last.fm."
        right={cloud.token ? <span className="muted small">{cloud.status === 'syncing' ? 'syncing…' : `synced ${ago(cloud.lastSync)}`}</span> : undefined}
      >
        {cloud.token ? (
          <>
            <p className="sync-status">
              <span className={`cloud-dot ${cloud.status === 'error' || cloud.error ? 'err' : cloud.dirty ? 'dirty' : 'ok'}`} /> Syncing as <b>{cloud.user}</b>
              {cloud.error && <span className="error small"> · {cloud.error}</span>}
            </p>
            <Row label="Sync now" hint="Sync also runs by itself every minute and when you leave the app.">
              <ActionButton run={async () => void (await syncNow())}>Sync now</ActionButton>
            </Row>
            <Row label="Upload everything again" hint="Re-sends every wrapped and picture on this device. Use it if something is missing on another device.">
              <ActionButton run={async () => void (await forceFullSync())}>Upload everything</ActionButton>
            </Row>
            <Row label="Turn off sync on this device" hint="Nothing is deleted. Your wrappeds stay here and on your account.">
              <button className="btn" onClick={() => void signOut()}>
                Turn off sync
              </button>
            </Row>
          </>
        ) : cloud.waiting ? (
          <div className="waiting-box">
            <span className="cloud-dot busy" /> Approve Encore on Last.fm, then come back here. It signs in by itself.
            <div className="row gap" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={() => void pollPending()}>
                I approved it
              </button>
              <button className="btn" onClick={cancelSignIn}>
                Cancel
              </button>
            </div>
          </div>
        ) : cloud.available?.signIn ? (
          <button className="btn primary" onClick={startSignIn}>
            Sign in with Last.fm
          </button>
        ) : (
          <p className="muted small">Sync isn't available right now.</p>
        )}
      </Group>

      <Group
        title="Last.fm connection"
        desc={
          apiKey
            ? `Using your own API key (…${apiKey.slice(-4)}). Requests go straight to Last.fm.`
            : API_URL
              ? "Requests go through Encore's server, which adds its key. No key needed. You can use your own key instead, e.g. if Last.fm is rate-limiting the shared one."
              : 'An API key is needed to talk to Last.fm.'
        }
      >
        <form
          className="row gap wrap"
          onSubmit={async (e) => {
            e.preventDefault();
            setKeyMsg(null);
            try {
              await setApiKey(key);
              setKey('');
              setKeyMsg({ text: 'Saved. Your key works.' });
            } catch (err) {
              setKeyMsg({ text: (err as Error).message, err: true });
            }
          }}
        >
          <input className="text-input mono key-input" placeholder="32-character API key" value={key} onChange={(e) => setKey(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <button className="btn" disabled={!key.trim()}>
            {apiKey ? 'Replace key' : 'Use my key'}
          </button>
          {apiKey && API_URL && (
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await setApiKey('');
                setKeyMsg({ text: "Back to Encore's server." });
              }}
            >
              Remove my key
            </button>
          )}
        </form>
        {keyMsg && <p className={`small ${keyMsg.err ? 'error' : 'muted'}`}>{keyMsg.text}</p>}
        <p className="muted small">
          Get one free at{' '}
          <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer">
            last.fm/api/account/create
          </a>{' '}
          (any app name, leave the callback blank).
        </p>
      </Group>

      <Group title="Disconnect" desc="Deletes the downloaded listening history from this browser and goes back to the start screen. Your wrappeds, pictures and settings stay (and stay on your account if sync is on).">
        <button className="btn danger" onClick={() => confirm('Disconnect and delete the downloaded history from this browser?') && void disconnect()}>
          Disconnect {user?.name ?? username}
        </button>
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ stats */

function StatsTab() {
  const { exploreRange, setExploreRange, compare, setCompare, demo, editCheck, checkEdits } = useApp();
  const { stats, label } = useRangeStats();
  const prefs = usePrefs();
  const [ms, setMs] = useState(loadMilestonePrefs);
  const gaps = stats.gaps();
  const gapDays = gaps.reduce((n, g) => n + g.end - g.start + 1, 0);
  const fmtGap = (d: number) => dayToDate(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <Group title="Breaks" desc="Long stretches with no scrobbles (a phone without scrobbling, a month away) drag down per-day averages and leave empty gaps in charts. Skipping them leaves them out of day counts, averages and timelines everywhere.">
        <Row label="Skip breaks" hint="Applies to every stats page.">
          <select
            className="select"
            value={exploreRange.gapDays ?? 0}
            onChange={(e) => {
              const n = Number(e.target.value);
              const next = { ...exploreRange };
              if (n) next.gapDays = n;
              else delete next.gapDays;
              setExploreRange(next);
            }}
          >
            {GAP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Row>
        {exploreRange.gapDays ? (
          gaps.length ? (
            <ul className="gap-list">
              <li className="muted small">
                In {label}: skipping {gaps.length} break{gaps.length > 1 ? 's' : ''}, {fmtNum(gapDays)} days
              </li>
              {gaps.slice(0, 8).map((g) => (
                <li key={g.start} className="small">
                  {fmtGap(g.start)} – {fmtGap(g.end)} <span className="muted">· {g.end - g.start + 1} days</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No breaks that long in {label}.</p>
          )
        ) : null}
      </Group>

      <Group title="Numbers">
        <Row label="Compare with" hint="The ▲▼ changes next to numbers and chart movement.">
          <select className="select" value={compare} onChange={(e) => setCompare(e.target.value as CompareMode)}>
            <option value="previous">The previous period</option>
            <option value="lastYear">The same time last year</option>
            <option value="none">Nothing (hide changes)</option>
          </select>
        </Row>
        <Row label="Clock" hint="Hours in charts and highlights.">
          <Segmented
            value={prefs.hour12 ? '12' : '24'}
            onChange={(v) => setPrefs({ hour12: v === '12' })}
            options={[
              { value: '12', label: '3p' },
              { value: '24', label: '15:00' },
            ]}
          />
        </Row>
        <Row label="Minutes per scrobble" hint="For “minutes listened” estimates: scrobbles × this. New wrappeds start with it too.">
          <Slider value={prefs.minutesPerScrobble} min={1} max={10} step={0.1} onChange={(v) => setPrefs({ minutesPerScrobble: v })} suffix="min" />
        </Row>
      </Group>

      <Group title="Pages">
        <Row label="Open the app on">
          <select className="select" value={prefs.startPage} onChange={(e) => setPrefs({ startPage: e.target.value as Prefs['startPage'] })}>
            <option value="overview">Overview</option>
            <option value="artists">Artists</option>
            <option value="albums">Albums</option>
            <option value="songs">Songs</option>
            <option value="listening">Listening</option>
            <option value="records">Records</option>
            <option value="create">Create</option>
          </select>
        </Row>
        <Row label="Chart length" hint="Rows on Artists, Albums and Songs before “Show more”.">
          <select className="select" value={prefs.listLength} onChange={(e) => setPrefs({ listLength: Number(e.target.value) })}>
            {[50, 100, 200, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Row>
      </Group>

      <Group title="Milestones" right={<a className="small" href={routePath({ name: 'records' })}>See them in Records →</a>}>
        <Row label="Count a milestone every">
          <div className="row gap">
            <select
              className="select"
              value={ms.step}
              onChange={(e) => {
                const next = { ...ms, step: e.target.value };
                setMs(next);
                saveMilestonePrefs(next);
              }}
            >
              {STEP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {ms.step === 'custom' && (
              <input
                className="text-input num-input"
                type="number"
                min={1}
                value={ms.custom}
                onChange={(e) => {
                  const next = { ...ms, custom: Math.max(1, Number(e.target.value) || 1) };
                  setMs(next);
                  saveMilestonePrefs(next);
                }}
              />
            )}
          </div>
        </Row>
      </Group>

      {!demo && (
        <Group title="Last.fm edits" desc="Scrobbles you fix or delete on Last.fm (Pro) are picked up here too.">
          <Row label="Check automatically" hint="The last two weeks on every sync, plus a couple of older months each time, so your whole history is covered every few days.">
            <Toggle value={prefs.autoEditCheck} onChange={(v) => setPrefs({ autoEditCheck: v })} label="" />
          </Row>
          <Row
            label="Check my whole history now"
            hint={editCheck?.manual ? (editCheck.running ? `Checking… ${editCheck.done}/${editCheck.total} months` : editCheck.changed ? `Edits applied in ${editCheck.changed} month${editCheck.changed > 1 ? 's' : ''}` : 'No edits found, all up to date') : 'A month at a time, newest first. Takes a minute or two.'}
          >
            <button className="btn" disabled={!!editCheck?.running} onClick={() => void checkEdits(true)}>
              {editCheck?.running ? 'Checking…' : 'Check now'}
            </button>
          </Row>
        </Group>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ albums */

function AlbumsTab() {
  const { demo, refreshAlbumGrouping, recheckSingles, lib } = useApp();
  const [groupedAt, setGroupedAt] = useState<number | null>(null);
  useEffect(() => {
    void getMeta<number>('albumArtistsAt').then((t) => setGroupedAt(t ?? null));
  }, [lib]);
  return (
    <>
      <Group title="Singles" right={lib ? <span className="muted small">{fmtNum(lib.singles.filter((x) => x.hidden).length)} treated as singles</span> : undefined}>
        <SinglesSettings />
      </Group>
      {!demo && (
        <Group
          title="Album artists"
          desc="Scrobbles only say who sings a song, but Last.fm files albums under the album artist (compilations, albums where every song features someone else). Encore asks Last.fm how it groups your albums so they're credited the same way."
        >
          <Row label="Refresh album grouping" hint={`Last refreshed ${ago(groupedAt)}. Runs by itself every few days and after edits.`}>
            <ActionButton
              run={async () => {
                await refreshAlbumGrouping();
                setGroupedAt(Date.now());
                return 'Albums regrouped';
              }}
            >
              Refresh now
            </ActionButton>
          </Row>
          <Row label="Ask Last.fm about singles again" hint="Forgets what Last.fm said about every one-song release and checks them all again in the background.">
            <ActionButton
              run={async () => {
                void recheckSingles();
                return 'Checking in the background…';
              }}
            >
              Re-check singles
            </ActionButton>
          </Row>
        </Group>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ images */

function ImagesTab() {
  const prefs = usePrefs();
  useImagesVersion();
  const custom = allOverrides().filter((o) => !o.key.startsWith('account:')).length;
  return (
    <>
      <Group title="Where pictures come from" desc="Covers come from Last.fm first. When Last.fm has none, Encore looks on Apple Music; artist photos come from Deezer. Anything you upload yourself always wins.">
        <Row label="Look up missing pictures online" hint="Off: only Last.fm art and your own uploads are used, and nothing else is downloaded.">
          <Toggle value={prefs.onlineArt} onChange={(v) => setPrefs({ onlineArt: v })} label="" />
        </Row>
        <Row label="Show pictures in lists" hint="Thumbnails next to every artist, album and song in charts.">
          <Toggle value={prefs.listImages} onChange={(v) => setPrefs({ listImages: v })} label="" />
        </Row>
        <Row label="Look everything up again" hint="Forgets looked-up pictures (not your uploads) so they're fetched fresh, e.g. after an artist changed their photo.">
          <ActionButton run={async () => void (await clearLookupCache())}>Refresh pictures</ActionButton>
        </Row>
      </Group>
      <Group title="My picture" desc="One picture for your account, used by any wrapped whose background is set to “My picture”.">
        <MyPictureControls />
      </Group>
      <Group title="Custom pictures" right={<span className="muted small">{fmtNum(custom)} uploaded</span>}>
        <ImagesManager />
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ appearance */

const PALETTES: { id: Prefs['palette']; name: string; desc: string; colors: [string, string, string] }[] = [
  { id: 'ink', name: 'Ink', desc: 'The original: silver on near-black', colors: ['#0a0a0c', '#18181c', '#e8ebf1'] },
  { id: 'oled', name: 'Black', desc: 'True black, for OLED screens', colors: ['#000000', '#101010', '#f2f2f2'] },
  { id: 'midnight', name: 'Midnight', desc: 'Deep blue-black', colors: ['#080b12', '#151b2a', '#e6ecf8'] },
  { id: 'sepia', name: 'Darkroom', desc: 'Warm, like old prints', colors: ['#100d0a', '#1e1914', '#efe6d8'] },
  { id: 'light', name: 'Paper', desc: 'Light, ink on paper', colors: ['#f3f2ef', '#ffffff', '#16171b'] },
];

const ACCENTS: { id: Prefs['accent']; name: string; color: string }[] = [
  { id: 'silver', name: 'Silver', color: '#c8cdd6' },
  { id: 'gold', name: 'Gold', color: '#e2c27a' },
  { id: 'rose', name: 'Rose', color: '#f0a3b5' },
  { id: 'ember', name: 'Ember', color: '#ff9a6b' },
  { id: 'mint', name: 'Mint', color: '#8fe0bf' },
  { id: 'ice', name: 'Ice', color: '#9cc8ff' },
  { id: 'violet', name: 'Violet', color: '#b9a3ff' },
];

function AppearanceTab() {
  const prefs = usePrefs();
  const changed = (['palette', 'accent', 'textSize', 'grain', 'motion'] as const).some((k) => prefs[k] !== DEFAULT_PREFS[k]);
  return (
    <>
      <Group title="Palette" desc="Changes the app only. Your wrappeds keep their own themes.">
        <div className="palette-grid">
          {PALETTES.map((p) => (
            <button key={p.id} className={`palette-card ${prefs.palette === p.id ? 'on' : ''}`} onClick={() => setPrefs({ palette: p.id })} style={{ background: p.colors[0], color: p.colors[2] }}>
              <span className="palette-swatch" style={{ background: p.colors[1], borderColor: `${p.colors[2]}33` }}>
                <i style={{ background: p.colors[2] }} />
                <i style={{ background: ACCENTS.find((a) => a.id === prefs.accent)?.color, width: '40%' }} />
              </span>
              <span className="palette-name">{p.name}</span>
              <span className="palette-desc">{p.desc}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Accent" desc="Links, highlights, chart bars and the little labels above titles.">
        <div className="accent-row">
          {ACCENTS.map((a) => (
            <button key={a.id} className={`accent-dot ${prefs.accent === a.id ? 'on' : ''}`} onClick={() => setPrefs({ accent: a.id })} title={a.name} aria-label={a.name}>
              <i style={{ background: a.color }} />
              <span>{a.name}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Display">
        <Row label="Text size" hint="Scales the stats pages.">
          <Segmented
            value={prefs.textSize}
            onChange={(v) => setPrefs({ textSize: v })}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'normal', label: 'Normal' },
              { value: 'large', label: 'Large' },
            ]}
          />
        </Row>
        <Row label="Film grain" hint="The subtle texture on cards and headers.">
          <Toggle value={prefs.grain} onChange={(v) => setPrefs({ grain: v })} label="" />
        </Row>
        <Row label="Animations" hint="Off: no transitions or motion (loading spinners still turn).">
          <Toggle value={prefs.motion} onChange={(v) => setPrefs({ motion: v })} label="" />
        </Row>
      </Group>
      {changed && (
        <button className="btn" onClick={() => resetPrefs(['palette', 'accent', 'textSize', 'grain', 'motion'])}>
          Back to the original look
        </button>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ data */

function DataTab() {
  const { lib, demo, user, username, checkEdits, redownloadHistory, editCheck } = useApp();
  const [counts, setCounts] = useState<{ projects: number; images: number; lookups: number; usage?: number; quota?: number } | null>(null);
  const [restoreSettings, setRestoreSettings] = useState(true);
  const [restoreMsg, setRestoreMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);
  useEffect(() => {
    let live = true;
    Promise.all([db.projects.count(), db.overrides.count(), db.imgcache.count(), navigator.storage?.estimate?.().catch(() => undefined)]).then(([projects, images, lookups, est]) => {
      if (live) setCounts({ projects, images, lookups, usage: est?.usage, quota: est?.quota });
    });
    return () => {
      live = false;
    };
  }, [lib, version]);
  const mb = (n?: number) => (n === undefined ? '—' : n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(0.1, n / 1e6).toFixed(1)} MB`);

  return (
    <>
      <Group title="On this device">
        <div className="data-stats">
          <div>
            <b>{fmtNum(lib?.n ?? 0)}</b>
            <span>scrobbles</span>
          </div>
          <div>
            <b>{fmtNum(counts?.projects ?? 0)}</b>
            <span>wrappeds</span>
          </div>
          <div>
            <b>{fmtNum(counts?.images ?? 0)}</b>
            <span>custom pictures</span>
          </div>
          <div>
            <b>{mb(counts?.usage)}</b>
            <span>storage used</span>
          </div>
        </div>
        <p className="muted small">Everything lives in this browser's storage. Your listening history is downloaded from Last.fm; wrappeds, pictures and settings are also kept on your account when sync is on.</p>
      </Group>

      <Group title="Backup" desc="A file with all your wrappeds, custom pictures and settings. Handy without sync, or before trying something risky. Your scrobbles aren't included; they can always be downloaded again.">
        <Row label="Download a backup">
          <ActionButton
            run={async () => {
              const f = await makeBackup(user?.name ?? username);
              const r = await deliverFiles([f]);
              return r === 'cancelled' ? 'Cancelled' : `Saved (${mb(f.size)})`;
            }}
          >
            Download backup
          </ActionButton>
        </Row>
        <Row label="Restore from a backup" hint="Adds anything missing or newer from the file. Nothing on this device is deleted.">
          <div className="row gap wrap">
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Choose file…
            </button>
            <Toggle value={restoreSettings} onChange={setRestoreSettings} label="Settings too" />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const r = await restoreBackup(f, { settings: restoreSettings });
                setRestoreMsg({ text: `Restored ${r.projects} wrapped${r.projects === 1 ? '' : 's'} and ${r.images} picture${r.images === 1 ? '' : 's'}${restoreSettings ? ', plus settings' : ''}.` });
                load();
              } catch (err) {
                setRestoreMsg({ text: (err as Error).message, err: true });
              }
            }}
          />
        </Row>
        {restoreMsg && <p className={`small ${restoreMsg.err ? 'error' : 'muted'}`}>{restoreMsg.text}</p>}
      </Group>

      {!demo && (
        <Group title="Listening history">
          <Row label="Check for Last.fm edits" hint={editCheck?.running ? `Checking… ${editCheck.done}/${editCheck.total} months` : 'Re-reads your whole history and applies any changes made on Last.fm.'}>
            <button className="btn" disabled={!!editCheck?.running} onClick={() => void checkEdits(true)}>
              {editCheck?.running ? 'Checking…' : 'Check now'}
            </button>
          </Row>
          <Row label="Download my history again" hint="Deletes the downloaded scrobbles and fetches them all from Last.fm again. Wrappeds and pictures aren't touched.">
            <ActionButton danger confirmText="Delete the downloaded history and download it all again? This can take a few minutes." run={async () => void (await redownloadHistory())}>
              Re-download
            </ActionButton>
          </Row>
        </Group>
      )}

      <Group title="Caches">
        <Row label="Looked-up pictures" hint={`${fmtNum(counts?.lookups ?? 0)} remembered. Clearing makes Encore look them up again.`}>
          <ActionButton
            run={async () => {
              await clearLookupCache();
              load();
            }}
          >
            Clear
          </ActionButton>
        </Row>
      </Group>
    </>
  );
}

/* ------------------------------------------------------------------ about */

function AboutTab() {
  const [upd, setUpd] = useState<string | null>(null);
  return (
    <>
      <Group title="Encore">
        <div className="about-head">
          <Logo />
          <div>
            <div className="profile-name">Encore</div>
            <div className="muted small">Your Last.fm stats, plus wrappeds for any time range.</div>
            <div className="muted small mono">Version {buildId()}</div>
          </div>
        </div>
        <Row label="Updates" hint="New versions load by themselves when you open the app.">
          <button
            className="btn"
            onClick={async () => {
              setUpd('Checking…');
              const r = await checkForUpdate();
              setUpd(r === 'latest' ? "You're on the latest version." : r === 'updating' ? 'Updating…' : r === 'offline' ? "Couldn't reach the server." : 'Development build.');
            }}
          >
            Check for updates
          </button>
          {upd && <span className="muted small">{upd}</span>}
        </Row>
      </Group>
      <Group title="Where things come from">
        <ul className="about-list small">
          <li>
            <b>Scrobbles, profile and album art:</b> Last.fm
          </li>
          <li>
            <b>Artist photos:</b> Deezer
          </li>
          <li>
            <b>Missing covers:</b> Apple Music
          </li>
          <li>
            <b>Every stat</b> is worked out on your device from your downloaded history; nothing about your listening is stored on Encore's server.
          </li>
        </ul>
      </Group>
      <Group title="Wrapped editor shortcuts">
        <ul className="about-list small shortcuts">
          <li>
            <kbd>⌘</kbd>
            <kbd>Z</kbd> undo · <kbd>⇧</kbd>
            <kbd>⌘</kbd>
            <kbd>Z</kbd> redo
          </li>
          <li>
            <kbd>⌘</kbd>
            <kbd>D</kbd> duplicate the selected block
          </li>
          <li>
            <kbd>Delete</kbd> remove it · <kbd>Esc</kbd> deselect
          </li>
          <li>
            <kbd>←</kbd>
            <kbd>→</kbd>
            <kbd>↑</kbd>
            <kbd>↓</kbd> nudge (hold <kbd>⇧</kbd> for bigger steps) · hold <kbd>Alt</kbd> while dragging to turn off snapping
          </li>
          <li>Double-tap text on the canvas to edit it</li>
        </ul>
      </Group>
      <Group title="Source">
        <p className="small">
          <a href="https://github.com/kadenremains/ENCORE" target="_blank" rel="noreferrer">
            github.com/kadenremains/ENCORE
          </a>
        </p>
      </Group>
    </>
  );
}
