import { useRef, useState, type ReactNode } from 'react';
import { RANGE_PRESETS, resolveRange, toISODate } from '../lib/range';
import type { RangeSpec } from '../lib/types';
import { fileToDataUrl } from '../lib/images';

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

export function TextInput({ value, onChange, placeholder, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return multiline ? (
    <textarea className="text-input" rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input className="text-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

export function RangePicker({ value, onChange, compact }: { value: RangeSpec; onChange: (r: RangeSpec) => void; compact?: boolean }) {
  const r = resolveRange(value);
  const start = value.start ?? toISODate(new Date(Math.max(r.from, 0) * 1000));
  const end = value.end ?? toISODate(new Date((r.to - 1) * 1000));
  const years: number[] = [];
  for (let y = new Date().getFullYear(); y >= 2003; y--) years.push(y);
  return (
    <div className={`range-picker ${compact ? 'compact' : ''}`}>
      <select
        className="select"
        value={value.preset === 'custom' && isWholeYear(value) ? `y${value.start!.slice(0, 4)}` : value.preset}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith('y')) onChange({ preset: 'custom', start: `${v.slice(1)}-01-01`, end: `${v.slice(1)}-12-31` });
          else if (v === 'custom') onChange({ preset: 'custom', start, end });
          else onChange({ preset: v as RangeSpec['preset'] });
        }}
      >
        {RANGE_PRESETS.map((p) => (
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
      {value.preset === 'custom' && !isWholeYear(value) && (
        <div className="dates">
          <input type="date" value={start} onChange={(e) => onChange({ preset: 'custom', start: e.target.value, end })} />
          <span>→</span>
          <input type="date" value={end} onChange={(e) => onChange({ preset: 'custom', start, end: e.target.value })} />
        </div>
      )}
    </div>
  );
}

function isWholeYear(v: RangeSpec) {
  return !!v.start && !!v.end && v.start.endsWith('-01-01') && v.end.endsWith('-12-31') && v.start.slice(0, 4) === v.end.slice(0, 4);
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
