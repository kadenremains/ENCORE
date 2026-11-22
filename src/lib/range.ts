import type { RangePreset, RangeSpec, TimeRange } from './types';

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'this-year', label: 'This year' },
  { value: 'last-year', label: 'Last year' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'last-7', label: 'Last 7 days' },
  { value: 'last-30', label: 'Last 30 days' },
  { value: 'last-90', label: 'Last 90 days' },
  { value: 'last-365', label: 'Last 365 days' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom dates…' },
];

const sec = (d: Date) => Math.floor(d.getTime() / 1000);

export function parseISODate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toISODate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function resolveRange(spec: RangeSpec, now = new Date()): TimeRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = new Date(y, m, now.getDate());
  const tomorrow = new Date(y, m, now.getDate() + 1);
  const daysBack = (n: number) => ({ from: sec(new Date(y, m, now.getDate() - n + 1)), to: sec(tomorrow) });
  switch (spec.preset) {
    case 'all':
      return { from: 0, to: sec(tomorrow) };
    case 'this-year':
      return { from: sec(new Date(y, 0, 1)), to: sec(new Date(y + 1, 0, 1)) };
    case 'last-year':
      return { from: sec(new Date(y - 1, 0, 1)), to: sec(new Date(y, 0, 1)) };
    case 'this-month':
      return { from: sec(new Date(y, m, 1)), to: sec(new Date(y, m + 1, 1)) };
    case 'last-month':
      return { from: sec(new Date(y, m - 1, 1)), to: sec(new Date(y, m, 1)) };
    case 'last-7':
      return daysBack(7);
    case 'last-30':
      return daysBack(30);
    case 'last-90':
      return daysBack(90);
    case 'last-365':
      return daysBack(365);
    case 'custom': {
      const s = spec.start ? parseISODate(spec.start) : new Date(y, 0, 1);
      const e = spec.end ? parseISODate(spec.end) : today;
      const end = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
      return s <= e ? { from: sec(s), to: sec(end) } : { from: sec(e), to: sec(new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1)) };
    }
  }
}

/** The equal-length period right before the range (calendar-aware for years / months). */
export function previousRange(spec: RangeSpec, r: TimeRange): TimeRange {
  const from = new Date(r.from * 1000);
  if (spec.preset === 'this-year' || spec.preset === 'last-year') {
    return { from: sec(new Date(from.getFullYear() - 1, 0, 1)), to: r.from };
  }
  if (spec.preset === 'this-month' || spec.preset === 'last-month') {
    return { from: sec(new Date(from.getFullYear(), from.getMonth() - 1, 1)), to: r.from };
  }
  const len = r.to - r.from;
  return { from: r.from - len, to: r.from };
}

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, opts);

export function rangeLabel(spec: RangeSpec, r: TimeRange, firstScrobble?: number): string {
  const now = new Date();
  switch (spec.preset) {
    case 'all':
      return firstScrobble ? `Since ${fmt(new Date(firstScrobble * 1000), { month: 'short', year: 'numeric' })}` : 'All time';
    case 'this-year':
      return String(now.getFullYear());
    case 'last-year':
      return String(now.getFullYear() - 1);
    case 'this-month':
    case 'last-month':
      return fmt(new Date(r.from * 1000), { month: 'long', year: 'numeric' });
    default: {
      const s = new Date(r.from * 1000);
      const e = new Date((r.to - 1) * 1000);
      // whole calendar year?
      if (s.getMonth() === 0 && s.getDate() === 1 && e.getMonth() === 11 && e.getDate() === 31 && s.getFullYear() === e.getFullYear()) return String(s.getFullYear());
      const sameYear = s.getFullYear() === e.getFullYear();
      if (sameYear && s.getMonth() === e.getMonth() && s.getDate() === 1 && new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1).getDate() === 1)
        return fmt(s, { month: 'long', year: 'numeric' });
      return `${fmt(s, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })} – ${fmt(e, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
  }
}
