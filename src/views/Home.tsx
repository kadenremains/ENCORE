import { Logo } from '../ui/Logo';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { db } from '../lib/db';
import { getStats } from '../lib/library';
import { rangeLabel, resolveRange } from '../lib/range';
import { newProject, TEMPLATES, THEMES, FORMATS, type Project } from '../editor/model';
import { RangePicker } from '../ui/controls';
import { EntityImg, fmtNum } from '../render/primitives';
import { SlideCanvas, backgroundCss } from '../render/SlideCanvas';
import { statValue } from '../render/blocks';
import type { EntityKind } from '../lib/types';
import { ImageEditor, type EntityRef } from '../ui/ImageEditor';
import { SyncPill } from './SyncPill';

export function Home() {
  const { lib, user, username, exploreRange, setExploreRange, openProject, setView, demo, disconnect } = useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<EntityKind>('artist');
  const [count, setCount] = useState(25);
  const [style, setStyle] = useState<'ledger' | 'grid'>('ledger');
  const [editing, setEditing] = useState<EntityRef | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    db.projects.orderBy('updated').reverse().toArray().then(setProjects);
  }, []);

  const range = useMemo(() => resolveRange(exploreRange), [exploreRange]);
  const stats = useMemo(() => (lib ? getStats(lib, range) : null), [lib, range]);
  if (!lib || !stats) return null;
  const label = rangeLabel(exploreRange, range, lib.n ? lib.ts[0] : undefined);
  const top = stats.top(tab, count);

  const create = async (templateId: string) => {
    const p = newProject(templateId, exploreRange);
    await db.projects.put(p);
    openProject(p.id);
  };

  const sv = (id: Parameters<typeof statValue>[1]) => statValue(stats, id, 3.5);
  const hours = stats.byHour();
  const maxH = Math.max(1, ...hours);
  const tl = stats.timeline('auto');
  const maxT = Math.max(1, ...tl.map((t) => t.value));

  return (
    <div className="home">
      <header className="home-header">
        <div className="brand">
          <Logo /> Encore
        </div>
        <div className="row gap">
          <SyncPill />
          <div className="user-menu">
            <button className="user-btn" onClick={() => setMenu(!menu)}>
              {user?.image ? <img src={user.image} alt="" /> : <span className="avatar">{(user?.name ?? username ?? '?')[0]?.toUpperCase()}</span>}
              <span>{demo ? 'Demo data' : (user?.name ?? username)}</span>
            </button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <button onClick={() => setView('images')}>Manage images</button>
                {demo && <button onClick={() => disconnect()}>Connect my Last.fm</button>}
                {!demo && (
                  <button
                    onClick={() => {
                      if (confirm('Disconnect and delete the downloaded history from this browser? (Your wrappeds and images stay.)')) disconnect();
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {demo && (
        <div className="demo-banner">
          You're looking at <b>demo data</b>.{' '}
          <button className="link" onClick={() => disconnect()}>
            Connect your Last.fm →
          </button>
        </div>
      )}

      <section className="hero grain">
        {stats.top('album', 1)[0] && (
          <div className="hero-art" aria-hidden>
            <EntityImg kind="album" name={stats.top('album', 1)[0].name} artist={stats.top('album', 1)[0].artist} />
          </div>
        )}
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner br" />
        <span className="corner bl" />
        <div className="hero-top">
          <div>
            <div className="eyebrow">Your listening</div>
            <h1>{label}</h1>
          </div>
          <RangePicker value={exploreRange} onChange={setExploreRange} />
        </div>
        <div className="kpis">
          <Kpi value={fmtNum(stats.total)} label="scrobbles" big />
          <Kpi value={sv('minutes').value} label="minutes (est.)" />
          <Kpi value={fmtNum(stats.unique('artist'))} label="artists" />
          <Kpi value={fmtNum(stats.unique('album'))} label="albums" />
          <Kpi value={fmtNum(stats.unique('track'))} label="songs" />
          <Kpi value={sv('streak').value} label="day streak" sub={sv('streak').sub} />
          <Kpi value={sv('busiestDay').value} label="biggest day" sub={sv('busiestDay').sub.replace('plays on ', '')} />
          <Kpi value={fmtNum(stats.discoveries('artist').length)} label="new artists" />
        </div>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Make a wrapped</h2>
          <span className="muted">Starts with {label}. Change anything later.</span>
        </div>
        <div className="templates">
          {TEMPLATES.map((t) => {
            const theme = THEMES.find((x) => x.name === t.theme)!;
            const f = FORMATS.find((x) => x.id === t.format)!;
            return (
              <button key={t.id} className="template" onClick={() => create(t.id)}>
                <span className="template-art" style={{ background: backgroundCss(theme), color: theme.text }}>
                  <span className="template-frame" style={{ aspectRatio: `${f.w} / ${f.h}`, borderColor: theme.text }} />
                </span>
                <span className="template-name">{t.name}</span>
                <span className="template-desc">{t.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      {projects.length > 0 && (
        <section className="block">
          <div className="block-head">
            <h2>Your wrappeds</h2>
          </div>
          <div className="projects">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                p={p}
                onOpen={() => openProject(p.id)}
                onDelete={async () => {
                  if (!confirm(`Delete “${p.name}”?`)) return;
                  await db.projects.delete(p.id);
                  setProjects((ps) => ps.filter((x) => x.id !== p.id));
                }}
                onDuplicate={async () => {
                  const copy = { ...structuredClone(p), id: Math.random().toString(36).slice(2, 10), name: `${p.name} copy`, updated: Date.now(), created: Date.now() };
                  await db.projects.put(copy);
                  setProjects((ps) => [copy, ...ps]);
                }}
              />
            ))}
          </div>
        </section>
      )}

      <section className="block">
        <div className="block-head">
          <h2>Top of {label}</h2>
          <div className="row gap">
            <div className="segmented">
              {(['artist', 'album', 'track'] as const).map((k) => (
                <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                  {k === 'artist' ? 'Artists' : k === 'album' ? 'Albums' : 'Songs'}
                </button>
              ))}
            </div>
            <div className="segmented">
              <button className={style === 'ledger' ? 'on' : ''} onClick={() => setStyle('ledger')}>
                List
              </button>
              <button className={style === 'grid' ? 'on' : ''} onClick={() => setStyle('grid')}>
                Grid
              </button>
            </div>
            <select className="select" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        {top.length === 0 ? (
          <p className="muted">Nothing scrobbled in this range.</p>
        ) : style === 'ledger' ? (
          <ol className="ledger">
            {top.map((it) => (
              <li key={it.idx}>
                <button className="ledger-row" title="Change image" onClick={() => setEditing({ kind: it.kind, name: it.name, artist: it.artist })}>
                  <span className="ledger-rk">{it.rank}</span>
                  <EntityImg kind={it.kind} name={it.name} artist={it.artist} size={46} shape="square" />
                  <span style={{ minWidth: 0 }}>
                    <span className="ledger-ttl" style={{ display: 'block' }}>
                      {it.name}
                    </span>
                    <span className="ledger-meta" style={{ display: 'block' }}>
                      {it.kind !== 'artist' ? `${it.artist} · ` : ''}
                      {((it.count / stats.total) * 100).toFixed(1)}% of plays
                    </span>
                  </span>
                  <span className="ledger-sc">
                    {fmtNum(it.count)}
                    <small>plays</small>
                  </span>
                  <span className="ledger-bar" style={{ width: `calc((100% - 92px) * ${(it.count / top[0].count).toFixed(4)})` }} />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="top-grid">
            {top.map((it) => (
              <div key={it.idx} className="top-card">
                <button className="top-img" title="Change image" onClick={() => setEditing({ kind: it.kind, name: it.name, artist: it.artist })}>
                  <EntityImg kind={it.kind} name={it.name} artist={it.artist} shape="square" />
                  <span className="top-rank">{it.rank}</span>
                  <span className="top-edit">✎</span>
                </button>
                <div className="top-name" title={it.name}>
                  {it.name}
                </div>
                <div className="top-sub">
                  {it.kind !== 'artist' ? `${it.artist} · ` : ''}
                  {fmtNum(it.count)} plays
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="block two-col">
        <div className="card">
          <h3>Over time</h3>
          <div className="mini-bars">
            {tl.map((t, i) => (
              <div key={i} className="mini-bar" title={`${t.label}: ${fmtNum(t.value)}`}>
                <span style={{ height: `${(t.value / maxT) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mini-axis">
            <span>{tl[0]?.label}</span>
            <span>{tl[tl.length - 1]?.label}</span>
          </div>
        </div>
        <div className="card">
          <h3>Hour of day</h3>
          <div className="mini-bars hours">
            {hours.map((v, i) => (
              <div key={i} className="mini-bar" title={`${i}:00 · ${fmtNum(v)}`}>
                <span style={{ height: `${(v / maxH) * 100}%`, opacity: i === stats.peakHour() ? 1 : 0.55 }} />
              </div>
            ))}
          </div>
          <div className="mini-axis">
            <span>12 AM</span>
            <span>6 AM</span>
            <span>12 PM</span>
            <span>6 PM</span>
            <span>11 PM</span>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Your #1, month by month</h2>
        </div>
        <div className="months-strip">
          {stats.topPerMonth('artist').map((m) =>
            m.item ? (
              <div key={m.month.getTime()} className="month-card">
                <EntityImg kind="artist" name={m.item.name} artist={m.item.artist} shape="square" />
                <div className="month-label">{m.month.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}</div>
                <div className="top-name">{m.item.name}</div>
                <div className="top-sub">{fmtNum(m.count)} plays</div>
              </div>
            ) : null,
          )}
        </div>
      </section>

      <footer className="home-footer muted small">
        {fmtNum(lib.n)} scrobbles stored in this browser · history and images never leave your device
      </footer>
      {editing && <ImageEditor entity={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Kpi({ value, label, sub, big }: { value: string; label: string; sub?: string; big?: boolean }) {
  return (
    <div className={`kpi ${big ? 'big' : ''}`}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function ProjectCard({ p, onOpen, onDelete, onDuplicate }: { p: Project; onOpen: () => void; onDelete: () => void; onDuplicate: () => void }) {
  const lib = useApp((s) => s.lib)!;
  const username = useApp((s) => s.user?.name ?? s.username);
  const w = 150;
  const scale = w / p.format.w;
  return (
    <div className="project-card">
      <button className="project-thumb" onClick={onOpen} style={{ width: w, height: p.format.h * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
          <SlideCanvas lib={lib} project={p} slide={p.slides[0]} username={username} />
        </div>
      </button>
      <div className="project-name">{p.name}</div>
      <div className="muted small">
        {p.slides.length} slide{p.slides.length > 1 ? 's' : ''} · {new Date(p.updated).toLocaleDateString()}
      </div>
      <div className="row tight">
        <button className="mini-btn" onClick={onOpen}>
          Open
        </button>
        <button className="mini-btn" onClick={onDuplicate}>
          Duplicate
        </button>
        <button className="mini-btn danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
