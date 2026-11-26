import { create } from 'zustand';
import { API_URL } from '../config';
import { setChangeListener, tombstones } from './changes';
import { applyRemoteOverride, applyRemoteRemoval } from './images';
import { blobId, fromB64, hashName, isSealed, loadDataKey, open, openPicture, seal, sealPicture, toB64, type DataKey } from './crypto';
import type { Project } from '../editor/model';
import { overridesDb, projectsDb } from './picStore';
import { fetchWithin } from './net';

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

function loadAuth(): { token: string | null; user: string | null; at?: number } {
  try {
    const v = JSON.parse(LS.get(K.auth) || 'null');
    return v && typeof v.token === 'string' ? v : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
}


/* ---------------- state ---------------- */

/**
 * Sync status:
 *  - ready: this device holds the account's data key; sync runs
 *  - setup: getting the key from the server right after sign-in
 *  - locked: couldn't get the key (e.g. offline); retried on the next sync (see error)
 */
export type Privacy = 'ready' | 'setup' | 'locked';

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
  /** an owner account (sees the owner stats in Settings) */
  owner: boolean;
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
  owner: false,
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
  const r = await fetchWithin(
    `${API_URL}${path}`,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    30_000,
  );
  if (r.status === 401) {
    await signOut();
    throw new Error('Signed out. Please sign in again.');
  }
  const d = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d;
}

/**
 * After signing in: get this account's data key from the server (it keeps it locked with a
 * server secret and hands it only to the account's own signed-in devices). An account that
 * synced before encryption downloads the old readable copies first; the server then wipes them
 * and this device uploads everything again, encrypted.
 */
async function setupKey(token: string, user: string) {
  if (!dataKey) useCloud.setState({ privacy: 'setup', error: null });
  try {
    const local = await loadLocalKey(user);
    let r = await api<{ key: string | null; kid?: string }>(token, '/vault');
    if (!r.key) {
      await legacyPull(token);
      r = await api<{ key: string; kid: string }>(token, '/vault', { mode: 'create' });
    }
    const dk = await loadDataKey(fromB64(r.key!));
    adoptKey(user, dk, !local || local.kid !== dk.kid);
  } catch (e) {
    // keep the key this device already has, if any; try again on the next start or sign-in
    useCloud.setState({ privacy: dataKey ? 'ready' : 'locked', error: dataKey ? null : `Couldn't start syncing: ${(e as Error).message}. Pull down to retry, or sign in again.` });
  }
}

function adoptKey(user: string, dk: DataKey, fresh: boolean) {
  dataKey = dk;
  saveLocalKey(user, dk);
  void checkOwner();
  if (fresh) {
    // new to this device: download everything and upload everything (encrypted)
    LS.set(K.cursor, null);
    LS.set(K.pushedAt, null);
    LS.set(K.rejected, null);
  }
  useCloud.setState({ privacy: 'ready', error: null });
}

interface Me {
  name: string;
  owner?: boolean;
  /** the account's former Last.fm names (lowercase), if it was renamed */
  was?: string[];
}

/**
 * Owner accounts (set on the server) see the owner stats in Settings. Also notices a rename: this
 * device signed in under the old name, and the server now knows the account by its new one.
 */
async function checkOwner() {
  const { token, user } = useCloud.getState();
  if (!token || !API_URL) return;
  try {
    const me = await api<Me>(token, '/me');
    useCloud.setState({ owner: !!me.owner });
    if (user && me.name.toLowerCase() !== user.toLowerCase()) {
      LS.set(K.auth, JSON.stringify({ ...loadAuth(), user: me.name }));
      if (dataKey) saveLocalKey(me.name, dataKey);
      useCloud.setState({ user: me.name });
      onSignedIn?.(me.name); // the app carries on under the new name, keeping everything
    }
  } catch {
    /* try again next launch */
  }
}

