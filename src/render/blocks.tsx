import type { CSSProperties, ReactNode } from 'react';
import type { Library, RangeStats } from '../lib/library';
import { getStats, dayToDate } from '../lib/library';
import { previousRange, rangeLabel, resolveRange } from '../lib/range';
import type { EntityKind, RangeSpec, RankedItem } from '../lib/types';
import {
  fontFamily,
  type Block,
  type ChartBlock,
  type ImageBlock,
  type LeaderboardBlock,
  type MonthsBlock,
  type Project,
  type ShapeBlock,
  type StatBlock,
  type StatId,
  type TextBlock,
  type Theme,
  type TopListBlock,
} from '../editor/model';
import { EntityImg, Movement, fmtNum, shapeRadius } from './primitives';
import type { ImageShape } from '../editor/model';

export interface RenderCtx {
  lib: Library;
  project: Project;
  theme: Theme;
  username: string;
}

/* ---------------- helpers ---------------- */

export function withAlpha(color: string, a: number) {
  const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const rgba = color.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a0 = '1'] = rgba[1].split(',').map((s) => s.trim());
    return `rgba(${r},${g},${b},${Number(a0) * a})`;
  }
  return color;
}

export function blockRange(ctx: RenderCtx, b: Block): { spec: RangeSpec; stats: RangeStats } {
  const spec = b.range ?? ctx.project.range;
  return { spec, stats: getStats(ctx.lib, resolveRange(spec)) };
}

function palette(ctx: RenderCtx, b: Block) {
  const text = b.color || ctx.theme.text;
  const t = ctx.theme;
  return {
    text,
    muted: b.color ? withAlpha(b.color, 0.62) : t.muted,
    accent: b.accent || t.accent,
    heading: fontFamily(t.headingFont),
    body: fontFamily(b.font || t.bodyFont),
    name: fontFamily(b.font || t.nameFont || t.bodyFont),
    serifNames: !b.font && !!t.nameFont && ['cormorant', 'instrument', 'dmserif'].includes(t.nameFont),
    tracking: `${t.headingTracking ?? 0}em`,
    trackingEm: t.headingTracking ?? 0,
    sharp: !!t.sharp,
    line: withAlpha(text, 0.14),
  };
}

type Pal = ReturnType<typeof palette>;

/** Style for an artist / album / song name. Serif name fonts run small, so bump them. */
const nameStyle = (p: Pal, size: number): CSSProperties => ({ fontFamily: p.name, fontWeight: p.serifNames ? 400 : 700, fontSize: p.serifNames ? size * 1.2 : size });

/** In sharp themes, rounded image corners become (almost) square. */
const shapeFor = (p: Pal, s: ImageShape): ImageShape => (p.sharp && s === 'rounded' ? 'square' : s);

function titleHeight(b: Block) {
  return b.showTitle && b.title ? Math.round(b.titleSize * 1.6) : 0;
}

export function innerSize(b: Block) {
  return { w: Math.max(10, b.w - b.padding * 2), h: Math.max(10, b.h - b.padding * 2 - titleHeight(b)) };
}

const ellipsis: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 };

function subFor(item: RankedItem, showSub: boolean) {
  if (!showSub || item.kind === 'artist') return '';
  return item.artist;
}

/* ---------------- tokens ---------------- */

export const TOKENS = ['{range}', '{user}', '{year}', '{scrobbles}', '{minutes}', '{hours}', '{artists}', '{albums}', '{songs}', '{topArtist}', '{topAlbum}', '{topTrack}'];

export function fillTokens(text: string, ctx: RenderCtx, spec: RangeSpec, s: RangeStats) {
  if (!text.includes('{')) return text;
  const min = s.total * ctx.project.avgTrackMinutes;
  const top = (k: EntityKind) => s.top(k, 1)[0]?.name ?? '—';
  const map: Record<string, string> = {
    range: rangeLabel(spec, s.range, ctx.lib.n ? ctx.lib.ts[0] : undefined),
    user: ctx.username,
    year: String(new Date((s.range.to - 1) * 1000).getFullYear()),
    scrobbles: fmtNum(s.total),
    minutes: fmtNum(min),
    hours: fmtNum(min / 60),
    artists: fmtNum(s.unique('artist')),
    albums: fmtNum(s.unique('album')),
    songs: fmtNum(s.unique('track')),
    topArtist: top('artist'),
    topAlbum: top('album'),
    topTrack: top('track'),
  };
  return text.replace(/\{(\w+)\}/g, (m, k) => map[k] ?? m);
}

/* ---------------- stat values ---------------- */

