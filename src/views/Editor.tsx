import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { useEditor } from '../editor/editorStore';
import { Stage } from '../editor/Stage';
import { Inspector } from '../editor/Inspector';
import { BLOCK_LIBRARY, type Block, type BlockType } from '../editor/model';
import { SlideCanvas } from '../render/SlideCanvas';
import { db } from '../lib/db';
import { deliverFiles, renderNodeToBlob, slugify } from '../lib/export';
import { rangeLabel, resolveRange } from '../lib/range';
import { navigate } from '../router';

export function Editor({ id }: { id: string }) {
  const lib = useApp((s) => s.lib);
  const { project, load, close, undo, redo, past, future } = useEditor();
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [mobileTab, setMobileTab] = useState<'canvas' | 'add' | 'edit'>('canvas');
  const [exporting, setExporting] = useState(false);
  const selectedId = useEditor((s) => s.selectedId);

  useEffect(() => {
    if (!id) return;
    db.projects.get(id).then((p) => (p ? load(p) : navigate({ name: 'create' })));
  }, [id, load]);

  // on phones, jump to the edit tab when something is double-tapped
  useEffect(() => {
    const f = () => setMobileTab('edit');
    window.addEventListener('sw:focus-text', f);
    return () => window.removeEventListener('sw:focus-text', f);
  }, []);

  if (!project || !lib) return <div className="center-screen">Loading…</div>;
  const range = resolveRange(project.range);

  return (
    <div className={`editor mtab-${mobileTab}`}>
      <header className="topbar">
        <button
          className="btn ghost"
          onClick={() => {
            close();
            navigate({ name: 'create' });
          }}
        >
          ← Back
        </button>
        <div className="topbar-title">
          <strong>{project.name}</strong>
          <span className="muted">
            {rangeLabel(project.range, range, lib.n ? lib.ts[0] : undefined)} · {project.format.w}×{project.format.h}
          </span>
        </div>
        <div className="row tight">
          <button className="icon-btn" disabled={!past.length} onClick={undo} title="Undo (⌘Z)">
            ↶
          </button>
          <button className="icon-btn" disabled={!future.length} onClick={redo} title="Redo (⇧⌘Z)">
            ↷
          </button>
          <select className="select zoom" value={String(zoom)} onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}>
            <option value="fit">Fit</option>
            <option value="0.25">25%</option>
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1">100%</option>
          </select>
          <button className="btn primary" onClick={() => setExporting(true)}>
            Export
          </button>
        </div>
      </header>

      <aside className="left-panel">
        <AddBlocks onAdd={() => setMobileTab('edit')} />
        <Slides />
        <Layers />
      </aside>

      <main className="center-panel">
        <Stage zoom={zoom} />
      </main>

      <aside className="right-panel">
        <Inspector />
      </aside>

      <nav className="mobile-tabs">
        <button className={mobileTab === 'add' ? 'on' : ''} onClick={() => setMobileTab('add')}>
          ＋ Add & slides
        </button>
        <button className={mobileTab === 'canvas' ? 'on' : ''} onClick={() => setMobileTab('canvas')}>
          ▣ Canvas
        </button>
        <button className={mobileTab === 'edit' ? 'on' : ''} onClick={() => setMobileTab('edit')}>
          ✎ {selectedId ? 'Edit block' : 'Settings'}
        </button>
      </nav>

      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}

