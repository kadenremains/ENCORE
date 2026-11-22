import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { useEditor } from './editorStore';
import {
  FONTS,
  FORMATS,
  STATS,
  THEMES,
  type Block,
  type CardStyle,
  type ChartBlock,
  type ImageBlock,
  type ImageShape,
  type LeaderboardBlock,
  type MonthsBlock,
  type Project,
  type ShapeBlock,
  type StatBlock,
  type TextBlock,
  type Theme,
  type TopListBlock,
} from './model';
import { ColorInput, Field, RangePicker, Section, Segmented, Select, Slider, TextInput, Toggle, UploadButton } from '../ui/controls';
import { blockRange, imageBlockEntity, TOKENS, defaultStatLabel, type RenderCtx } from '../render/blocks';
import { slideTheme, backgroundCss } from '../render/SlideCanvas';
import { ImageEditor, type EntityRef } from '../ui/ImageEditor';
import { EntityImg } from '../render/primitives';
import type { EntityKind } from '../lib/types';

const ENTITY_OPTS: { value: EntityKind; label: string }[] = [
  { value: 'artist', label: 'Artists' },
  { value: 'album', label: 'Albums' },
  { value: 'track', label: 'Songs' },
];

const SHAPE_OPTS: { value: ImageShape; label: string }[] = [
  { value: 'square', label: '■' },
  { value: 'rounded', label: '▢' },
  { value: 'circle', label: '●' },
];

const TYPE_LABEL: Record<Block['type'], string> = {
  text: 'Text',
  toplist: 'Top list',
  leaderboard: 'Leaderboard',
  stat: 'Big stat',
  image: 'Image',
  chart: 'Chart',
  months: '#1 by month',
  shape: 'Shape',
};

export function Inspector() {
  const project = useEditor((s) => s.project);
  const slideIdx = useEditor((s) => s.slideIdx);
  const selectedId = useEditor((s) => s.selectedId);
  if (!project) return null;
  const block = project.slides[slideIdx]?.blocks.find((b) => b.id === selectedId);
  return <div className="inspector">{block ? <BlockInspector key={block.id} block={block} project={project} /> : <ProjectInspector project={project} />}</div>;
}

/* =============================== block =============================== */

function BlockInspector({ block, project }: { block: Block; project: Project }) {
  const st = useEditor();
  const set = (patch: Partial<Block>, merge?: string) => st.updateBlock(block.id, patch, merge);
  const sNum = (k: keyof Block) => (v: number) => set({ [k]: v } as Partial<Block>, `${block.id}:${String(k)}`);

  return (
    <>
      <div className="inspector-head">
        <div>
          <div className="eyebrow">{TYPE_LABEL[block.type]}</div>
          <input className="name-input" value={block.name ?? ''} placeholder={block.title || TYPE_LABEL[block.type]} onChange={(e) => set({ name: e.target.value }, `${block.id}:name`)} />
        </div>
        <div className="row tight">
          <button className="icon-btn" title="Bring forward" onClick={() => st.reorder(block.id, 'up')}>
            ↑
          </button>
          <button className="icon-btn" title="Send backward" onClick={() => st.reorder(block.id, 'down')}>
            ↓
          </button>
          <button className="icon-btn" title={block.locked ? 'Unlock' : 'Lock position'} onClick={() => set({ locked: !block.locked })}>
            {block.locked ? '🔒' : '🔓'}
          </button>
          <button className="icon-btn" title="Duplicate (⌘D)" onClick={() => st.duplicateBlock(block.id)}>
            ⧉
          </button>
          <button className="icon-btn danger" title="Delete" onClick={() => st.deleteBlock(block.id)}>
            🗑
          </button>
        </div>
      </div>

      <TypeSection block={block} set={set} project={project} />

      {block.type !== 'shape' && (
        <Section title="Time range" defaultOpen={!!block.range}>
          <Toggle value={!block.range} onChange={(v) => set({ range: v ? null : { ...project.range } })} label="Same as the wrapped" />
          {block.range && <RangePicker value={block.range} onChange={(r) => set({ range: r })} />}
        </Section>
      )}

      {block.type !== 'text' && block.type !== 'shape' && (
        <Section title="Title">
          <Toggle value={block.showTitle} onChange={(v) => set({ showTitle: v })} label="Show title" />
          {block.showTitle && (
            <>
              <Field label="Title text">
                <TextInput value={block.title} onChange={(v) => set({ title: v }, `${block.id}:title`)} />
              </Field>
              <Field label="Title size">
                <Slider value={block.titleSize} min={12} max={120} onChange={sNum('titleSize')} />
              </Field>
            </>
          )}
        </Section>
      )}

      <Section title="Box & colors" defaultOpen={false}>
        <Field label="Background">
          <Segmented<CardStyle>
            value={block.card}
            onChange={(v) => set({ card: v, padding: v !== 'none' && block.padding === 0 ? 32 : block.padding })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'glass', label: 'Glass' },
              { value: 'solid', label: 'Solid' },
              { value: 'outline', label: 'Line' },
            ]}
          />
        </Field>
        {block.card !== 'none' && (
          <Field label="Box color">
            <ColorInput value={block.cardColor} onChange={(v) => set({ cardColor: v })} allowClear />
          </Field>
        )}
        <Field label="Corner radius">
          <Slider value={block.radius} min={0} max={200} onChange={sNum('radius')} />
        </Field>
        <Field label="Padding">
          <Slider value={block.padding} min={0} max={160} onChange={sNum('padding')} />
        </Field>
        <Field label="Text color">
          <ColorInput value={block.color} onChange={(v) => set({ color: v })} allowClear />
        </Field>
        <Field label="Accent color">
          <ColorInput value={block.accent} onChange={(v) => set({ accent: v })} allowClear />
        </Field>
        <Field label="Font">
          <Select value={block.font ?? ''} options={[{ value: '', label: 'Theme body font' }, ...FONTS.map((f) => ({ value: f.id, label: f.label }))]} onChange={(v) => set({ font: v || undefined })} />
        </Field>
        <Field label="Opacity">
          <Slider value={block.opacity} min={0} max={1} step={0.01} onChange={sNum('opacity')} />
        </Field>
        <Field label="Rotation">
          <Slider value={block.rotation} min={-180} max={180} onChange={sNum('rotation')} suffix="°" />
        </Field>
      </Section>

      <Section title="Position & size" defaultOpen={false}>
        <div className="grid2">
          <Field label="X">
            <input className="text-input" type="number" value={block.x} onChange={(e) => set({ x: Number(e.target.value) })} />
          </Field>
          <Field label="Y">
            <input className="text-input" type="number" value={block.y} onChange={(e) => set({ y: Number(e.target.value) })} />
          </Field>
          <Field label="Width">
            <input className="text-input" type="number" value={block.w} onChange={(e) => set({ w: Math.max(10, Number(e.target.value)) })} />
          </Field>
          <Field label="Height">
            <input className="text-input" type="number" value={block.h} onChange={(e) => set({ h: Math.max(10, Number(e.target.value)) })} />
          </Field>
        </div>
        <div className="row gap wrap">
          <button className="btn small" onClick={() => set({ x: Math.round((project.format.w - block.w) / 2) })}>
            Center horizontally
          </button>
          <button className="btn small" onClick={() => set({ x: 0, w: project.format.w })}>
            Full width
          </button>
          <button className="btn small" onClick={() => set({ x: 80, w: project.format.w - 160 })}>
            Full width (margins)
          </button>
        </div>
      </Section>
    </>
  );
}