const fmtDay = (d: number, year = false) => dayToDate(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
const fmtHour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

export function statValue(s: RangeStats, id: StatId, avgMin: number): { value: string; sub: string } {
  const lib = s.lib;
  switch (id) {
    case 'scrobbles':
      return { value: fmtNum(s.total), sub: '' };
    case 'minutes':
      return { value: fmtNum(s.total * avgMin), sub: `≈ ${fmtNum((s.total * avgMin) / 60)} hours` };
    case 'hours':
      return { value: fmtNum((s.total * avgMin) / 60), sub: '' };
    case 'days':
      return { value: ((s.total * avgMin) / 1440).toFixed(1), sub: '' };
    case 'uniqueArtists':
      return { value: fmtNum(s.unique('artist')), sub: '' };
    case 'uniqueAlbums':
      return { value: fmtNum(s.unique('album')), sub: '' };
    case 'uniqueTracks':
      return { value: fmtNum(s.unique('track')), sub: '' };
    case 'avgPerDay':
      return { value: (s.total / s.spanDays).toFixed(s.total / s.spanDays >= 100 ? 0 : 1), sub: '' };
    case 'activeDays':
      return { value: fmtNum(s.activeDays), sub: `out of ${fmtNum(s.spanDays)}` };
    case 'streak': {
      const st = s.longestStreak();
      return st ? { value: fmtNum(st.days), sub: `${fmtDay(st.start)} – ${fmtDay(st.end, true)}` } : { value: '0', sub: '' };
    }
    case 'artistStreak': {
      const st = s.artistStreak();
      return st ? { value: fmtNum(st.streak.days), sub: `of ${lib.artists[st.artist].name}` } : { value: '0', sub: '' };
    }
    case 'busiestDay': {
      const b = s.busiestDay();
      return b ? { value: fmtNum(b.count), sub: `plays on ${fmtDay(b.day, true)}` } : { value: '0', sub: '' };
    }
    case 'newArtists': {
      const d = s.discoveries('artist');
      return { value: fmtNum(d.length), sub: d[0] ? `led by ${lib.artists[d[0].idx].name}` : '' };
    }
    case 'newTracks': {
      const d = s.discoveries('track');
      return { value: fmtNum(d.length), sub: d[0] ? `led by ${lib.tracks[d[0].idx].name}` : '' };
    }
    case 'obsession': {
      const o = s.obsession();
      return o ? { value: fmtNum(o.count), sub: `“${lib.tracks[o.track].name}” on ${fmtDay(o.day)}` } : { value: '0', sub: '' };
    }
    case 'peakHour': {
      const h = s.peakHour();
      return { value: fmtHour(h), sub: `${fmtNum(s.byHour()[h])} plays` };
    }
    case 'topArtistPlays': {
      const t = s.top('artist', 1)[0];
      return { value: fmtNum(t?.count ?? 0), sub: t?.name ?? '' };
    }
    case 'topTrackPlays': {
      const t = s.top('track', 1)[0];
      return { value: fmtNum(t?.count ?? 0), sub: t ? `${t.name} — ${t.artist}` : '' };
    }
    case 'percentTopArtist': {
      const t = s.top('artist', 1)[0];
      const p = t && s.total ? (t.count / s.total) * 100 : 0;
      return { value: `${p.toFixed(p < 10 ? 1 : 0)}%`, sub: t?.name ?? '' };
    }
  }
}

/* ---------------- frame ---------------- */

function cardStyle(ctx: RenderCtx, b: Block): CSSProperties {
  const c = b.cardColor || ctx.theme.card;
  switch (b.card) {
    case 'glass':
      return { background: c, backdropFilter: 'blur(24px)', border: `1.5px solid ${withAlpha(b.color || ctx.theme.text, 0.12)}` };
    case 'solid':
      return { background: b.cardColor || ctx.theme.accent };
    case 'outline':
      return { border: `3px solid ${b.cardColor || b.color || ctx.theme.text}` };
    default:
      return {};
  }
}

export function BlockView({ ctx, block }: { ctx: RenderCtx; block: Block }) {
  if (block.hidden) return null;
  const p = palette(ctx, block);
  const frame: CSSProperties = {
    position: 'absolute',
    left: block.x,
    top: block.y,
    width: block.w,
    height: block.h,
    transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined,
    opacity: block.opacity,
    padding: block.padding,
    borderRadius: block.card === 'none' && block.type !== 'shape' ? 0 : ctx.theme.sharp ? Math.min(block.radius, 3) : block.radius,
    boxSizing: 'border-box',
    color: p.text,
    fontFamily: p.body,
    display: 'flex',
    flexDirection: 'column',
    overflow: block.type === 'text' ? 'visible' : 'hidden',
    ...cardStyle(ctx, block),
  };
  const th = titleHeight(block);
  return (
    <div style={frame} data-block={block.id}>
      {th > 0 && (
        <div style={{ height: th, flex: `0 0 ${th}px`, fontSize: block.titleSize, fontWeight: p.sharp ? 400 : 700, color: p.sharp ? p.muted : p.accent, letterSpacing: p.sharp ? '0.26em' : '0.06em', textTransform: 'uppercase', ...ellipsis, lineHeight: `${block.titleSize * 1.2}px` }}>
          {block.title}
        </div>
      )}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>{renderBody(ctx, block)}</div>
    </div>
  );
}

function renderBody(ctx: RenderCtx, b: Block): ReactNode {
  switch (b.type) {
    case 'text':
      return <TextView ctx={ctx} b={b} />;
    case 'toplist':
      return <TopListView ctx={ctx} b={b} />;
    case 'leaderboard':
      return <LeaderboardView ctx={ctx} b={b} />;
    case 'stat':
      return <StatView ctx={ctx} b={b} />;
    case 'image':
      return <ImageView ctx={ctx} b={b} />;
    case 'chart':
      return <ChartView ctx={ctx} b={b} />;
    case 'months':
      return <MonthsView ctx={ctx} b={b} />;
    case 'shape':
      return <ShapeView ctx={ctx} b={b} />;
  }
}

/* ---------------- text ---------------- */

function TextView({ ctx, b }: { ctx: RenderCtx; b: TextBlock }) {
  const p = palette(ctx, b);
  const { spec, stats } = blockRange(ctx, b);
  const family = b.fontRole === 'heading' ? p.heading : b.fontRole === 'body' ? fontFamily(ctx.theme.bodyFont) : p.body;
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: b.valign === 'top' ? 'flex-start' : b.valign === 'center' ? 'center' : 'flex-end',
        textAlign: b.align,
        fontFamily: family,
        fontSize: b.size,
        fontWeight: b.weight,
        fontStyle: b.italic ? 'italic' : undefined,
        letterSpacing: b.fontRole === 'heading' && p.trackingEm ? `calc(${b.letterSpacing}px + ${p.tracking})` : b.letterSpacing,
        lineHeight: b.lineHeight,
        textTransform: b.uppercase ? 'uppercase' : undefined,
        color: b.useAccent ? p.accent : p.text,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
      }}
    >
      {fillTokens(b.text, ctx, spec, stats)}
    </div>
  );
}