function AddBlocks({ onAdd }: { onAdd: () => void }) {
  const addBlock = useEditor((s) => s.addBlock);
  return (
    <div className="panel-section">
      <div className="panel-title">Add a block</div>
      <div className="add-grid">
        {BLOCK_LIBRARY.map((b) => (
          <button
            key={b.type}
            className="add-opt"
            title={b.desc}
            onClick={() => {
              addBlock(b.type as BlockType);
              if (matchMedia('(max-width: 900px)').matches) onAdd();
            }}
          >
            <BlockIcon type={b.type} />
            <span className="add-label">{b.label}</span>
            <span className="add-desc">{b.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockIcon({ type }: { type: BlockType }) {
  const icons: Record<BlockType, string> = { toplist: '☰', leaderboard: '⇅', stat: '#', image: '◩', text: 'T', chart: '▥', months: '▦', shape: '◯' };
  return <span className="block-icon">{icons[type]}</span>;
}

function Slides() {
  const lib = useApp((s) => s.lib)!;
  const username = useApp((s) => s.user?.name ?? s.username);
  const { project, slideIdx, setSlide, addSlide, duplicateSlide, deleteSlide, moveSlide, update } = useEditor();
  if (!project) return null;
  const thumbW = 92;
  const scale = thumbW / project.format.w;
  return (
    <div className="panel-section">
      <div className="panel-title">
        Slides <span className="muted">{project.slides.length}</span>
        <button className="mini-btn" onClick={() => addSlide()}>
          + New
        </button>
      </div>
      <div className="slides">
        {project.slides.map((s, i) => (
          <div key={s.id} className={`slide-thumb ${i === slideIdx ? 'on' : ''}`} onClick={() => setSlide(i)}>
            <div className="slide-thumb-canvas" style={{ width: thumbW, height: project.format.h * scale }}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none' }}>
                <SlideCanvas lib={lib} project={project} slide={s} username={username} />
              </div>
            </div>
            <div className="slide-meta">
              <input className="slide-name" value={s.name} onClick={(e) => e.stopPropagation()} onChange={(e) => update((p) => void (p.slides[i].name = e.target.value), `slidename:${s.id}`)} />
              {i === slideIdx && (
                <div className="row tight">
                  <button className="mini-btn" title="Move up" onClick={(e) => (e.stopPropagation(), moveSlide(i, -1))}>
                    ↑
                  </button>
                  <button className="mini-btn" title="Move down" onClick={(e) => (e.stopPropagation(), moveSlide(i, 1))}>
                    ↓
                  </button>
                  <button className="mini-btn" title="Duplicate" onClick={(e) => (e.stopPropagation(), duplicateSlide(i))}>
                    ⧉
                  </button>
                  {project.slides.length > 1 && (
                    <button className="mini-btn danger" title="Delete slide" onClick={(e) => (e.stopPropagation(), confirm('Delete this slide?') && deleteSlide(i))}>
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function layerName(b: Block) {
  if (b.name) return b.name;
  switch (b.type) {
    case 'text':
      return b.text.split('\n')[0].slice(0, 28) || 'Text';
    case 'toplist':
      return b.title || `Top ${b.count} ${b.entity}s`;
    case 'stat':
      return `Stat · ${b.stat}`;
    case 'image':
      return b.source === 'upload' ? 'Image' : `#${b.rank} ${b.source} image`;
    default:
      return b.showTitle && b.title ? b.title : b.type;
  }
}

function Layers() {
  const { project, slideIdx, selectedId, select, updateBlock } = useEditor();
  if (!project) return null;
  const blocks = [...project.slides[slideIdx].blocks].reverse();
  return (
    <div className="panel-section">
      <div className="panel-title">Layers</div>
      {!blocks.length && <p className="muted small">Empty slide. Add a block above.</p>}
      <div className="layers">
        {blocks.map((b) => (
          <div key={b.id} className={`layer ${b.id === selectedId ? 'on' : ''} ${b.hidden ? 'hidden' : ''}`} onClick={() => select(b.id)}>
            <BlockIcon type={b.type} />
            <span className="layer-name">{layerName(b)}</span>
            <button className="mini-btn" title={b.hidden ? 'Show' : 'Hide'} onClick={(e) => (e.stopPropagation(), updateBlock(b.id, { hidden: !b.hidden }))}>
              {b.hidden ? '◌' : '●'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExportDialog({ onClose }: { onClose: () => void }) {
  const lib = useApp((s) => s.lib)!;
  const username = useApp((s) => s.user?.name ?? s.username);
  const { project, slideIdx } = useEditor();
  const [which, setWhich] = useState<'current' | 'all'>('current');
  const [ratio, setRatio] = useState(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [renderIdx, setRenderIdx] = useState<number | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const [previews, setPreviews] = useState<{ url: string; file: File }[]>([]);
  if (!project) return null;

  const run = async () => {
    const idxs = which === 'current' ? [slideIdx] : project.slides.map((_, i) => i);
    const files: File[] = [];
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setPreviews([]);
    try {
      for (const [n, i] of idxs.entries()) {
        setBusy(`Rendering slide ${n + 1} of ${idxs.length}…`);
        setRenderIdx(i);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const node = nodeRef.current;
        if (!node) throw new Error('render failed');
        const blob = await renderNodeToBlob(node, project.format.w, project.format.h, ratio);
        const name = `${slugify(project.name)}${idxs.length > 1 ? `-${String(n + 1).padStart(2, '0')}-${slugify(project.slides[i].name)}` : ''}.png`;
        files.push(new File([blob], name, { type: 'image/png' }));
      }
      setRenderIdx(null);
      setPreviews(files.map((f) => ({ url: URL.createObjectURL(f), file: f })));
      setBusy(null);
    } catch (e) {
      console.error(e);
      setBusy(`Export failed: ${(e as Error).message}`);
      setRenderIdx(null);
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal export" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Export</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        {!previews.length ? (
          <>
            <div className="field">
              <span className="field-label">Slides</span>
              <div className="segmented">
                <button className={which === 'current' ? 'on' : ''} onClick={() => setWhich('current')}>
                  This slide
                </button>
                <button className={which === 'all' ? 'on' : ''} onClick={() => setWhich('all')}>
                  All {project.slides.length} slides
                </button>
              </div>
            </div>
            <div className="field">
              <span className="field-label">Quality</span>
              <div className="segmented">
                {[1, 2, 3].map((r) => (
                  <button key={r} className={ratio === r ? 'on' : ''} onClick={() => setRatio(r)}>
                    {r}× · {project.format.w * r}×{project.format.h * r}
                  </button>
                ))}
              </div>
              <span className="field-hint">2× is crisp on any phone. 3× is huge and slower.</span>
            </div>
            <button className="btn primary big" disabled={!!busy && !busy.startsWith('Export failed')} onClick={run}>
              {busy ?? 'Render PNG'}
            </button>
            {busy?.startsWith('Export failed') && <p className="error">{busy}</p>}
          </>
        ) : (
          <>
            <div className="export-previews">
              {previews.map((p) => (
                <img key={p.url} src={p.url} alt={p.file.name} style={{ aspectRatio: `${project.format.w} / ${project.format.h}` }} />
              ))}
            </div>
            <div className="row gap end">
              <button className="btn" onClick={() => setPreviews([])}>
                Back
              </button>
              <button className="btn primary" onClick={() => deliverFiles(previews.map((p) => p.file))}>
                {matchMedia('(pointer: coarse)').matches ? 'Share / Save' : `Download ${previews.length > 1 ? `${previews.length} PNGs` : 'PNG'}`}
              </button>
            </div>
            <p className="muted small">On iPhone, tap Share / Save, then “Save Image” or share straight to Instagram. You can also press and hold a preview to save it.</p>
          </>
        )}
      </div>
      {renderIdx !== null && (
        <div className="offscreen" aria-hidden>
          <SlideCanvas ref={nodeRef} lib={lib} project={project} slide={project.slides[renderIdx]} username={username} />
        </div>
      )}
    </div>
  );
}