/** The signed-in account's former Last.fm names (lowercase): [] if none, or if the server can't say. */
export async function formerNames(): Promise<string[]> {
  const { token } = useCloud.getState();
  if (!token || !API_URL) return [];
  try {
    return (await api<Me>(token, '/me')).was ?? [];
  } catch {
    return [];
  }
}

export interface AdminStats {
  now: number;
  accounts: { account: string; joined: number; last_seen: number | null; devices: number; private: number; wrappeds: number; pictures: number; bytes: number; was?: string[] }[];
  visitors: { name: string; first_seen: number; last_seen: number; visits: number }[];
}

/** Owner only: who uses Encore, how much they store, when they were last here. */
export async function fetchAdminStats(): Promise<AdminStats> {
  const { token } = useCloud.getState();
  if (!token) throw new Error('Not signed in');
  return api<AdminStats>(token, '/admin/stats');
}

/** Owner only: join a renamed account's old name onto its new one (data, devices, stats). */
export async function mergeRenamedAccount(from: string, to: string): Promise<void> {
  const { token } = useCloud.getState();
  if (!token) throw new Error('Not signed in');
  await api(token, '/admin/merge', { from, to });
}

/** Owner only: behind-the-scenes version notes, which live on the server, not in the public code. */
export async function fetchOwnerNotes(): Promise<{ version: string; text: string }[]> {
  const { token } = useCloud.getState();
  if (!token) return [];
  return (await api<{ notes: { version: string; text: string }[] }>(token, '/admin/notes')).notes;
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
    const r = await fetchWithin(`${API_URL}/health`, {}, 15_000);
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

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Running as an app added to the home screen. */
export function isHomeScreenApp() {
  return isStandalone();
}

function isStandalone() {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
}

/**
 * In the iPhone home-screen app, links open in the app's own little browser, where you aren't
 * logged in to Last.fm and Last.fm's login fails. Send Last.fm links to Safari instead (where
 * you're usually logged in, so editing scrobbles works). If Safari doesn't take it (older iOS),
 * the link opens the usual way.
 */
export function installLastfmLinksInSafari() {
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || !isIOS() || !isStandalone()) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      let url: URL;
      try {
        url = new URL(a.href);
      } catch {
        return;
      }
      if (url.protocol !== 'https:' || !/^(www\.)?last\.fm$/.test(url.hostname)) return;
      e.preventDefault();
      let left = false;
      const onHide = () => {
        if (document.visibilityState === 'hidden') left = true;
      };
      document.addEventListener('visibilitychange', onHide);
      location.href = `x-safari-${url.href}`;
      setTimeout(() => {
        document.removeEventListener('visibilitychange', onHide);
        if (!left && document.visibilityState === 'visible') window.open(url.href, '_blank', 'noreferrer');
      }, 1200);
    },
    true,
  );
}

/**
 * Start "Sign in with Last.fm". The app also registers a random pickup id and polls for the
 * session, so it gets signed in even if Last.fm's approval happens in a different browser view
 * (iOS opens links from home-screen apps in a separate view).
 */
export function startSignIn() {
  if (!API_URL) return;
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const back = location.origin + location.pathname;
  const url = `${API_URL}/auth/start?redirect=${encodeURIComponent(back)}&pending=${id}`;
  LS.set(PENDING, JSON.stringify({ id, at: Date.now(), url }));
  // remembers which tab started it: only that tab may clear the "waiting" marker on its way back
  try {
    sessionStorage.setItem('sw.signinHere', id);
  } catch {
    /* ignore */
  }
  useCloud.setState({ waiting: true });
  // Register the pickup id (and so this connection) first: the server only hands the sign-in back
  // by itself when the approval comes from the same connection. Plain text = no pre-flight, and
  // keepalive lets it finish even as this page leaves for Last.fm.
  void fetch(`${API_URL}/auth/begin`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ id }) }).catch(() => {});
  if (isStandalone()) {
    // iPhone home-screen apps open links in a little browser of their own, where Last.fm's login
    // form fails. Open the page in Safari itself instead (where you're usually logged in to
    // Last.fm); approving there signs this app in when you come back. Elsewhere: a normal pop-up.
    if (isIOS()) location.href = `x-safari-${url}`;
    else window.open(url, '_blank');
    void pollPending();
  } else location.href = url;
}

