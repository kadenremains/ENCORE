import { getFontEmbedCSS, toCanvas } from 'html-to-image';

let fontCss: Promise<string> | null = null;

const isSafari = typeof navigator !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

async function waitForImages(node: HTMLElement, timeout = 8000) {
  const start = Date.now();
  // wait for lookups to settle: the set of <img> srcs must be stable and all loaded
  let lastSig = '';
  let stableSince = Date.now();
  while (Date.now() - start < timeout) {
    const imgs = [...node.querySelectorAll('img')];
    const sig = imgs.map((i) => i.src).join('|');
    if (sig !== lastSig) {
      lastSig = sig;
      stableSince = Date.now();
    }
    const loaded = imgs.every((i) => i.complete);
    if (loaded && Date.now() - stableSince > 500) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  await Promise.all(
    [...node.querySelectorAll('img')].map((i) => (i.decode ? i.decode().catch(() => {}) : Promise.resolve())),
  );
}

export async function renderNodeToBlob(node: HTMLElement, w: number, h: number, pixelRatio: number): Promise<Blob> {
  await document.fonts.ready;
  await waitForImages(node);
  if (!fontCss) fontCss = getFontEmbedCSS(node).catch(() => '');
  const fontEmbedCSS = await fontCss;
  // includeQueryParams: links that differ only after "?" (e.g. Google image links) are different pictures
  // imagePlaceholder: a picture that fails to load is left blank instead of failing the whole export
  const opts = {
    width: w,
    height: h,
    pixelRatio,
    fontEmbedCSS,
    cacheBust: false,
    includeQueryParams: true,
    imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    style: { transform: 'none', left: '0', top: '0' },
  };
  // Safari sometimes drops images on the first pass; render twice there.
  if (isSafari) await toCanvas(node, opts).catch(() => {});
  let canvas: HTMLCanvasElement;
  try {
    canvas = await toCanvas(node, opts);
  } catch (e) {
    // html-to-image rejects with a DOM Event (no message) when a resource fails
    throw new Error(e instanceof Error && e.message ? e.message : "a picture couldn't be loaded; try again in a moment");
  }
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Export failed'))), 'image/png'));
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wrapped';
}

export async function deliverFiles(files: File[]) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && nav.canShare?.({ files })) {
    try {
      await nav.share({ files });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'downloaded';
}
