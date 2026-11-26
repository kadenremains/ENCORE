import { md5 } from './md5';

/**
 * Encore API (Cloudflare Worker + D1)
 *  - GET  /health            which secrets are configured
 *  - GET  /lastfm?...        read-only Last.fm relay (adds the API key server-side)
 *  - GET  /auth/start        begin "Sign in with Last.fm"
 *  - GET  /auth/callback     Last.fm redirects here; we create a session and bounce back to the site
 *  - GET  /auth/poll         a waiting app picks up its session (sign-in finished in another browser view)
 *  - GET  /me                who am I
 *  - GET/POST /vault         the account's data key, for its own signed-in devices
 *  - POST /sync              push local changes, pull remote changes (wrappeds, images, settings)
 *  - POST /account/delete   delete everything stored for the signed-in account
 *  - POST /logout
 *  - GET  /art?type=&q=      artwork search (Deezer), so the app never runs third-party code
 *  - POST /blobs/missing, GET/PUT /blob/<id>   the encrypted picture store
 *  - POST /auth/begin        the home-screen app registers its sign-in pickup id (and connection)
 *  - POST /auth/confirm      the approving browser releases a pickup that came from another connection
 *  - GET  /admin/stats       owner-only usage numbers
 *  - GET  /admin/notes       owner-only behind-the-scenes version notes (kept in the database, not in this repo)
 *  - POST /admin/merge       owner-only: join a renamed Last.fm account's old name onto its new one
 *
 * Privacy: synced wrappeds, pictures and settings are encrypted in the browser before upload
 * ("e1:" values, picture names hashed to "h:" keys). Each account's key is stored locked with
 * VAULT_KEY, a Worker secret kept outside the database. So the database on its own holds
 * usernames and unreadable data; only this server, for that account's own signed-in devices,
 * unlocks the key.
 */

export interface Env {
  DB: D1Database;
  LASTFM_API_KEY?: string;
  LASTFM_SECRET?: string;
  ALLOWED_ORIGINS: string;
  /** Last.fm usernames (lowercase, comma separated) that can see the owner stats and whose data key is kept readable for the owner */
  OWNERS?: string;
  /** Worker secret (base64, 32 bytes): locks every account's data key. Never in the database or this repo. */
  VAULT_KEY?: string;
  /** Last.fm's API address; unset = the real one (a local test points it at a stand-in) */
  LASTFM_API?: string;
}

const isOwner = (user: string, env: Env) =>
  (env.OWNERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(user.toLowerCase());

const lastfm = (env: Env) => env.LASTFM_API || 'https://ws.audioscrobbler.com/2.0/';
const READ_METHODS = new Set([
  'user.getinfo',
  'user.getrecenttracks',
  'user.gettopartists',
  'user.gettopalbums',
  'user.gettoptracks',
  'user.getweeklychartlist',
  'user.getfriends', // who someone follows (Compare: your Last.fm friends)
  'artist.getinfo',
  'album.getinfo',
  'track.getinfo',
]);
const CHUNK = 1_800_000; // D1 rows top out at 2 MB, so bigger values are split across rows
const MAX_ITEM = 40_000_000; // sanity cap per wrapped / picture
const CHUNKED = '__chunks__:';
const PAGE_BYTES = 8_000_000; // keep each sync response comfortably small

interface Keys {
  key?: string;
  secret?: string;
}
let keyCache: { at: number; keys: Keys } | null = null;

/** Last.fm credentials: Worker secrets if set, otherwise the ones saved in the config table. */
async function getKeys(env: Env): Promise<Keys> {
  if (env.LASTFM_API_KEY && env.LASTFM_SECRET) return { key: env.LASTFM_API_KEY, secret: env.LASTFM_SECRET };
  if (keyCache && Date.now() - keyCache.at < 60_000) return keyCache.keys;
  const rows = await env.DB.prepare("SELECT k, v FROM config WHERE k IN ('lastfm_api_key', 'lastfm_secret')").all<{ k: string; v: string }>();
  const m = Object.fromEntries(rows.results.map((r) => [r.k, r.v]));
  const keys = { key: env.LASTFM_API_KEY || m.lastfm_api_key, secret: env.LASTFM_SECRET || m.lastfm_secret };
  keyCache = { at: Date.now(), keys };
  return keys;
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

/** Requests to a Worker running on this computer (wrangler dev), not the live one. */
const isLocal = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1';

function originAllowed(origin: string, env: Env, url: URL) {
  if (!origin) return false;
  // a local copy of the app only talks to a local copy of the Worker
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return isLocal(url);
  return env.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .includes(origin);
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  if (!originAllowed(origin, env, new URL(req.url))) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res: Response;
    try {
      switch (url.pathname) {
        case '/':
        case '/health': {
          const k = await getKeys(env);
          res = json({ ok: true, service: 'encore-api', lastfm: !!k.key, signIn: !!(k.key && k.secret) });
          break;
        }
        case '/art':
          res = Object.keys(cors).length ? await art(req, url) : json({ error: 'origin not allowed' }, 403);
          break;
        case '/lastfm':
          res = Object.keys(cors).length ? await lastfmRelay(req, url, env, ctx) : json({ error: 'origin not allowed' }, 403);
          break;
        case '/auth/start':
          return await authStart(url, env);
        case '/auth/callback':
          return await authCallback(req, url, env);
        case '/auth/begin':
          res = req.method === 'POST' && Object.keys(cors).length ? await authBegin(req, env) : json({ error: 'not allowed' }, 405);
          break;
        case '/auth/confirm':
          res = req.method === 'POST' && Object.keys(cors).length ? await authConfirm(req, env) : json({ error: 'not allowed' }, 405);
          break;
        case '/auth/poll':
          res = await authPoll(url, env);
          break;
        case '/me':
          res = await me(req, env);
          break;
        case '/vault':
          res = await vault(req, env);
          break;
        case '/admin/stats':
          res = await adminStats(req, env);
          break;
        case '/admin/notes':
          res = await adminNotes(req, env);
          break;
        case '/admin/merge':
          res = req.method === 'POST' ? await adminMerge(req, env) : json({ error: 'POST only' }, 405);
          break;
        case '/blobs/missing':
          res = req.method === 'POST' ? await blobsMissing(req, env) : json({ error: 'POST only' }, 405);
          break;
        case '/sync':
          res = req.method === 'POST' ? await sync(req, env) : json({ error: 'POST only' }, 405);
          break;
        case '/account/delete':
          res = req.method === 'POST' ? await deleteAccount(req, env) : json({ error: 'POST only' }, 405);
          break;
        case '/logout':
          res = await logout(req, env);
          break;
        default:
          res = url.pathname.startsWith('/blob/') ? await blob(req, url, env) : json({ error: 'not found' }, 404);
      }
    } catch (e) {
      // details go to our logs only; callers get a generic message (no internals leak out)
      console.error(JSON.stringify({ evt: 'error', path: url.pathname, message: (e as Error).message }));
      res = json({ error: 'server error' }, 500);
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    // standard hardening: no type sniffing, no referrers, nothing personal cached by proxies
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
    return new Response(res.body, { status: res.status, headers });
  },
};

/* ---------------- Last.fm relay ---------------- */

/**
 * Per-IP limit for the relay (in memory, per Worker instance, so it's approximate). Generous
 * enough for a first full history download; stops someone hammering Last.fm with our key.
 */
const buckets = new Map<string, { tokens: number; at: number }>();
function allow(ip: string, perSec = 12, burst = 120) {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: burst, at: now };
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSec);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  if (buckets.size > 5000) buckets.clear();
  return true;
}