/** The sign-in link that's waiting to be approved, if any. */
function pendingUrl(): string | null {
  try {
    return (JSON.parse(LS.get(PENDING) || 'null') as { url?: string } | null)?.url ?? null;
  } catch {
    return null;
  }
}

/** Fallback when Safari didn't open (older iPhones): continue in the app's own little browser. */
export function signInHereInstead() {
  const url = pendingUrl();
  if (url) window.open(url, '_blank');
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
  try {
    const r = await fetchWithin(`${API_URL}/auth/poll?id=${p.id}`, {}, 15_000);
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

/** Work that has to wait until the app has wired up its sync hooks. */
let afterInit: (() => void)[] = [];

function adoptSession(token: string, user: string) {
  const prev = loadAuth();
  LS.set(K.auth, JSON.stringify({ token, user, at: Date.now() }));
  LS.set(K.version, SYNC_VERSION);
  if (!prev.user || prev.user.toLowerCase() !== user.toLowerCase()) {
    // a different account: start from scratch
    dataKey = null;
    LS.set(K.cursor, null);
    LS.set(K.pushedAt, null);
  }
  useCloud.setState({ token, user, error: null, waiting: false });
  const run = () => startSyncing(token, user);
  if (hooks) void run();
  else afterInit.push(() => void run());
}

/** Signed in: use this device's key right away if it has one, and check it with the server. */
async function startSyncing(token: string, user: string) {
  const local = dataKey ?? (await loadLocalKey(user));
  if (local) {
    dataKey = local;
    useCloud.setState({ privacy: 'ready' });
    void syncNow();
  }
  await setupKey(token, user);
  void checkOwner();
  if (dataKey) void syncNow();
}

/** If we just came back from "Sign in with Last.fm", store the session. */
export function consumeAuthRedirect(): { user?: string; error?: string; handoff?: boolean } | null {
  const h = location.hash;
  if (!h.startsWith('#auth=') && !h.startsWith('#auth_error=')) return null;
  const params = new URLSearchParams(h.slice(1));
  // the address (with the sign-in token in it) is replaced before anything else happens
  history.replaceState(null, '', location.pathname + location.search + '#/');
  const err = params.get('auth_error');
  if (err) return { error: err };
  const token = params.get('auth');
  const user = params.get('user');
  if (!token || !/^[0-9a-f]{64}$/.test(token) || !user) return { error: 'bad_response' };
  // Same tab that started it: done waiting. A different window (e.g. the sign-in view an iPhone
  // home-screen app opens, which can share its storage): leave the marker so the app collects
  // its own sign-in when you switch back.
  let startedHere = false;
  try {
    startedHere = !!sessionStorage.getItem('sw.signinHere');
    sessionStorage.removeItem('sw.signinHere');
  } catch {
    /* ignore */
  }
  // Sign-in started somewhere else (the iPhone home-screen app, which collects it by itself) and
  // finished here: say "go back" instead of opening a second Encore. If the server held the pickup
  // (the approval came from a different connection), this page asks before releasing it.
  const confirm = params.get('confirm');
  const needsConfirm = !!confirm && /^[0-9a-f]{32}$/.test(confirm);
  if (!startedHere && (needsConfirm || (isIOS() && !isStandalone()))) {
    handoff = { token, user, confirm: needsConfirm ? confirm : null };
    return { user, handoff: true };
  }
  if (startedHere) LS.set(PENDING, null);
  adoptSession(token, user);
  return { user };
}

let handoff: { token: string; user: string; confirm: string | null } | null = null;

/** The "go back to the app" page has to ask before the app gets signed in. */
export const handoffNeedsConfirm = () => !!handoff?.confirm;

/** "Yes, that was me": release the sign-in to the app that's waiting for it. */
export async function confirmHandoff(): Promise<void> {
  if (!handoff?.confirm || !API_URL) return;
  const r = await fetchWithin(`${API_URL}/auth/confirm`, { method: 'POST', headers: { Authorization: `Bearer ${handoff.token}`, 'Content-Type': 'text/plain' }, body: JSON.stringify({ id: handoff.confirm }) });
  if (!r.ok) throw new Error(r.status === 410 ? 'This sign-in expired. Start it again from the app.' : 'Couldn’t reach Encore. Try again.');
  handoff.confirm = null;
}

/** On the "go back to the app" page: use Encore here in this browser instead. */
export function continueSignInHere() {
  if (!handoff) return;
  try {
    sessionStorage.setItem('sw.signinHere', '1');
  } catch {
    /* ignore */
  }
  location.replace(`${location.pathname}${location.search}#auth=${handoff.token}&user=${encodeURIComponent(handoff.user)}`);
  location.reload();
}

/** Delete everything the server holds for this account, then sign out here. Local data stays. */
export async function deleteAccountData() {
  const { token } = useCloud.getState();
  if (!token) return;
  await api(token, '/account/delete', {});
  await signOut('Your synced data was deleted from Encore’s server. Sign in again any time to start syncing fresh.');
}

let onSignedOut: ((why: string) => void) | null = null;
/** The app sends anyone who gets signed out back to the start screen (so they sign in again). */
export function setOnSignedOut(fn: (why: string) => void) {
  onSignedOut = fn;
}

export async function signOut(why = "You've been signed out. Sign in again to keep your wrappeds, pictures and settings syncing.") {
  const { token } = useCloud.getState();
  if (token && API_URL) fetch(`${API_URL}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  LS.set(K.auth, null);
  LS.set(K.cursor, null);
  LS.set(K.pushedAt, null);
  LS.set(K.rejected, null);
  LS.set(K.key, null);
  dataKey = null;
  useCloud.setState({ token: null, user: null, status: 'idle', error: null, dirty: false, privacy: null, owner: false });
  if (token) onSignedOut?.(why);
}

/* ---------------- sync ---------------- */

interface RemoteProject {
  id: string;
  data: string | null;
  updated: number;
  deleted: boolean;
  refs?: string[];
}
interface RemoteImage {
  refs?: string[];
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
  // (a page of synced wrappeds can be several MB: a minute, not seconds)
  const r = await fetchWithin(
    `${API_URL}/sync`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    60_000,
  );
  if (r.status === 401) {
    await signOut();
    throw new Error('Signed out. Please sign in again.');
  }
  if (!r.ok) throw new Error(`Sync failed (${r.status})`);
  return r.json();
}

/* ---------------- picture store ---------------- */

/**
 * Pictures travel separately from the wrapped / custom picture that uses them: as raw encrypted
 * bytes (a third smaller than the text form) and once per account, however many places use them.
 * On this device nothing changes: wrappeds and pictures keep their pictures inline.
 */
const DATA_URL = /data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)/g;
const PICTURE_REF = /encore-blob:(b_[A-Za-z0-9_-]{24})/g;
interface Picture {
  mime: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** Swap every embedded picture for a reference; collects the pictures in `out`. */
async function liftPictures(text: string, dk: DataKey, out: Map<string, Picture>): Promise<{ text: string; refs: string[] }> {
  const parts: string[] = [];
  const refs = new Set<string>();
  let last = 0;
  for (const m of text.matchAll(DATA_URL)) {
    const bytes = fromB64(m[2]);
    const id = await blobId(bytes, dk);
    out.set(id, { mime: m[1], bytes });
    refs.add(id);
    parts.push(text.slice(last, m.index), `encore-blob:${id}`);
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return { text: parts.join(''), refs: [...refs] };
}

/** Upload the pictures the server doesn't have yet (a few at a time). */
async function uploadPictures(token: string, pics: Map<string, Picture>, dk: DataKey) {
  const ids = [...pics.keys()];
  for (let i = 0; i < ids.length; i += 400) {
    const { missing } = await api<{ missing: string[] }>(token, '/blobs/missing', { ids: ids.slice(i, i + 400) });
    let next = 0;
    const worker = async () => {
      while (next < missing.length) {
        const id = missing[next++];
        const p = pics.get(id)!;
        const r = await fetchWithin(
          `${API_URL}/blob/${id}`,
          {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
            body: await sealPicture(p.mime, p.bytes, dk),
          },
          120_000,
        );
        if (!r.ok) throw new Error(`Picture upload failed (${r.status})`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }
}

/** Put the real pictures back into a downloaded wrapped / custom picture. */
async function restorePictures(text: string, token: string, dk: DataKey, cache: Map<string, Promise<string>>): Promise<string> {
  const ids = [...new Set([...text.matchAll(PICTURE_REF)].map((m) => m[1]))];
  if (!ids.length) return text;
  const urls = new Map<string, string>();
  for (const id of ids) {
    let p = cache.get(id);
    if (!p) {
      p = (async () => {
        const r = await fetchWithin(`${API_URL}/blob/${id}`, { headers: { Authorization: `Bearer ${token}` } }, 120_000);
        if (!r.ok) throw new Error(`Picture download failed (${r.status})`);
        return openPicture(new Uint8Array(await r.arrayBuffer()), dk);
      })();
      cache.set(id, p);
    }
    urls.set(id, await p);
  }
  return text.replace(PICTURE_REF, (_, id: string) => urls.get(id)!);
}

/** Server names of pictures -> their real names (hashed names can't be turned back otherwise). */
async function pictureNames(dk: DataKey): Promise<Map<string, string>> {
  const names = new Set<string>(await overridesDb.keys());
  for (const k of Object.keys(tombstones())) if (k.startsWith('image:')) names.add(k.slice(6));
  const out = new Map<string, string>();
  await Promise.all([...names].map(async (n) => out.set(await hashName(n, dk), n)));
  return out;
}

async function doSync() {
  const { token, user } = useCloud.getState();
  if (!token || !API_URL || !user) return;
  if (!dataKey) {
    // the key didn't arrive earlier (offline?): try again; otherwise it's still being set up
    if (useCloud.getState().privacy === 'locked') await setupKey(token, user);
    if (!dataKey) return;
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
    const pics = new Map<string, Picture>();
    const projects: RemoteProject[] = [];
    for (const p of await projectsDb.all()) {
      if (!(p.updated > pushedAt || retry.has(`project:${p.id}`))) continue;
      const lifted = await liftPictures(JSON.stringify(p), dk, pics);
      projects.push({ id: p.id, data: await seal(lifted.text, dk), updated: p.updated, deleted: false, refs: lifted.refs });
    }
    const images: RemoteImage[] = [];
    for (const o of await overridesDb.all()) {
      const key = await nameFor(o.key);
      if (!(o.updated > pushedAt || retry.has(`image:${key}`))) continue;
      const lifted = await liftPictures(JSON.stringify({ key: o.key, src: o.src, zoom: o.zoom, x: o.x, y: o.y }), dk, pics);
      images.push({ key, src: await seal(lifted.text, dk), zoom: 1, x: 50, y: 50, updated: o.updated, deleted: false, refs: lifted.refs });
    }
    // the pictures go up first: the server only accepts items whose pictures it already has
    await uploadPictures(token, pics, dk);
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
      await applyRemote(res, dk, names, token);
      cursor = res.cursor;
    }
    while (res?.more) {
      res = await post(token, { cursor });
      await applyRemote(res, dk, names, token);
      cursor = res.cursor;
    }

    LS.set(K.cursor, JSON.stringify(cursor));
    LS.set(K.pushedAt, String(startedAt));
    LS.set(K.rejected, JSON.stringify(rejected));
    LS.set('sw.cloud.lastSync', String(Date.now()));
    window.dispatchEvent(new Event('sw:synced'));
    useCloud.setState({
      status: 'idle',
      dirty: changeSeq !== seqAtStart,
      lastSync: Date.now(),
      error: rejected.length ? await describeRejected(rejected, sizes) : null,
    });
  } catch (e) {
    useCloud.setState({ status: 'error', error: (e as Error).message });
    window.dispatchEvent(new Event('sw:synced'));
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
      const p = await projectsDb.get(id);
      names.push(`“${p?.name ?? 'a wrapped'}” (${mb(sizes.get(k) ?? 0)})`);
    } else names.push(`a picture (${mb(sizes.get(k) ?? 0)})`);
  }
  const big = keys.some((k) => (sizes.get(k) ?? 0) > 1_500_000);
  return big
    ? `Not synced: ${names.join(', ')}. Items that big can't sync. Usually it's a big uploaded picture inside it; re-uploading it will shrink it.`
    : `Not synced yet: ${names.join(', ')}. Trying again on the next sync.`;
}

/**
 * Apply what the server sent. With a data key, only encrypted values are accepted; without one
 * (`dk` null) this is the one-time download of what an account synced before private sync.
 */
async function applyRemote(res: SyncResponse, dk: DataKey | null, names?: Map<string, string>, token?: string) {
  const pictures = new Map<string, Promise<string>>();
  const read = async (v: string): Promise<string | null> => {
    if (dk) {
      if (!isSealed(v)) return null;
      const text = await open(v, dk);
      return token ? restorePictures(text, token, dk, pictures) : text;
    }
    return isSealed(v) ? null : v;
  };
  let changed = false;
  for (const r of res.projects) {
    const local = await projectsDb.get(r.id);
    if (r.deleted) {
      if (local && local.updated <= r.updated) {
        await projectsDb.delete(r.id);
        hooks?.onProjectChanged(null, r.id);
        changed = true;
      }
    } else if (r.data && (!local || r.updated > local.updated)) {
      try {
        const text = await read(r.data);
        if (!text) continue;
        const p = JSON.parse(text) as Project;
        if (p.id !== r.id) continue;
        await projectsDb.put({ ...p, updated: r.updated });
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

/** Storage says we're signed in with a different session than this page is using. */
function signedInElsewhere() {
  const saved = loadAuth().token;
  return !!saved && saved !== useCloud.getState().token;
}

/** That other window has finished unlocking private sync (its key is saved for this account). */
function keySavedElsewhere() {
  try {
    return JSON.parse(LS.get(K.key) || 'null')?.user?.toLowerCase() === loadAuth().user?.toLowerCase();
  } catch {
    return false;
  }
}

let started = false;
/** Bump to make every signed-in device re-upload and re-download everything once. */
const SYNC_VERSION = '4'; // 4: pictures move to the picture store (one full re-upload)

export function initCloud(h: Hooks) {
  hooks = h;
  if (started || !API_URL) return;
  started = true;
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
    if (document.visibilityState !== 'visible') return;
    if (signedInElsewhere() && keySavedElsewhere()) return location.reload();
    if (LS.get(PENDING)) void pollPending();
  });
  // another window sharing this app's storage signed in (once it has finished setting up) or out
  window.addEventListener('storage', (e) => {
    if (e.key === K.key && e.newValue && signedInElsewhere()) location.reload();
    else if (e.key === K.auth && !e.newValue && useCloud.getState().token) location.reload();
  });
  if (LS.get(PENDING)) void pollPending();
  void checkHealth();
  const queued = afterInit;
  afterInit = [];
  if (queued.length) queued.forEach((f) => f());
  else {
    const { token, user } = useCloud.getState();
    if (token && user) void startSyncing(token, user);
  }
}
