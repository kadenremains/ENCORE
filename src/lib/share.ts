/** Hand files to the user: the share sheet on phones (save to Photos / Files, Instagram), a download elsewhere. */
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