/** Usernames looked up without signing in (only the name and when), at most one write per name per 10 min. */
const seenRecently = new Map<string, number>();
async function noteVisitor(name: string, env: Env) {
  const k = name.toLowerCase();
  const now = Date.now();
  if ((seenRecently.get(k) ?? 0) > now - 10 * 60_000) return;
  seenRecently.set(k, now);
  if (seenRecently.size > 5000) seenRecently.clear();
  await env.DB.prepare(
    'INSERT INTO visitors (name, display, first_seen, last_seen, visits) VALUES (?, ?, ?, ?, 1) ON CONFLICT(name) DO UPDATE SET last_seen = excluded.last_seen, display = excluded.display, visits = visitors.visits + 1',
  )
    .bind(k, name, now, now)
    .run();
}

async function lastfmRelay(req: Request, url: URL, env: Env, ctx?: ExecutionContext) {
  const { key } = await getKeys(env);
  if (!key) return json({ error: 'relay not configured', code: 'NO_KEY' }, 503);
  if (!allow(req.headers.get('CF-Connecting-IP') ?? 'unknown')) return json({ error: 29, message: 'Rate limit exceeded' }, 429);
  const params = new URLSearchParams(url.search);
  const method = (params.get('method') ?? '').toLowerCase();
  if (!READ_METHODS.has(method)) return json({ error: 'method not allowed' }, 400);
  // read-only: nothing signed or tied to a session ever goes through here
  for (const k of ['api_key', 'sk', 'api_sig', 'token']) params.delete(k);
  const who = params.get('user');
  if (who && (method === 'user.getinfo' || method === 'user.getrecenttracks') && /^[\w.-]{2,32}$/.test(who)) {
    const p = noteVisitor(who, env).catch(() => {});
    if (ctx) ctx.waitUntil(p);
  }
  params.set('api_key', key);
  params.set('format', 'json');
  const upstream = await fetch(`${lastfm(env)}?${params}`, { headers: { 'User-Agent': 'EncoreStats/1.0' } });
  return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': 'application/json' } });
}

/* ---------------- artwork search ---------------- */

/**
 * Deezer's search, fetched here instead of in the browser (Deezer has no CORS, and the old
 * workaround ran Deezer's script inside the app). Only names and picture links come back, and
 * only pictures from Deezer's image servers. Nothing is stored or logged.
 */
const DEEZER_IMG = /^https:\/\/(cdn-images|e-cdns-images)\.dzcdn\.net\//;
async function art(req: Request, url: URL) {
  if (!allow(req.headers.get('CF-Connecting-IP') ?? 'unknown', 8, 60)) return json({ error: 'slow down' }, 429);
  const type = url.searchParams.get('type') ?? '';
  const q = (url.searchParams.get('q') ?? '').slice(0, 200);
  if (!['artist', 'album', 'track'].includes(type) || !q.trim()) return json({ error: 'bad request' }, 400);
  const r = await fetch(`https://api.deezer.com/search/${type}?q=${encodeURIComponent(q)}&limit=5`, { headers: { 'User-Agent': 'EncoreStats/1.0' } });
  if (!r.ok) return json({ error: 'upstream' }, 502);
  type Hit = { name?: string; title?: string; picture_xl?: string; cover_xl?: string; artist?: { name?: string }; album?: { cover_xl?: string } };
  const body = (await r.json().catch(() => ({}))) as { data?: Hit[] };
  const pic = (u?: string) => (u && DEEZER_IMG.test(u) && !u.includes('/artist//') ? u : '');
  const data = (body.data ?? []).slice(0, 5).map((h) => ({
    name: String(h.name ?? h.title ?? ''),
    artist: String(h.artist?.name ?? ''),
    picture: pic(type === 'artist' ? h.picture_xl : type === 'album' ? h.cover_xl : h.album?.cover_xl),
  }));
  return new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } });
}

/* ---------------- auth ---------------- */

function safeRedirect(raw: string | null, env: Env, url: URL): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return originAllowed(u.origin, env, url) ? u.origin + u.pathname : null;
  } catch {
    return null;
  }
}

async function authStart(url: URL, env: Env) {
  const redirect = safeRedirect(url.searchParams.get('redirect'), env, url);
  if (!redirect) return json({ error: 'bad redirect' }, 400);
  const { key, secret } = await getKeys(env);
  if (!key || !secret) return Response.redirect(`${redirect}#auth_error=not_configured`, 302);
  // `pending` lets the app that started sign-in pick the session up itself, even when Last.fm's
  // approval happens in another browser view (iOS opens home-screen apps' links in one)
  const pending = url.searchParams.get('pending');
  const okPending = !!pending && /^[0-9a-f]{32}$/.test(pending);
  const cb = `${url.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}${okPending ? `&pending=${pending}` : ''}`;
  return Response.redirect(`https://www.last.fm/api/auth/?api_key=${key}&cb=${encodeURIComponent(cb)}`, 302);
}

