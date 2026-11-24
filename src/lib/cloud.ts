import { create } from 'zustand';
import { API_URL } from '../config';
import { db } from './db';
import { setChangeListener, tombstones } from './changes';
import { applyRemoteOverride, applyRemoteRemoval } from './images';
import { fromB64, hashName, isSealed, loadDataKey, lockDataKey, newDataKey, newSealKeys, open, openSealed, seal, toB64, unlockDataKey, type DataKey } from './crypto';
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

const K = {
  auth: 'sw.cloud',
  cursor: 'sw.cloud.cursor',
  pushedAt: 'sw.cloud.pushedAt',
  settingsUpdated: 'sw.settings.updated',
  rejected: 'sw.cloud.rejected',
  version: 'sw.cloud.v',
  /** this device's copy of the account's data key (never sent anywhere unencrypted) */
  key: 'sw.cloud.key',
};

/** Items the server refused last time; they're retried on every sync until they go through. */
function rejectedKeys(): Set<string> {
  try {
    return new Set(JSON.parse(LS.get(K.rejected) || '[]'));
  } catch {
    return new Set();
  }
}

export function isRejected(kind: 'project' | 'image', id: string) {
  return rejectedKeys().has(`${kind}:${id}`);
}

function loadAuth(): { token: string | null; user: string | null } {
  try {
    const v = JSON.parse(LS.get(K.auth) || 'null');
    return v && typeof v.token === 'string' ? v : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
}

/* ---------------- state ---------------- */

/**
 * Private sync status:
 *  - ready: this device holds the account's data key; sync runs
 *  - setup: unlocking or creating the key right after sign-in
 *  - needs-signin: signed in from before private sync existed; signing in again unlocks it
 *  - locked: the key on the server couldn't be opened (see error)
 */
export type Privacy = 'ready' | 'setup' | 'needs-signin' | 'locked';

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
  privacy: Privacy | null;
}

export const useCloud = create<CloudState>(() => ({
  ...loadAuth(),
  status: 'idle',
  lastSync: Number(LS.get('sw.cloud.lastSync')) || null,
  error: null,
  available: null,
  waiting: false,
  dirty: false,
  privacy: null,
}));

let changeSeq = 0;

export const cloudEnabled = () => !!API_URL;

/* ---------------- the data key ---------------- */

let dataKey: DataKey | null = null;

async function loadLocalKey(user: string | null): Promise<DataKey | null> {
  try {
    const v = JSON.parse(LS.get(K.key) || 'null') as { user: string; raw: string } | null;
    if (!v || !user || v.user.toLowerCase() !== user.toLowerCase()) return null;
    return await loadDataKey(fromB64(v.raw));
  } catch {
    return null;
  }
}

function saveLocalKey(user: string, dk: DataKey | null) {
  LS.set(K.key, dk ? JSON.stringify({ user, raw: toB64(dk.raw) }) : null);
}

async function api<T>(token: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) {
    await signOut();
    throw new Error('Signed out. Please sign in again.');
  }
  const d = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}

interface VaultRow {
  wrapped: string;
  kid: string;
}

/**
 * Right after signing in with Last.fm (we have the session key): unlock the account's data key,
 * or create it on the first device. Turning private sync on for an account that synced before
 * downloads the old (readable) copies first, then the server deletes them and this device
 * uploads everything again, encrypted.
 */
async function setupKey(token: string, user: string, sessionKey: string) {
  useCloud.setState({ privacy: 'setup', error: null });
  try {
    const local = await loadLocalKey(user);
    let { vault } = await api<{ vault: VaultRow | null }>(token, '/vault');
    if (!vault) {
      await legacyPull(token);
      const fresh = await newDataKey();
      const r = await api<{ vault: VaultRow; created: boolean }>(token, '/vault', { mode: 'create', wrapped: await lockDataKey(fresh, sessionKey), kid: fresh.kid });
      if (r.created) return useKey(user, fresh, true);
      vault = r.vault; // another device got there first: use theirs
    }
    let dk: DataKey | null = null;
    try {
      dk = await unlockDataKey(vault.wrapped, sessionKey);
    } catch {
      // Last.fm gave this sign-in a different session key. A device that already holds the
      // data key re-locks it with the new one, so the account's other devices can follow.
      if (local && local.kid === vault.kid) {
        await api(token, '/vault', { mode: 'replace', wrapped: await lockDataKey(local, sessionKey), kid: local.kid });
        dk = local;
      }
    }
    if (!dk || dk.kid !== vault.kid) {
      useCloud.setState({
        privacy: 'locked',
        error: "Couldn't unlock your synced data with this sign-in. On a device where sync already works, turn sync off and sign in again, then try here once more.",
      });
      return;
    }
    return useKey(user, dk, !local || local.kid !== dk.kid);
  } catch (e) {
    useCloud.setState({ privacy: 'locked', error: `Couldn't set up private sync: ${(e as Error).message}` });
  }
}