type SetFn = (patch: Partial<Block>, merge?: string) => void;

function TypeSection({ block, set, project }: { block: Block; set: SetFn; project: Project }) {
  switch (block.type) {
    case 'text':
      return <TextSection b={block} set={set} />;
    case 'toplist':
      return <TopListSection b={block} set={set} project={project} />;
    case 'leaderboard':
      return <LeaderboardSection b={block} set={set} project={project} />;
    case 'stat':
      return <StatSection b={block} set={set} />;
    case 'image':
      return <ImageSection b={block} set={set} project={project} />;
    case 'chart':
      return <ChartSection b={block} set={set} />;
    case 'months':
      return <MonthsSection b={block} set={set} project={project} />;
    case 'shape':
      return <ShapeSection b={block} set={set} />;
  }
}

function TextSection({ b, set }: { b: TextBlock; set: SetFn }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const f = () => ref.current?.focus();
    window.addEventListener('sw:focus-text', f);
    return () => window.removeEventListener('sw:focus-text', f);
  }, []);
  const n = (k: keyof TextBlock) => (v: number) => set({ [k]: v } as Partial<Block>, `${b.id}:${String(k)}`);
  return (
    <>
      <Section title="Text">
        <textarea ref={ref} className="text-input big" rows={4} value={b.text} onChange={(e) => set({ text: e.target.value }, `${b.id}:text`)} />
        <div className="tokens">
          {TOKENS.map((t) => (
            <button key={t} className="chip" onClick={() => set({ text: b.text + t })}>
              {t}
            </button>
          ))}
        </div>
        <p className="muted small">Tokens fill in live from your stats for this block's time range.</p>
      </Section>
      <Section title="Typography">
        <Field label="Font">
          <Segmented
            value={b.fontRole}
            onChange={(v) => set({ fontRole: v })}
            options={[
              { value: 'heading', label: 'Heading' },
              { value: 'body', label: 'Body' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </Field>
        {b.fontRole === 'custom' && (
          <Field label="Custom font">
            <Select value={b.font ?? 'inter'} options={FONTS.map((f) => ({ value: f.id, label: f.label }))} onChange={(v) => set({ font: v })} />
          </Field>
        )}
        <Field label="Size">
          <Slider value={b.size} min={10} max={400} onChange={n('size')} />
        </Field>
        <Field label="Weight">
          <Slider value={b.weight} min={100} max={900} step={100} onChange={n('weight')} />
        </Field>
        <Field label="Letter spacing">
          <Slider value={b.letterSpacing} min={-20} max={40} step={0.5} onChange={n('letterSpacing')} />
        </Field>
        <Field label="Line height">
          <Slider value={b.lineHeight} min={0.6} max={2} step={0.01} onChange={n('lineHeight')} />
        </Field>
        <Field label="Align">
          <Segmented
            value={b.align}
            onChange={(v) => set({ align: v })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
          />
        </Field>
        <Field label="Vertical">
          <Segmented
            value={b.valign}
            onChange={(v) => set({ valign: v })}
            options={[
              { value: 'top', label: 'Top' },
              { value: 'center', label: 'Middle' },
              { value: 'bottom', label: 'Bottom' },
            ]}
          />
        </Field>
        <div className="row gap wrap">
          <Toggle value={b.uppercase} onChange={(v) => set({ uppercase: v })} label="UPPERCASE" />
          <Toggle value={b.italic} onChange={(v) => set({ italic: v })} label="Italic" />
          <Toggle value={b.useAccent} onChange={(v) => set({ useAccent: v })} label="Accent color" />
        </div>
      </Section>
    </>
  );
}

function TopListSection({ b, set, project }: { b: TopListBlock; set: SetFn; project: Project }) {
  const n = (k: keyof TopListBlock) => (v: number) => set({ [k]: v } as Partial<Block>, `${b.id}:${String(k)}`);
  return (
    <>
      <Section title="Data">
        <Field label="Show">
          <Segmented value={b.entity} options={ENTITY_OPTS} onChange={(v) => set({ entity: v, title: autoTitle(b.title, b.entity, v) })} />
        </Field>
        <Toggle value={b.discoveries} onChange={(v) => set({ discoveries: v })} label="Only new discoveries (first heard in range)" />
        <Field label="How many">
          <Slider value={b.count} min={1} max={50} onChange={n('count')} />
        </Field>
        <Field label="Start at rank" hint="e.g. 2 to skip your #1 when it's shown elsewhere">
          <Slider value={b.offset + 1} min={1} max={50} onChange={(v) => set({ offset: v - 1 }, `${b.id}:offset`)} />
        </Field>
      </Section>
      <Section title="Layout">
        <div className="layout-grid">
          {(
            [
              ['list', 'List'],
              ['ledger', 'Ledger'],
              ['grid', 'Grid'],
              ['collage', 'Collage'],
              ['podium', 'Podium'],
              ['hero', 'Hero + list'],
              ['bars', 'Bars'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} className={`layout-opt ${b.layout === v ? 'on' : ''}`} onClick={() => set({ layout: v })}>
              <LayoutIcon kind={v} />
              <span>{l}</span>
            </button>
          ))}
        </div>
        {(b.layout === 'grid' || b.layout === 'collage') && (
          <Field label="Columns">
            <Slider value={b.columns} min={1} max={8} onChange={n('columns')} />
          </Field>
        )}
        <Field label="Item size">
          <Slider value={b.itemScale} min={0.4} max={2} step={0.01} onChange={n('itemScale')} />
        </Field>
        <Field label="Spacing">
          <Slider value={b.gap} min={0} max={100} onChange={n('gap')} />
        </Field>
        <div className="toggles">
          <Toggle value={b.showImages} onChange={(v) => set({ showImages: v })} label="Images" />
          <Toggle value={b.showRank} onChange={(v) => set({ showRank: v })} label="Rank numbers" />
          <Toggle value={b.showCounts} onChange={(v) => set({ showCounts: v })} label="Play counts" />
          {b.entity !== 'artist' && <Toggle value={b.showSub} onChange={(v) => set({ showSub: v })} label="Artist name" />}
          {b.layout === 'list' && <Toggle value={b.featureFirst} onChange={(v) => set({ featureFirst: v })} label="Make #1 bigger" />}
        </div>
        <Field label="Image shape">
          <Segmented value={b.imageShape} options={SHAPE_OPTS} onChange={(v) => set({ imageShape: v })} />
        </Field>
        <Field label="Count label">
          <TextInput value={b.countLabel} onChange={(v) => set({ countLabel: v }, `${b.id}:cl`)} placeholder="plays" />
        </Field>
      </Section>
      <BlockImages block={b} project={project} kind={b.entity} />
    </>
  );
}

function autoTitle(current: string, from: EntityKind, to: EntityKind) {
  const names: Record<EntityKind, string> = { artist: 'Artists', album: 'Albums', track: 'Songs' };
  return current.includes(names[from]) ? current.replace(names[from], names[to]) : current;
}

function LayoutIcon({ kind }: { kind: TopListBlock['layout'] }) {
  const c = 'currentColor';
  const box = (x: number, y: number, w: number, h: number, o = 1) => <rect x={x} y={y} width={w} height={h} rx={1.5} fill={c} opacity={o} />;
  return (
    <svg viewBox="0 0 40 30" width={40} height={30}>
      {kind === 'list' && [0, 1, 2, 3].map((i) => <g key={i}>{box(2, 2 + i * 7, 5, 5)}{box(10, 3 + i * 7, 26, 3, 0.5)}</g>)}
      {kind === 'grid' && [0, 1, 2].flatMap((r) => [0, 1, 2].map((cI) => <g key={`${r}${cI}`}>{box(4 + cI * 11, 1 + r * 10, 9, 6)}{box(4 + cI * 11, 8 + r * 10, 7, 1.2, 0.5)}</g>))}
      {kind === 'collage' && [0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((cI) => <g key={`${r}${cI}`}>{box(2 + cI * 9.3, 1 + r * 9.5, 8.5, 8.5)}</g>))}
      {kind === 'podium' && (
        <>
          {box(15, 2, 10, 8)}
          {box(3, 6, 9, 7)}
          {box(28, 8, 9, 6)}
          {box(15, 12, 10, 16, 0.6)}
          {box(3, 15, 9, 13, 0.4)}
          {box(28, 17, 9, 11, 0.3)}
        </>
      )}
      {kind === 'hero' && (
        <>
          {box(2, 1, 36, 15)}
          {[0, 1].map((i) => <g key={i}>{box(2, 19 + i * 5.5, 4, 4)}{box(9, 20 + i * 5.5, 25, 2, 0.5)}</g>)}
        </>
      )}
      {kind === 'ledger' && [0, 1, 2, 3].map((i) => <g key={i}>{box(2, 3 + i * 7, 3, 2, 0.5)}{box(7, 1.5 + i * 7, 5, 5)}{box(14, 2.5 + i * 7, 14, 2)}{box(31, 2 + i * 7, 7, 3)}{box(7, 6.8 + i * 7, 30 - i * 6, 0.6, 0.6)}</g>)}
      {kind === 'bars' && [0, 1, 2, 3].map((i) => <g key={i}>{box(2, 2 + i * 7, 36 - i * 7, 4, 1 - i * 0.18)}</g>)}
    </svg>
  );
}

function LeaderboardSection({ b, set, project }: { b: LeaderboardBlock; set: SetFn; project: Project }) {
  const n = (k: keyof LeaderboardBlock) => (v: number) => set({ [k]: v } as Partial<Block>, `${b.id}:${String(k)}`);
  return (
    <>
      <Section title="Data">
        <Field label="Show">
          <Segmented value={b.entity} options={ENTITY_OPTS} onChange={(v) => set({ entity: v })} />
        </Field>
        <Field label="How many">
          <Slider value={b.count} min={3} max={30} onChange={n('count')} />
        </Field>
        <Field label="Movement compared to">
          <Select
            value={b.compare}
            options={[
              { value: 'previous', label: 'The period before' },
              { value: 'custom', label: 'A custom range' },
              { value: 'none', label: 'Nothing (hide movement)' },
            ]}
            onChange={(v) => set({ compare: v, compareRange: v === 'custom' ? (b.compareRange ?? { preset: 'last-year' }) : b.compareRange })}
          />
        </Field>
        {b.compare === 'custom' && <RangePicker value={b.compareRange ?? { preset: 'last-year' }} onChange={(r) => set({ compareRange: r })} />}
      </Section>
      <Section title="Style">
        <Field label="Item size">
          <Slider value={b.itemScale} min={0.4} max={2} step={0.01} onChange={n('itemScale')} />
        </Field>
        <div className="toggles">
          <Toggle value={b.showMovement} onChange={(v) => set({ showMovement: v })} label="▲▼ movement" />
          <Toggle value={b.showBars} onChange={(v) => set({ showBars: v })} label="Play bars" />
          <Toggle value={b.showImages} onChange={(v) => set({ showImages: v })} label="Images" />
          <Toggle value={b.showCounts} onChange={(v) => set({ showCounts: v })} label="Play counts" />
          {b.entity !== 'artist' && <Toggle value={b.showSub} onChange={(v) => set({ showSub: v })} label="Artist name" />}
        </div>
        <Field label="Image shape">
          <Segmented value={b.imageShape} options={SHAPE_OPTS} onChange={(v) => set({ imageShape: v })} />
        </Field>
        <Field label="Count label">
          <TextInput value={b.countLabel} onChange={(v) => set({ countLabel: v }, `${b.id}:cl`)} placeholder="plays" />
        </Field>
      </Section>
      <BlockImages block={b} project={project} kind={b.entity} />
    </>
  );
}

function StatSection({ b, set }: { b: StatBlock; set: SetFn }) {
  const n = (k: keyof StatBlock) => (v: number) => set({ [k]: v } as Partial<Block>, `${b.id}:${String(k)}`);
  return (
    <>
      <Section title="Data">
        <Field label="Stat">
          <Select value={b.stat} options={STATS.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => set({ stat: v })} />
        </Field>
        <Field label="Label">
          <TextInput value={b.label} placeholder={defaultStatLabel(b.stat)} onChange={(v) => set({ label: v }, `${b.id}:label`)} />
        </Field>
        <Field label="Detail line">
          <Segmented
            value={b.sub}
            onChange={(v) => set({ sub: v })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'custom', label: 'Custom' },
              { value: 'none', label: 'None' },
            ]}
          />
        </Field>
        {b.sub === 'custom' && <TextInput value={b.subText} onChange={(v) => set({ subText: v }, `${b.id}:sub`)} />}
        <div className="grid2">
          <Field label="Before number">
            <TextInput value={b.prefix} onChange={(v) => set({ prefix: v }, `${b.id}:pre`)} />
          </Field>
          <Field label="After number">
            <TextInput value={b.suffix} onChange={(v) => set({ suffix: v }, `${b.id}:suf`)} />
          </Field>
        </div>
      </Section>
      <Section title="Style">
        <Field label="Number size (max)">
          <Slider value={b.size} min={20} max={500} onChange={n('size')} />
        </Field>
        <Field label="Align">
          <Segmented
            value={b.align}
            onChange={(v) => set({ align: v })}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
          />
        </Field>
        <Field label="Label position">
          <Segmented
            value={b.labelPosition}
            onChange={(v) => set({ labelPosition: v })}
            options={[
              { value: 'above', label: 'Above' },
              { value: 'below', label: 'Below' },
            ]}
          />
        </Field>
        <Toggle value={b.useAccent} onChange={(v) => set({ useAccent: v })} label="Number in accent color" />
      </Section>
    </>
  );
}

function ImageSection({ b, set, project }: { b: ImageBlock; set: SetFn; project: Project }) {
  const n = (k: keyof ImageBlock) => (v: number) => set({ [k]: v } as Partial<Block>, `${b.id}:${String(k)}`);
  return (
    <>
      <Section title="Image">
        <Field label="Source">
          <Segmented
            value={b.source}
            onChange={(v) => set({ source: v })}
            options={[
              { value: 'artist', label: 'Artist' },
              { value: 'album', label: 'Album' },
              { value: 'track', label: 'Song' },
              { value: 'upload', label: 'Upload' },
            ]}
          />
        </Field>
        {b.source !== 'upload' ? (
          <>
            <Field label="Which rank">
              <Slider value={b.rank} min={1} max={50} onChange={n('rank')} />
            </Field>
            <Toggle value={b.caption} onChange={(v) => set({ caption: v })} label="Name & plays caption" />
            {b.caption && (
              <>
                <Field label="Caption size">
                  <Slider value={b.captionSize} min={16} max={200} onChange={n('captionSize')} />
                </Field>
                <Toggle value={b.fade} onChange={(v) => set({ fade: v })} label="Dark fade behind caption" />
              </>
            )}
          </>
        ) : (
          <UploadButton className="btn primary" onImage={(src) => set({ src, zoom: 1, fx: 50, fy: 50 })}>
            {b.src ? 'Replace image' : 'Upload image'}
          </UploadButton>
        )}
      </Section>
      <Section title="Crop & filters">
        <Field label="Shape">
          <Segmented value={b.shape} options={SHAPE_OPTS} onChange={(v) => set({ shape: v })} />
        </Field>
        <Field label="Zoom">
          <Slider value={b.zoom} min={1} max={4} step={0.01} onChange={n('zoom')} />
        </Field>
        <Field label="Horizontal focus">
          <Slider value={b.fx} min={0} max={100} onChange={n('fx')} />
        </Field>
        <Field label="Vertical focus">
          <Slider value={b.fy} min={0} max={100} onChange={n('fy')} />
        </Field>
        <Field label="Black & white">
          <Slider value={b.grayscale} min={0} max={1} step={0.01} onChange={n('grayscale')} />
        </Field>
        <Field label="Brightness">
          <Slider value={b.brightness} min={0.2} max={1.8} step={0.01} onChange={n('brightness')} />
        </Field>
        <Field label="Blur">
          <Slider value={b.blur} min={0} max={40} onChange={n('blur')} />
        </Field>
      </Section>
      {b.source !== 'upload' && <BlockImages block={b} project={project} kind={b.source} />}
    </>
  );
}

function ChartSection({ b, set }: { b: ChartBlock; set: SetFn }) {
  return (
    <Section title="Chart">
      <Field label="Type">
        <Select
          value={b.chart}
          onChange={(v) => set({ chart: v })}
          options={[
            { value: 'timeline', label: 'Listening over time' },
            { value: 'clock', label: '24h clock' },
            { value: 'hours', label: 'Hour of day (bars)' },
            { value: 'weekdays', label: 'Day of week' },
          ]}
        />
      </Field>
      {b.chart === 'timeline' && (
        <Field label="Group by">
          <Segmented
            value={b.bucket}
            onChange={(v) => set({ bucket: v })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'year', label: 'Year' },
            ]}
          />
        </Field>
      )}
      {b.chart !== 'clock' && (
        <Field label="Style">
          <Segmented
            value={b.style}
            onChange={(v) => set({ style: v })}
            options={[
              { value: 'bars', label: 'Bars' },
              { value: 'area', label: 'Area' },
            ]}
          />
        </Field>
      )}
      <Toggle value={b.showLabels} onChange={(v) => set({ showLabels: v })} label="Labels" />
      <Toggle value={b.highlightPeak} onChange={(v) => set({ highlightPeak: v })} label="Highlight the peak" />
    </Section>
  );
}

