import { create } from 'zustand';
import { API_URL } from '../config';
import { db } from './db';
import { setChangeListener, tombstones } from './changes';
import { applyRemoteOverride, applyRemoteRemoval } from './images';
import type { Project } from '../editor/model';

/* ---------------- local storage helpers ---------------- */

const LS = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

const K = { auth: 'sw.cloud', cursor: 'sw.cloud.cursor', pushedAt: 'sw.cloud.pushedAt', settingsUpdated: 'sw.settings.updated' };

function loadAuth(): { token: string | null; user: string | null } {
  try {
    const v = JSON.parse(LS.get(K.auth) || 'null');
    return v && typeof v.token === 'string' ? v : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
}

/* ---------------- state ---------------- */

export interface CloudState {
  token: string | null;
  user: string | null;
  status: 'idle' | 'syncing' | 'error';
  lastSync: number | null;
  error: string | null;
  available: { lastfm: boolean; signIn: boolean } | null;
  waiting: boolean;
  /** local edits not uploaded yet */
  dirty: boolean;
}

export const useCloud = create<CloudState>(() => ({
  ...loadAuth(),
  status: 'idle',
  lastSync: Number(LS.get('sw.cloud.lastSync')) || null,
  error: null,
  available: null,
  waiting: false,
  dirty: false,
}));

let changeSeq = 0;

export const cloudEnabled = () => !!API_URL;

/* ---------------- health / auth ---------------- */

export async function checkHealth() {
  if (!API_URL) return null;
  try {
    const r = await fetch(`${API_URL}/health`);
    const d = (await r.json()) as { lastfm?: boolean; signIn?: boolean };
    const available = { lastfm: !!d.lastfm, signIn: !!d.signIn };
    useCloud.setState({ available });
    return available;
  } catch {
    useCloud.setState({ available: { lastfm: false, signIn: false } });
    return null;
  }
}

const PENDING = 'sw.cloud.pending';

function isStandalone() {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
}

/**
 * Start "Sign in with Last.fm". The app also registers a random pickup id and polls for the
 * session, so it gets signed in even if Last.fm's approval happens in a different browser view
 * (iOS opens links from home-screen apps in a separate view with its own storage).
 */
export function startSignIn() {
  if (!API_URL) return;
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  LS.set(PENDING, JSON.stringify({ id, at: Date.now() }));
  const back = location.origin + location.pathname;
  const url = `${API_URL}/auth/start?redirect=${encodeURIComponent(back)}&pending=${id}`;
  useCloud.setState({ waiting: true });
  if (isStandalone()) {
    window.open(url, '_blank');
    pollPending();
  } else location.href = url;
}

let pollTimer: ReturnType<typeof setTimeout> | undefined;

/** Check whether a sign-in we started has been approved (anywhere). */
export async function pollPending(): Promise<boolean> {
  clearTimeout(pollTimer);
  let p: { id: string; at: number } | null = null;
  try {
    p = JSON.parse(LS.get(PENDING) || 'null');
  } catch {
    p = null;
  }
  if (!p || Date.now() - p.at > 15 * 60_000 || !API_URL) {
    LS.set(PENDING, null);
    useCloud.setState({ waiting: false });
    return false;
  }
  if (useCloud.getState().token) {
    LS.set(PENDING, null);
    useCloud.setState({ waiting: false });
    return true;
  }
  try {
    const r = await fetch(`${API_URL}/auth/poll?id=${p.id}`);
    const d = (await r.json()) as { token?: string; user?: string };
    if (d.token && d.user) {
      LS.set(PENDING, null);
      adoptSession(d.token, d.user);
      onSignedIn?.(d.user);
      return true;
    }
  } catch {
    /* offline: try again shortly */
  }
  useCloud.setState({ waiting: true });
  pollTimer = setTimeout(() => void pollPending(), 2500);
  return false;
}

export function cancelSignIn() {
  clearTimeout(pollTimer);
  LS.set(PENDING, null);
  useCloud.setState({ waiting: false });
}

let onSignedIn: ((user: string) => void) | null = null;
export function setOnSignedIn(fn: (user: string) => void) {
  onSignedIn = fn;
}

function adoptSession(token: string, user: string) {
  LS.set(K.auth, JSON.stringify({ token, user }));
  // a fresh sign-in pulls everything and uploads everything already on this device
  LS.set(K.cursor, null);
  LS.set(K.pushedAt, null);
  useCloud.setState({ token, user, error: null, waiting: false });
  void syncNow();
}

/** If we just came back from "Sign in with Last.fm", store the session. */
export function consumeAuthRedirect(): { user?: string; error?: string } | null {
  const h = location.hash;
  if (!h.startsWith('#auth=') && !h.startsWith('#auth_error=')) return null;
  const params = new URLSearchParams(h.slice(1));
  history.replaceState(null, '', location.pathname + location.search + '#/');
  const err = params.get('auth_error');
  if (err) return { error: err };
  const token = params.get('auth');
  const user = params.get('user');
  if (!token || !/^[0-9a-f]{64}$/.test(token) || !user) return { error: 'bad_response' };
  LS.set(PENDING, null);
  adoptSession(token, user);
  return { user };
}

export async function signOut() {
  const { token } = useCloud.getState();
  if (token && API_URL) fetch(`${API_URL}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  LS.set(K.auth, null);
  LS.set(K.cursor, null);
  LS.set(K.pushedAt, null);
  useCloud.setState({ token: null, user: null, status: 'idle', error: null });
}

/* ---------------- sync ---------------- */

interface RemoteProject {
  id: string;
  data: string | null;
  updated: number;
  deleted: boolean;
}
interface RemoteImage {
  key: string;
  src: string | null;
  zoom: number;
  x: number;
  y: number;
  updated: number;
  deleted: boolean;
}
interface SyncResponse {
  now: number;
  more: boolean;
  rejected: string[];
  cursor: { p: number; i: number; s: number };
  projects: RemoteProject[];
  images: RemoteImage[];
  settings: { data: string; updated: number } | null;
}

/** Hooks the app provides so remote changes land in the UI. */
interface Hooks {
  getSettings: () => unknown;
  applySettings: (data: unknown) => void;
  onProjectChanged: (p: Project | null, id: string) => void;
}
let hooks: Hooks | null = null;

let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function scheduleSync(delay = 1200) {
  if (!useCloud.getState().token) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void syncNow();
  }, delay);
}

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = doSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

const BATCH_BYTES = 6_000_000;

async function post(token: string, body: unknown): Promise<SyncResponse> {
  const r = await fetch(`${API_URL}/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 401) {
    await signOut();
    throw new Error('Signed out. Please sign in again.');
  }
  if (!r.ok) throw new Error(`Sync failed (${r.status})`);
  return r.json();
}

async function doSync() {
  const { token } = useCloud.getState();
  if (!token || !API_URL) return;
  useCloud.setState({ status: 'syncing', error: null });
  const seqAtStart = changeSeq;
  try {
    const startedAt = Date.now();
    const pushedAt = Number(LS.get(K.pushedAt)) || 0;

    // ---- gather local changes since the last successful push ----
    const projects: RemoteProject[] = (await db.projects.toArray())
      .filter((p) => p.updated > pushedAt)
      .map((p) => ({ id: p.id, data: JSON.stringify(p), updated: p.updated, deleted: false }));
    const images: RemoteImage[] = (await db.overrides.toArray())
      .filter((o) => o.updated > pushedAt)
      .map((o) => ({ key: o.key, src: o.src, zoom: o.zoom, x: o.x, y: o.y, updated: o.updated, deleted: false }));
    for (const [k, at] of Object.entries(tombstones())) {
      if (at <= pushedAt) continue;
      const i = k.indexOf(':');
      const kind = k.slice(0, i);
      const id = k.slice(i + 1);
      if (kind === 'project') projects.push({ id, data: null, updated: at, deleted: true });
      else images.push({ key: id, src: null, zoom: 1, x: 50, y: 50, updated: at, deleted: true });
    }
    const sUpdated = Number(LS.get(K.settingsUpdated)) || 0;
    const settings = sUpdated > pushedAt && hooks ? { data: JSON.stringify(hooks.getSettings()), updated: sUpdated } : null;

    // ---- split into request-sized batches ----
    const batches: { projects: RemoteProject[]; images: RemoteImage[] }[] = [{ projects: [], images: [] }];
    let size = 0;
    const add = (kind: 'projects' | 'images', item: RemoteProject | RemoteImage, bytes: number) => {
      if (size + bytes > BATCH_BYTES && (batches[batches.length - 1].projects.length || batches[batches.length - 1].images.length)) {
        batches.push({ projects: [], images: [] });
        size = 0;
      }
      (batches[batches.length - 1][kind] as (RemoteProject | RemoteImage)[]).push(item);
      size += bytes;
    };
    projects.forEach((p) => add('projects', p, p.data?.length ?? 100));
    images.forEach((im) => add('images', im, im.src?.length ?? 100));

    let cursor = JSON.parse(LS.get(K.cursor) || '{"p":0,"i":0,"s":0}');
    const rejected: string[] = [];
    const sizes = new Map<string, number>();
    projects.forEach((p) => sizes.set(`project:${p.id}`, p.data?.length ?? 0));
    images.forEach((im) => sizes.set(`image:${im.key}`, im.src?.length ?? 0));
    let res: SyncResponse | null = null;
    for (let b = 0; b < batches.length; b++) {
      res = await post(token, { cursor, ...batches[b], settings: b === 0 ? settings : null });
      rejected.push(...res.rejected);
      await applyRemote(res);
      cursor = res.cursor;
    }
    while (res?.more) {
      res = await post(token, { cursor });
      await applyRemote(res);
      cursor = res.cursor;
    }

    LS.set(K.cursor, JSON.stringify(cursor));
    LS.set(K.pushedAt, String(startedAt));
    LS.set('sw.cloud.lastSync', String(Date.now()));
    useCloud.setState({
      status: 'idle',
      dirty: changeSeq !== seqAtStart,
      lastSync: Date.now(),
      error: rejected.length ? await describeRejected(rejected, sizes) : null,
    });
  } catch (e) {
    useCloud.setState({ status: 'error', error: (e as Error).message });
  }
}

/** Human-readable "what didn't sync and why". */
async function describeRejected(keys: string[], sizes: Map<string, number>) {
  const mb = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`;
  const names: string[] = [];
  for (const k of keys) {
    const i = k.indexOf(':');
    const kind = k.slice(0, i);
    const id = k.slice(i + 1);
    if (kind === 'project') {
      const p = await db.projects.get(id);
      names.push(`“${p?.name ?? 'a wrapped'}” (${mb(sizes.get(k) ?? 0)})`);
    } else names.push(`a picture (${mb(sizes.get(k) ?? 0)})`);
  }
  return `Not synced: ${names.join(', ')}. Items over 2 MB can't sync. Usually it's a big uploaded picture inside it; re-uploading it will shrink it.`;
}

async function applyRemote(res: SyncResponse) {
  for (const r of res.projects) {
    const local = await db.projects.get(r.id);
    if (r.deleted) {
      if (local && local.updated <= r.updated) {
        await db.projects.delete(r.id);
        hooks?.onProjectChanged(null, r.id);
      }
    } else if (r.data && (!local || r.updated > local.updated)) {
      try {
        const p = JSON.parse(r.data) as Project;
        await db.projects.put(p);
        hooks?.onProjectChanged(p, r.id);
      } catch {
        /* skip corrupt row */
      }
    }
  }
  for (const r of res.images) {
    if (r.deleted) await applyRemoteRemoval(r.key, r.updated);
    else if (r.src) await applyRemoteOverride({ key: r.key, src: r.src, zoom: r.zoom, x: r.x, y: r.y, updated: r.updated });
  }
  if (res.settings && hooks) {
    const local = Number(LS.get(K.settingsUpdated)) || 0;
    if (res.settings.updated > local) {
      try {
        hooks.applySettings(JSON.parse(res.settings.data));
        LS.set(K.settingsUpdated, String(res.settings.updated));
      } catch {
        /* ignore */
      }
    }
  }
  if (res.projects.length || res.images.length) window.dispatchEvent(new Event('sw:remote-change'));
}

/** Local edits newer than this haven't been uploaded yet. */
export function lastPushedAt() {
  return Number(LS.get(K.pushedAt)) || 0;
}

/** Re-upload everything on this device and re-download everything from the server. */
export function forceFullSync() {
  LS.set(K.pushedAt, null);
  LS.set(K.cursor, null);
  useCloud.setState({ dirty: true });
  return syncNow();
}

/* ---------------- lifecycle ---------------- */

let started = false;

export function initCloud(h: Hooks) {
  hooks = h;
  if (started || !API_URL) return;
  started = true;
  setChangeListener(() => {
    changeSeq++;
    if (useCloud.getState().token) useCloud.setState({ dirty: true });
    scheduleSync();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(300);
    // leaving the app: upload pending edits right away instead of waiting for the timer
    else if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      void syncNow();
    }
  });
  window.addEventListener('pagehide', () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      void syncNow();
    }
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 60_000);
  // finish a sign-in that was approved while we were away (e.g. in Safari)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && LS.get(PENDING)) void pollPending();
  });
  if (LS.get(PENDING)) void pollPending();
  void checkHealth();
  void syncNow();
}
