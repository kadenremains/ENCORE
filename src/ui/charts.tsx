import { useState, type ReactNode } from 'react';
import { dayToDate } from '../lib/library';
import type { EntityKind } from '../lib/types';
import { EntityImg, fmtNum } from '../render/primitives';

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const fmtHour = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
export const fmtDate = (ts: number, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) => new Date(ts * 1000).toLocaleDateString(undefined, opts);
export const fmtDay = (d: number, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) => dayToDate(d).toLocaleDateString(undefined, opts);

/* ---------------- delta vs comparison period ---------------- */

export function Delta({ cur, prev, invert }: { cur: number; prev: number | null | undefined; invert?: boolean }) {
  if (prev === null || prev === undefined) return null;
  if (prev === 0) return cur > 0 ? <span className="delta up">new</span> : null;
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return <span className="delta flat">±0%</span>;
  const up = pct > 0;
  return (
    <span className={`delta ${up !== !!invert ? 'up' : 'down'}`} title={`was ${fmtNum(prev)}`}>
      {up ? '▲' : '▼'} {Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%
    </span>
  );
}

export function Move({ rank, prev }: { rank: number; prev: number | null | undefined }) {
  if (prev === undefined) return <span className="move" />;
  if (prev === null) return <span className="move new">new</span>;
  const d = prev - rank;
  if (d === 0) return <span className="move flat">=</span>;
  return <span className={`move ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>;
}

/* ---------------- KPI ---------------- */

export function Kpi({ value, label, sub, delta, href }: { value: ReactNode; label: string; sub?: ReactNode; delta?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">
        {label} {delta}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </>
  );
  return href ? (
    <a className="kpi link-kpi" href={href}>
      {body}
    </a>
  ) : (
    <div className="kpi">{body}</div>
  );
}

/* ---------------- ledger ---------------- */

export interface LedgerItem {
  key: string | number;
  rank?: number;
  kind: EntityKind;
  name: string;
  artist: string;
  meta?: ReactNode;
  value: number;
  valueLabel?: string;
  frac: number; // 0..1 bar width
  move?: ReactNode;
  href?: string;
  showImage?: boolean;
}

export function Ledger({ items, compact, empty = 'Nothing here for this range.' }: { items: LedgerItem[]; compact?: boolean; empty?: string }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <ol className={`ledger ${compact ? 'compact' : ''}`}>
      {items.map((it) => {
        const showImage = it.showImage !== false;
        const inner = (
          <>
            <span className="ledger-rk">{it.rank ?? ''}</span>
            {it.move !== undefined && <span className="ledger-mv">{it.move}</span>}
            {showImage ? <EntityImg kind={it.kind} name={it.name} artist={it.artist} size={compact ? 38 : 46} shape="square" /> : <span />}
            <span className="ledger-main">
              <span className="ledger-ttl">{it.name}</span>
              {it.meta && <span className="ledger-meta">{it.meta}</span>}
            </span>
            <span className="ledger-sc">
              {fmtNum(it.value)}
              {it.valueLabel !== '' && <small>{it.valueLabel ?? 'plays'}</small>}
            </span>
            <span className="ledger-bar" style={{ width: `calc((100% - var(--bar-left)) * ${Math.max(0, Math.min(1, it.frac)).toFixed(4)})` }} />
          </>
        );
        const cls = `ledger-row ${it.move !== undefined ? 'with-move' : ''} ${showImage ? '' : 'no-img'}`;
        return (
          <li key={it.key}>
            {it.href ? (
              <a className={cls} href={it.href}>
                {inner}
              </a>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- bar chart ---------------- */

export interface Bar {
  label: string;
  value: number;
  tip?: string;
  axis?: string;
  dim?: boolean;
  /** days of skipped break right before this bar */
  afterBreak?: number;
}

export function BarChart({ data, height = 160, highlightMax = true, compare }: { data: Bar[]; height?: number; highlightMax?: boolean; compare?: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value), ...(compare ?? []));
  const peak = data.reduce((b, d, i) => (d.value > data[b].value ? i : b), 0);
  const h = hover ?? null;
  return (
    <div className="barchart" onPointerLeave={() => setHover(null)}>
      <div className="barchart-tip">{h !== null ? (data[h].tip ?? `${data[h].label} · ${fmtNum(data[h].value)} plays`) : ' '}</div>
      <div className="barchart-bars" style={{ height, gap: data.length > 60 ? 1 : data.length > 30 ? 2 : 4 }}>
        {data.map((d, i) => (
          <div key={i} className={`bc-col ${h === i ? 'hover' : ''} ${d.afterBreak ? 'after-break' : ''}`} onPointerEnter={() => setHover(i)} onClick={() => setHover(i)}>
            {compare && <span className="bc-ghost" style={{ height: `${((compare[i] ?? 0) / max) * 100}%` }} />}
            <span className={`bc-bar ${highlightMax && i === peak ? 'peak' : ''} ${d.dim ? 'dim' : ''}`} style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="barchart-axis">
        {data.map((d, i) => (
          <span key={i}>{d.axis ?? ''}</span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- calendar heatmap ---------------- */

export function CalendarHeatmap({ counts, startDay, endDay, onPick }: { counts: Map<number, number>; startDay: number; endDay: number; onPick?: (day: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const start = dayToDate(startDay);
  const lead = (start.getDay() + 6) % 7; // Monday-first
  const first = startDay - lead;
  const weeks = Math.ceil((endDay - first + 1) / 7);
  const vals = [...counts.entries()].filter(([d]) => d >= startDay && d <= endDay).map(([, v]) => v).sort((a, b) => a - b);
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] ?? 1;
  const levels = [q(0.25), q(0.5), q(0.75), q(0.93)];
  const level = (v: number) => (v <= 0 ? 0 : v <= levels[0] ? 1 : v <= levels[1] ? 2 : v <= levels[2] ? 3 : v <= levels[3] ? 4 : 5);
  const C = 12;
  const G = 3;
  const left = 26;
  const top = 16;
  const months: { x: number; label: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    const d7 = dayToDate(first + w * 7 + 6);
    if (w === 0 || d7.getMonth() !== dayToDate(first + (w - 1) * 7 + 6).getMonth()) months.push({ x: left + w * (C + G), label: d7.toLocaleDateString(undefined, { month: 'short' }) });
  }
  const W = left + weeks * (C + G);
  const H = top + 7 * (C + G);
  return (
    <div className="heatmap">
      <div className="barchart-tip">{hover !== null ? `${fmtDay(hover)} · ${fmtNum(counts.get(hover) ?? 0)} plays` : ' '}</div>
      <div className="heatmap-scroll" ref={(el) => void (el && (el.scrollLeft = el.scrollWidth))}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W * 1.6 }} onPointerLeave={() => setHover(null)}>
          {months.map((m, i) => (
            <text key={i} x={m.x} y={10} className="hm-label">
              {m.label}
            </text>
          ))}
          {[0, 2, 4].map((r) => (
            <text key={r} x={0} y={top + r * (C + G) + C - 2} className="hm-label">
              {WD[r]}
            </text>
          ))}
          {Array.from({ length: weeks * 7 }, (_, k) => {
            const day = first + k;
            if (day < startDay || day > endDay) return null;
            const w = Math.floor(k / 7);
            const r = k % 7;
            const v = counts.get(day) ?? 0;
            return (
              <rect
                key={k}
                x={left + w * (C + G)}
                y={top + r * (C + G)}
                width={C}
                height={C}
                rx={1.5}
                className={`hm l${level(v)} ${hover === day ? 'hover' : ''}`}
                onPointerEnter={() => setHover(day)}
                onClick={() => (onPick ? onPick(day) : setHover(day))}
              />
            );
          })}
        </svg>
      </div>
      <div className="heatmap-legend">
        less <i className="hm l0" />
        <i className="hm l1" />
        <i className="hm l2" />
        <i className="hm l3" />
        <i className="hm l4" />
        <i className="hm l5" /> more
      </div>
    </div>
  );
}

/* ---------------- hour × weekday punchcard ---------------- */

export function Punchcard({ matrix }: { matrix: number[][] }) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const max = Math.max(1, ...matrix.flat());
  const C = 26;
  const left = 34;
  const top = 6;
  const W = left + 24 * C;
  const H = top + 7 * C + 18;
  return (
    <div className="punchcard">
      <div className="barchart-tip">{hover ? `${WD[hover[0]]} ${fmtHour(hover[1])}–${fmtHour((hover[1] + 1) % 24)} · ${fmtNum(matrix[hover[0]][hover[1]])} plays` : ' '}</div>
      <div className="heatmap-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 520, display: 'block' }} onPointerLeave={() => setHover(null)}>
          {WD.map((d, r) => (
            <text key={d} x={0} y={top + r * C + C / 2 + 4} className="hm-label">
              {d}
            </text>
          ))}
          {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
            <text key={h} x={left + h * C + C / 2} y={H - 4} className="hm-label" textAnchor="middle">
              {fmtHour(h)}
            </text>
          ))}
          {matrix.map((row, r) =>
            row.map((v, h) => {
              const rad = v ? Math.max(1.5, Math.sqrt(v / max) * (C / 2 - 2)) : 0;
              return (
                <g key={`${r}-${h}`} onPointerEnter={() => setHover([r, h])} onClick={() => setHover([r, h])}>
                  <rect x={left + h * C} y={top + r * C} width={C} height={C} fill="transparent" />
                  <circle cx={left + h * C + C / 2} cy={top + r * C + C / 2} r={rad} className={`pc ${hover && hover[0] === r && hover[1] === h ? 'hover' : ''}`} />
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </div>
  );
}

/* ---------------- area spark (all-time monthly) ---------------- */

/**
 * Plays over all time, one point per month or per week. The shaded part is the buckets the
 * selected range touches.
 */
export function AreaSpark({ data, unit = 'month', height = 120, highlight }: { data: { start: Date; value: number }[]; unit?: 'month' | 'week'; height?: number; highlight?: { from: number; to: number } }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <p className="empty">Not enough history yet.</p>;
  const W = 600;
  const H = height;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = W / (data.length - 1);
  const x = (i: number) => i * step;
  const y = (v: number) => H - 4 - (v / max) * (H - 10);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  let hl: { x0: number; x1: number } | null = null;
  if (highlight) {
    // bucket i covers [start i, start i+1); shade the ones that overlap the range
    const startOf = (i: number) => data[i].start.getTime() / 1000;
    const endOf = (i: number) => (i + 1 < data.length ? startOf(i + 1) : Infinity);
    const hit = data.map((_, i) => i).filter((i) => endOf(i) > highlight.from && startOf(i) < highlight.to);
    if (hit.length && hit.length < data.length) {
      const half = hit.length === 1 ? step / 2 : 0; // a single point still gets a visible band
      hl = { x0: Math.max(0, x(hit[0]) - half), x1: Math.min(W, x(hit[hit.length - 1]) + half) };
    }
  }
  const years = data.map((d, i) => ({ i, d })).filter(({ d, i }) => i > 0 && d.start.getFullYear() !== data[i - 1].start.getFullYear());
  const yStep = Math.max(1, Math.ceil(years.length / 8));
  const tip = (d: { start: Date; value: number }) =>
    unit === 'week'
      ? `Week of ${d.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${fmtNum(d.value)} plays`
      : `${d.start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · ${fmtNum(d.value)} plays`;
  return (
    <div className="spark">
      <div className="barchart-tip">{hover !== null ? tip(data[hover]) : ' '}</div>
      <svg
        viewBox={`0 0 ${W} ${H + 16}`}
        preserveAspectRatio="none"
        width="100%"
        height={H + 16}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(((e.clientX - r.left) / r.width) * (data.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {hl && <rect x={hl.x0} y={0} width={Math.max(2, hl.x1 - hl.x0)} height={H} className="spark-hl" />}
        <path d={`${line} L${W},${H} L0,${H} Z`} className="spark-fill" />
        <path d={line} className="spark-line" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="spark-cursor" vectorEffect="non-scaling-stroke" />}
        {years
          .filter((_, k) => k % yStep === 0)
          .map(({ i, d }) => (
            <text key={i} x={x(i)} y={H + 13} className="hm-label" textAnchor="middle" style={{ fontSize: 10 }}>
              {d.start.getFullYear()}
            </text>
          ))}
      </svg>
    </div>
  );
}

export function Panel({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel-box ${className ?? ''}`}>
      {(title || right) && (
        <div className="panel-box-head">
          {title && <h3>{title}</h3>}
          {right && <div className="panel-box-right">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export const WEEKDAYS = WD;
