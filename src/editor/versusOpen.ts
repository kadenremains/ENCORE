import type { Project } from './model';

/**
 * A "You vs." wrapped that was just made already has its comparison: hand the filled copy to the
 * editor for this one opening, so it doesn't ask to load what it has. Later openings ask.
 */
let pending: { id: string; filled: Project } | null = null;
export function openVersusFilled(id: string, filled: Project) {
  pending = { id, filled };
}
export function takeVersusFilled(id: string): Project | null {
  if (pending?.id !== id) return null;
  const p = pending.filled;
  pending = null;
  return p;
}
