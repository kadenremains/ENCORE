/** requests in flight, and the ones that were when the app was last put away */
const running = new Set<AbortController>();
const AWAY_LONG_ENOUGH = 10_000;
let leftAt = 0;
let leftRunning: AbortController[] = [];

/**
 * fetch with a time limit. On iPhone, a request that's in flight when the app is put away (switching
 * apps, locking the screen) can be left hanging for good: it never answers and never fails, and
 * whatever waits on it (the "Checking for new scrobbles" pill, a picture search slot) waits forever.
 * After `ms` it fails like a dropped connection instead, so the caller retries or says so. The limit
 * covers reading the response too, not just the first byte.
 */
export function fetchWithin(url: string, init: RequestInit = {}, ms = 20_000): Promise<Response> {
  const ctl = new AbortController();
  running.add(ctl);
  setTimeout(() => {
    running.delete(ctl);
    ctl.abort(new DOMException(`No answer within ${ms / 1000}s`, 'TimeoutError'));
  }, ms);
  return fetch(url, { ...init, signal: ctl.signal });
}

/**
 * Coming back after the app was away for a while: requests that were running when it left are
 * almost certainly dead, so they're dropped now (and retried by whoever made them) rather than
 * waiting out their time limit. A quick switch away and back leaves them alone.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      leftAt = Date.now();
      leftRunning = [...running];
      return;
    }
    if (Date.now() - leftAt >= AWAY_LONG_ENOUGH) for (const ctl of leftRunning) ctl.abort(new DOMException('Lost while the app was away', 'AbortError'));
    leftRunning = [];
  });
}
