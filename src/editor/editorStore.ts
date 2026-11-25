import { create } from 'zustand';
import { localChanged } from '../lib/changes';
import { makeBlock, uid, type Block, type BlockType, type Project, type Slide } from './model';
import { projectsDb } from '../lib/picStore';
import { isVersusData } from './versusBlank';

interface EditorState {
  project: Project | null;
  slideIdx: number;
  selectedId: string | null;
  past: Project[];
  future: Project[];
  lastMerge: { key: string; at: number } | null;
  load: (p: Project) => void;
  close: () => void;
  update: (fn: (p: Project) => void, mergeKey?: string) => void;
  updateBlock: (id: string, patch: Partial<Block>, mergeKey?: string) => void;
  select: (id: string | null) => void;
  setSlide: (i: number) => void;
  addBlock: (type: BlockType, over?: Partial<Block>) => void;
  deleteBlock: (id: string) => void;
  duplicateBlock: (id: string) => void;
  reorder: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void;
  addSlide: (s?: Slide) => void;
  duplicateSlide: (i: number) => void;
  deleteSlide: (i: number) => void;
  moveSlide: (i: number, dir: -1 | 1) => void;
  undo: () => void;
  redo: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pendingSave: Project | null = null;

function saveNow(leaving = false) {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const p = pendingSave;
  pendingSave = null;
  if (!p) return;
  // leaving the app: written this instant, so nothing's lost if it closes
  (leaving ? projectsDb.putNow(p) : projectsDb.put(p))
    .then(() => localChanged())
    .catch((e) => console.error('save failed', e));
}

function scheduleSave(p: Project) {
  pendingSave = p;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(), 400);
}

// leaving the app (switching apps on iPhone, closing the tab): write the last edit right away
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => saveNow(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow(true);
  });
}

/**
 * A deep copy of project data (plain objects, arrays, numbers, strings). Strings are shared rather
 * than copied: an uploaded picture is megabytes of text, and every drag frame and undo step copies
 * the project. (structuredClone copied every picture each time.)
 */
function clone<T>(x: T): T {
  if (Array.isArray(x)) return x.map(clone) as T;
  if (x && typeof x === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) out[k] = clone(v);
    return out as T;
  }
  return x;
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  slideIdx: 0,
  selectedId: null,
  past: [],
  future: [],
  lastMerge: null,

  load: (p) => set({ project: p, slideIdx: 0, selectedId: null, past: [], future: [], lastMerge: null }),
  close: () => {
    const p = get().project;
    if (p && pendingSave) {
      pendingSave = p;
      saveNow();
    }
    set({ project: null, selectedId: null });
  },

  update: (fn, mergeKey) => {
    const { project, past, lastMerge } = get();
    if (!project) return;
    const next = clone(project);
    fn(next);
    next.updated = Date.now();
    const now = Date.now();
    const merging = mergeKey && lastMerge && lastMerge.key === mergeKey && now - lastMerge.at < 1200;
    set({
      project: next,
      past: merging ? past : [...past.slice(-80), project],
      future: [],
      lastMerge: mergeKey ? { key: mergeKey, at: now } : null,
    });
    scheduleSave(next);
  },

  updateBlock: (id, patch, mergeKey) =>
    get().update((p) => {
      for (const s of p.slides) {
        const i = s.blocks.findIndex((b) => b.id === id);
        if (i >= 0) {
          const next = { ...s.blocks[i], ...patch } as Block;
          // typing over a "You vs." number makes it your own text: kept, not refilled
          if ('text' in patch && next.vs && isVersusData(next)) delete next.vs;
          s.blocks[i] = next;
        }
      }
    }, mergeKey ?? `block:${id}:${Object.keys(patch).join(',')}`),

  select: (selectedId) => set({ selectedId }),
  setSlide: (i) => set({ slideIdx: i, selectedId: null }),

  addBlock: (type, over) => {
    const { project, slideIdx } = get();
    if (!project) return;
    const f = project.format;
    const b = makeBlock(type, over);
    // center it horizontally, place it a bit below the top
    b.w = Math.min(b.w, f.w - 160);
    b.x = Math.round((f.w - b.w) / 2);
    b.y = Math.round(Math.min(f.h - b.h - 40, f.h * 0.25));
    get().update((p) => {
      p.slides[slideIdx].blocks.push(b);
    });
    set({ selectedId: b.id });
  },

  deleteBlock: (id) => {
    get().update((p) => {
      p.slides.forEach((s) => (s.blocks = s.blocks.filter((b) => b.id !== id)));
    });
    set({ selectedId: null });
  },

  duplicateBlock: (id) => {
    const { project, slideIdx } = get();
    const src = project?.slides[slideIdx].blocks.find((b) => b.id === id);
    if (!src) return;
    const copy = { ...clone(src), id: uid(), x: src.x + 40, y: src.y + 40 };
    get().update((p) => {
      const blocks = p.slides[slideIdx].blocks;
      blocks.splice(blocks.findIndex((b) => b.id === id) + 1, 0, copy);
    });
    set({ selectedId: copy.id });
  },

  reorder: (id, dir) =>
    get().update((p) => {
      const blocks = p.slides[get().slideIdx].blocks;
      const i = blocks.findIndex((b) => b.id === id);
      if (i < 0) return;
      const [b] = blocks.splice(i, 1);
      const j = dir === 'up' ? Math.min(blocks.length, i + 1) : dir === 'down' ? Math.max(0, i - 1) : dir === 'top' ? blocks.length : 0;
      blocks.splice(j, 0, b);
    }),

  addSlide: (s) => {
    const slide = s ?? { id: uid(), name: `Slide ${(get().project?.slides.length ?? 0) + 1}`, blocks: [] };
    get().update((p) => {
      p.slides.splice(get().slideIdx + 1, 0, slide);
    });
    set({ slideIdx: get().slideIdx + 1, selectedId: null });
  },

  duplicateSlide: (i) => {
    const src = get().project?.slides[i];
    if (!src) return;
    const copy: Slide = { ...clone(src), id: uid(), name: `${src.name} copy`, blocks: src.blocks.map((b) => ({ ...clone(b), id: uid() })) };
    get().update((p) => {
      p.slides.splice(i + 1, 0, copy);
    });
    set({ slideIdx: i + 1, selectedId: null });
  },

  deleteSlide: (i) => {
    const p0 = get().project;
    if (!p0 || p0.slides.length <= 1) return;
    get().update((p) => {
      p.slides.splice(i, 1);
    });
    set({ slideIdx: Math.max(0, Math.min(i, p0.slides.length - 2)), selectedId: null });
  },

  moveSlide: (i, dir) => {
    const p0 = get().project;
    const j = i + dir;
    if (!p0 || j < 0 || j >= p0.slides.length) return;
    get().update((p) => {
      const [s] = p.slides.splice(i, 1);
      p.slides.splice(j, 0, s);
    });
    set({ slideIdx: j });
  },

  undo: () => {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    // a fresh timestamp, so the undo counts as the newest version and syncs to other devices
    const prev = { ...past[past.length - 1], updated: Date.now() };
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], lastMerge: null, slideIdx: Math.min(get().slideIdx, prev.slides.length - 1) });
    scheduleSave(prev);
  },

  redo: () => {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    const next = { ...future[0], updated: Date.now() };
    set({ project: next, past: [...past, project], future: future.slice(1), lastMerge: null, slideIdx: Math.min(get().slideIdx, next.slides.length - 1) });
    scheduleSave(next);
  },
}));
