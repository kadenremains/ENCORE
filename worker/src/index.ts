import { md5 } from './md5';

/**
 * Encore API (Cloudflare Worker + D1)
 *  - GET  /health            which secrets are configured
 *  - GET  /lastfm?...        read-only Last.fm relay (adds the API key server-side)
 *  - GET  /auth/start        begin "Sign in with Last.fm"
 *  - GET  /auth/callback     Last.fm redirects here; we create a session and bounce back to the site
 *  - GET  /me                who am I
 *  - POST /sync              push local changes, pull remote changes (wrappeds, images, settings)
 *  - POST /logout
 */

export interface Env {
  DB: D1Database;
  LASTFM_API_KEY?: string;
  LASTFM_SECRET?: string;
  ALLOWED_ORIGINS: string;
}

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

/** Last.fm credentials: Worker secrets if set, otherwise the ones saved through /setup. */
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
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
        case '/setup':
          return await setup(req, url, env);
        case '/lastfm':
          res = Object.keys(cors).length ? await lastfmRelay(url, env) : json({ error: 'origin not allowed' }, 403);
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
        case '/sync':
          res = req.method === 'POST' ? await sync(req, env) : json({ error: 'POST only' }, 405);
          break;
        case '/logout':
          res = await logout(req, env);
          break;
        default:
          res = json({ error: 'not found' }, 404);
      }
    } catch (e) {
      console.error(JSON.stringify({ evt: 'error', path: url.pathname, message: (e as Error).message }));
      res = json({ error: (e as Error).message || 'server error' }, 500);
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};

/* ---------------- Last.fm relay ---------------- */

async function lastfmRelay(url: URL, env: Env) {
  const { key } = await getKeys(env);
  if (!key) return json({ error: 'relay not configured', code: 'NO_KEY' }, 503);
  const params = new URLSearchParams(url.search);
  const method = (params.get('method') ?? '').toLowerCase();
  if (!READ_METHODS.has(method)) return json({ error: 'method not allowed' }, 400);
  params.delete('api_key');
  params.set('api_key', key);
  params.set('format', 'json');
  const upstream = await fetch(`${LASTFM}?${params}`, { headers: { 'User-Agent': 'EncoreStats/1.0' } });
  return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': 'application/json' } });
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
  const cb = `${url.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}${pending && /^[0-9a-f]{32}$/.test(pending) ? `&pending=${pending}` : ''}`;
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
  const body = (await r.json()) as { session?: { name: string }; error?: number; message?: string };
  if (!body.session?.name) return Response.redirect(`${redirect}#auth_error=${encodeURIComponent(body.message ?? 'lastfm_rejected')}`, 302);
  const name = body.session.name;
  const now = Date.now();
  const session = randomToken();
  const pending = url.searchParams.get('pending');
  const stmts = [
    env.DB.prepare('INSERT INTO users (name, display, created) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET display = excluded.display').bind(name.toLowerCase(), name, now),
    env.DB.prepare('INSERT INTO sessions (token, user, created, last_seen) VALUES (?, ?, ?, ?)').bind(session, name.toLowerCase(), now, now),
  ];
  if (pending && /^[0-9a-f]{32}$/.test(pending)) {
    // a second session for the app that's waiting (each device context gets its own token)
    const waiting = randomToken();
    stmts.push(env.DB.prepare('INSERT INTO sessions (token, user, created, last_seen) VALUES (?, ?, ?, ?)').bind(waiting, name.toLowerCase(), now, now));
    stmts.push(env.DB.prepare('INSERT OR REPLACE INTO pending_auth (id, token, user, created) VALUES (?, ?, ?, ?)').bind(pending, waiting, name, now));
  }
  await env.DB.batch(stmts);
  return Response.redirect(`${redirect}#auth=${session}&user=${encodeURIComponent(name)}`, 302);
}

