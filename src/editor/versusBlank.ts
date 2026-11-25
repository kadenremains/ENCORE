import type { Block, Project } from './model';

/**
 * A "You vs." wrapped keeps who it compares you with, never the comparison: before it's saved (and
 * synced), every block showing their data is emptied. Opening it loads the comparison again.
 * Roles that are only names (yours and theirs) stay.
 */
const KEEP = new Set(['title', 'meName', 'themName', 'keyMe', 'keyThem', 'onlyThemTitle', 'onlyMeTitle']);

export const isVersusData = (b: Block) => !!b.vs && !KEEP.has(b.vs);

export function blankVersus(p: Project): Project {
  if (!p.versus) return p;
  return {
    ...p,
    slides: p.slides.map((s) => ({
      ...s,
      blocks: s.blocks.map((b) => {
        if (!isVersusData(b)) return b;
        if (b.type === 'text') return { ...b, text: '' };
        if (b.type === 'shape') return { ...b, w: 6 };
        return b;
      }),
    })),
  };
}

/** Whether the comparison has been loaded into this copy (any data block has something in it). */
export const versusFilled = (p: Project) => p.slides.some((s) => s.blocks.some((b) => isVersusData(b) && b.type === 'text' && b.text !== ''));