function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function authCallback(req: Request, url: URL, env: Env) {
  const redirect = safeRedirect(url.searchParams.get('redirect'), env, url);
  if (!redirect) return json({ error: 'bad redirect' }, 400);
  const token = url.searchParams.get('token');
  const { key, secret } = await getKeys(env);
  if (!token || !key || !secret) return Response.redirect(`${redirect}#auth_error=missing_token`, 302);
  const sig = md5(`api_key${key}methodauth.getSessiontoken${token}${secret}`);
  const qs = new URLSearchParams({ method: 'auth.getSession', api_key: key, token, api_sig: sig, format: 'json' });
  const r = await fetch(`${lastfm(env)}?${qs}`, { headers: { 'User-Agent': 'EncoreStats/1.0' } });
  // only the username is used: Last.fm's session key is never kept or passed on
  const body = (await r.json().catch(() => ({}))) as { session?: { name: string }; error?: number; message?: string };
  if (!body.session?.name) return Response.redirect(`${redirect}#auth_error=${encodeURIComponent(body.message ?? 'lastfm_rejected')}`, 302);
  const name = body.session.name;
  const now = Date.now();
  const session = randomToken();
  const pending = url.searchParams.get('pending');
  // the same Last.fm account seen before under another name: everything moves to this one first
  const found = await lastfmRegistered(env, name);
  const registered = typeof found === 'number' ? found : null;
  const from = registered ? await renamedFrom(env, name.toLowerCase(), registered) : null;
  const stmts = [
    ...(from ? await mergeStatements(env, from, name) : []),
    env.DB.prepare(
      'INSERT INTO users (name, display, created, last_seen, registered) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET display = excluded.display, last_seen = excluded.last_seen, registered = COALESCE(excluded.registered, users.registered)',
    ).bind(name.toLowerCase(), name, now, now, registered),
    env.DB.prepare('INSERT INTO sessions (token, user, created, last_seen) VALUES (?, ?, ?, ?)').bind(session, name.toLowerCase(), now, now),
  ];
  if (from) console.log(JSON.stringify({ evt: 'account-renamed' }));
  let confirm = '';
  if (pending && /^[0-9a-f]{32}$/.test(pending)) {
    // A second session for the app that's waiting (each device context gets its own token). Whoever
    // started a sign-in gets the account that approves it, so a sign-in link someone else made could
    // hand them your account. It's only released by itself when the approval comes from the same
    // connection that started it (your own phone); otherwise the approving page asks you first.
    const begin = await env.DB.prepare('SELECT ip, created FROM auth_begin WHERE id = ?').bind(pending).first<{ ip: string; created: number }>();
    const ip = req.headers.get('CF-Connecting-IP') ?? '';
    const sameDevice = !!begin && !!ip && begin.ip === ip && begin.created > now - PICKUP_WINDOW;
    const waiting = randomToken();
    stmts.push(env.DB.prepare('INSERT INTO sessions (token, user, created, last_seen) VALUES (?, ?, ?, ?)').bind(waiting, name.toLowerCase(), now, now));
    stmts.push(env.DB.prepare('INSERT OR REPLACE INTO auth_pending (id, token, user, created, ready) VALUES (?, ?, ?, ?, ?)').bind(pending, waiting, name, now, sameDevice ? 1 : 0));
    stmts.push(env.DB.prepare('DELETE FROM auth_begin WHERE id = ?').bind(pending), ...dropExpiredPickups(env, now));
    if (!sameDevice) confirm = `&confirm=${pending}`;
  }
  await env.DB.batch(stmts);
  return Response.redirect(`${redirect}#auth=${session}&user=${encodeURIComponent(name)}${confirm}`, 302);
}

const PICKUP_WINDOW = 15 * 60_000;

/**
 * Sign-ins that were started but never finished or never picked up: the registration, the waiting
 * row, and the session that was made for an app that never collected it (it would otherwise stay
 * valid, and count as a device in the owner stats).
 */
const dropExpiredPickups = (env: Env, now: number) => {
  const old = now - PICKUP_WINDOW;
  return [
    env.DB.prepare('DELETE FROM sessions WHERE token IN (SELECT token FROM auth_pending WHERE created < ? AND token IS NOT NULL)').bind(old),
    env.DB.prepare('DELETE FROM auth_pending WHERE created < ?').bind(old),
    env.DB.prepare('DELETE FROM auth_begin WHERE created < ?').bind(old),
  ];
};

/** The app registers its pickup id (and so its connection) before sending you to Last.fm. */
async function authBegin(req: Request, env: Env) {
  const ip = req.headers.get('CF-Connecting-IP') ?? '';
  if (!allow(`begin:${ip}`, 0.5, 10)) return json({ error: 'slow down' }, 429);
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  if (!/^[0-9a-f]{32}$/.test(id)) return json({ error: 'bad id' }, 400);
  const now = Date.now();
  await env.DB.batch([
    // OR IGNORE: an id, once registered, keeps the connection it was registered from
    env.DB.prepare('INSERT OR IGNORE INTO auth_begin (id, ip, created) VALUES (?, ?, ?)').bind(id, ip, now),
    ...dropExpiredPickups(env, now),
  ]);
  return json({ ok: true });
}

/**
 * The approving browser (it alone received this sign-in's session) says yes: release the waiting
 * app's session. Only for the same account, within the pickup window.
 */
async function authConfirm(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  if (!/^[0-9a-f]{32}$/.test(id)) return json({ error: 'bad id' }, 400);
  const r = await env.DB.prepare('UPDATE auth_pending SET ready = 1 WHERE id = ? AND lower(user) = ? AND token IS NOT NULL AND created > ?').bind(id, user, Date.now() - PICKUP_WINDOW).run();
  return r.meta.changes ? json({ ok: true }) : json({ error: 'expired' }, 410);
}

