import { create } from 'zustand';
import { bumpSettings } from './changes';

/**
 * App-wide preferences from the Settings page. Kept on the device and synced to your account
 * with the rest of your settings. Dependency-free so any module can read them.
 */
export interface Prefs {
  /* appearance */
  palette: 'ink' | 'oled' | 'midnight' | 'sepia' | 'light';
  accent: 'silver' | 'gold' | 'rose' | 'ice' | 'mint' | 'violet' | 'ember';
  textSize: 'small' | 'normal' | 'large';
  grain: boolean;
  motion: boolean;
  /** the picture behind the Overview card, and how strongly it shows */
  heroBg: 'avatar' | 'artist' | 'album' | 'mine' | 'none';
  heroBgStrength: 'subtle' | 'medium' | 'strong';
  /* stats */
  hour12: boolean;
  minutesPerScrobble: number;
  startPage: 'overview' | 'artists' | 'albums' | 'songs' | 'listening' | 'records' | 'create';
  listLength: number;
  /* pictures */
  listImages: boolean;
  onlineArt: boolean;
  /* background work */
  autoEditCheck: boolean;
  /** picked a look on first run (synced, so a signed-in account never sees the picker again) */
  lookChosen: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  palette: 'ink',
  accent: 'silver',
  textSize: 'normal',
  grain: true,
  motion: true,
  heroBg: 'avatar',
  heroBgStrength: 'medium',
  hour12: true,
  minutesPerScrobble: 3.5,
  startPage: 'overview',
  listLength: 100,
  listImages: true,
  onlineArt: true,
  autoEditCheck: true,
  lookChosen: false,
};

const LS = 'sw.prefs';

function load(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(LS) || '{}');
    return sanitize(v);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Unknown or wrongly typed values fall back to the defaults (e.g. settings from an older version). */
export function sanitize(raw: unknown): Prefs {
  const out = { ...DEFAULT_PREFS };
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === typeof DEFAULT_PREFS[k]) (out as Record<string, unknown>)[k] = v;
  }
  out.minutesPerScrobble = Math.min(10, Math.max(1, out.minutesPerScrobble));
  out.listLength = Math.min(1000, Math.max(10, Math.round(out.listLength)));
  return out;
}

export const usePrefs = create<Prefs>(() => load());

export const getPrefs = () => usePrefs.getState();

function save(p: Prefs) {
  try {
    localStorage.setItem(LS, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

/** Change preferences from the UI (syncs to your other devices). */
export function setPrefs(patch: Partial<Prefs>) {
  const next = { ...getPrefs(), ...patch };
  usePrefs.setState(next);
  save(next);
  bumpSettings();
}

/** Preferences that arrived from another device. */
export function applyRemotePrefs(raw: unknown) {
  const next = sanitize(raw);
  usePrefs.setState(next);
  save(next);
}

export function resetPrefs(keys: (keyof Prefs)[]) {
  const patch: Partial<Prefs> = {};
  for (const k of keys) (patch as Record<string, unknown>)[k] = DEFAULT_PREFS[k];
  setPrefs(patch);
}

/** Hour of the day in the chosen clock style (charts, highlights). */
export function fmtHourPref(h: number) {
  if (!getPrefs().hour12) return `${String(h).padStart(2, '0')}:00`;
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
}

/** Put the appearance settings on the page (palette, accent, text size, texture, motion). */
export function applyAppearance(p: Prefs) {
  const el = document.documentElement;
  el.dataset.palette = p.palette;
  el.dataset.accent = p.accent;
  el.dataset.text = p.textSize;
  el.classList.toggle('no-grain', !p.grain);
  el.classList.toggle('no-motion', !p.motion);
  const bg = getComputedStyle(el).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#0a0a0c');
}
