/**
 * Encryption for sync. Everything that leaves the device (wrappeds, pictures, settings) is
 * encrypted with the account's data key before upload. The server stores that key locked with a
 * server secret kept outside the database, and gives it only to the account's signed-in devices.
 *
 *  - data key: 32 random bytes, AES-256-GCM
 *  - values:   "e1:" + ("z" gzip | "p" plain) + base64(iv | ciphertext)
 *  - picture names: "h:" + HMAC-SHA256(name) under a key derived from the data key
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------------- base64 that copes with multi-megabyte values ---------------- */

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const toB64u = (b: Uint8Array) => toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/* ---------------- compression (pictures are big; text compresses well) ---------------- */

const canGzip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function pipe(data: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Response(new Blob([data]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/* ---------------- keys ---------------- */

export interface DataKey {
  raw: Uint8Array<ArrayBuffer>;
  aes: CryptoKey;
  mac: CryptoKey;
  /** short public fingerprint, so devices can tell whether they hold the same key */
  kid: string;
}

export async function loadDataKey(raw: Uint8Array<ArrayBuffer>): Promise<DataKey> {
  const aes = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits']);
  const macBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('encore'), info: enc.encode('picture-names') }, base, 256);
  const mac = await crypto.subtle.importKey('raw', macBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kid = hex(await crypto.subtle.digest('SHA-256', raw)).slice(0, 32);
  return { raw, aes, mac, kid };
}

/* ---------------- values ---------------- */

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export async function seal(text: string, dk: DataKey): Promise<string> {
  let body: Uint8Array<ArrayBuffer> = enc.encode(text);
  let mode = 'p';
  if (canGzip && body.length > 256) {
    body = await pipe(body, new CompressionStream('gzip'));
    mode = 'z';
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dk.aes, body));
  return `e1:${mode}${toB64(concat(iv, ct))}`;
}

export const isSealed = (v: string | null | undefined) => !!v && v.startsWith('e1:');

export async function open(value: string, dk: DataKey): Promise<string> {
  if (!isSealed(value)) throw new Error('not encrypted');
  const mode = value[3];
  const b = fromB64(value.slice(4));
  let body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, dk.aes, b.subarray(12)));
  if (mode === 'z') body = await pipe(body, new DecompressionStream('gzip'));
  return dec.decode(body);
}

/** Server-side name for a picture: unreadable, but the same on every device with this key. */
export async function hashName(name: string, dk: DataKey): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', dk.mac, enc.encode(name));
  return `h:${toB64u(new Uint8Array(sig).subarray(0, 18))}`;
}

/* ---------------- pictures (stored as encrypted binary, once per account) ---------------- */

/** Name for a picture on the server: a keyed hash of its bytes (same picture, same name; reveals nothing). */
export async function blobId(bytes: Uint8Array<ArrayBuffer>, dk: DataKey): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', dk.mac, concat(enc.encode('picture\0'), bytes));
  return `b_${toB64u(new Uint8Array(sig).subarray(0, 18))}`;
}

/** [mime length][mime][image bytes], encrypted: iv | ciphertext. */
export async function sealPicture(mime: string, bytes: Uint8Array, dk: DataKey): Promise<Uint8Array<ArrayBuffer>> {
  const m = enc.encode(mime);
  const plain = new Uint8Array(1 + m.length + bytes.length);
  plain[0] = m.length;
  plain.set(m, 1);
  plain.set(bytes, 1 + m.length);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return concat(iv, new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dk.aes, plain)));
}

export async function openPicture(sealed: Uint8Array<ArrayBuffer>, dk: DataKey): Promise<string> {
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.subarray(0, 12) }, dk.aes, sealed.subarray(12)));
  const n = plain[0];
  const mime = dec.decode(plain.subarray(1, 1 + n));
  return `data:${mime};base64,${toB64(plain.subarray(1 + n))}`;
}