/** The app polls this with the random id it started sign-in with; one-time pickup, 15 min window. */
async function authPoll(url: URL, env: Env) {
  const id = url.searchParams.get('id') ?? '';
  if (!/^[0-9a-f]{32}$/.test(id)) return json({ error: 'bad id' }, 400);
  const now = Date.now();
  const row = await env.DB.prepare('SELECT token, user, created FROM auth_pending WHERE id = ? AND token IS NOT NULL AND ready = 1').bind(id).first<{ token: string; user: string; created: number }>();
  if (!row) return json({ pending: true });
  // too late: dropped along with its session, like any other expired sign-in
  if (row.created < now - PICKUP_WINDOW) {
    await env.DB.batch(dropExpiredPickups(env, now));
    return json({ pending: true });
  }
  // collected: the session now belongs to the app, only the waiting row goes
  await env.DB.prepare('DELETE FROM auth_pending WHERE id = ?').bind(id).run();
  return json({ token: row.token, user: row.user });
}

/* ---------------- picture store ---------------- */

/**
 * Pictures are stored once per account as encrypted binary (no text encoding), named by a keyed
 * hash of their content: the same picture in several wrappeds is kept once, and the name says
 * nothing about what's in it. Wrappeds and custom pictures point at them ("refs").
 */
const BLOB_ID = /^b_[A-Za-z0-9_-]{24}$/;
const BLOB_CHUNK = 1_900_000; // D1 rows top out at 2 MB
const MAX_BLOB = 25_000_000;

async function haveBlobs(env: Env, user: string, ids: string[]) {
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const row = await env.DB.prepare(`SELECT count(*) AS n FROM blobs WHERE user = ? AND seq = 0 AND id IN (${part.map(() => '?').join(',')})`)
      .bind(user, ...part)
      .first<{ n: number }>();
    if ((row?.n ?? 0) !== part.length) return false;
  }
  return true;
}

async function collectBlobs(env: Env, user: string) {
  await env.DB.prepare(
    `DELETE FROM blobs WHERE user = ?1 AND created < ?2 AND id NOT IN (
       SELECT j.value FROM projects p, json_each(p.refs) j WHERE p.user = ?1 AND p.refs IS NOT NULL
       UNION SELECT j.value FROM images i, json_each(i.refs) j WHERE i.user = ?1 AND i.refs IS NOT NULL)`,
  )
    .bind(user, Date.now() - 3600_000)
    .run();
}

/** POST { ids } -> { missing }: which of these pictures this account hasn't uploaded yet. */
async function blobsMissing(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === 'string' && BLOB_ID.test(x)))].slice(0, 500) : [];
  const have = new Set<string>();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const rows = await env.DB.prepare(`SELECT id FROM blobs WHERE user = ? AND seq = 0 AND id IN (${part.map(() => '?').join(',')})`)
      .bind(user, ...part)
      .all<{ id: string }>();
    rows.results.forEach((r) => have.add(r.id));
  }
  return json({ missing: ids.filter((id) => !have.has(id)) });
}

/** PUT /blob/<id> (raw encrypted bytes) and GET /blob/<id>. */
async function blob(req: Request, url: URL, env: Env) {
  const id = url.pathname.slice('/blob/'.length);
  if (!BLOB_ID.test(id)) return json({ error: 'not found' }, 404);
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (req.method === 'GET') {
    const rows = await env.DB.prepare('SELECT data FROM blobs WHERE user = ? AND id = ? ORDER BY seq').bind(user, id).all<{ data: ArrayBuffer }>();
    if (!rows.results.length) return json({ error: 'not found' }, 404);
    const parts = rows.results.map((r) => new Uint8Array(r.data));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    // named by content, so it never changes: let the browser keep it
    return new Response(out, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=31536000, immutable' } });
  }
  if (req.method !== 'PUT') return json({ error: 'GET or PUT' }, 405);
  // only private (encrypted) accounts use the picture store
  if (!(await env.DB.prepare('SELECT 1 AS x FROM vault WHERE user = ?').bind(user).first())) return json({ error: 'not private' }, 403);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BLOB) return json({ error: 'bad size' }, 413);
  if (await env.DB.prepare('SELECT 1 AS x FROM blobs WHERE user = ? AND id = ? AND seq = 0').bind(user, id).first()) return json({ ok: true });
  const now = Date.now();
  const stmts = [env.DB.prepare('DELETE FROM blobs WHERE user = ? AND id = ?').bind(user, id)];
  for (let i = 0, seq = 0; i < bytes.length; i += BLOB_CHUNK, seq++) {
    stmts.push(env.DB.prepare('INSERT INTO blobs (user, id, seq, data, size, created) VALUES (?, ?, ?, ?, ?, ?)').bind(user, id, seq, bytes.subarray(i, i + BLOB_CHUNK), bytes.length, now));
  }
  await env.DB.batch(stmts);
  return json({ ok: true });
}

/* ---------------- owner stats ---------------- */

/** Everyone who uses Encore: accounts (usage, size, last seen) and usernames looked up without signing in. Owners only. */
async function adminStats(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (!isOwner(user, env)) return json({ error: 'not allowed' }, 403);
  const [accounts, visitors, renamed] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM account_stats ORDER BY last_seen DESC'),
    env.DB.prepare('SELECT display AS name, first_seen, last_seen, visits FROM visitors ORDER BY last_seen DESC LIMIT 500'),
    env.DB.prepare('SELECT display, was FROM users WHERE was IS NOT NULL'),
  ]);
  // the names a renamed account had before, next to it
  const was = new Map((renamed.results as { display: string; was: string }[]).map((r) => [r.display, formerNames(r.was)]));
  return json({ accounts: (accounts.results as { account: string }[]).map((a) => ({ ...a, was: was.get(a.account) ?? [] })), visitors: visitors.results, now: Date.now() });
}

/** Behind-the-scenes version notes. They live only in the database so they aren't public. Owners only. */
async function adminNotes(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (!isOwner(user, env)) return json({ error: 'not allowed' }, 403);
  const rows = await env.DB.prepare('SELECT version, text FROM owner_notes ORDER BY version, seq').all<{ version: string; text: string }>();
  return json({ notes: rows.results });
}

/* ---------------- vault: each account's data key ---------------- */

const hexOf = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromB64 = (v: string) => Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