function MonthsSection({ b, set, project }: { b: MonthsBlock; set: SetFn; project: Project }) {
  return (
    <>
      <Section title="Data">
        <Field label="Show">
          <Segmented value={b.entity} options={ENTITY_OPTS} onChange={(v) => set({ entity: v })} />
        </Field>
        <Field label="Columns">
          <Slider value={b.columns} min={1} max={6} onChange={(v) => set({ columns: v }, `${b.id}:cols`)} />
        </Field>
        <Toggle value={b.showImages} onChange={(v) => set({ showImages: v })} label="Images" />
        <Toggle value={b.showCounts} onChange={(v) => set({ showCounts: v })} label="Play counts" />
        <Field label="Image shape">
          <Segmented value={b.imageShape} options={SHAPE_OPTS} onChange={(v) => set({ imageShape: v })} />
        </Field>
      </Section>
      <BlockImages block={b} project={project} kind={b.entity} />
    </>
  );
}

function ShapeSection({ b, set }: { b: ShapeBlock; set: SetFn }) {
  return (
    <Section title="Shape">
      <Field label="Shape">
        <Segmented
          value={b.shape}
          onChange={(v) => set({ shape: v })}
          options={[
            { value: 'rect', label: 'Box' },
            { value: 'circle', label: 'Circle' },
            { value: 'line', label: 'Line' },
          ]}
        />
      </Field>
      <Toggle value={b.useAccent} onChange={(v) => set({ useAccent: v })} label="Use accent color" />
      {!b.useAccent && (
        <Field label="Fill">
          <ColorInput value={b.fill} onChange={(v) => set({ fill: v ?? '#ffffff' })} />
        </Field>
      )}
      <Field label={b.shape === 'line' ? 'Thickness' : 'Outline only (thickness)'}>
        <Slider value={b.stroke} min={0} max={60} onChange={(v) => set({ stroke: v }, `${b.id}:stroke`)} />
      </Field>
    </Section>
  );
}

