import { db, type ImageOverride } from './db';
import { applyRemoteOverride, getOverride } from './images';
import { bumpSettings, clearTombstone, localChanged } from './changes';
import { applyAppSettings, getAppSettings } from './appSettings';
import type { Project } from '../editor/model';

/**
 * A backup file: your wrappeds, custom pictures and settings (not the scrobble history, which
 * can always be downloaded again from Last.fm).
 */
interface Backup {
  app: 'encore';
  version: 1;
  created: number;
  user?: string;
  projects: Project[];
  images: ImageOverride[];
  settings: unknown;
}

export async function makeBackup(user?: string): Promise<File> {
  const data: Backup = {
    app: 'encore',
    version: 1,
    created: Date.now(),
    user,
    projects: await db.projects.toArray(),
    images: await db.overrides.toArray(),
    settings: getAppSettings(),
  };
  const day = new Date().toISOString().slice(0, 10);
  return new File([JSON.stringify(data)], `encore-backup-${day}.json`, { type: 'application/json' });
}

/** Merge a backup into this device: anything missing or newer in the backup is restored. */
export async function restoreBackup(file: File, opts: { settings: boolean }): Promise<{ projects: number; images: number }> {
  let data: Backup;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't an Encore backup.");
  }
  if (data?.app !== 'encore' || !Array.isArray(data.projects) || !Array.isArray(data.images)) throw new Error("That file isn't an Encore backup.");
  const now = Date.now();
  let projects = 0;
  for (const p of data.projects) {
    if (!p?.id || !Array.isArray(p.slides)) continue;
    const local = await db.projects.get(p.id);
    if (local && local.updated >= p.updated) continue;
    // a fresh timestamp so the restored copy syncs to your other devices too
    await db.projects.put({ ...p, updated: now });
    clearTombstone('project', p.id);
    projects++;
  }
  let images = 0;
  for (const o of data.images) {
    if (!o?.key || !o.src) continue;
    const local = getOverride(o.key);
    if (local && local.updated >= o.updated) continue;
    await applyRemoteOverride({ ...o, updated: now });
    clearTombstone('image', o.key);
    images++;
  }
  if (opts.settings && data.settings) {
    applyAppSettings(data.settings);
    bumpSettings(); // restored settings count as a change, so they sync to your other devices
  }
  if (projects || images) {
    localChanged();
    window.dispatchEvent(new Event('sw:remote-change'));
  }
  return { projects, images };
}