async function vaultLock(env: Env) {
  if (!env.VAULT_KEY) throw new Error('VAULT_KEY is not set');
  return crypto.subtle.importKey('raw', fromB64(env.VAULT_KEY), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function lockKey(env: Env, raw: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await vaultLock(env), raw));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return toB64(out);
}
async function unlockKey(env: Env, locked: string) {
  const b = fromB64(locked);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, await vaultLock(env), b.subarray(12)));
}

/**
 * The account's data key (synced data is encrypted with it in the browser). It's stored locked
 * with VAULT_KEY, a Worker secret kept outside the database, and handed only to the account's
 * own signed-in devices. GET: { key, kid }, or { key: null } if the account has none yet.
 * POST { mode: 'create' }: make one. The first time, older unencrypted copies are wiped (the
 * device has downloaded them first and re-uploads them encrypted).
 */
async function vault(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const owner = isOwner(user, env);
  const row = await env.DB.prepare('SELECT kid, skey, escrow FROM vault WHERE user = ?').bind(user).first<{ kid: string; skey: string | null; escrow: string | null }>();
  let raw: Uint8Array | null = null;
  if (row?.skey) raw = await unlockKey(env, row.skey);
  else if (row?.escrow) {
    // from the earlier design (locked with a Last.fm session key): moved over using the owner's copy
    raw = fromB64(row.escrow);
    await env.DB.prepare('UPDATE vault SET skey = ?, updated = ? WHERE user = ?').bind(await lockKey(env, raw), Date.now(), user).run();
  }
  if (raw && row) {
    if (owner && !row.escrow) await env.DB.prepare('UPDATE vault SET escrow = ? WHERE user = ?').bind(toB64(raw), user).run();
    return json({ key: toB64(raw), kid: row.kid });
  }
  if (req.method === 'GET') return json({ key: null });
  if (req.method !== 'POST') return json({ error: 'GET or POST' }, 405);
  const body = (await req.json().catch(() => ({}))) as { mode?: string };
  if (body.mode !== 'create') return json({ error: 'bad mode' }, 400);
  const fresh = crypto.getRandomValues(new Uint8Array(32));
  const kid = hexOf(await crypto.subtle.digest('SHA-256', fresh)).slice(0, 32);
  const now = Date.now();
  await env.DB.batch([
    // (a vault from the earlier design that can't be opened is replaced)
    env.DB.prepare('DELETE FROM vault WHERE user = ?').bind(user),
    env.DB.prepare('INSERT INTO vault (user, wrapped, kid, updated, escrow, skey) VALUES (?, ?, ?, ?, ?, ?)').bind(user, '', kid, now, owner ? toB64(fresh) : null, await lockKey(env, fresh)),
    env.DB.prepare('DELETE FROM projects WHERE user = ?').bind(user),
    env.DB.prepare('DELETE FROM images WHERE user = ?').bind(user),
    env.DB.prepare('DELETE FROM settings WHERE user = ?').bind(user),
    env.DB.prepare('DELETE FROM chunks WHERE user = ?').bind(user),
    env.DB.prepare('DELETE FROM blobs WHERE user = ?').bind(user),
  ]);
  return json({ key: toB64(fresh), kid, created: true });
}

const SESSION_IDLE = 180 * 86400_000; // a device unused for 6 months has to sign in again
const TOUCH_EVERY = 15 * 60_000;

async function userFor(req: Request, env: Env): Promise<string | null> {
  const m = (req.headers.get('Authorization') ?? '').match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return null;
  const row = await env.DB.prepare('SELECT user, created, last_seen FROM sessions WHERE token = ?').bind(m[1]).first<{ user: string; created: number; last_seen: number }>();
  if (!row) return null;
  const now = Date.now();
  const last = Math.max(row.last_seen ?? 0, row.created ?? 0);
  if (last < now - SESSION_IDLE) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(m[1]).run();
    return null;
  }
  // "last used" for the owner stats, written at most every 15 minutes per device
  if ((row.last_seen ?? 0) < now - TOUCH_EVERY) {
    await env.DB.batch([
      env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?').bind(now, m[1]),
      env.DB.prepare('UPDATE users SET last_seen = ? WHERE name = ?').bind(now, row.user),
    ]);
  }
  return row.user;
}

/**
 * Who am I: the account's name (the current one, after a rename), whether it's an owner, and the
 * names it had before (so a device holding data under an old name keeps it).
 */
async function me(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT display, registered, was FROM users WHERE name = ?').bind(user).first<{ display: string; registered: number | null; was: string | null }>();
  // accounts from before creation times were kept: fill it in once, so a later rename is recognised
  if (row && !row.registered) {
    const registered = await lastfmRegistered(env, row.display ?? user);
    if (typeof registered === 'number') await env.DB.prepare('UPDATE users SET registered = ? WHERE name = ?').bind(registered, user).run();
  }
  return json({ name: row?.display ?? user, owner: isOwner(user, env), was: formerNames(row?.was ?? null) });
}

/* ---------------- renamed Last.fm accounts ---------------- */

/**
 * Last.fm lets people change their username, and Encore knows accounts by name. What doesn't change
 * is the second the Last.fm account was created, so that's kept for every account: someone signing
 * in under a new name with the same creation time as a known account, whose old name Last.fm no
 * longer knows, is that account renamed. (Signing in proves the new name; nobody can choose their
 * creation time; and a different person who happened to sign up in the same second still has their
 * old name, so they're never mistaken for each other.)
 *
 * lastfmRegistered: when this Last.fm account was created (unix seconds); 'missing' if Last.fm has
 * no such user; null if it can't say right now.
 */
async function lastfmRegistered(env: Env, name: string): Promise<number | 'missing' | null> {
  const { key } = await getKeys(env);
  if (!key) return null;
  try {
    const qs = new URLSearchParams({ method: 'user.getinfo', user: name, api_key: key, format: 'json' });
    const r = await fetch(`${lastfm(env)}?${qs}`, { headers: { 'User-Agent': 'EncoreStats/1.0' } });
    const b = (await r.json()) as { user?: { registered?: { unixtime?: string } }; error?: number; message?: string };
    if (b.error === 6 && /not found/i.test(b.message ?? '')) return 'missing';
    const registered = Number(b.user?.registered?.unixtime);
    // (a struggling Last.fm has answered with zeros: only a real date counts)
    return registered > 1_000_000_000 ? registered : null;
  } catch {
    return null;
  }
}