/** The app polls this with the random id it started sign-in with; one-time pickup, 15 min window. */
async function authPoll(url: URL, env: Env) {
  const id = url.searchParams.get('id') ?? '';
  if (!/^[0-9a-f]{32}$/.test(id)) return json({ error: 'bad id' }, 400);
  const row = await env.DB.prepare('SELECT token, user, created FROM pending_auth WHERE id = ?').bind(id).first<{ token: string; user: string; created: number }>();
  if (!row) return json({ pending: true });
  await env.DB.prepare('DELETE FROM pending_auth WHERE id = ? OR created < ?').bind(id, Date.now() - 15 * 60_000).run();
  if (Date.now() - row.created > 15 * 60_000) return json({ pending: true });
  return json({ token: row.token, user: row.user });
}

async function userFor(req: Request, env: Env): Promise<string | null> {
  const m = (req.headers.get('Authorization') ?? '').match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return null;
  const row = await env.DB.prepare('SELECT user FROM sessions WHERE token = ?').bind(m[1]).first<{ user: string }>();
  return row?.user ?? null;
}

async function me(req: Request, env: Env) {
  const user = await userFor(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT display FROM users WHERE name = ?').bind(user).first<{ display: string }>();
  return json({ name: row?.display ?? user });
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
}
interface ImageIn {
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
  // unique, increasing server revision per row so paging by cursor never skips ties
  let seq = 0;
  const rev = () => now * 1000 + seq++;
  // statements grouped per item (an item's pieces are written atomically), with approximate byte size
  const groups: { stmts: D1PreparedStatement[]; bytes: number }[] = [];
  let stmts: D1PreparedStatement[] = [];
  const flushGroup = (bytes: number) => {
    if (stmts.length) groups.push({ stmts, bytes });
    stmts = [];
  };
  const rejected: string[] = [];

  // big values are stored in pieces; only write when the incoming version is newer
  const newer = async (table: 'projects' | 'images', col: 'id' | 'key', key: string, updated: number) => {
    const row = await env.DB.prepare(`SELECT updated FROM ${table} WHERE user = ? AND ${col} = ?`).bind(user, key).first<{ updated: number }>();
    return !row || updated > row.updated;
  };
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
    if (data && data.length > MAX_ITEM) {
      rejected.push(`project:${p.id}`);
      continue;
    }
    if (!(await newer('projects', 'id', p.id, p.updated))) continue;
    const c = chunkStmts('project', p.id, data);
    stmts.push(...c.stmts);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO projects (user, id, data, updated, deleted, srv) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user, id) DO UPDATE SET data = excluded.data, updated = excluded.updated, deleted = excluded.deleted, srv = excluded.srv`,
      ).bind(user, p.id, c.stored, p.updated, p.deleted ? 1 : 0, rev()),
    );
    flushGroup(data?.length ?? 0);
  }
  for (const im of body.images ?? []) {
    if (typeof im.key !== 'string' || !im.key || typeof im.updated !== 'number') continue;
    const src = im.deleted ? null : (im.src ?? null);
    if (src && src.length > MAX_ITEM) {
      rejected.push(`image:${im.key}`);
      continue;
    }
    if (!(await newer('images', 'key', im.key, im.updated))) continue;
    const c = chunkStmts('image', im.key, src);
    stmts.push(...c.stmts);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO images (user, key, src, zoom, x, y, updated, deleted, srv) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user, key) DO UPDATE SET src = excluded.src, zoom = excluded.zoom, x = excluded.x, y = excluded.y,
           updated = excluded.updated, deleted = excluded.deleted, srv = excluded.srv`,
      ).bind(user, im.key, c.stored, im.zoom ?? 1, im.x ?? 50, im.y ?? 50, im.updated, im.deleted ? 1 : 0, rev()),
    );
    flushGroup(src?.length ?? 0);
  }
  if (body.settings && typeof body.settings.updated === 'number' && (body.settings.data ?? '').length < 100_000) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO settings (user, data, updated, srv) VALUES (?, ?, ?, ?)
         ON CONFLICT(user) DO UPDATE SET data = excluded.data, updated = excluded.updated, srv = excluded.srv
         WHERE excluded.updated > settings.updated`,
      ).bind(user, body.settings.data, body.settings.updated, rev()),
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

/* ---------------- one-time setup page ---------------- */

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title}</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0c;color:#e8ebf1;font:13px ui-monospace,Menlo,monospace;padding:16px;box-sizing:border-box}
.card{position:relative;max-width:440px;width:100%;border:1px solid rgba(200,205,214,.22);background:#121215;padding:28px}
.card:before{content:"";position:absolute;inset:8px;border:1px solid rgba(200,205,214,.1);pointer-events:none}
h1{font:400 30px/1 Impact,sans-serif;letter-spacing:.14em;margin:0 0 10px;text-transform:uppercase}
p{color:#b6bcc8;line-height:1.6}label{display:block;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#7b8493;margin:16px 0 6px}
input{width:100%;box-sizing:border-box;background:#18181c;border:1px solid rgba(200,205,214,.22);color:#e8ebf1;padding:11px;font:inherit;font-size:15px;border-radius:3px}
button{margin-top:20px;width:100%;padding:13px;background:#e8ebf1;color:#0a0a0c;border:0;border-radius:3px;font:inherit;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
a{color:#e8ebf1}.err{color:#d06a6a}.ok{color:#8fd19e}
</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
  );

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function validCode(env: Env, code: string) {
  if (!/^[0-9a-f]{32,64}$/.test(code)) return false;
  const row = await env.DB.prepare('SELECT expires FROM setup_codes WHERE hash = ?').bind(await sha256(code)).first<{ expires: number }>();
  return !!row && row.expires > Date.now();
}

async function setup(req: Request, url: URL, env: Env): Promise<Response> {
  if (req.method === 'GET') {
    const code = url.searchParams.get('code') ?? '';
    if (!(await validCode(env, code))) return page('Link expired', '<h1>Link expired</h1><p>This setup link was already used or has expired.</p>', 403);
    return page(
      'Encore setup',
      `<h1>Encore setup</h1>
