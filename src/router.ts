import { useSyncExternalStore } from 'react';
import type { EntityKind } from './lib/types';

/**
 * Tiny hash router. Hash routing works on GitHub Pages with no server config,
 * and gives real back/forward (and iOS swipe-back) between pages.
 */
export type Route =
  | { name: 'overview' }
  | { name: 'top'; kind: EntityKind }
  | { name: 'entity'; kind: EntityKind; artist: string; title: string }
  | { name: 'listening' }
  | { name: 'records' }
  | { name: 'create' }
  | { name: 'edit'; id: string }
  | { name: 'images' };

const enc = encodeURIComponent;
const dec = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [a, b, c] = parts;
  switch (a) {
    case 'artists':
      return { name: 'top', kind: 'artist' };
    case 'albums':
      return { name: 'top', kind: 'album' };
    case 'songs':
      return { name: 'top', kind: 'track' };
    case 'artist':
      if (b) return { name: 'entity', kind: 'artist', artist: dec(b), title: dec(b) };
      break;
    case 'album':
    case 'song':
      if (b && c) return { name: 'entity', kind: a === 'album' ? 'album' : 'track', artist: dec(b), title: dec(c) };
      break;
    case 'listening':
      return { name: 'listening' };
    case 'records':
      return { name: 'records' };
    case 'create':
      return { name: 'create' };
    case 'edit':
      if (b) return { name: 'edit', id: b };
      break;
    case 'images':
      return { name: 'images' };
  }
  return { name: 'overview' };
}

export function routePath(r: Route): string {
  switch (r.name) {
    case 'overview':
      return '#/';
    case 'top':
      return r.kind === 'artist' ? '#/artists' : r.kind === 'album' ? '#/albums' : '#/songs';
    case 'entity':
      return r.kind === 'artist' ? `#/artist/${enc(r.artist)}` : `#/${r.kind === 'album' ? 'album' : 'song'}/${enc(r.artist)}/${enc(r.title)}`;
    case 'listening':
      return '#/listening';
    case 'records':
      return '#/records';
    case 'create':
      return '#/create';
    case 'edit':
      return `#/edit/${r.id}`;
    case 'images':
      return '#/images';
  }
}

export const entityPath = (kind: EntityKind, name: string, artist: string) => routePath({ name: 'entity', kind, artist, title: name });

export function navigate(r: Route | string) {
  const path = typeof r === 'string' ? r : routePath(r);
  if (location.hash !== path) location.hash = path;
  window.scrollTo(0, 0);
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parseRoute(hash);
}

/**
 * Clicking an in-app link starts the new page at the top. Back/forward keeps the browser's
 * own scroll restoration, so returning to a list puts you where you were.
 */
let linkClicked = false;
export function installScrollToTopOnLinks() {
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="#/"]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank') return;
      linkClicked = a.getAttribute('href') !== location.hash;
    },
    true,
  );
  window.addEventListener('hashchange', () => {
    if (!linkClicked) return;
    linkClicked = false;
    window.scrollTo(0, 0);
    // after the new page renders too (it can be taller/shorter than the old one)
    requestAnimationFrame(() => window.scrollTo(0, 0));
  });
}
