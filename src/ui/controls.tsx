import { useRef, useState, type ReactNode } from 'react';
import { GAP_OPTIONS, RANGE_PRESETS, resolveRange, toISODate } from '../lib/range';
import type { RangeSpec } from '../lib/types';
import { fileToDataUrl } from '../lib/images';
import { useApp } from '../store';

export function Section({ title, children, defaultOpen = true, right }: { title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`section ${open ? 'open' : ''}`}>
      <button className="section-head" onClick={() => setOpen(!open)}>
        <span className="chev">{open ? '▾' : '▸'}</span>
        <span>{title}</span>
        {right && (
          <span className="section-right" onClick={(e) => e.stopPropagation()}>
            {right}
          </span>
        )}
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="field-control">{children}</div>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Slider({ value, min, max, step = 1, onChange, suffix }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <input
        className="num"
        type="number"
        step={step}
        value={Number.isInteger(step) ? Math.round(value) : Number(value.toFixed(2))}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </div>
  );
}

export function Select<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select
      className="select"
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value);
        if (o) onChange(o.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} title={o.title} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="track">
        <span className="knob" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function ColorInput({ value, onChange, allowClear, placeholder }: { value: string | undefined; onChange: (v: string | undefined) => void; allowClear?: boolean; placeholder?: string }) {
  const isHex = !!value && /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div className="color-input">
      <span className="swatch" style={{ background: value || placeholder || 'transparent' }}>
        <input type="color" value={isHex ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      </span>
      <input className="text" value={value ?? ''} placeholder={placeholder ?? 'theme'} onChange={(e) => onChange(e.target.value || undefined)} />
      {allowClear && value && (
        <button className="mini" onClick={() => onChange(undefined)} title="Use theme color">
          ×
        </button>
      )}
    </div>
  );
}

/**
 * A number box you can type in freely: a half-typed or out-of-range number isn't applied (so
 * clearing the box to type a new width doesn't squash anything to the minimum), and leaving the box
 * puts back the last value that was. `live: false` applies it only when you leave the box / press Enter.
 */