<p>Paste the two values from your <a href="https://www.last.fm/api/accounts" target="_blank" rel="noreferrer">Last.fm API account</a> page. They're saved to your Encore database and never shown again.</p>
<form method="post" action="/setup" autocomplete="off">
<input type="hidden" name="code" value="${esc(code)}">
<label>API key</label><input name="key" required minlength="32" maxlength="32" spellcheck="false" autocapitalize="off">
<label>Shared secret</label><input name="secret" required minlength="32" maxlength="32" spellcheck="false" autocapitalize="off" type="password">
<button>Save &amp; turn on sign-in</button></form>`,
    );
  }
  if (req.method !== 'POST') return page('Setup', '<p>Unsupported.</p>', 405);
  const form = await req.formData();
  const code = String(form.get('code') ?? '');
  const key = String(form.get('key') ?? '').trim();
  const secret = String(form.get('secret') ?? '').trim();
  if (!(await validCode(env, code))) return page('Link expired', '<h1>Link expired</h1><p>This setup link was already used or has expired.</p>', 403);
  if (!/^[0-9a-f]{32}$/i.test(key) || !/^[0-9a-f]{32}$/i.test(secret))
    return page('Check the values', `<h1>Not quite</h1><p class="err">Both values should be 32 characters of letters a–f and numbers.</p><p><a href="/setup?code=${esc(code)}">Try again</a></p>`, 400);
  // prove the pair works: auth.getToken needs a valid key AND a correct signature from the secret
  const sig = md5(`api_key${key}methodauth.getToken${secret}`);
  const r = await fetch(`${LASTFM}?${new URLSearchParams({ method: 'auth.getToken', api_key: key, api_sig: sig, format: 'json' })}`, { headers: { 'User-Agent': 'EncoreStats/1.0' } });
  const body = (await r.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!body.token)
    return page('Check the values', `<h1>Not quite</h1><p class="err">Last.fm didn't accept that pair: ${esc(body.message ?? 'unknown error')}. Make sure the key and the secret aren't swapped.</p><p><a href="/setup?code=${esc(code)}">Try again</a></p>`, 400);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO config (k, v) VALUES ('lastfm_api_key', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(key.toLowerCase()),
    env.DB.prepare("INSERT INTO config (k, v) VALUES ('lastfm_secret', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(secret.toLowerCase()),
    env.DB.prepare('DELETE FROM setup_codes'),
  ]);
  keyCache = null;
  return page('All set', '<h1>All set</h1><p class="ok">Last.fm sign-in and the shared key are on.</p><p>You can close this tab and go back to Encore.</p>');
}
