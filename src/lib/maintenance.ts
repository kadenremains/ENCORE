import { db } from './db';
import { embedLinkedOverrides, shrinkDataUrl, shrinkStoredOverrides } from './images';
import { localChanged } from './changes';
import type { Project } from '../editor/model';

/** Shrink every oversized embedded picture in a wrapped. Returns true if anything changed. */
export async function shrinkProjectImages(p: Project): Promise<boolean> {
  let changed = false;
  const fix = async (v: string | undefined) => {
    if (!v) return v;
    const out = await shrinkDataUrl(v);
    if (out !== v) changed = true;
    return out;
  };
  p.theme.bgImage = await fix(p.theme.bgImage);
  for (const s of p.slides) {
    if (s.theme?.bgImage) s.theme.bgImage = await fix(s.theme.bgImage);
    for (const b of s.blocks) if (b.type === 'image' && b.src) b.src = (await fix(b.src)) ?? '';
  }
  return changed;
}

const DONE = 'sw.maint.shrink.v1';

/**
 * One-time pass over everything saved before uploads were compressed: shrinks big pictures
 * inside wrappeds and custom images so they're light and sync quickly.
 */
const EMBED_DONE = 'sw.maint.embed.v1';

export async function runMaintenance() {
  // custom pictures that are links to other sites -> keep our own copy (fixes exports + sync)
  try {
    if (!localStorage.getItem(EMBED_DONE)) {
      await embedLinkedOverrides();
      localStorage.setItem(EMBED_DONE, String(Date.now()));
    }
  } catch {
    /* try again next launch */
  }
  try {
    if (localStorage.getItem(DONE)) return;
  } catch {
    return;
  }
  let changed = 0;
  for (const p of await db.projects.toArray()) {
    if (await shrinkProjectImages(p)) {
      p.updated = Date.now();
      await db.projects.put(p);
      changed++;
    }
  }
  changed += await shrinkStoredOverrides();
  try {
    localStorage.setItem(DONE, String(Date.now()));
  } catch {
    /* ignore */
  }
  if (changed) {
    localChanged();
    window.dispatchEvent(new Event('sw:remote-change'));
  }
}