/* ---------------- top list ---------------- */

interface RowProps {
  item: RankedItem;
  h: number;
  b: TopListBlock;
  p: Pal;
  rankWidth: number;
  feature?: boolean;
  w: number;
}

function ListRow({ item, h, b, p, rankWidth, feature, w }: RowProps) {
  const s = b.itemScale;
  // scale with row height, but never so big that names get squeezed out by narrow boxes
  const nameSize = Math.max(10, Math.min(h * (feature ? 0.26 : 0.36), w * (feature ? 0.05 : 0.058)) * s);
  const sub = subFor(item, b.showSub);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.max(8, h * 0.2), height: h, flex: `0 0 ${h}px`, minWidth: 0 }}>
      {b.showRank && (
        <div style={{ width: rankWidth, flex: `0 0 ${rankWidth}px`, fontFamily: p.heading, fontSize: rankFont(h, w) * s, fontWeight: 800, color: item.rank === 1 ? p.accent : p.text, textAlign: 'left', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {item.rank}
        </div>
      )}
      {b.showImages && <EntityImg kind={item.kind} name={item.name} artist={item.artist} size={Math.min(h, w * (feature ? 0.34 : 0.22))} shape={shapeFor(p, b.imageShape)} />}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: nameSize * 0.12 }}>
        <div style={{ ...ellipsis, lineHeight: 1.15, ...(feature ? { fontSize: nameSize * 1.4, fontWeight: 700, fontFamily: p.heading, letterSpacing: p.tracking } : nameStyle(p, nameSize)) }}>{item.name}</div>
        {(sub || (b.showCounts && feature)) && (
          <div style={{ ...ellipsis, fontSize: nameSize * 0.72, color: p.muted, lineHeight: 1.2 }}>
            {sub}
            {sub && b.showCounts && feature ? ' · ' : ''}
            {b.showCounts && feature ? `${fmtNum(item.count)} ${b.countLabel}` : ''}
          </div>
        )}
      </div>
      {b.showCounts && !feature && (
        <div style={{ fontSize: nameSize * 0.78, color: p.muted, fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(item.count)}
          {b.countLabel ? <span style={{ fontWeight: 400 }}> {b.countLabel}</span> : null}
        </div>
      )}
    </div>
  );
}

function rankFont(h: number, w: number) {
  return Math.min(h * 0.5, w * 0.075);
}

function rankColWidth(font: number, maxRank: number) {
  return Math.round(font * 0.66 * String(maxRank).length + font * 0.15);
}

function ListLayout({ items, b, p, w, h, count }: { items: RankedItem[]; b: TopListBlock; p: Pal; w: number; h: number; count: number }) {
  const featureW = b.featureFirst ? 1.9 : 1;
  const n = Math.max(1, count);
  const unit = (h - b.gap * (n - 1)) / (n - 1 + featureW);
  const rw = rankColWidth(rankFont(unit, w) * b.itemScale, (b.offset || 0) + n);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: b.gap, height: '100%' }}>
      {items.map((it, i) => (
        <ListRow key={it.idx} item={it} b={b} p={p} h={i === 0 && b.featureFirst ? unit * featureW : unit} rankWidth={rw} feature={i === 0 && b.featureFirst} w={w} />
      ))}
    </div>
  );
}

