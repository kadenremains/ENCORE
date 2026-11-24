import { md5 } from './md5';

/**
 * Encore API (Cloudflare Worker + D1)
 *  - GET  /health            which secrets are configured
 *  - GET  /lastfm?...        read-only Last.fm relay (adds the API key server-side)
 *  - GET  /auth/start        begin "Sign in with Last.fm"
 *  - GET  /auth/callback     Last.fm redirects here; we create a session and bounce back to the site
 *  - GET  /auth/poll         a waiting app picks up its session (sign-in finished in another browser view)
 *  - GET  /me                who am I
 *  - GET/POST /vault         the account's data key, locked with the Last.fm session (we can't open it)
 *  - POST /sync              push local changes, pull remote changes (wrappeds, images, settings)

 * Privacy: synced wrappeds, pictures and settings are encrypted in the browser before upload
 * ("e1:" values, picture names hashed to "h:" keys). The key that opens them is stored here only
 * locked with the user's Last.fm session key, which this server passes to the browser at sign-in
 * and never stores or logs. So the database holds usernames and unreadable data, nothing else.
 *  - POST /account/delete   delete everything stored for the signed-in account
 *  - POST /logout
 *  - GET  /art?type=&q=      artwork search (Deezer), so the app never runs third-party code
 *  - POST /blobs/missing, GET/PUT /blob/<id>   the encrypted picture store
 *  - GET  /admin/stats       owner-only usage numbers
 */

export interface Env {
  DB: D1Database;
  LASTFM_API_KEY?: string;
  LASTFM_SECRET?: string;
  ALLOWED_ORIGINS: string;
  /** Last.fm usernames (lowercase, comma separated) that can see the owner stats and whose data key is kept readable for the owner */
  OWNERS?: string;
}