function useKey(user: string, dk: DataKey, fresh: boolean) {
  dataKey = dk;
  saveLocalKey(user, dk);
  if (fresh) {
    // new to this device: download everything and upload everything (encrypted)
    LS.set(K.cursor, null);
    LS.set(K.pushedAt, null);
    LS.set(K.rejected, null);
  }
  useCloud.setState({ privacy: 'ready', error: null });
}

/** Download what an account synced before private sync, so nothing is lost when it's replaced. */
async function legacyPull(token: string) {
  let cursor = { p: 0, i: 0, s: 0 };
  for (let page = 0; page < 200; page++) {
    const res = await post(token, { cursor });
    await applyRemote(res, null);
    cursor = res.cursor;
    if (!res.more) break;
  }
}

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

/** Made ahead of time so the sign-in button can open Last.fm instantly (iPhone blocks late pop-ups). */
let sealKeys: { pk: string; jwk: JsonWebKey } | null = null;
export function prepareSignIn() {
  if (!sealKeys && crypto.subtle) void newSealKeys().then((k) => (sealKeys = k)).catch(() => {});
}

/**
 * Start "Sign in with Last.fm". The app also registers a random pickup id and polls for the
 * session, so it gets signed in even if Last.fm's approval happens in a different browser view
 * (iOS opens links from home-screen apps in a separate view with its own storage). The session
 * key comes back sealed to a key only this app holds.
 */
export function startSignIn() {
  if (!API_URL) return;
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const keys = sealKeys;
  sealKeys = null;
  LS.set(PENDING, JSON.stringify({ id, at: Date.now(), jwk: keys?.jwk }));
  const back = location.origin + location.pathname;
  const url = `${API_URL}/auth/start?redirect=${encodeURIComponent(back)}&pending=${id}${keys ? `&pk=${keys.pk}` : ''}`;
  useCloud.setState({ waiting: true });
  if (isStandalone()) {
    window.open(url, '_blank');
    void pollPending();
  } else location.href = url;
  prepareSignIn();
}

let pollTimer: ReturnType<typeof setTimeout> | undefined;

