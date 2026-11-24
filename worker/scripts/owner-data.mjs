#!/usr/bin/env node
/**
 * Read an owner account's synced data (wrappeds, custom pictures, settings) out of the database
 * and decrypt it with the owner's escrowed key. Only works for accounts listed in OWNERS (their
 * devices keep a readable key copy); every other account's data stays unreadable.
 *
 * Needs your Cloudflare login (wrangler), so nobody else can run it against your database.
 *
 *   node scripts/owner-data.mjs [lastfm-username] [--local]
 *
 * Writes to worker/.owner-data/<username>/ (git-ignored): wrappeds/*.json, pictures/*, settings.json
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { webcrypto as crypto } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const local = args.includes('--local');
const owners = /OWNERS\s*=\s*"([^"]*)"/.exec(readFileSync(join(root, 'wrangler.toml'), 'utf8'))?.[1].split(',').map((s) => s.trim()) ?? [];
const user = (args.find((a) => !a.startsWith('--')) ?? owners[0] ?? '').toLowerCase();
if (!/^[\w.-]{2,32}$/.test(user)) throw new Error('usage: node scripts/owner-data.mjs <lastfm-username> [--local]');

function query(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'encore', local ? '--local' : '--remote', '--json', '--command', sql], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 30 });
  return JSON.parse(out)[0].results;
}
const q = (s) => `'${s.replace(/'/g, "''")}'`;

const vault = query(`SELECT kid, escrow FROM vault WHERE user = ${q(user)}`)[0];
let key = null;
if (vault) {
  if (!vault.escrow) throw new Error(`${user} is private and has no owner key copy (not in OWNERS, or hasn't opened the app since).`);
  key = await crypto.subtle.importKey('raw', Buffer.from(vault.escrow, 'base64'), 'AES-GCM', false, ['decrypt']);
}

async function read(value, kind, id) {
  if (value?.startsWith('__chunks__:')) {
    value = query(`SELECT data FROM chunks WHERE user = ${q(user)} AND kind = ${q(kind)} AND key = ${q(id)} ORDER BY seq`).map((r) => r.data).join('');
  }
  if (!value) return null;
  if (!value.startsWith('e1:')) return value; // from before private sync
  if (!key) throw new Error('encrypted value but no key');
  const b = Buffer.from(value.slice(4), 'base64');
  let pt = Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, key, b.subarray(12)));
  if (value[3] === 'z') pt = gunzipSync(pt);
  return pt.toString('utf8');
}

const outDir = join(root, '.owner-data', user);
mkdirSync(join(outDir, 'wrappeds'), { recursive: true });
mkdirSync(join(outDir, 'pictures'), { recursive: true });
const safe = (s) => s.replace(/[^\w.-]+/g, '_').slice(0, 80);

let wrappeds = 0;
for (const p of query(`SELECT id, data FROM projects WHERE user = ${q(user)} AND deleted = 0`)) {
  const text = await read(p.data, 'project', p.id);
  if (!text) continue;
  const project = JSON.parse(text);
  writeFileSync(join(outDir, 'wrappeds', `${safe(project.name ?? p.id)}-${p.id}.json`), JSON.stringify(project, null, 2));
  wrappeds++;
}

let pictures = 0;
for (const im of query(`SELECT key, src, zoom, x, y FROM images WHERE user = ${q(user)} AND deleted = 0`)) {
  const text = await read(im.src, 'image', im.key);
  if (!text) continue;
  const pic = key ? JSON.parse(text) : { key: im.key, src: text };
  const m = /^data:image\/(\w+);base64,(.*)$/s.exec(pic.src);
  if (m) writeFileSync(join(outDir, 'pictures', `${safe(pic.key)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`), Buffer.from(m[2], 'base64'));
  else writeFileSync(join(outDir, 'pictures', `${safe(pic.key)}.url.txt`), pic.src);
  pictures++;
}

const s = query(`SELECT data FROM settings WHERE user = ${q(user)}`)[0];
if (s) writeFileSync(join(outDir, 'settings.json'), JSON.stringify(JSON.parse(await read(s.data, 'settings', user)), null, 2));

console.log(`${user}: ${wrappeds} wrappeds, ${pictures} pictures${s ? ', settings' : ''} -> ${outDir}`);
