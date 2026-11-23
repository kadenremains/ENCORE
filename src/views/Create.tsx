import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { db } from '../lib/db';
import { newProject, uid, TEMPLATES, THEMES, FORMATS, type Project } from '../editor/model';
import { SlideCanvas, backgroundCss } from '../render/SlideCanvas';
import { navigate } from '../router';
import { useRangeStats } from './stats/useRangeStats';
import { localChanged, markDeleted } from '../lib/changes';
import { isRejected, lastPushedAt, startSignIn, useCloud } from '../lib/cloud';

export function Create() {
  const exploreRange = useApp((s) => s.exploreRange);
  const lib = useApp((s) => s.lib)!;
  const username = useApp((s) => s.user?.name ?? s.username);
  const { label } = useRangeStats();
  const [projects, setProjects] = useState<Project[]>([]);
  const cloud = useCloud();
  // re-read on every render; useCloud() re-renders this after each sync
  const pushedAt = lastPushedAt();

  useEffect(() => {
    const load = () => db.projects.orderBy('updated').reverse().toArray().then(setProjects);
    load();
    window.addEventListener('sw:remote-change', load);
    return () => window.removeEventListener('sw:remote-change', load);
  }, []);

  const create = async (templateId: string) => {
    const p = newProject(templateId, exploreRange);
    await db.projects.put(p);
    localChanged();
    navigate({ name: 'edit', id: p.id });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Shareable graphics · starts with {label}</div>
          <h1 className="page-title">Create</h1>
        </div>
      </div>

      <section className="block">
        <div className="block-head">
          <h2>Start from a template</h2>
          <span className="muted small">Every block, size, stat and picture is editable afterwards.</span>
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

      <section className="block">
        <div className="block-head">
          <h2>Your wrappeds</h2>
          <span className="muted small">{projects.length ? `${projects.length} saved in this browser` : ''}</span>
        </div>
        {!projects.length && <p className="empty">Nothing yet. Pick a template above.</p>}
        <div className="projects">
          {projects.map((p) => {
            const w = 150;
            const scale = w / p.format.w;
            return (
              <div key={p.id} className="project-card">
                <a className="project-thumb" href={`#/edit/${p.id}`} style={{ width: w, height: p.format.h * scale }}>
                  <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
                    <SlideCanvas lib={lib} project={p} slide={p.slides[0]} username={username} />
                  </div>
                </a>
                <div className="project-name">{p.name}</div>
                {cloud.token ? (
                  isRejected('project', p.id) ? (
                    <div className="sync-badge pending" title={cloud.error ?? ''}>⚠ couldn't sync, retrying</div>
                  ) : p.updated > pushedAt ? (
                    <div className="sync-badge pending">{cloud.status === 'syncing' ? '↻ uploading…' : '● not uploaded yet'}</div>
                  ) : (
                    <div className="sync-badge ok">✓ synced</div>
                  )
                ) : (
                  cloud.available?.signIn && (
                    <button className="sync-badge local" onClick={startSignIn} title="Sign in to back this up and see it on your other devices">
                      ○ only on this device
                    </button>
                  )
                )}
                <div className="muted small">
                  {p.slides.length} slide{p.slides.length > 1 ? 's' : ''} · {new Date(p.updated).toLocaleDateString()}
                </div>
                <div className="row tight">
                  <button
                    className="mini-btn"
                    onClick={async () => {
                      const copy = { ...structuredClone(p), id: uid(), name: `${p.name} copy`, updated: Date.now(), created: Date.now() };
                      await db.projects.put(copy);
                      localChanged();
                      setProjects((ps) => [copy, ...ps]);
                    }}
                  >
                    Duplicate
                  </button>
                  <button
                    className="mini-btn danger"
                    onClick={async () => {
                      if (!confirm(`Delete “${p.name}”?`)) return;
                      await db.projects.delete(p.id);
                      markDeleted('project', p.id);
                      setProjects((ps) => ps.filter((x) => x.id !== p.id));
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
