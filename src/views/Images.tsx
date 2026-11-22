import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { getStats } from '../lib/library';
import { resolveRange, rangeLabel } from '../lib/range';
import { allOverrides, useImagesVersion } from '../lib/images';
import { entityKey } from '../lib/db';
import type { EntityKind } from '../lib/types';
import { EntityImg, fmtNum } from '../render/primitives';
import { ImageEditor, type EntityRef } from '../ui/ImageEditor';
import { RangePicker } from '../ui/controls';

export function Images() {
  const { lib, setView, exploreRange, setExploreRange } = useApp();
  useImagesVersion();
  const [kind, setKind] = useState<EntityKind>('artist');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<EntityRef | null>(null);
  const range = useMemo(() => resolveRange(exploreRange), [exploreRange]);
  if (!lib) return null;
  const stats = getStats(lib, range);
  const custom = new Set(allOverrides().map((o) => o.key));

  let items: { kind: EntityKind; name: string; artist: string; count: number }[];
  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    const all = getStats(lib, { from: 0, to: Infinity });
    items = all
      .ranking(kind)
      .map((r, i) => all.item(kind, r, i + 1))
      .filter((it) => it.name.toLowerCase().includes(needle) || it.artist.toLowerCase().includes(needle))
      .slice(0, 120);
  } else items = stats.top(kind, 120);

  return (
    <div className="home images-view">
      <header className="home-header">
        <button className="btn ghost" onClick={() => setView('home')}>
          ← Home
        </button>
        <div className="brand">Images</div>
        <span />
      </header>
      <section className="block">
        <p className="muted">
          Pictures come from Last.fm, Apple Music and Deezer automatically. Upload your own for anything missing or wrong, and it's used in every wrapped. <b>{custom.size}</b> custom image{custom.size === 1 ? '' : 's'} so far.
        </p>
        <div className="row gap wrap images-controls">
          <div className="segmented">
            {(['artist', 'album', 'track'] as const).map((k) => (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {k === 'artist' ? 'Artists' : k === 'album' ? 'Albums' : 'Songs'}
              </button>
            ))}
          </div>
          <input className="text-input" placeholder="Search your whole library…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
          {!q && <RangePicker value={exploreRange} onChange={setExploreRange} />}
        </div>
        {!q && <h3 className="muted">Top {kind === 'track' ? 'songs' : `${kind}s`} · {rangeLabel(exploreRange, range, lib.ts[0])}</h3>}
        <div className="top-grid">
          {items.map((it) => {
            const isCustom = custom.has(entityKey(it.kind, it.name, it.artist));
            return (
              <div key={it.name + it.artist} className="top-card">
                <button className="top-img" onClick={() => setEditing(it)}>
                  <EntityImg kind={it.kind} name={it.name} artist={it.artist} shape="square" />
                  {isCustom && <span className="badge">custom</span>}
                  <span className="top-edit">✎</span>
                </button>
                <div className="top-name">{it.name}</div>
                <div className="top-sub">
                  {it.kind !== 'artist' ? `${it.artist} · ` : ''}
                  {fmtNum(it.count)} plays
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {editing && <ImageEditor entity={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