export function NumberInput({ value, onChange, min = -Infinity, max = Infinity, live = true }: { value: number; onChange: (v: number) => void; min?: number; max?: number; live?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    const n = Math.round(Number(text));
    if (text.trim() && Number.isFinite(n) && n >= min && n <= max && n !== value) onChange(n);
  };
  return (
    <input
      className="text-input"
      type="number"
      inputMode="numeric"
      min={Number.isFinite(min) ? min : undefined}
      max={Number.isFinite(max) ? max : undefined}
      value={draft ?? value}
      onChange={(e) => {
        setDraft(e.target.value);
        if (live) commit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== null && !live) commit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

export function TextInput({ value, onChange, placeholder, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return multiline ? (
    <textarea className="text-input" rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input className="text-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

/** `gaps`: show the skip-breaks choice (the stats pages keep it in Settings instead). */
export function RangePicker({ value, onChange, compact, gaps = true }: { value: RangeSpec; onChange: (r: RangeSpec) => void; compact?: boolean; gaps?: boolean }) {
  // nothing before your first scrobble (or after today) can be picked
  const firstTs = useApp((st) => (st.lib?.n ? st.lib.ts[0] : null));
  const today = toISODate(new Date());
  const minISO = firstTs ? toISODate(new Date(firstTs * 1000)) : '2002-01-01';
  const clamp = (d: string) => (d < minISO ? minISO : d > today ? today : d);
  const r = resolveRange(value);
  const start = clamp(value.start ?? toISODate(new Date(Math.max(r.from, 0) * 1000)));
  const end = clamp(value.end ?? toISODate(new Date((r.to - 1) * 1000)));
  const thisYear = new Date().getFullYear();
  const firstYear = firstTs ? new Date(firstTs * 1000).getFullYear() : 2003;
  const years: number[] = [];
  for (let y = thisYear; y >= firstYear; y--) years.push(y);
  // hide presets that end before your first scrobble
  const presets = RANGE_PRESETS.filter((p) => p.value === 'all' || p.value === 'custom' || !firstTs || resolveRange({ preset: p.value }).to > firstTs);
  const selected = value.preset === 'year' ? `y${value.year ?? thisYear}` : value.preset;
  return (
    <div className={`range-picker ${compact ? 'compact' : ''}`}>
      <select
        className="select"
        value={selected}
        onChange={(e) => {
          const v = e.target.value;
          const keep = value.gapDays ? { gapDays: value.gapDays } : {};
          if (v.startsWith('y')) onChange({ preset: 'year', year: Number(v.slice(1)), ...keep });
          else if (v === 'month') {
            // start on the latest month of what you were looking at (this month for "this year")
            const at = new Date(Math.min(r.to * 1000 - 1, Date.now()));
            onChange({ preset: 'month', year: at.getFullYear(), month: at.getMonth(), ...keep });
          } else if (v === 'custom') onChange({ preset: 'custom', start, end, ...keep });
          else onChange({ preset: v as RangeSpec['preset'], ...keep });
        }}
      >
        {presets.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
        <optgroup label="Year">
          {years.map((y) => (
            <option key={y} value={`y${y}`}>
              {y}
            </option>
          ))}
        </optgroup>
      </select>
      {value.preset === 'month' && <MonthSelect value={value} onChange={onChange} firstTs={firstTs} years={years} />}
      {value.preset === 'custom' && (
        <div className="dates">
          <input type="date" min={minISO} max={end} value={start} onChange={(e) => e.target.value && onChange({ ...value, preset: 'custom', start: clamp(e.target.value), end })} />
          <span>→</span>
          <input type="date" min={start} max={today} value={end} onChange={(e) => e.target.value && onChange({ ...value, preset: 'custom', start, end: clamp(e.target.value) })} />
        </div>
      )}
      {gaps && (
      <select
        className={`select gap-select ${value.gapDays ? 'on' : ''}`}
        value={value.gapDays ?? 0}
        title="Leave long stretches with no scrobbles out of averages, day counts and charts"
        onChange={(e) => {
          const n = Number(e.target.value);
          const next = { ...value };
          if (n) next.gapDays = n;
          else delete next.gapDays;
          onChange(next);
        }}
      >
        {GAP_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      )}
    </div>
  );
}

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'short' }));

/** Month + year pickers for the "A specific month" range. Months before your first scrobble or after this one can't be picked. */
function MonthSelect({ value, onChange, firstTs, years }: { value: RangeSpec; onChange: (r: RangeSpec) => void; firstTs: number | null; years: number[] }) {
  const now = new Date();
  const first = firstTs ? new Date(firstTs * 1000) : new Date(2002, 0, 1);
  const year = value.year ?? now.getFullYear();
  const month = value.month ?? now.getMonth();
  const ok = (y: number, m: number) => (y > first.getFullYear() || (y === first.getFullYear() && m >= first.getMonth())) && (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth()));
  const set = (y: number, m: number) => {
    // keep the month if it exists in that year, otherwise the nearest one that does
    let mm = m;
    if (!ok(y, mm)) mm = y === now.getFullYear() ? Math.min(m, now.getMonth()) : Math.max(m, first.getMonth());
    onChange({ ...value, preset: 'month', year: y, month: mm });
  };
  return (
    <div className="dates">
      <select className="select" value={month} onChange={(e) => set(year, Number(e.target.value))} aria-label="Month">
        {MONTHS.map((name, i) => (
          <option key={i} value={i} disabled={!ok(year, i)}>
            {name}
          </option>
        ))}
      </select>
      <select className="select" value={year} onChange={(e) => set(Number(e.target.value), month)} aria-label="Year">
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

export function UploadButton({ onImage, children, className }: { onImage: (dataUrl: string) => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={className ?? 'btn'} type="button" onClick={() => ref.current?.click()}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onImage(await fileToDataUrl(f));
          e.target.value = '';
        }}
      />
    </>
  );
}