/** The account (by its stored name) that `name` used to be, if it was renamed. */
async function renamedFrom(env: Env, name: string, registered: number): Promise<string | null> {
  const rows = await env.DB.prepare('SELECT name, display FROM users WHERE registered = ? AND name != ?').bind(registered, name).all<{ name: string; display: string }>();
  for (const r of rows.results) if ((await lastfmRegistered(env, r.display ?? r.name)) === 'missing') return r.name;
  return null;
}

const formerNames = (was: string | null) => (was ? was.split(',').filter(Boolean) : []);

/** Everything the account stores that's encrypted with its data key. */
const DATA_TABLES = ['projects', 'images', 'settings', 'chunks', 'blobs', 'vault'] as const;

/**
 * Statements that join the account `from` onto `to` (its new name; `toDisplay` as Last.fm writes it):
 * synced data, signed-in devices, owner stats, and the old name noted. Synced data is encrypted with
 * one account's key, so the two can't be mixed: `from`'s moves over (key included) unless `to` already
 * synced something of its own, having been signed in under the new name first. Then `to`'s is the one
 * in use, and `from`'s copy, which no device could read any more, goes.
 */
async function mergeStatements(env: Env, from: string, toDisplay: string): Promise<D1PreparedStatement[]> {
  const to = toDisplay.toLowerCase();
  const count = (u: string) =>
    env.DB.prepare(
      'SELECT (SELECT count(*) FROM projects WHERE user = ?1 AND deleted = 0) + (SELECT count(*) FROM images WHERE user = ?1 AND deleted = 0) + (SELECT count(*) FROM settings WHERE user = ?1) + (SELECT count(*) FROM vault WHERE user = ?1) AS n',
    )
      .bind(u)
      .first<{ n: number }>()
      .then((r) => r?.n ?? 0);
  const user = (u: string) => env.DB.prepare('SELECT display, created, last_seen, registered, was FROM users WHERE name = ?').bind(u).first<{ display: string; created: number; last_seen: number; registered: number | null; was: string | null }>();
  const visitor = (u: string) => env.DB.prepare('SELECT display, first_seen, last_seen, visits FROM visitors WHERE name = ?').bind(u).first<{ display: string; first_seen: number; last_seen: number; visits: number }>();
  const [fromStores, toSynced, a, b, va, vb] = await Promise.all([
    count(from),
    // (the new name's own key alone, with nothing encrypted under it yet, doesn't count)
    count(to).then(async (n) => n - ((await env.DB.prepare('SELECT 1 AS x FROM vault WHERE user = ?').bind(to).first()) ? 1 : 0)),
    user(from),
    user(to),
    visitor(from),
    visitor(to),
  ]);
  const stmts = DATA_TABLES.flatMap((t) =>
    fromStores && !toSynced
      ? [env.DB.prepare(`DELETE FROM ${t} WHERE user = ?`).bind(to), env.DB.prepare(`UPDATE ${t} SET user = ? WHERE user = ?`).bind(to, from)]
      : [env.DB.prepare(`DELETE FROM ${t} WHERE user = ?`).bind(from)],
  );
  // devices signed in under the old name carry on under the new one
  stmts.push(env.DB.prepare('UPDATE sessions SET user = ? WHERE user = ?').bind(to, from), env.DB.prepare('UPDATE auth_pending SET user = ? WHERE lower(user) = ?').bind(toDisplay, from));
  const earliest = (x?: number | null, y?: number | null) => Math.min(x || Infinity, y || Infinity);
  const latest = (x?: number | null, y?: number | null) => Math.max(x ?? 0, y ?? 0);
  if (a || b) {
    // one account row, joined when the first of the two was, with the old name noted
    const was = [...new Set([...formerNames(b?.was ?? null), ...formerNames(a?.was ?? null), from])].filter((n) => n !== to).join(',');
    const created = earliest(a?.created, b?.created);
    stmts.push(
      env.DB.prepare('DELETE FROM users WHERE name = ?').bind(from),
      env.DB.prepare(
        'INSERT INTO users (name, display, created, last_seen, registered, was) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET created = excluded.created, last_seen = excluded.last_seen, registered = excluded.registered, was = excluded.was',
      ).bind(to, b?.display ?? toDisplay, Number.isFinite(created) ? created : Date.now(), latest(a?.last_seen, b?.last_seen) || null, b?.registered ?? a?.registered ?? null, was),
    );
  }
  if (va) {
    // looked up without signing in, under either name: one row
    stmts.push(
      env.DB.prepare('DELETE FROM visitors WHERE name = ?').bind(from),
      env.DB.prepare('INSERT INTO visitors (name, display, first_seen, last_seen, visits) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET first_seen = excluded.first_seen, last_seen = excluded.last_seen, visits = excluded.visits').bind(
        to,
        vb?.display ?? toDisplay,
        earliest(va.first_seen, vb?.first_seen),
        latest(va.last_seen, vb?.last_seen),
        va.visits + (vb?.visits ?? 0),
      ),
    );
  }
  return stmts;
}

/**
 * Owner only: join an old name onto the new one by hand, for a rename Encore couldn't recognise by
 * itself (it happened before creation times were kept, or Last.fm was down at the time).
 * POST { from, to }: both names as Encore knows them (signed-in accounts or looked-up profiles).
 */
async function adminMerge(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (!isOwner(user, env)) return json({ error: 'not allowed' }, 403);
  const body = (await req.json().catch(() => ({}))) as { from?: unknown; to?: unknown };
  const clean = (v: unknown) => (typeof v === 'string' && /^[\w.-]{2,32}$/.test(v.trim()) ? v.trim() : '');
  const from = clean(body.from).toLowerCase();
  const to = clean(body.to);
  if (!from || !to || from === to.toLowerCase()) return json({ error: 'Give the old name and the new name.' }, 400);
  if (isOwner(from, env)) return json({ error: 'Owner accounts are set on the server: change OWNERS there instead.' }, 400);
  const known = async (n: string) =>
    !!(await env.DB.prepare('SELECT 1 AS x FROM users WHERE name = ?1 UNION SELECT 1 FROM visitors WHERE name = ?1').bind(n).first());
  if (!(await known(from))) return json({ error: `Encore doesn't know “${from}”.` }, 404);
  if (!(await known(to.toLowerCase()))) return json({ error: `Encore doesn't know “${to}” yet: they need to sign in (or be looked up) under the new name first.` }, 404);
  // the new name as written on its own row (or as typed)
  const row = await env.DB.prepare('SELECT display FROM users WHERE name = ?1 UNION SELECT display FROM visitors WHERE name = ?1').bind(to.toLowerCase()).first<{ display: string }>();
  await env.DB.batch(await mergeStatements(env, from, row?.display ?? to));
  console.log(JSON.stringify({ evt: 'account-merged' }));
  return json({ ok: true });
}

