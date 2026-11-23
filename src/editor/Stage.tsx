import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { SlideCanvas } from '../render/SlideCanvas';
import { useApp } from '../store';
import { useEditor } from './editorStore';
import type { Block } from './model';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface DragState {
  id: string;
  mode: 'move' | Handle;
  sx: number;
  sy: number;
  orig: { x: number; y: number; w: number; h: number };
  moved: boolean;
}

export function Stage({ zoom }: { zoom: 'fit' | number }) {
  const lib = useApp((s) => s.lib);
  const username = useApp((s) => s.user?.name ?? s.username);
  const project = useEditor((s) => s.project);
  const slideIdx = useEditor((s) => s.slideIdx);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const updateBlock = useEditor((s) => s.updateBlock);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 800, h: 800 });
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const drag = useRef<DragState | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setAvail({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useKeyboard();

  if (!project || !lib) return null;
  const slide = project.slides[slideIdx];
  const { w: W, h: H } = project.format;
  const pad = 32;
  const fit = Math.min((avail.w - pad * 2) / W, (avail.h - pad * 2) / H);
  const scale = zoom === 'fit' ? Math.max(0.05, fit) : zoom;
  const handleSize = 14 / scale;

  const onPointerDown = (e: RPointerEvent, b: Block, mode: DragState['mode']) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    select(b.id);
    if (b.locked) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { id: b.id, mode, sx: e.clientX, sy: e.clientY, orig: { x: b.x, y: b.y, w: b.w, h: b.h }, moved: false };
  };

  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3 / scale) return;
    d.moved = true;
    const o = d.orig;
    const others = slide.blocks.filter((x) => x.id !== d.id && !x.hidden);
    const snapT = 10 / scale;
    const xs = [0, W / 2, W, ...others.flatMap((x) => [x.x, x.x + x.w / 2, x.x + x.w])];
    const ys = [0, H / 2, H, ...others.flatMap((x) => [x.y, x.y + x.h / 2, x.y + x.h])];
    const gx: number[] = [];
    const gy: number[] = [];
    const snap = (v: number, lines: number[], out: number[]) => {
      let best = v;
      let bd = snapT;
      for (const l of lines) {
        const dd = Math.abs(l - v);
        if (dd < bd) {
          bd = dd;
          best = l;
        }
      }
      if (best !== v) out.push(best);
      return best;
    };
    if (d.mode === 'move') {
      let x = Math.round(o.x + dx);
      let y = Math.round(o.y + dy);
      if (!e.altKey) {
        // try snapping left, center, right edges
        const cands = [
          { off: 0, v: x },
          { off: o.w / 2, v: x + o.w / 2 },
          { off: o.w, v: x + o.w },
        ];
        for (const c of cands) {
          const s = snap(c.v, xs, gx);
          if (s !== c.v) {
            x = Math.round(s - c.off);
            break;
          }
        }
        const candsY = [
          { off: 0, v: y },
          { off: o.h / 2, v: y + o.h / 2 },
          { off: o.h, v: y + o.h },
        ];
        for (const c of candsY) {
          const s = snap(c.v, ys, gy);
          if (s !== c.v) {
            y = Math.round(s - c.off);
            break;
          }
        }
      }
      updateBlock(d.id, { x, y }, `drag:${d.id}`);
    } else {
      let { x, y, w, h } = o;
      const m = d.mode;
      if (m.includes('e')) w = o.w + dx;
      if (m.includes('s')) h = o.h + dy;
      if (m.includes('w')) {
        w = o.w - dx;
        x = o.x + dx;
      }
      if (m.includes('n')) {
        h = o.h - dy;
        y = o.y + dy;
      }
      if (e.shiftKey && m.length === 2) {
        const ratio = o.w / o.h;
        if (Math.abs(dx) > Math.abs(dy)) {
          const nh = w / ratio;
          if (m.includes('n')) y = o.y + o.h - nh;
          h = nh;
        } else {
          const nw = h * ratio;
          if (m.includes('w')) x = o.x + o.w - nw;
          w = nw;
        }
      }
      if (!e.altKey) {
        if (m.includes('e')) w = snap(x + w, xs, gx) - x;
        if (m.includes('s')) h = snap(y + h, ys, gy) - y;
        if (m.includes('w')) {
          const nx = snap(x, xs, gx);
          w += x - nx;
          x = nx;
        }
        if (m.includes('n')) {
          const ny = snap(y, ys, gy);
          h += y - ny;
          y = ny;
        }
      }
      const minS = 30;
      if (w < minS) {
        if (m.includes('w')) x -= minS - w;
        w = minS;
      }
      if (h < minS) {
        if (m.includes('n')) y -= minS - h;
        h = minS;
      }
      updateBlock(d.id, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }, `drag:${d.id}`);
    }
    setGuides({ x: gx, y: gy });
  };

  const onPointerUp = () => {
    drag.current = null;
    setGuides({ x: [], y: [] });
  };

  const selected = slide.blocks.find((b) => b.id === selectedId);

  return (
    <div ref={wrapRef} className="stage" onPointerDown={() => select(null)}>
      <div className="stage-inner" style={{ width: W * scale + pad * 2, height: H * scale + pad * 2 }}>
        <div style={{ width: W * scale, height: H * scale, position: 'relative', margin: pad }} className="stage-canvas">
          <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0 }}>
            <SlideCanvas lib={lib} project={project} slide={slide} username={username}>
              <div className="overlay" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
                {slide.blocks.map((b) =>
                  b.hidden ? null : (
                    <div
                      key={b.id}
                      className={`hitbox ${b.id === selectedId ? 'sel' : ''} ${b.locked ? 'locked' : ''}`}
                      style={{ left: b.x, top: b.y, width: b.w, height: b.h, transform: b.rotation ? `rotate(${b.rotation}deg)` : undefined, outlineWidth: 2 / scale }}
                      onPointerDown={(e) => onPointerDown(e, b, 'move')}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onDoubleClick={() => window.dispatchEvent(new CustomEvent('sw:focus-text'))}
                    />
                  ),
                )}
                {selected && !selected.hidden && (
                  <div className="selection" style={{ left: selected.x, top: selected.y, width: selected.w, height: selected.h, transform: selected.rotation ? `rotate(${selected.rotation}deg)` : undefined, borderWidth: 2 / scale }}>
                    {!selected.locked &&
                      HANDLES.map((hd) => (
                        <div
                          key={hd}
                          className={`handle h-${hd}`}
                          style={{ width: handleSize, height: handleSize, margin: -handleSize / 2, borderWidth: 2 / scale }}
                          onPointerDown={(e) => onPointerDown(e, selected, hd)}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                        />
                      ))}
                    <div className="dims" style={{ fontSize: 12 / scale, padding: `${2 / scale}px ${6 / scale}px`, top: -24 / scale, borderRadius: 4 / scale }}>
                      {selected.w} × {selected.h}
                    </div>
                  </div>
                )}
                {guides.x.map((x, i) => (
                  <div key={`gx${i}`} className="guide" style={{ left: x, top: 0, width: 1 / scale, height: H }} />
                ))}
                {guides.y.map((y, i) => (
                  <div key={`gy${i}`} className="guide" style={{ top: y, left: 0, height: 1 / scale, width: W }} />
                ))}
              </div>
            </SlideCanvas>
          </div>
        </div>
      </div>
    </div>
  );
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const st = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
        return;
      }
      const id = st.selectedId;
      if (!id || !st.project) return;
      const b = st.project.slides[st.slideIdx].blocks.find((x) => x.id === id);
      if (!b) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        st.deleteBlock(id);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        st.duplicateBlock(id);
      } else if (e.key === 'Escape') st.select(null);
      else if (e.key.startsWith('Arrow') && !b.locked) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0;
        const dy = e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0;
        st.updateBlock(id, { x: b.x + dx, y: b.y + dy }, `nudge:${id}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
