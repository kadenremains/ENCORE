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

const scaleOf = (t: string) => {
  const m = /scale\(([\d.]+)/.exec(t);
  return m ? Number(m[1]) || 1 : 1;
};

/**
 * Swap every picture in the slide for a copy at exactly the resolution the export needs.
 * Phone photos and 1000px artist pictures make the snapshot huge, and Safari drops the
 * biggest pictures from it when they aren't decoded in time. Returns a function that undoes it.
 */
async function downsizeImages(node: HTMLElement, pixelRatio: number): Promise<() => void> {
  const restore: (() => void)[] = [];
  await Promise.all(
    [...node.querySelectorAll('img')].map(async (img) => {
      if (!img.naturalWidth || !img.offsetWidth) return;
      const need = Math.min(2400, Math.ceil(Math.max(img.offsetWidth, img.offsetHeight) * pixelRatio * scaleOf(img.style.transform)));
      const natural = Math.max(img.naturalWidth, img.naturalHeight);
      const k = Math.min(1, need / natural);
      // already small and embedded: nothing to gain
      if (k > 0.85 && img.src.startsWith('data:')) return;
      try {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const g = c.getContext('2d')!;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, c.width, c.height);
        const alpha = /^data:image\/(png|gif|webp)|\.(png|gif|webp)(\?|$)/i.test(img.src);
        const small = alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92);
        const { src, srcset } = img;
        img.removeAttribute('srcset');
        img.src = small;
        await img.decode().catch(() => {});
        restore.push(() => {
          img.src = src;
          if (srcset) img.srcset = srcset;
        });
      } catch {
        /* the site didn't allow reading the picture; leave it as it is */
      }
    }),
  );
  return () => restore.forEach((f) => f());
}

/** A tiny fingerprint of a rendered canvas, to tell whether another pass changed anything. */
function fingerprint(canvas: HTMLCanvasElement) {
  const c = document.createElement('canvas');
  c.width = c.height = 24;
  const g = c.getContext('2d')!;
  g.drawImage(canvas, 0, 0, 24, 24);
  const d = g.getImageData(0, 0, 24, 24).data;
  let sum = 0;
  for (let i = 0; i < d.length; i++) sum = (sum * 31 + d[i]) % 1_000_000_007;
  return sum;
}

export async function renderNodeToBlob(node: HTMLElement, w: number, h: number, pixelRatio: number): Promise<Blob> {
  await document.fonts.ready;
  await waitForImages(node);
  const undo = await downsizeImages(node, pixelRatio);
  try {
    return await render(node, w, h, pixelRatio);
  } finally {
    undo();
  }
}

async function render(node: HTMLElement, w: number, h: number, pixelRatio: number): Promise<Blob> {
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
  let canvas: HTMLCanvasElement;
  try {
    canvas = await toCanvas(node, opts);
    // Safari draws pictures into the snapshot only once they've decoded, so early passes can
    // come out with pictures missing. Keep rendering until two passes in a row match.
    if (isSafari) {
      let last = fingerprint(canvas);
      for (let pass = 0; pass < 5; pass++) {
        const next = await toCanvas(node, opts);
        const fp = fingerprint(next);
        canvas = next;
        if (fp === last) break;
        last = fp;
      }
    }
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
