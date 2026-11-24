import type { RangePreset, RangeSpec, TimeRange } from './types';

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'this-year', label: 'This year' },
  { value: 'last-year', label: 'Last year' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'month', label: 'Month…' },
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
  const r = resolveDates(spec, now);
  return spec.gapDays ? { ...r, gapDays: spec.gapDays } : r;
}

export const GAP_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Keep breaks' },
  { value: 14, label: 'Skip breaks of 2+ weeks' },
  { value: 30, label: 'Skip breaks of 1+ month' },
  { value: 60, label: 'Skip breaks of 2+ months' },
  { value: 90, label: 'Skip breaks of 3+ months' },
];

function resolveDates(spec: RangeSpec, now: Date): TimeRange {
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
    case 'year': {
      const yr = spec.year ?? y;
      return { from: sec(new Date(yr, 0, 1)), to: sec(new Date(yr + 1, 0, 1)) };
    }
    case 'month': {
      const yr = spec.year ?? y;
      const mo = spec.month ?? m;
      return { from: sec(new Date(yr, mo, 1)), to: sec(new Date(yr, mo + 1, 1)) };
    }
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
  const p = previousDates(spec, r);
  return r.gapDays ? { ...p, gapDays: r.gapDays } : p;
}

function previousDates(spec: RangeSpec, r: TimeRange): TimeRange {
  const from = new Date(r.from * 1000);
  if (spec.preset === 'this-year' || spec.preset === 'last-year' || spec.preset === 'year') {
    return { from: sec(new Date(from.getFullYear() - 1, 0, 1)), to: r.from };
  }
  if (spec.preset === 'this-month' || spec.preset === 'last-month' || spec.preset === 'month') {
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
    case 'month':
      return fmt(new Date(r.from * 1000), { month: 'long', year: 'numeric' });
    case 'year':
      return String(spec.year ?? now.getFullYear());
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

export type CompareMode = 'previous' | 'lastYear' | 'none';

/**
 * The range to compare against: the period right before, or the same dates a year earlier.
 * A period still in progress (this year, this month, the last 7 days including today) is compared
 * with the same stretch of the other period only, e.g. Jan 1 – today vs Jan 1 – this day last year,
 * so the numbers aren't measured against a full period that's had more time.
 */
export function compareRange(spec: RangeSpec, r: TimeRange, mode: CompareMode, now = new Date()): TimeRange | null {
  if (mode === 'none' || spec.preset === 'all') return null;
  const nowSec = sec(now);
  let out: TimeRange;
  if (mode === 'previous') {
    out = previousRange(spec, r);
    if (r.to > nowSec && nowSec > r.from) out = { ...out, to: Math.min(out.to, out.from + (nowSec - r.from)) };
  } else {
    const yearBack = (t: number) => {
      const d = new Date(t * 1000);
      return sec(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
    };
    out = { from: yearBack(r.from), to: yearBack(Math.min(r.to, Math.max(nowSec, r.from))) };
    if (r.gapDays) out.gapDays = r.gapDays;
  }
  return out;
}

export function compareLabel(mode: CompareMode) {
  return mode === 'previous' ? 'vs previous period' : mode === 'lastYear' ? 'vs same time last year' : '';
}