const isOwner = (user: string, env: Env) =>
  (env.OWNERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(user.toLowerCase());

const LASTFM = 'https://ws.audioscrobbler.com/2.0/';
const READ_METHODS = new Set([
  'user.getinfo',
  'user.getrecenttracks',
  'user.gettopartists',
  'user.gettopalbums',
  'user.gettoptracks',
  'user.getweeklychartlist',
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

function originAllowed(origin: string, env: Env) {
  if (!origin) return false;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return env.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .includes(origin);
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  if (!originAllowed(origin, env)) return {};
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
          return await authCallback(url, env);
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
  const upstream = await fetch(`${LASTFM}?${params}`, { headers: { 'User-Agent': 'EncoreStats/1.0' } });
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

function safeRedirect(raw: string | null, env: Env): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return originAllowed(u.origin, env) ? u.origin + u.pathname : null;
  } catch {
    return null;
  }
}

async function authStart(url: URL, env: Env) {
  const redirect = safeRedirect(url.searchParams.get('redirect'), env);
  if (!redirect) return json({ error: 'bad redirect' }, 400);
  const { key, secret } = await getKeys(env);
  if (!key || !secret) return Response.redirect(`${redirect}#auth_error=not_configured`, 302);
  // `pending` lets the app that started sign-in pick the session up itself, even when Last.fm's
  // approval happens in another browser (e.g. iOS opens home-screen apps' links in a separate view)
  const pending = url.searchParams.get('pending');
  const okPending = !!pending && /^[0-9a-f]{32}$/.test(pending);
  // the waiting app's public key: the session key is sealed to it so only that app can read it
  const pk = url.searchParams.get('pk') ?? '';
  if (okPending && /^[A-Za-z0-9_-]{80,100}$/.test(pk)) {
    await env.DB.prepare('INSERT OR REPLACE INTO auth_pending (id, pk, created) VALUES (?, ?, ?)').bind(pending, pk, Date.now()).run();
  }
  const cb = `${url.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}${okPending ? `&pending=${pending}` : ''}`;
  return Response.redirect(`https://www.last.fm/api/auth/?api_key=${key}&cb=${encodeURIComponent(cb)}`, 302);
}

function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function authCallback(url: URL, env: Env) {
  const redirect = safeRedirect(url.searchParams.get('redirect'), env);
  if (!redirect) return json({ error: 'bad redirect' }, 400);
  const token = url.searchParams.get('token');
  const { key, secret } = await getKeys(env);
  if (!token || !key || !secret) return Response.redirect(`${redirect}#auth_error=missing_token`, 302);
  const sig = md5(`api_key${key}methodauth.getSessiontoken${token}${secret}`);
  const qs = new URLSearchParams({ method: 'auth.getSession', api_key: key, token, api_sig: sig, format: 'json' });
  const r = await fetch(`${LASTFM}?${qs}`, { headers: { 'User-Agent': 'EncoreStats/1.0' } });
  const body = (await r.json().catch(() => ({}))) as { session?: { name: string; key: string }; error?: number; message?: string };
  if (!body.session?.name) return Response.redirect(`${redirect}#auth_error=${encodeURIComponent(body.message ?? 'lastfm_rejected')}`, 302);
  const name = body.session.name;
  const sk = body.session.key ?? ''; // passed on to the browser, never stored
  const now = Date.now();
  const session = randomToken();
  const pending = url.searchParams.get('pending');
  const stmts = [
    env.DB.prepare('INSERT INTO users (name, display, created, last_seen) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET display = excluded.display, last_seen = excluded.last_seen').bind(name.toLowerCase(), name, now, now),
    env.DB.prepare('INSERT INTO sessions (token, user, created, last_seen) VALUES (?, ?, ?, ?)').bind(session, name.toLowerCase(), now, now),
  ];
  if (pending && /^[0-9a-f]{32}$/.test(pending)) {
    // a second session for the app that's waiting (each device context gets its own token)
    const waiting = randomToken();
    stmts.push(env.DB.prepare('INSERT INTO sessions (token, user, created, last_seen) VALUES (?, ?, ?, ?)').bind(waiting, name.toLowerCase(), now, now));
    const row = await env.DB.prepare('SELECT pk FROM auth_pending WHERE id = ?').bind(pending).first<{ pk: string }>();
    const sealed = row?.pk && sk ? await sealTo(row.pk, sk).catch(() => null) : null;
    stmts.push(
      env.DB.prepare('INSERT OR REPLACE INTO auth_pending (id, pk, token, user, sealed, created) VALUES (?, ?, ?, ?, ?, ?)').bind(pending, row?.pk ?? null, waiting, name, sealed, now),
    );
  }
  await env.DB.batch(stmts);
  return Response.redirect(`${redirect}#auth=${session}&user=${encodeURIComponent(name)}${sk ? `&k=${encodeURIComponent(sk)}` : ''}`, 302);
}

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/**
 * Encrypt a secret so only the holder of `pkB64` (a P-256 public key the app made) can read it:
 * ECDH with a throwaway key, SHA-256 of the shared secret as an AES-GCM key.
 * Output: throwaway public key (65 bytes) | iv (12) | ciphertext.
 */
async function sealTo(pkB64: string, secret: string) {
  const their = await crypto.subtle.importKey('raw', unb64u(pkB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const mine = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  // (the Workers type definitions spell this field $public; the runtime takes the standard name)
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: their } as unknown as SubtleCryptoDeriveKeyAlgorithm, mine.privateKey, 256);
  const aes = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', bits), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(secret)));
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', mine.publicKey)) as ArrayBuffer);
  const out = new Uint8Array(pub.length + iv.length + ct.length);
  out.set(pub, 0);
  out.set(iv, pub.length);
  out.set(ct, pub.length + iv.length);
  return b64u(out);
}

/** The app polls this with the random id it started sign-in with; one-time pickup, 15 min window. */
async function authPoll(url: URL, env: Env) {
  const id = url.searchParams.get('id') ?? '';
  if (!/^[0-9a-f]{32}$/.test(id)) return json({ error: 'bad id' }, 400);
  const old = Date.now() - 15 * 60_000;
  const row = await env.DB.prepare('SELECT token, user, sealed, created FROM auth_pending WHERE id = ? AND token IS NOT NULL').bind(id).first<{ token: string; user: string; sealed: string | null; created: number }>();
  if (row) {
    await env.DB.prepare('DELETE FROM auth_pending WHERE id = ? OR created < ?').bind(id, old).run();
    if (row.created < old) return json({ pending: true });
    return json({ token: row.token, user: row.user, sealed: row.sealed ?? undefined });
  }
  // sign-ins started by an older version of the app
  const legacy = await env.DB.prepare('SELECT token, user, created FROM pending_auth WHERE id = ?').bind(id).first<{ token: string; user: string; created: number }>();
  if (!legacy) return json({ pending: true });
  await env.DB.prepare('DELETE FROM pending_auth WHERE id = ? OR created < ?').bind(id, old).run();
  if (legacy.created < old) return json({ pending: true });
  return json({ token: legacy.token, user: legacy.user });
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
  const body = (await req.json()) as { ids?: unknown };
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
  const [accounts, visitors] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM account_stats ORDER BY last_seen DESC'),
    env.DB.prepare('SELECT display AS name, first_seen, last_seen, visits FROM visitors ORDER BY last_seen DESC LIMIT 500'),
  ]);
  return json({ accounts: accounts.results, visitors: visitors.results, now: Date.now() });
}