/** Everything the server holds for this account, gone: synced data, pictures, key, devices, name. */
async function deleteAccount(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  await env.DB.batch(
    ['projects', 'images', 'settings', 'chunks', 'blobs', 'vault', 'sessions'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user = ?`).bind(user)).concat([
      env.DB.prepare('DELETE FROM users WHERE name = ?').bind(user),
      env.DB.prepare('DELETE FROM visitors WHERE name = ?').bind(user),
      env.DB.prepare('DELETE FROM auth_pending WHERE lower(user) = ?').bind(user),
    ]),
  );
  console.log(JSON.stringify({ evt: 'account-deleted' }));
  return json({ ok: true });
}

async function logout(req: Request, env: Env) {
  const m = (req.headers.get('Authorization') ?? '').match(/^Bearer ([0-9a-f]{64})$/);
  if (m) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(m[1]).run();
  return json({ ok: true });
}

/* ---------------- sync ---------------- */

interface ProjectIn {
  id: string;
  data: string | null;
  updated: number;
  deleted: boolean;
  /** pictures (blob ids) this item uses */
  refs?: string[];
}
interface ImageIn {
  refs?: string[];
  key: string;
  src: string | null;
  zoom: number;
  x: number;
  y: number;
  updated: number;
  deleted: boolean;
}
interface SyncIn {
  cursor?: { p?: number; i?: number; s?: number };
  projects?: ProjectIn[];
  images?: ImageIn[];
  settings?: { data: string; updated: number } | null;
}

async function sync(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = (await req.json().catch(() => null)) as SyncIn | null;
  if (!body || typeof body !== 'object') return json({ error: 'bad request' }, 400);
  const now = Date.now();
  // with a vault, refuse anything readable (e.g. from an old, not yet updated copy of the app)
  const locked = !!(await env.DB.prepare('SELECT 1 AS x FROM vault WHERE user = ?').bind(user).first());
  const sealedOk = (v: string | null) => !locked || v === null || v.startsWith('e1:');
  // Server revision per row, for paging by cursor. It's computed inside the write itself as
  // max(time-based value, current max + 1), so revisions only ever grow in commit order: a slow
  // request can't commit a revision lower than one another device has already paged past.
  let seq = 0;
  const rev = () => now * 1000 + seq++;
  const nextSrv = (table: 'projects' | 'images' | 'settings') => `MAX(?, COALESCE((SELECT MAX(srv) FROM ${table} WHERE user = ?), 0) + 1)`;
  // statements grouped per item (an item's pieces are written atomically), with approximate byte size
  const groups: { stmts: D1PreparedStatement[]; bytes: number }[] = [];
  let stmts: D1PreparedStatement[] = [];
  const flushGroup = (bytes: number) => {
    if (stmts.length) groups.push({ stmts, bytes });
    stmts = [];
  };
  const rejected: string[] = [];

  // big values are stored in pieces; only write when the incoming version is newer
  const newer = async (table: 'projects' | 'images', col: 'id' | 'key', key: string, updated: number, refs: string[]) => {
    const row = await env.DB.prepare(`SELECT updated, refs FROM ${table} WHERE user = ? AND ${col} = ?`).bind(user, key).first<{ updated: number; refs: string | null }>();
    // same version re-sent with its pictures moved to the picture store: take it (one-time conversion)
    return !row || updated > row.updated || (updated === row.updated && refs.length > 0 && row.refs === null);
  };
  const cleanRefs = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && BLOB_ID.test(x)))].slice(0, 300) : []);
  let wrote = false;
  const chunkStmts = (kind: string, key: string, value: string | null) => {
    const out = [env.DB.prepare('DELETE FROM chunks WHERE user = ? AND kind = ? AND key = ?').bind(user, kind, key)];
    if (!value || value.length <= CHUNK) return { stored: value, stmts: out };
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) out.push(env.DB.prepare('INSERT INTO chunks (user, kind, key, seq, data) VALUES (?, ?, ?, ?, ?)').bind(user, kind, key, i, value.slice(i * CHUNK, (i + 1) * CHUNK)));
    return { stored: `${CHUNKED}${n}`, stmts: out };
  };

  for (const p of body.projects ?? []) {
    if (typeof p.id !== 'string' || !p.id || typeof p.updated !== 'number') continue;
    const data = p.deleted ? null : (p.data ?? null);
    if ((data && data.length > MAX_ITEM) || !sealedOk(data)) {
      rejected.push(`project:${p.id}`);
      continue;
    }
    const refs = p.deleted ? [] : cleanRefs(p.refs);
    if (!(await newer('projects', 'id', p.id, p.updated, refs))) continue;
    // every picture it points to must already be uploaded, or other devices couldn't open it
    if (!(await haveBlobs(env, user, refs))) {
      rejected.push(`project:${p.id}`);
      continue;
    }
    const c = chunkStmts('project', p.id, data);
    stmts.push(...c.stmts);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO projects (user, id, data, updated, deleted, srv, refs) VALUES (?, ?, ?, ?, ?, ${nextSrv('projects')}, ?)
         ON CONFLICT(user, id) DO UPDATE SET data = excluded.data, updated = excluded.updated, deleted = excluded.deleted, srv = excluded.srv, refs = excluded.refs`,
      ).bind(user, p.id, c.stored, p.updated, p.deleted ? 1 : 0, rev(), user, refs.length ? JSON.stringify(refs) : null),
    );
    wrote = true;
    flushGroup(data?.length ?? 0);
  }
  for (const im of body.images ?? []) {
    if (typeof im.key !== 'string' || !im.key || typeof im.updated !== 'number') continue;
    const src = im.deleted ? null : (im.src ?? null);
    if ((src && src.length > MAX_ITEM) || !sealedOk(src) || (locked && !im.key.startsWith('h:'))) {
      rejected.push(`image:${im.key}`);
      continue;
    }
    const refs = im.deleted ? [] : cleanRefs(im.refs);
    if (!(await newer('images', 'key', im.key, im.updated, refs))) continue;
    if (!(await haveBlobs(env, user, refs))) {
      rejected.push(`image:${im.key}`);
      continue;
    }
    wrote = true;
    const c = chunkStmts('image', im.key, src);
    stmts.push(...c.stmts);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO images (user, key, src, zoom, x, y, updated, deleted, srv, refs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${nextSrv('images')}, ?)
         ON CONFLICT(user, key) DO UPDATE SET src = excluded.src, zoom = excluded.zoom, x = excluded.x, y = excluded.y,
           updated = excluded.updated, deleted = excluded.deleted, srv = excluded.srv, refs = excluded.refs`,
      ).bind(user, im.key, c.stored, im.zoom ?? 1, im.x ?? 50, im.y ?? 50, im.updated, im.deleted ? 1 : 0, rev(), user, refs.length ? JSON.stringify(refs) : null),
    );
    flushGroup(src?.length ?? 0);
  }
  if (body.settings && typeof body.settings.updated === 'number' && (body.settings.data ?? '').length < 200_000 && sealedOk(body.settings.data ?? null)) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO settings (user, data, updated, srv) VALUES (?, ?, ?, ${nextSrv('settings')})
         ON CONFLICT(user) DO UPDATE SET data = excluded.data, updated = excluded.updated, srv = excluded.srv
         WHERE excluded.updated > settings.updated`,
      ).bind(user, body.settings.data, body.settings.updated, rev(), user),
    );
  }
  flushGroup(body.settings?.data?.length ?? 0);
  // D1 batches are transactional; combine whole items up to ~8 MB / 50 statements per batch
  let batch: D1PreparedStatement[] = [];
  let batchBytes = 0;
  for (const g of groups) {
    if (batch.length && (batch.length + g.stmts.length > 50 || batchBytes + g.bytes > 8_000_000)) {
      await env.DB.batch(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(...g.stmts);
    batchBytes += g.bytes;
  }
  if (batch.length) await env.DB.batch(batch);
  // pictures nothing points to any more (an hour's grace for ones uploaded just before their item)
  if (wrote) await collectBlobs(env, user);

  // ---- pull everything changed since the client's cursors (a little overlap; client dedupes) ----
  const sent = new Map<string, number>();
  for (const p of body.projects ?? []) sent.set(`p:${p.id}`, p.updated);
  for (const im of body.images ?? []) sent.set(`i:${im.key}`, im.updated);
  const cur = { p: body.cursor?.p ?? 0, i: body.cursor?.i ?? 0, s: body.cursor?.s ?? 0 };
  let budget = PAGE_BYTES;
  let more = false;

  const projects: (ProjectIn & { srv: number })[] = [];
  const pr = await env.DB.prepare('SELECT id, data, updated, deleted, srv FROM projects WHERE user = ? AND srv > ? ORDER BY srv LIMIT 200')
    .bind(user, cur.p)
    .all<{ id: string; data: string | null; updated: number; deleted: number; srv: number }>();
  let pCursor = cur.p;
  const unchunk = async (kind: string, key: string, v: string | null) => {
    if (!v || !v.startsWith(CHUNKED)) return v;
    const rows = await env.DB.prepare('SELECT data FROM chunks WHERE user = ? AND kind = ? AND key = ? ORDER BY seq').bind(user, kind, key).all<{ data: string }>();
    return rows.results.map((r) => r.data).join('');
  };
  for (const r of pr.results) {
    if (!sent.has(`p:${r.id}`) || sent.get(`p:${r.id}`) !== r.updated) r.data = await unchunk('project', r.id, r.data);
    const size = r.data?.length ?? 0;
    if (projects.length && budget - size < 0) {
      more = true;
      break;
    }
    pCursor = r.srv;
    if (sent.get(`p:${r.id}`) === r.updated) continue;
    budget -= size;
    projects.push({ id: r.id, data: r.data, updated: r.updated, deleted: !!r.deleted, srv: r.srv });
  }
  if (pr.results.length === 200) more = true;

  const images: (ImageIn & { srv: number })[] = [];
  const ir = await env.DB.prepare('SELECT key, src, zoom, x, y, updated, deleted, srv FROM images WHERE user = ? AND srv > ? ORDER BY srv LIMIT 200')
    .bind(user, cur.i)
    .all<{ key: string; src: string | null; zoom: number; x: number; y: number; updated: number; deleted: number; srv: number }>();
  let iCursor = cur.i;
  for (const r of ir.results) {
    if (!sent.has(`i:${r.key}`) || sent.get(`i:${r.key}`) !== r.updated) r.src = await unchunk('image', r.key, r.src);
    const size = r.src?.length ?? 0;
    if ((images.length || projects.length) && budget - size < 0) {
      more = true;
      break;
    }
    iCursor = r.srv;
    if (sent.get(`i:${r.key}`) === r.updated) continue;
    budget -= size;
    images.push({ key: r.key, src: r.src, zoom: r.zoom, x: r.x, y: r.y, updated: r.updated, deleted: !!r.deleted, srv: r.srv });
  }
  if (ir.results.length === 200) more = true;

  const s = await env.DB.prepare('SELECT data, updated, srv FROM settings WHERE user = ? AND srv > ?').bind(user, cur.s).first<{ data: string; updated: number; srv: number }>();

  console.log(JSON.stringify({ evt: 'sync', user, pushedProjects: body.projects?.length ?? 0, pushedImages: body.images?.length ?? 0, settings: !!body.settings, rejected, pulledProjects: projects.length, pulledImages: images.length, more }));
  return json({
    now,
    more,
    rejected,
    cursor: { p: pCursor, i: iCursor, s: s?.srv ?? cur.s },
    projects,
    images,
    settings: s ? { data: s.data, updated: s.updated } : null,
  });
}