/** Thumbnails of every entity a block shows, each with a "replace image" action. */
function BlockImages({ block, project, kind }: { block: Block; project: Project; kind: EntityKind }) {
  const lib = useApp((s) => s.lib);
  const username = useApp((s) => s.username);
  const slideIdx = useEditor((s) => s.slideIdx);
  const [editing, setEditing] = useState<EntityRef | null>(null);
  if (!lib) return null;
  const ctx: RenderCtx = { lib, project, theme: slideTheme(project, project.slides[slideIdx]), username };
  const { stats } = blockRange(ctx, block);
  let items: { kind: EntityKind; name: string; artist: string; rank: number }[] = [];
  if (block.type === 'toplist') items = stats.top(block.entity, block.count, { discoveriesOnly: block.discoveries, offset: block.offset });
  else if (block.type === 'leaderboard') items = stats.top(block.entity, block.count);
  else if (block.type === 'months') items = stats.topPerMonth(block.entity).flatMap((m, i) => (m.item ? [{ ...m.item, rank: i + 1 }] : []));
  else if (block.type === 'image') {
    const it = imageBlockEntity(ctx, block);
    items = it ? [it] : [];
  }
  const seen = new Set<string>();
  items = items.filter((i) => (seen.has(i.name + i.artist) ? false : (seen.add(i.name + i.artist), true)));
  if (!items.length) return null;
  return (
    <Section title="Images" defaultOpen={false} right={<span className="muted small">{kind === 'artist' ? 'artist photos' : 'cover art'}</span>}>
      <p className="muted small">Missing or wrong picture? Click it to upload your own. It's saved for every wrapped.</p>
      <div className="thumbs">
        {items.map((it) => (
          <button key={it.name + it.artist} className="thumb" title={`${it.name} — replace image`} onClick={() => setEditing({ kind: it.kind, name: it.name, artist: it.artist })}>
            <EntityImg kind={it.kind} name={it.name} artist={it.artist} size={56} shape="rounded" />
            <span className="thumb-name">{it.name}</span>
          </button>
        ))}
      </div>
      {editing && <ImageEditor entity={editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

/* =============================== project =============================== */

const BG_KEYS: (keyof Theme)[] = ['bgType', 'bg1', 'bg2', 'bg3', 'angle', 'bgImage', 'bgImageSource', 'bgImageOpacity', 'bgImageBlur', 'grain'];

function ProjectInspector({ project }: { project: Project }) {
  const st = useEditor();
  const slide = project.slides[st.slideIdx];
  const [bgScope, setBgScope] = useState<'all' | 'slide'>(slide.theme ? 'slide' : 'all');
  useEffect(() => setBgScope(slide.theme ? 'slide' : 'all'), [slide.id, slide.theme]);
  const theme = project.theme;
  const eff = slideTheme(project, slide);
  const setTheme = (patch: Partial<Theme>, merge?: string) =>
    st.update((p) => {
      p.theme = { ...p.theme, ...patch };
    }, merge);
  const setBg = (patch: Partial<Theme>, merge?: string) => {
    if (bgScope === 'all') return setTheme(patch, merge);
    st.update((p) => {
      const s = p.slides[st.slideIdx];
      s.theme = { ...(s.theme ?? {}), ...patch };
    }, merge);
  };
  const changeFormat = (w: number, h: number, id: string, label: string) =>
    st.update((p) => {
      const sx = w / p.format.w;
      const sy = h / p.format.h;
      p.slides.forEach((s) =>
        s.blocks.forEach((b) => {
          b.x = Math.round(b.x * sx);
          b.w = Math.round(b.w * sx);
          b.y = Math.round(b.y * sy);
          b.h = Math.round(b.h * sy);
        }),
      );
      p.format = { id, label, w, h };
    });

  return (
    <>
      <div className="inspector-head">
        <div>
          <div className="eyebrow">Wrapped settings</div>
          <input className="name-input" value={project.name} onChange={(e) => st.update((p) => void (p.name = e.target.value), 'name')} />
        </div>
      </div>
      <p className="muted small pad">Select something on the canvas to edit it. These settings apply to the whole wrapped.</p>

      <Section title="Time range">
        <RangePicker value={project.range} onChange={(r) => st.update((p) => void (p.range = r))} />
        <p className="muted small">Every block uses this unless you give it its own range.</p>
      </Section>

      <Section title="Size">
        <div className="format-grid">
          {FORMATS.map((f) => (
            <button key={f.id} className={`format-opt ${project.format.id === f.id ? 'on' : ''}`} onClick={() => changeFormat(f.w, f.h, f.id, f.label)}>
              <span className="format-shape" style={{ aspectRatio: `${f.w} / ${f.h}` }} />
              <span>{f.label}</span>
              <span className="muted small">
                {f.w}×{f.h}
              </span>
            </button>
          ))}
        </div>
        <div className="grid2">
          <Field label="Width">
            <input className="text-input" type="number" value={project.format.w} onChange={(e) => changeFormat(Math.max(200, Number(e.target.value)), project.format.h, 'custom', 'Custom')} />
          </Field>
          <Field label="Height">
            <input className="text-input" type="number" value={project.format.h} onChange={(e) => changeFormat(project.format.w, Math.max(200, Number(e.target.value)), 'custom', 'Custom')} />
          </Field>
        </div>
      </Section>

      <Section title="Theme">
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button key={t.name} className={`theme-opt ${theme.name === t.name ? 'on' : ''}`} onClick={() => st.update((p) => void ((p.theme = { ...t }), p.slides.forEach((s) => delete s.theme)))}>
              <span className="theme-swatch" style={{ background: backgroundCss(t), color: t.text }}>
                <span style={{ fontFamily: FONTS.find((f) => f.id === t.headingFont)?.family, fontWeight: 800 }}>Aa</span>
                <span className="dot" style={{ background: t.accent }} />
              </span>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Background">
        <Segmented
          value={bgScope}
          onChange={(v) => {
            setBgScope(v);
            if (v === 'all')
              st.update((p) => {
                delete p.slides[st.slideIdx].theme;
              });
            else
              st.update((p) => {
                const s = p.slides[st.slideIdx];
                s.theme = Object.fromEntries(BG_KEYS.map((k) => [k, p.theme[k]])) as Partial<Theme>;
              });
          }}
          options={[
            { value: 'all', label: 'All slides' },
            { value: 'slide', label: 'This slide only' },
          ]}
        />
        <Field label="Style">
          <Segmented
            value={eff.bgType}
            onChange={(v) => setBg({ bgType: v })}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'linear', label: 'Gradient' },
              { value: 'radial', label: 'Radial' },
              { value: 'mesh', label: 'Mesh' },
            ]}
          />
        </Field>
        <Field label="Color 1">
          <ColorInput value={eff.bg1} onChange={(v) => setBg({ bg1: v ?? '#000000' }, 'bg1')} />
        </Field>
        {eff.bgType !== 'solid' && (
          <Field label="Color 2">
            <ColorInput value={eff.bg2} onChange={(v) => setBg({ bg2: v ?? '#000000' }, 'bg2')} />
          </Field>
        )}
        {eff.bgType === 'mesh' && (
          <Field label="Color 3">
            <ColorInput value={eff.bg3} onChange={(v) => setBg({ bg3: v ?? '#000000' }, 'bg3')} />
          </Field>
        )}
        {eff.bgType === 'linear' && (
          <Field label="Angle">
            <Slider value={eff.angle} min={0} max={360} onChange={(v) => setBg({ angle: v }, 'angle')} suffix="°" />
          </Field>
        )}
        <Field label="Film grain">
          <Slider value={eff.grain} min={0} max={1} step={0.01} onChange={(v) => setBg({ grain: v }, 'grain')} />
        </Field>
        <Field label="Background image">
          <Segmented
            value={eff.bgImageSource === 'artist' || eff.bgImageSource === 'album' ? eff.bgImageSource : eff.bgImage ? 'upload' : 'none'}
            onChange={(v) => setBg(v === 'none' ? { bgImageSource: 'upload', bgImage: undefined } : { bgImageSource: v as Theme['bgImageSource'], ...(v !== 'upload' && eff.bgImageBlur === 0 ? { bgImageBlur: 40, bgImageOpacity: 0.2 } : {}) })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'album', label: '#1 album' },
              { value: 'artist', label: '#1 artist' },
              { value: 'upload', label: 'Upload' },
            ]}
          />
        </Field>
        {(eff.bgImageSource ?? 'upload') === 'upload' && (
          <div className="row gap">
            <UploadButton className="btn" onImage={(src) => setBg({ bgImage: src, bgImageSource: 'upload' })}>
              {eff.bgImage ? 'Replace image' : 'Upload image'}
            </UploadButton>
            {eff.bgImage && (
              <button className="btn danger" onClick={() => setBg({ bgImage: undefined })}>
                Remove
              </button>
            )}
          </div>
        )}
        {(eff.bgImage || eff.bgImageSource === 'artist' || eff.bgImageSource === 'album') && (
          <>
            <Field label="Image opacity">
              <Slider value={eff.bgImageOpacity} min={0} max={1} step={0.01} onChange={(v) => setBg({ bgImageOpacity: v }, 'bgio')} />
            </Field>
            <Field label="Image blur">
              <Slider value={eff.bgImageBlur} min={0} max={80} onChange={(v) => setBg({ bgImageBlur: v }, 'bgib')} />
            </Field>
          </>
        )}
      </Section>

      <Section title="Colors & fonts">
        <Field label="Text">
          <ColorInput value={theme.text} onChange={(v) => setTheme({ text: v ?? '#ffffff' }, 'text')} />
        </Field>
        <Field label="Secondary text">
          <ColorInput value={theme.muted} onChange={(v) => setTheme({ muted: v ?? '#999999' }, 'muted')} />
        </Field>
        <Field label="Accent">
          <ColorInput value={theme.accent} onChange={(v) => setTheme({ accent: v ?? '#ffffff' }, 'accent')} />
        </Field>
        <Field label="Glass box tint">
          <ColorInput value={theme.card} onChange={(v) => setTheme({ card: v ?? 'rgba(255,255,255,0.08)' }, 'card')} />
        </Field>
        <Field label="Heading font">
          <Select value={theme.headingFont} options={FONTS.map((f) => ({ value: f.id, label: f.label }))} onChange={(v) => setTheme({ headingFont: v })} />
        </Field>
        <Field label="Body & label font">
          <Select value={theme.bodyFont} options={FONTS.map((f) => ({ value: f.id, label: f.label }))} onChange={(v) => setTheme({ bodyFont: v })} />
        </Field>
        <Field label="Names font" hint="Artist, album and song names in lists">
          <Select value={theme.nameFont ?? ''} options={[{ value: '', label: 'Same as body' }, ...FONTS.map((f) => ({ value: f.id, label: f.label }))]} onChange={(v) => setTheme({ nameFont: v || undefined })} />
        </Field>
        <Field label="Heading letter spacing">
          <Slider value={theme.headingTracking ?? 0} min={-0.1} max={0.4} step={0.01} onChange={(v) => setTheme({ headingTracking: v }, 'tracking')} suffix="em" />
        </Field>
        <div className="toggles">
          <Toggle value={!!theme.frame} onChange={(v) => setTheme({ frame: v })} label="Frame & corners" />
          <Toggle value={!!theme.sharp} onChange={(v) => setTheme({ sharp: v })} label="Sharp corners" />
        </div>
      </Section>

      <Section title="Listening time" defaultOpen={false}>
        <Field label="Average song length" hint="Last.fm doesn't record durations, so minutes are estimated as plays × this.">
          <Slider value={project.avgTrackMinutes} min={1} max={10} step={0.1} onChange={(v) => st.update((p) => void (p.avgTrackMinutes = v), 'avg')} suffix="min" />
        </Field>
      </Section>
    </>
  );
}