function GridLayout({ items, b, p, w, h, count, collage }: { items: RankedItem[]; b: TopListBlock; p: Pal; w: number; h: number; count: number; collage?: boolean }) {
  const cols = Math.max(1, Math.min(b.columns, count));
  const rows = Math.ceil(count / cols);
  let cell = (w - b.gap * (cols - 1)) / cols;
  const capFont = Math.max(10, cell * 0.11 * b.itemScale);
  // caption = padding + name line (serif names are drawn 1.2× larger) + optional meta line, plus breathing room
  const nameLine = capFont * (p.serifNames ? 1.2 : 1) * 1.2;
  const capH = collage ? 0 : capFont * 0.45 + nameLine + (b.showSub || b.showCounts ? capFont * 0.8 * 1.3 : 0) + capFont * 0.35;
  const maxCell = (h - b.gap * (rows - 1)) / rows - capH;
  cell = Math.max(10, Math.min(cell, maxCell));
  const gridW = cell * cols + b.gap * (cols - 1);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap: b.gap, width: gridW, margin: '0 auto' }}>
      {items.map((it) => (
        <div key={it.idx} style={{ width: cell, minWidth: 0 }}>
          <div style={{ position: 'relative' }}>
            <EntityImg kind={it.kind} name={it.name} artist={it.artist} size={cell} shape={shapeFor(p, b.imageShape)} />
            {b.showRank && (
              <div
                style={{
                  position: 'absolute',
                  left: cell * 0.05,
                  top: cell * 0.05,
                  minWidth: cell * 0.2,
                  height: cell * 0.2,
                  padding: `0 ${cell * 0.04}px`,
                  borderRadius: cell * 0.1,
                  background: p.accent,
                  color: '#000',
                  fontFamily: p.heading,
                  fontWeight: 800,
                  fontSize: cell * 0.11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                }}
              >
                {it.rank}
              </div>
            )}
          </div>
          {!collage && (
            <div style={{ paddingTop: capFont * 0.45 }}>
              <div style={{ ...ellipsis, lineHeight: 1.2, ...nameStyle(p, capFont) }}>{it.name}</div>
              {(b.showSub || b.showCounts) && (
                <div style={{ ...ellipsis, fontSize: capFont * 0.8, color: p.muted, lineHeight: 1.3 }}>
                  {[subFor(it, b.showSub), b.showCounts ? `${fmtNum(it.count)} ${b.countLabel}` : ''].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PodiumLayout({ items, b, p, w, h, count }: { items: RankedItem[]; b: TopListBlock; p: Pal; w: number; h: number; count: number }) {
  const top3 = items.slice(0, 3);
  const rest = items.slice(3);
  const podH = rest.length ? h * 0.6 : h;
  const colW = (w - b.gap * 2) / 3;
  const order = [1, 0, 2].filter((i) => top3[i]);
  const heights = [1, 0.72, 0.55];
  const img0 = Math.min(colW * 0.92, podH * 0.5);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: b.gap * 1.5 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: b.gap, height: podH, flex: `0 0 ${podH}px` }}>
        {order.map((i) => {
          const it = top3[i];
          const img = img0 * (i === 0 ? 1 : 0.8);
          const font = Math.max(12, colW * 0.085 * b.itemScale);
          const barH = (podH - img - font * 3.4) * heights[i];
          return (
            <div key={it.idx} style={{ width: colW, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
              <EntityImg kind={it.kind} name={it.name} artist={it.artist} size={img} shape={shapeFor(p, b.imageShape)} />
              <div style={{ ...ellipsis, maxWidth: '100%', ...nameStyle(p, font), marginTop: font * 0.5, textAlign: 'center' }}>{it.name}</div>
              <div style={{ ...ellipsis, maxWidth: '100%', fontSize: font * 0.75, color: p.muted, marginBottom: font * 0.5, textAlign: 'center' }}>
                {b.showCounts ? `${fmtNum(it.count)} ${b.countLabel}` : subFor(it, b.showSub)}
              </div>
              <div
                style={{
                  width: '100%',
                  height: Math.max(barH, font * 2),
                  borderRadius: `${font * 0.6}px ${font * 0.6}px 0 0`,
                  background: i === 0 ? p.accent : withAlpha(p.text, i === 1 ? 0.22 : 0.14),
                  color: i === 0 ? '#000' : p.text,
                  fontFamily: p.heading,
                  fontWeight: 800,
                  fontSize: Math.min(colW * 0.32, Math.max(barH, font * 2) * 0.7),
                  display: 'flex',
                  justifyContent: 'center',
                  paddingTop: font * 0.4,
                  boxSizing: 'border-box',
                  lineHeight: 1,
                }}
              >
                {it.rank}
              </div>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && <ListLayout items={rest} b={{ ...b, featureFirst: false }} p={p} w={w} h={h - podH - b.gap * 1.5} count={Math.max(1, count - 3)} />}
    </div>
  );
}

function HeroLayout({ items, b, p, w, h, count }: { items: RankedItem[]; b: TopListBlock; p: Pal; w: number; h: number; count: number }) {
  const [first, ...rest] = items;
  if (!first) return null;
  const heroH = rest.length ? h * 0.6 : h;
  const font = Math.min(w * 0.09, heroH * 0.14) * b.itemScale;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: b.gap }}>
      <div style={{ position: 'relative', height: heroH, flex: `0 0 ${heroH}px`, borderRadius: shapeRadius(shapeFor(p, b.imageShape === 'circle' ? 'rounded' : b.imageShape), Math.min(w, heroH) * 0.4), overflow: 'hidden' }}>
        <EntityImg kind={first.kind} name={first.name} artist={first.artist} shape="square" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.75))' }} />
        <div style={{ position: 'absolute', left: font * 0.6, right: font * 0.6, bottom: font * 0.5, color: '#fff' }}>
          {b.showRank && <div style={{ fontSize: font * 0.45, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 }}>No. {first.rank}</div>}
          <div style={{ fontFamily: p.heading, fontSize: font, fontWeight: 800, lineHeight: 1.02, letterSpacing: p.tracking, ...ellipsis }}>{first.name}</div>
          <div style={{ fontSize: font * 0.4, opacity: 0.85, ...ellipsis }}>{[subFor(first, b.showSub), b.showCounts ? `${fmtNum(first.count)} ${b.countLabel}` : ''].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      {rest.length > 0 && <ListLayout items={rest} b={{ ...b, featureFirst: false }} p={p} w={w} h={h - heroH - b.gap} count={Math.max(1, count - 1)} />}
    </div>
  );
}

function BarsLayout({ items, b, p, h, count }: { items: RankedItem[]; b: TopListBlock; p: Pal; w: number; h: number; count: number }) {
  const n = Math.max(1, count);
  const rowH = (h - b.gap * (n - 1)) / n;
  const max = items[0]?.count || 1;
  const font = Math.max(10, rowH * 0.3 * b.itemScale);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: b.gap, height: '100%' }}>
      {items.map((it) => (
        <div key={it.idx} style={{ display: 'flex', alignItems: 'center', gap: rowH * 0.2, height: rowH }}>
          {b.showImages && <EntityImg kind={it.kind} name={it.name} artist={it.artist} size={rowH} shape={shapeFor(p, b.imageShape)} />}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: rowH * 0.08 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: font * 0.5, minWidth: 0 }}>
              {b.showRank && <span style={{ fontFamily: p.heading, fontWeight: 800, fontSize: font, color: p.accent }}>{it.rank}</span>}
              <span style={{ ...ellipsis, flex: 1, ...nameStyle(p, font) }}>
                {it.name}
                {subFor(it, b.showSub) && <span style={{ color: p.muted, fontWeight: 400 }}> · {it.artist}</span>}
              </span>
              {b.showCounts && <span style={{ fontSize: font * 0.85, color: p.muted, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(it.count)}</span>}
            </div>
            <div style={{ height: Math.max(4, rowH * 0.24), borderRadius: 999, background: withAlpha(p.text, 0.1), overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(it.count / max) * 100}%`, background: p.accent, borderRadius: 999 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Archival ranked list: hairline rules, mono meta, big display counts, thin play bars. */
function LedgerLayout({ items, b, p, w, h, count }: { items: RankedItem[]; b: TopListBlock; p: Pal; w: number; h: number; count: number }) {
  const n = Math.max(1, count);
  const rowH = h / n;
  const s = b.itemScale;
  const name = Math.max(10, Math.min(rowH * 0.32, w * (b.showImages ? 0.05 : 0.068)) * s);
  const meta = Math.max(8, name * 0.5);
  const thumb = b.showImages ? Math.min(rowH * 0.74, w * 0.13) : 0;
  const rankW = b.showRank ? meta * 3.2 : 0;
  const gap = Math.max(8, rowH * 0.16);
  const barLeft = rankW + (rankW ? gap : 0);
  const max = items[0]?.count || 1;
  return (
    <div style={{ height: '100%', borderTop: `1px solid ${p.line}` }}>
      {items.map((it) => {
        const sub = subFor(it, b.showSub);
        return (
          <div key={it.idx} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap, height: rowH, borderBottom: `1px solid ${p.line}`, boxSizing: 'border-box' }}>
            {b.showRank && (
              <div style={{ width: rankW, flex: `0 0 ${rankW}px`, textAlign: 'right', fontSize: meta * 1.05, color: p.muted, fontFamily: p.body, fontVariantNumeric: 'tabular-nums' }}>
                {String(it.rank).padStart(2, '0')}
              </div>
            )}
            {b.showImages && <EntityImg kind={it.kind} name={it.name} artist={it.artist} size={thumb} shape={shapeFor(p, b.imageShape)} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...ellipsis, lineHeight: 1.15, ...nameStyle(p, name) }}>{it.name}</div>
              {sub && <div style={{ ...ellipsis, fontSize: meta, color: p.muted, letterSpacing: '0.04em', marginTop: meta * 0.3, fontFamily: p.body }}>{sub}</div>}
            </div>
            {b.showCounts && (
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap', lineHeight: 1 }}>
                <span style={{ fontFamily: p.heading, fontSize: name * 1.25, letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(it.count)}</span>
                {b.countLabel && <span style={{ fontFamily: p.body, fontSize: meta * 0.95, color: p.muted, marginLeft: meta * 0.4 }}>{b.countLabel}</span>}
              </div>
            )}
            <div style={{ position: 'absolute', left: barLeft, bottom: -1, height: Math.max(2, rowH * 0.02), width: `calc((100% - ${barLeft}px) * ${(it.count / max).toFixed(4)})`, background: p.accent, opacity: 0.55 }} />
          </div>
        );
      })}
    </div>
  );
}

function EmptyNote({ p }: { p: Pal }) {
  return <div style={{ color: p.muted, fontSize: 28, padding: 12 }}>No listening data in this range.</div>;
}

function TopListView({ ctx, b }: { ctx: RenderCtx; b: TopListBlock }) {
  const p = palette(ctx, b);
  const { stats } = blockRange(ctx, b);
  const items = stats.top(b.entity, b.count, { discoveriesOnly: b.discoveries, offset: b.offset });
  const { w, h } = innerSize(b);
  if (!items.length) return <EmptyNote p={p} />;
  const props = { items, b, p, w, h, count: b.count };
  switch (b.layout) {
    case 'grid':
      return <GridLayout {...props} />;
    case 'collage':
      return <GridLayout {...props} collage />;
    case 'podium':
      return <PodiumLayout {...props} />;
    case 'hero':
      return <HeroLayout {...props} />;
    case 'bars':
      return <BarsLayout {...props} />;
    case 'ledger':
      return <LedgerLayout {...props} />;
    default:
      return <ListLayout {...props} />;
  }
}

/* ---------------- leaderboard ---------------- */

function LeaderboardView({ ctx, b }: { ctx: RenderCtx; b: LeaderboardBlock }) {
  const p = palette(ctx, b);
  const { spec, stats } = blockRange(ctx, b);
  const items = stats.top(b.entity, b.count);
  const { w, h } = innerSize(b);
  if (!items.length) return <EmptyNote p={p} />;
  let prev: RangeStats | null = null;
  if (b.compare === 'previous') prev = getStats(ctx.lib, previousRange(spec, stats.range));
  else if (b.compare === 'custom' && b.compareRange) prev = getStats(ctx.lib, resolveRange(b.compareRange));
  const prevMap = prev?.rankMap(b.entity);
  const n = Math.max(1, b.count);
  const rowH = h / (n + 0.16 * (n - 1));
  const gap = rowH * 0.16;
  const max = items[0].count || 1;
  const s = b.itemScale;
  const font = Math.max(10, Math.min(rowH * 0.33, w * 0.045) * s);
  const lead = Math.min(rowH, w * 0.13); // rank / image sizing basis
  const rankW = lead * 0.42 * String(n).length * s + lead * 0.1;
  const moveW = b.showMovement && prevMap ? font * 2.6 : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, height: '100%' }}>
      {items.map((it) => {
        const prevRank = prevMap ? (prevMap.get(it.idx)?.rank ?? null) : undefined;
        return (
          <div key={it.idx} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: rowH * 0.22, height: rowH, flex: `0 0 ${rowH}px`, paddingRight: rowH * 0.25, boxSizing: 'border-box' }}>
            {b.showBars && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${Math.max(0.12, it.count / max) * 100}%`,
                  background: it.rank === 1 ? withAlpha(p.accent, 0.28) : withAlpha(p.text, 0.08),
                  borderRadius: p.sharp ? 2 : Math.min(rowH * 0.22, 24),
                }}
              />
            )}
            <div style={{ position: 'relative', width: rankW, flex: `0 0 ${rankW}px`, textAlign: 'center', fontFamily: p.heading, fontWeight: 800, fontSize: lead * 0.48 * s, color: it.rank === 1 ? p.accent : p.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {it.rank}
            </div>
            {moveW > 0 && (
              <div style={{ position: 'relative', width: moveW, flex: `0 0 ${moveW}px`, display: 'flex', justifyContent: 'center' }}>
                <Movement rank={it.rank} prevRank={prevRank} size={font * 0.78} up="#3ddc84" down="#ff5c5c" neutral={p.muted} accent={p.accent} />
              </div>
            )}
            {b.showImages && <EntityImg kind={it.kind} name={it.name} artist={it.artist} size={Math.min(rowH * 0.84, w * 0.16)} shape={shapeFor(p, b.imageShape)} style={{ position: 'relative' }} />}
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <div style={{ ...ellipsis, lineHeight: 1.15, ...nameStyle(p, font) }}>{it.name}</div>
              {subFor(it, b.showSub) && <div style={{ ...ellipsis, fontSize: font * 0.7, color: p.muted }}>{it.artist}</div>}
            </div>
            {b.showCounts && (
              <div style={{ position: 'relative', fontSize: font * 0.8, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                {fmtNum(it.count)}
                {b.countLabel && <span style={{ color: p.muted, fontWeight: 400 }}> {b.countLabel}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- big stat ---------------- */

function StatView({ ctx, b }: { ctx: RenderCtx; b: StatBlock }) {
  const p = palette(ctx, b);
  const { stats } = blockRange(ctx, b);
  const { value, sub } = statValue(stats, b.stat, ctx.project.avgTrackMinutes);
  const { w, h } = innerSize(b);
  const text = `${b.prefix}${value}${b.suffix}`;
  const label = b.label || defaultStatLabel(b.stat);
  const subText = b.sub === 'auto' ? sub : b.sub === 'custom' ? b.subText : '';
  const labelSize = Math.max(14, Math.min(b.size * 0.3, 44));
  const labelFont = p.sharp ? labelSize * 0.62 : labelSize;
  const gap = labelSize * 0.25;
  // how many lines the label wraps to (max 2), so the number leaves room for it
  const charW = p.sharp ? 0.84 : 0.54;
  const labelLines = label ? Math.min(2, Math.ceil((label.length * labelFont * charW) / Math.max(1, w))) : 0;
  const labelH = labelLines * labelFont * 1.25;
  const subH = subText ? labelSize * 0.8 * 1.3 : 0;
  const gaps = gap * ((label ? 1 : 0) + (subText ? 1 : 0));
  // shrink the number to fit the box width and whatever height the label + detail line leave
  const fit = Math.min(b.size, w / Math.max(2, text.length * 0.58), (h - labelH - subH - gaps) / 1.04);
  const labelEl = label ? (
    <div
      style={{
        fontSize: labelFont,
        fontWeight: p.sharp ? 400 : 600,
        color: p.muted,
        ...(p.sharp ? { textTransform: 'uppercase', letterSpacing: '0.22em' } : {}),
        lineHeight: 1.25,
        maxWidth: '100%',
        flexShrink: 0,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        paddingBottom: '0.08em',
      }}
    >
      {label}
    </div>
  ) : null;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: b.align, alignItems: b.align === 'center' ? 'center' : b.align === 'right' ? 'flex-end' : 'flex-start', gap }}>
      {b.labelPosition === 'above' && labelEl}
      <div style={{ fontFamily: p.heading, fontSize: Math.max(12, fit), fontWeight: 800, lineHeight: 1, letterSpacing: p.trackingEm ? `${p.trackingEm * 0.4}em` : '-0.03em', color: b.useAccent ? p.accent : p.text, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{text}</div>
      {b.labelPosition === 'below' && labelEl}
      {subText && <div style={{ fontSize: labelSize * 0.8, color: p.muted, lineHeight: 1.3, maxWidth: '100%', flexShrink: 0, ...ellipsis }}>{subText}</div>}
    </div>
  );
}

export function defaultStatLabel(id: StatId) {
  const map: Record<StatId, string> = {
    scrobbles: 'Scrobbles',
    minutes: 'Minutes listened',
    hours: 'Hours listened',
    days: 'Days of nonstop music',
    uniqueArtists: 'Artists',
    uniqueAlbums: 'Albums',
    uniqueTracks: 'Songs',
    avgPerDay: 'Songs a day',
    activeDays: 'Days with music',
    streak: 'Day listening streak',
    artistStreak: 'Days in a row',
    busiestDay: 'Biggest day',
    newArtists: 'New artists',
    newTracks: 'New songs',
    obsession: 'Plays of one song in a day',
    peakHour: 'Peak hour',
    topArtistPlays: 'Plays of your #1 artist',
    topTrackPlays: 'Plays of your #1 song',
    percentTopArtist: 'of your plays were your #1',
  };
  return map[id];
}

/* ---------------- image ---------------- */

export function imageBlockEntity(ctx: RenderCtx, b: ImageBlock): RankedItem | null {
  if (b.source === 'upload') return null;
  const { stats } = blockRange(ctx, b);
  return stats.top(b.source, 1, { offset: Math.max(0, b.rank - 1) })[0] ?? null;
}

function ImageView({ ctx, b }: { ctx: RenderCtx; b: ImageBlock }) {
  const p = palette(ctx, b);
  const { w, h } = innerSize(b);
  const filter = [b.grayscale ? `grayscale(${b.grayscale})` : '', b.brightness !== 1 ? `brightness(${b.brightness})` : '', b.blur ? `blur(${b.blur}px)` : ''].filter(Boolean).join(' ') || undefined;
  const radius = shapeRadius(shapeFor(p, b.shape), Math.min(w, h));
  const item = imageBlockEntity(ctx, b);
  const font = b.captionSize;
  let img: ReactNode;
  if (b.source === 'upload') {
    img = b.src ? (
      <img
        src={b.src}
        alt=""
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${b.fx}% ${b.fy}%`, transform: b.zoom !== 1 ? `scale(${b.zoom})` : undefined, transformOrigin: `${b.fx}% ${b.fy}%`, filter, display: 'block' }}
      />
    ) : (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: withAlpha(p.text, 0.08), color: p.muted, fontSize: 32 }}>Upload an image →</div>
    );
  } else if (item) {
    img = <EntityImg kind={item.kind} name={item.name} artist={item.artist} filter={filter} extraZoom={b.zoom} focal={{ x: b.fx, y: b.fy }} />;
  } else img = <EmptyNote p={p} />;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: radius, overflow: 'hidden' }}>
      {img}
      {b.caption && item && (
        <>
          {b.fade && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.72))' }} />}
          <div style={{ position: 'absolute', left: font * 0.55, right: font * 0.55, bottom: font * 0.45, color: '#fff', textShadow: b.fade ? undefined : '0 2px 18px rgba(0,0,0,0.5)' }}>
            <div style={{ fontFamily: p.heading, fontSize: font, fontWeight: 800, lineHeight: 1.02, letterSpacing: p.trackingEm ? p.tracking : '-0.02em', ...ellipsis }}>{item.name}</div>
            <div style={{ fontSize: font * 0.42, opacity: 0.88, marginTop: font * 0.12, ...ellipsis }}>
              {[item.kind !== 'artist' ? item.artist : '', `${fmtNum(item.count)} plays`].filter(Boolean).join(' · ')}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- charts ---------------- */

function ChartView({ ctx, b }: { ctx: RenderCtx; b: ChartBlock }) {
  const p = palette(ctx, b);
  const { stats } = blockRange(ctx, b);
  const { w, h } = innerSize(b);
  if (!stats.total) return <EmptyNote p={p} />;
  if (b.chart === 'clock') return <ClockChart stats={stats} w={w} h={h} p={p} b={b} />;
  let data: { label: string; value: number }[];
  if (b.chart === 'hours') data = stats.byHour().map((v, i) => ({ label: i % 6 === 0 ? (i === 0 ? '12a' : i === 12 ? '12p' : i < 12 ? `${i}a` : `${i - 12}p`) : '', value: v }));
  else if (b.chart === 'weekdays') data = stats.byWeekday().map((v, i) => ({ label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], value: v }));
  else {
    const tl = stats.timeline(b.bucket);
    const every = Math.max(1, Math.ceil(tl.length / 7));
    data = tl.map((d, i) => ({ label: i % every === 0 ? d.label : '', value: d.value }));
  }
  const labelSize = Math.max(14, Math.min(28, h * 0.075));
  const labelH = b.showLabels ? labelSize * 1.6 : 0;
  const ch = h - labelH;
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.findIndex((d) => d.value === max);
  const n = data.length;
  const slot = w / n;
  const bw = Math.max(1, slot * (n > 60 ? 0.9 : 0.72));
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      {b.style === 'area' ? (
        (() => {
          const pts = data.map((d, i) => [i * slot + slot / 2, ch - (d.value / max) * ch * 0.96]);
          const line = pts.map((pt, i) => `${i ? 'L' : 'M'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(' ');
          return (
            <>
              <defs>
                <linearGradient id={`g-${b.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={p.accent} stopOpacity="0.55" />
                  <stop offset="1" stopColor={p.accent} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${line} L${pts[pts.length - 1][0]},${ch} L${pts[0][0]},${ch} Z`} fill={`url(#g-${b.id})`} />
              <path d={line} fill="none" stroke={p.accent} strokeWidth={Math.max(2, h * 0.012)} strokeLinejoin="round" strokeLinecap="round" />
              {b.highlightPeak && <circle cx={pts[peak][0]} cy={pts[peak][1]} r={Math.max(4, h * 0.02)} fill={p.accent} />}
            </>
          );
        })()
      ) : (
        data.map((d, i) => {
          const bh = Math.max(d.value ? 2 : 0, (d.value / max) * ch * 0.96);
          return <rect key={i} x={i * slot + (slot - bw) / 2} y={ch - bh} width={bw} height={bh} rx={Math.min(bw / 2, 10)} fill={p.accent} opacity={b.highlightPeak && i !== peak ? 0.42 : 1} />;
        })
      )}
      {b.showLabels &&
        data.map((d, i) =>
          d.label ? (
            <text key={`l${i}`} x={i * slot + slot / 2} y={h - labelSize * 0.25} fontSize={labelSize} fill={p.muted} textAnchor="middle" fontFamily={p.body}>
              {d.label}
            </text>
          ) : null,
        )}
    </svg>
  );
}

function ClockChart({ stats, w, h, p, b }: { stats: RangeStats; w: number; h: number; p: Pal; b: ChartBlock }) {
  const hours = stats.byHour();
  const max = Math.max(1, ...hours);
  const peak = stats.peakHour();
  const size = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const label = size * 0.06;
  const R = size / 2 - (b.showLabels ? label * 1.8 : 4);
  const r0 = R * 0.42;
  const seg = (Math.PI * 2) / 24;
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={r0} fill="none" stroke={withAlpha(p.text, 0.12)} strokeWidth={2} />
      {hours.map((v, i) => {
        const a0 = i * seg - Math.PI / 2 + seg * 0.12;
        const a1 = (i + 1) * seg - Math.PI / 2 - seg * 0.12;
        const r1 = r0 + 6 + (R - r0 - 6) * (v / max);
        const pt = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
        const d = `M${pt(r0 + 4, a0)} L${pt(r1, a0)} A${r1},${r1} 0 0 1 ${pt(r1, a1)} L${pt(r0 + 4, a1)} A${r0 + 4},${r0 + 4} 0 0 0 ${pt(r0 + 4, a0)} Z`;
        return <path key={i} d={d} fill={p.accent} opacity={b.highlightPeak && i !== peak ? 0.4 : 1} />;
      })}
      {b.showLabels &&
        [0, 6, 12, 18].map((hr) => {
          const a = hr * seg - Math.PI / 2;
          const rr = R + label * 1.05;
          return (
            <text key={hr} x={cx + rr * Math.cos(a)} y={cy + rr * Math.sin(a) + label * 0.35} fontSize={label} fill={p.muted} textAnchor="middle" fontFamily={p.body}>
              {hr === 0 ? '12 AM' : hr === 12 ? '12 PM' : hr < 12 ? `${hr} AM` : `${hr - 12} PM`}
            </text>
          );
        })}
      <text x={cx} y={cy + r0 * 0.12} fontSize={r0 * 0.42} fontWeight={800} fill={p.text} textAnchor="middle" fontFamily={p.heading}>
        {fmtHour(peak)}
      </text>
      <text x={cx} y={cy + r0 * 0.42} fontSize={r0 * 0.16} fill={p.muted} textAnchor="middle" fontFamily={p.body}>
        peak hour
      </text>
    </svg>
  );
}

/* ---------------- #1 by month ---------------- */

function MonthsView({ ctx, b }: { ctx: RenderCtx; b: MonthsBlock }) {
  const p = palette(ctx, b);
  const { stats } = blockRange(ctx, b);
  const data = stats.topPerMonth(b.entity);
  const { w, h } = innerSize(b);
  if (!data.length) return <EmptyNote p={p} />;
  const multiYear = new Set(data.map((d) => d.month.getFullYear())).size > 1;
  const cols = Math.max(1, b.columns);
  const rows = Math.ceil(data.length / cols);
  const gap = Math.min(w, h) * 0.025;
  const cellW = (w - gap * (cols - 1)) / cols;
  const cellH = (h - gap * (rows - 1)) / rows;
  const font = Math.max(10, Math.min(cellW * 0.09, cellH * 0.1));
  const textH = font * (b.showCounts ? 3.6 : 2.6);
  const img = b.showImages ? Math.max(0, Math.min(cellW, cellH - textH)) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap, height: '100%' }}>
      {data.map((d) => (
        <div key={d.month.getTime()} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          {b.showImages && d.item && <EntityImg kind={d.item.kind} name={d.item.name} artist={d.item.artist} size={img} shape={shapeFor(p, b.imageShape)} />}
          <div style={{ fontSize: font * 0.8, fontWeight: 700, color: p.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: font * 0.4 }}>
            {d.month.toLocaleDateString(undefined, { month: 'short', ...(multiYear ? { year: '2-digit' } : {}) })}
          </div>
          <div style={{ ...ellipsis, maxWidth: '100%', lineHeight: 1.2, ...nameStyle(p, font) }}>{d.item?.name}</div>
          {b.showCounts && <div style={{ fontSize: font * 0.75, color: p.muted }}>{fmtNum(d.count)} plays</div>}
        </div>
      ))}
    </div>
  );
}

/* ---------------- shape ---------------- */

function ShapeView({ ctx, b }: { ctx: RenderCtx; b: ShapeBlock }) {
  const p = palette(ctx, b);
  const fill = b.useAccent ? p.accent : b.fill;
  if (b.shape === 'line') return <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: Math.max(1, b.stroke || 4), transform: 'translateY(-50%)', background: fill, borderRadius: 99 }} />;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: b.stroke ? 'transparent' : fill,
        border: b.stroke ? `${b.stroke}px solid ${fill}` : undefined,
        borderRadius: b.shape === 'circle' ? '50%' : b.radius,
      }}
    />
  );
}