/* ---------------- vault: the account's data key, locked ---------------- */

/**
 * GET: the locked key (or null). POST { wrapped, kid, mode }:
 *  - 'create': first device. Stores the key and wipes the user's older unencrypted sync data
 *    (that device has already downloaded it, and re-uploads it encrypted).
 *  - 'replace': re-lock the same key (same kid) with a new Last.fm session.
 */
async function vault(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  // (the owner escrow column is never sent back)
  const get = () => env.DB.prepare('SELECT wrapped, kid, updated FROM vault WHERE user = ?').bind(user).first<{ wrapped: string; kid: string; updated: number }>();
  if (req.method === 'GET') return json({ vault: (await get()) ?? null });
  if (req.method !== 'POST') return json({ error: 'GET or POST' }, 405);
  const body = (await req.json()) as { wrapped?: string; kid?: string; mode?: string };
  if (body.mode !== 'escrow' && (typeof body.wrapped !== 'string' || body.wrapped.length > 400)) return json({ error: 'bad vault' }, 400);
  if (typeof body.kid !== 'string' || !/^[0-9a-f]{32}$/.test(body.kid)) return json({ error: 'bad vault' }, 400);
  if (body.mode === 'escrow' && typeof (body as { key?: string }).key !== 'string') return json({ error: 'bad vault' }, 400);
  const now = Date.now();
  if (body.mode === 'create') {
    const existing = await get();
    if (existing) return json({ vault: existing, created: false });
    await env.DB.batch([
      env.DB.prepare('INSERT INTO vault (user, wrapped, kid, updated) VALUES (?, ?, ?, ?)').bind(user, body.wrapped, body.kid, now),
      env.DB.prepare('DELETE FROM projects WHERE user = ?').bind(user),
      env.DB.prepare('DELETE FROM images WHERE user = ?').bind(user),
      env.DB.prepare('DELETE FROM settings WHERE user = ?').bind(user),
      env.DB.prepare('DELETE FROM chunks WHERE user = ?').bind(user),
    ]);
    return json({ vault: await get(), created: true });
  }
  if (body.mode === 'escrow') {
    // owners only: keep the data key readable here so the owner (and their tools) can read their own data
    if (!isOwner(user, env)) return json({ error: 'not allowed' }, 403);
    const key = (body as { key?: string }).key ?? '';
    const raw = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
    const kid = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    if (raw.length !== 32 || kid !== body.kid) return json({ error: 'key mismatch' }, 409);
    const r = await env.DB.prepare('UPDATE vault SET escrow = ? WHERE user = ? AND kid = ?').bind(key, user, kid).run();
    return r.meta.changes ? json({ ok: true }) : json({ error: 'key mismatch' }, 409);
  }
  if (body.mode === 'replace') {
    const r = await env.DB.prepare('UPDATE vault SET wrapped = ?, updated = ? WHERE user = ? AND kid = ?').bind(body.wrapped, now, user, body.kid).run();
    if (!r.meta.changes) return json({ error: 'key mismatch' }, 409);
    return json({ vault: await get() });
  }
  return json({ error: 'bad mode' }, 400);
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

async function me(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT display FROM users WHERE name = ?').bind(user).first<{ display: string }>();
  return json({ name: row?.display ?? user, owner: isOwner(user, env) });
}

/** Everything the server holds for this account, gone: synced data, pictures, key, devices, name. */
async function deleteAccount(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  await env.DB.batch(
    ['projects', 'images', 'settings', 'chunks', 'blobs', 'vault', 'sessions'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user = ?`).bind(user)).concat([
      env.DB.prepare('DELETE FROM users WHERE name = ?').bind(user),
      env.DB.prepare('DELETE FROM visitors WHERE name = ?').bind(user),
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
  const body = (await req.json()) as SyncIn;
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
