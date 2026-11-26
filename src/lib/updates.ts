import { create } from 'zustand';
import { fetchWithin } from './net';

/**
 * Picks up new versions of the site. An app added to the iPhone home screen is usually resumed
 * rather than reloaded, so it can keep running an old version for days. Whenever the app comes
 * back to the screen (and every half hour while open) we ask the server which build is current.
 */
export const useUpdate = create<{ available: boolean }>(() => ({ available: false }));

const BUILD_RE = /assets\/(index-[\w-]+\.js)/;

function runningBuild(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src') ?? '';
  return BUILD_RE.exec(s)?.[1] ?? null;
}

async function latestBuild(): Promise<string | null> {
  try {
    const r = await fetchWithin(`${location.pathname}?check=${Date.now()}`, { cache: 'no-store' }, 15_000);
    if (!r.ok) return null;
    return BUILD_RE.exec(await r.text())?.[1] ?? null;
  } catch {
    return null; // offline
  }
}

/** Load the new version (the query string makes sure the page itself isn't served from cache). */
export function applyUpdate(build?: string) {
  location.replace(`${location.pathname}?v=${encodeURIComponent(build ?? String(Date.now()))}${location.hash}`);
}

let checking = false;
/** Ask the server for the current version; reloads into it when there's a newer one. */
export async function checkForUpdate(): Promise<'latest' | 'updating' | 'offline' | 'dev'> {
  const running = runningBuild();
  if (!running) return 'dev';
  const latest = await latestBuild();
  if (!latest) return 'offline';
  if (latest === running) return 'latest';
  applyUpdate(latest);
  return 'updating';
}

/** The build that's running (shown in Settings → About). */
export function buildId() {
  return runningBuild()?.replace(/^index-|\.js$/g, '') ?? 'dev';
}

async function check() {
  const running = runningBuild();
  if (!running || checking || document.visibilityState !== 'visible') return; // dev server: nothing to compare
  checking = true;
  try {
    const latest = await latestBuild();
    if (!latest || latest === running) return;
    // already tried this exact version once and still got the old one: just offer the button
    let tried = false;
    try {
      tried = sessionStorage.getItem('sw.updateTried') === latest;
      sessionStorage.setItem('sw.updateTried', latest);
    } catch {
      /* private mode */
    }
    // in the editor, don't yank the page away mid-edit: show a button instead
    if (!tried && !location.hash.startsWith('#/edit')) applyUpdate(latest);
    else useUpdate.setState({ available: true });
  } finally {
    checking = false;
  }
}

export function startUpdateChecks() {
  void check();
  document.addEventListener('visibilitychange', () => void check());
  window.addEventListener('pageshow', () => void check());
  setInterval(() => void check(), 30 * 60_000);
}