/** Check whether a sign-in we started has been approved (anywhere). */
export async function pollPending(): Promise<boolean> {
  clearTimeout(pollTimer);
  let p: { id: string; at: number; jwk?: JsonWebKey } | null = null;
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
  try {
    const r = await fetch(`${API_URL}/auth/poll?id=${p.id}`);
    const d = (await r.json()) as { token?: string; user?: string; sealed?: string };
    if (d.token && d.user) {
      LS.set(PENDING, null);
      let sessionKey: string | undefined;
      if (d.sealed && p.jwk) sessionKey = await openSealed(d.sealed, p.jwk).catch(() => undefined);
      adoptSession(d.token, d.user, sessionKey);
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

/** Work that has to wait until the app has wired up its sync hooks. */
let afterInit: (() => void)[] = [];

function adoptSession(token: string, user: string, sessionKey?: string) {
  const prev = loadAuth();
  LS.set(K.auth, JSON.stringify({ token, user }));
  LS.set(K.version, SYNC_VERSION);
  if (!prev.user || prev.user.toLowerCase() !== user.toLowerCase()) {
    // a different account: start from scratch
    dataKey = null;
    LS.set(K.cursor, null);
    LS.set(K.pushedAt, null);
  }
  useCloud.setState({ token, user, error: null, waiting: false });
  const run = async () => {
    if (sessionKey) await setupKey(token, user, sessionKey);
    else {
      dataKey = dataKey ?? (await loadLocalKey(user));
      useCloud.setState({ privacy: dataKey ? 'ready' : 'needs-signin' });
    }
    if (dataKey) void syncNow();
  };
  if (hooks) void run();
  else afterInit.push(() => void run());
}

/** If we just came back from "Sign in with Last.fm", store the session. */
export function consumeAuthRedirect(): { user?: string; error?: string } | null {
  const h = location.hash;
  if (!h.startsWith('#auth=') && !h.startsWith('#auth_error=')) return null;
  const params = new URLSearchParams(h.slice(1));
  // the address (with the session key in it) is replaced before anything else happens
  history.replaceState(null, '', location.pathname + location.search + '#/');
  const err = params.get('auth_error');
  if (err) return { error: err };
  const token = params.get('auth');
  const user = params.get('user');
  if (!token || !/^[0-9a-f]{64}$/.test(token) || !user) return { error: 'bad_response' };
  LS.set(PENDING, null);
  adoptSession(token, user, params.get('k') || undefined);
  return { user };
}

export async function signOut() {
  const { token } = useCloud.getState();
  if (token && API_URL) fetch(`${API_URL}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  LS.set(K.auth, null);
  LS.set(K.cursor, null);
  LS.set(K.pushedAt, null);
  LS.set(K.rejected, null);
  LS.set(K.key, null);
  dataKey = null;
  useCloud.setState({ token: null, user: null, status: 'idle', error: null, dirty: false, privacy: null });
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

/** Server names of pictures -> their real names (hashed names can't be turned back otherwise). */
async function pictureNames(dk: DataKey): Promise<Map<string, string>> {
  const names = new Set<string>((await db.overrides.toCollection().primaryKeys()) as string[]);
  for (const k of Object.keys(tombstones())) if (k.startsWith('image:')) names.add(k.slice(6));
  const out = new Map<string, string>();
  await Promise.all([...names].map(async (n) => out.set(await hashName(n, dk), n)));
  return out;
}

async function doSync() {
  const { token, user } = useCloud.getState();
  if (!token || !API_URL || !user) return;
  if (!dataKey) {
    if (useCloud.getState().privacy === null) useCloud.setState({ privacy: 'needs-signin' });
    return;
  }
  const dk = dataKey;
  useCloud.setState({ status: 'syncing', error: null });
  const seqAtStart = changeSeq;
  try {
    const startedAt = Date.now();
    const pushedAt = Number(LS.get(K.pushedAt)) || 0;
    const names = await pictureNames(dk);
    const serverName = new Map([...names].map(([h, n]) => [n, h]));
    const nameFor = async (n: string) => {
      let h = serverName.get(n);
      if (!h) {
        // a picture added while this sync was starting
        h = await hashName(n, dk);
        serverName.set(n, h);
        names.set(h, n);
      }
      return h;
    };

    // ---- gather local changes since the last successful push, encrypted ----
    const retry = rejectedKeys();
    const projects: RemoteProject[] = [];
    for (const p of await db.projects.toArray()) {
      if (!(p.updated > pushedAt || retry.has(`project:${p.id}`))) continue;
      projects.push({ id: p.id, data: await seal(JSON.stringify(p), dk), updated: p.updated, deleted: false });
    }
    const images: RemoteImage[] = [];
    for (const o of await db.overrides.toArray()) {
      const key = await nameFor(o.key);
      if (!(o.updated > pushedAt || retry.has(`image:${key}`))) continue;
      const src = await seal(JSON.stringify({ key: o.key, src: o.src, zoom: o.zoom, x: o.x, y: o.y }), dk);
      images.push({ key, src, zoom: 1, x: 50, y: 50, updated: o.updated, deleted: false });
    }
    for (const [k, at] of Object.entries(tombstones())) {
      if (at <= pushedAt) continue;
      const i = k.indexOf(':');
      const kind = k.slice(0, i);
      const id = k.slice(i + 1);
      if (kind === 'project') projects.push({ id, data: null, updated: at, deleted: true });
      else images.push({ key: await nameFor(id), src: null, zoom: 1, x: 50, y: 50, updated: at, deleted: true });
    }
    const sUpdated = Number(LS.get(K.settingsUpdated)) || 0;
    const settings = sUpdated > pushedAt && hooks ? { data: await seal(JSON.stringify(hooks.getSettings()), dk), updated: sUpdated } : null;

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
      await applyRemote(res, dk, names);
      cursor = res.cursor;
    }
    while (res?.more) {
      res = await post(token, { cursor });
      await applyRemote(res, dk, names);
      cursor = res.cursor;
    }

    LS.set(K.cursor, JSON.stringify(cursor));
    LS.set(K.pushedAt, String(startedAt));
    LS.set(K.rejected, JSON.stringify(rejected));
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
  return `Not synced: ${names.join(', ')}. Items that big can't sync. Usually it's a big uploaded picture inside it; re-uploading it will shrink it.`;
}

/**
 * Apply what the server sent. With a data key, only encrypted values are accepted; without one
 * (`dk` null) this is the one-time download of what an account synced before private sync.
 */
async function applyRemote(res: SyncResponse, dk: DataKey | null, names?: Map<string, string>) {
  const read = async (v: string): Promise<string | null> => {
    if (dk) return isSealed(v) ? open(v, dk) : null;
    return isSealed(v) ? null : v;
  };
  let changed = false;
  for (const r of res.projects) {
    const local = await db.projects.get(r.id);
    if (r.deleted) {
      if (local && local.updated <= r.updated) {
        await db.projects.delete(r.id);
        hooks?.onProjectChanged(null, r.id);
        changed = true;
      }
    } else if (r.data && (!local || r.updated > local.updated)) {
      try {
        const text = await read(r.data);
        if (!text) continue;
        const p = JSON.parse(text) as Project;
        if (p.id !== r.id) continue;
        await db.projects.put({ ...p, updated: r.updated });
        hooks?.onProjectChanged(p, r.id);
        changed = true;
      } catch {
        /* skip a row we can't read */
      }
    }
  }
  for (const r of res.images) {
    try {
      if (r.deleted) {
        const key = dk ? names?.get(r.key) : r.key;
        if (key) await applyRemoteRemoval(key, r.updated);
      } else if (r.src) {
        const text = await read(r.src);
        if (!text) continue;
        const o = dk ? (JSON.parse(text) as { key: string; src: string; zoom: number; x: number; y: number }) : { key: r.key, src: text, zoom: r.zoom, x: r.x, y: r.y };
        if (dk) names?.set(r.key, o.key);
        await applyRemoteOverride({ key: o.key, src: o.src, zoom: o.zoom ?? 1, x: o.x ?? 50, y: o.y ?? 50, updated: r.updated });
      }
      changed = true;
    } catch {
      /* skip a row we can't read */
    }
  }
  if (res.settings && hooks) {
    const local = Number(LS.get(K.settingsUpdated)) || 0;
    if (res.settings.updated > local) {
      try {
        const text = await read(res.settings.data);
        if (text) {
          hooks.applySettings(JSON.parse(text));
          LS.set(K.settingsUpdated, String(res.settings.updated));
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (changed) window.dispatchEvent(new Event('sw:remote-change'));
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
/** Bump to make every signed-in device re-upload and re-download everything once. */
const SYNC_VERSION = '3';

export function initCloud(h: Hooks) {
  hooks = h;
  if (started || !API_URL) return;
  started = true;
  if (!useCloud.getState().token) prepareSignIn();
  if (useCloud.getState().token && LS.get(K.version) !== SYNC_VERSION) {
    LS.set(K.pushedAt, null);
    LS.set(K.cursor, null);
    LS.set(K.version, SYNC_VERSION);
  }
  setChangeListener(() => {
    changeSeq++;
    if (useCloud.getState().token) useCloud.setState({ dirty: true });
    // a change saved while the app is being hidden goes up right away (timers may not run later)
    scheduleSync(document.visibilityState === 'hidden' ? 0 : 1200);
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
  const queued = afterInit;
  afterInit = [];
  if (queued.length) queued.forEach((f) => f());
  else {
    const { token, user } = useCloud.getState();
    if (token)
      void loadLocalKey(user).then((dk) => {
        dataKey = dataKey ?? dk;
        useCloud.setState({ privacy: dataKey ? 'ready' : 'needs-signin' });
        if (dataKey) void syncNow();
      });
  }
}
