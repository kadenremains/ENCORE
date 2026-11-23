import type { EntityKind, RangeSpec } from '../lib/types';

export const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------------- fonts ---------------- */

export const FONTS: { id: string; label: string; family: string }[] = [
  { id: 'bebas', label: 'Bebas Neue', family: "'Bebas Neue', Impact, sans-serif" },
  { id: 'cormorant', label: 'Cormorant Garamond', family: "'Cormorant Garamond', Georgia, serif" },
  { id: 'dmmono', label: 'DM Mono', family: "'DM Mono', ui-monospace, monospace" },
  { id: 'inter', label: 'Inter', family: "'Inter Variable', system-ui, sans-serif" },
  { id: 'space', label: 'Space Grotesk', family: "'Space Grotesk Variable', system-ui, sans-serif" },
  { id: 'bricolage', label: 'Bricolage', family: "'Bricolage Grotesque Variable', system-ui, sans-serif" },
  { id: 'unbounded', label: 'Unbounded', family: "'Unbounded Variable', system-ui, sans-serif" },
  { id: 'anton', label: 'Anton', family: "'Anton', Impact, sans-serif" },
  { id: 'archivo', label: 'Archivo Black', family: "'Archivo Black', Impact, sans-serif" },
  { id: 'instrument', label: 'Instrument Serif', family: "'Instrument Serif', Georgia, serif" },
  { id: 'dmserif', label: 'DM Serif', family: "'DM Serif Display', Georgia, serif" },
  { id: 'mono', label: 'JetBrains Mono', family: "'JetBrains Mono Variable', ui-monospace, monospace" },
];

export const fontFamily = (id: string) => FONTS.find((f) => f.id === id)?.family ?? FONTS[0].family;

/* ---------------- formats ---------------- */

export interface Format {
  id: string;
  label: string;
  w: number;
  h: number;
}

export const FORMATS: Format[] = [
  { id: 'story', label: 'Story 9:16', w: 1080, h: 1920 },
  { id: 'portrait', label: 'Post 4:5', w: 1080, h: 1350 },
  { id: 'square', label: 'Square 1:1', w: 1080, h: 1080 },
  { id: 'landscape', label: 'Landscape 16:9', w: 1920, h: 1080 },
];

/* ---------------- theme ---------------- */

export interface Theme {
  name: string;
  bgType: 'solid' | 'linear' | 'radial' | 'mesh';
  bg1: string;
  bg2: string;
  bg3: string;
  angle: number;
  text: string;
  muted: string;
  accent: string;
  card: string;
  headingFont: string;
  bodyFont: string;
  grain: number; // 0..1
  bgImage?: string;
  /** where the background image comes from: an upload, or your #1 artist / album art */
  /** upload = this wrapped only; mine = your account picture; avatar = Last.fm profile picture */
  bgImageSource?: 'upload' | 'artist' | 'album' | 'avatar' | 'mine';
  bgImageOpacity: number;
  bgImageBlur: number;
  /** framing of the background picture: focus point (0-100%) and zoom (1 = fill) */
  bgImageX?: number;
  bgImageY?: number;
  bgImageZoom?: number;
  /** font for artist / album / song names in lists (defaults to body font) */
  nameFont?: string;
  /** extra letter-spacing for heading text, in em */
  headingTracking?: number;
  /** thin inset frame with corner brackets */
  frame?: boolean;
  /** square-ish corners everywhere */
  sharp?: boolean;
}

const base = { bgImageOpacity: 0.5, bgImageBlur: 0, grain: 0.18, angle: 160 };

export const THEMES: Theme[] = [
  {
    ...base,
    name: 'Vault',
    bgType: 'solid',
    bg1: '#101012',
    bg2: '#18181c',
    bg3: '#000000',
    text: '#eaedf3',
    muted: '#7b8493',
    accent: '#c8cdd6',
    card: 'rgba(200,205,214,0.045)',
    headingFont: 'bebas',
    bodyFont: 'dmmono',
    nameFont: 'cormorant',
    headingTracking: 0.1,
    frame: true,
    sharp: true,
    grain: 0.06,
    bgImageSource: 'album',
    bgImageOpacity: 0.16,
    bgImageBlur: 40,
  },
  {
    ...base,
    name: 'Vault Light',
    bgType: 'solid',
    bg1: '#eceef2',
    bg2: '#ffffff',
    bg3: '#000000',
    text: '#14161c',
    muted: '#6c7482',
    accent: '#3a404c',
    card: 'rgba(20,22,30,0.04)',
    headingFont: 'bebas',
    bodyFont: 'dmmono',
    nameFont: 'cormorant',
    headingTracking: 0.1,
    frame: true,
    sharp: true,
    grain: 0.08,
  },
  { ...base, name: 'Midnight', bgType: 'mesh', bg1: '#0b0b1a', bg2: '#3a1c71', bg3: '#d76d77', text: '#ffffff', muted: 'rgba(255,255,255,0.62)', accent: '#ffaf7b', card: 'rgba(255,255,255,0.08)', headingFont: 'bricolage', bodyFont: 'inter' },
  { ...base, name: 'Acid', bgType: 'solid', bg1: '#c6ff3d', bg2: '#c6ff3d', bg3: '#000000', text: '#0a0a0a', muted: 'rgba(10,10,10,0.6)', accent: '#ff3d7f', card: 'rgba(0,0,0,0.08)', headingFont: 'anton', bodyFont: 'space', grain: 0.1 },
  { ...base, name: 'Sunset', bgType: 'linear', bg1: '#ff5f6d', bg2: '#ffc371', bg3: '#ffffff', text: '#1b0b14', muted: 'rgba(27,11,20,0.62)', accent: '#ffffff', card: 'rgba(255,255,255,0.22)', headingFont: 'unbounded', bodyFont: 'inter' },
  { ...base, name: 'Paper', bgType: 'solid', bg1: '#f3efe6', bg2: '#f3efe6', bg3: '#000', text: '#171512', muted: 'rgba(23,21,18,0.55)', accent: '#d9381e', card: 'rgba(23,21,18,0.05)', headingFont: 'instrument', bodyFont: 'inter', grain: 0.25 },
  { ...base, name: 'Mono', bgType: 'solid', bg1: '#0a0a0a', bg2: '#0a0a0a', bg3: '#000', text: '#f5f5f5', muted: 'rgba(245,245,245,0.5)', accent: '#f5f5f5', card: 'rgba(255,255,255,0.06)', headingFont: 'archivo', bodyFont: 'mono', grain: 0.12 },
  { ...base, name: 'Ocean', bgType: 'mesh', bg1: '#021b2b', bg2: '#0f9b8e', bg3: '#5b6cff', text: '#ffffff', muted: 'rgba(255,255,255,0.65)', accent: '#7cf5d6', card: 'rgba(255,255,255,0.09)', headingFont: 'space', bodyFont: 'inter' },
  { ...base, name: 'Bubblegum', bgType: 'radial', bg1: '#ffd6f2', bg2: '#ff6ec7', bg3: '#000', text: '#2a0821', muted: 'rgba(42,8,33,0.6)', accent: '#7b2cff', card: 'rgba(255,255,255,0.35)', headingFont: 'unbounded', bodyFont: 'bricolage' },
  { ...base, name: 'Ember', bgType: 'mesh', bg1: '#120400', bg2: '#b82e00', bg3: '#ff9a00', text: '#fff4e8', muted: 'rgba(255,244,232,0.62)', accent: '#ffd166', card: 'rgba(255,255,255,0.08)', headingFont: 'anton', bodyFont: 'space' },
  { ...base, name: 'Editorial', bgType: 'solid', bg1: '#111111', bg2: '#111', bg3: '#000', text: '#efe9dc', muted: 'rgba(239,233,220,0.55)', accent: '#e9c46a', card: 'rgba(239,233,220,0.06)', headingFont: 'dmserif', bodyFont: 'inter' },
];

/* ---------------- blocks ---------------- */

export type CardStyle = 'none' | 'glass' | 'solid' | 'outline';

export interface BlockBase {
  id: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  hidden?: boolean;
  locked?: boolean;
  /** null = inherit the project range */
  range: RangeSpec | null;
  card: CardStyle;
  cardColor?: string;
  radius: number;
  padding: number;
  title: string;
  showTitle: boolean;
  titleSize: number;
  color?: string; // text color override
  accent?: string; // accent override
  font?: string; // body font override
}

export type StatId =
  | 'scrobbles'
  | 'minutes'
  | 'hours'
  | 'days'
  | 'uniqueArtists'
  | 'uniqueAlbums'
  | 'uniqueTracks'
  | 'avgPerDay'
  | 'activeDays'
  | 'streak'
  | 'artistStreak'
  | 'busiestDay'
  | 'newArtists'
  | 'newTracks'
  | 'obsession'
  | 'peakHour'
  | 'topArtistPlays'
  | 'topTrackPlays'
  | 'percentTopArtist';

export const STATS: { id: StatId; label: string; defaultLabel: string }[] = [
  { id: 'scrobbles', label: 'Total scrobbles', defaultLabel: 'Scrobbles' },
  { id: 'minutes', label: 'Minutes listened (est.)', defaultLabel: 'Minutes listened' },
  { id: 'hours', label: 'Hours listened (est.)', defaultLabel: 'Hours listened' },
  { id: 'days', label: 'Days of music (est.)', defaultLabel: 'Days of nonstop music' },
  { id: 'uniqueArtists', label: 'Unique artists', defaultLabel: 'Artists' },
  { id: 'uniqueAlbums', label: 'Unique albums', defaultLabel: 'Albums' },
  { id: 'uniqueTracks', label: 'Unique tracks', defaultLabel: 'Songs' },
  { id: 'avgPerDay', label: 'Average per day', defaultLabel: 'Songs a day' },
  { id: 'activeDays', label: 'Days with music', defaultLabel: 'Days with music' },
  { id: 'streak', label: 'Longest listening streak', defaultLabel: 'Day streak' },
  { id: 'artistStreak', label: 'Longest artist streak', defaultLabel: 'Days in a row' },
  { id: 'busiestDay', label: 'Busiest day', defaultLabel: 'Biggest day' },
  { id: 'newArtists', label: 'New artists discovered', defaultLabel: 'New artists' },
  { id: 'newTracks', label: 'New songs discovered', defaultLabel: 'New songs' },
  { id: 'obsession', label: 'Most plays of one song in a day', defaultLabel: 'Plays in one day' },
  { id: 'peakHour', label: 'Peak listening hour', defaultLabel: 'Peak hour' },
  { id: 'topArtistPlays', label: '#1 artist plays', defaultLabel: 'Plays of your #1 artist' },
  { id: 'topTrackPlays', label: '#1 song plays', defaultLabel: 'Plays of your #1 song' },
  { id: 'percentTopArtist', label: '% of plays from #1 artist', defaultLabel: 'of everything was your #1' },
];

export type ListLayout = 'list' | 'ledger' | 'grid' | 'podium' | 'hero' | 'collage' | 'bars';
export type ImageShape = 'square' | 'rounded' | 'circle';

export interface TextBlock extends BlockBase {
  type: 'text';
  text: string;
  size: number;
  weight: number;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'center' | 'bottom';
  fontRole: 'heading' | 'body' | 'custom';
  uppercase: boolean;
  italic: boolean;
  letterSpacing: number;
  lineHeight: number;
  useAccent: boolean;
}

export interface TopListBlock extends BlockBase {
  type: 'toplist';
  entity: EntityKind;
  discoveries: boolean;
  count: number;
  offset: number;
  layout: ListLayout;
  columns: number;
  showImages: boolean;
  showCounts: boolean;
  showRank: boolean;
  showSub: boolean;
  imageShape: ImageShape;
  featureFirst: boolean;
  countLabel: string;
  itemScale: number;
  gap: number;
}

export interface LeaderboardBlock extends BlockBase {
  type: 'leaderboard';
  entity: EntityKind;
  count: number;
  compare: 'previous' | 'custom' | 'none';
  compareRange?: RangeSpec;
  showMovement: boolean;
  showBars: boolean;
  showImages: boolean;
  showCounts: boolean;
  showSub: boolean;
  imageShape: ImageShape;
  itemScale: number;
  countLabel: string;
}

export interface StatBlock extends BlockBase {
  type: 'stat';
  stat: StatId;
  label: string;
  sub: 'auto' | 'none' | 'custom';
  subText: string;
  size: number;
  align: 'left' | 'center' | 'right';
  labelPosition: 'above' | 'below';
  prefix: string;
  suffix: string;
  useAccent: boolean;
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  source: 'upload' | EntityKind;
  rank: number;
  src: string;
  shape: ImageShape;
  grayscale: number;
  brightness: number;
  blur: number;
  caption: boolean;
  captionSize: number;
  zoom: number;
  fx: number;
  fy: number;
  fade: boolean;
}

export interface ChartBlock extends BlockBase {
  type: 'chart';
  chart: 'timeline' | 'hours' | 'weekdays' | 'clock';
  bucket: 'auto' | 'day' | 'week' | 'month' | 'year';
  style: 'bars' | 'area';
  showLabels: boolean;
  highlightPeak: boolean;
}

export interface MonthsBlock extends BlockBase {
  type: 'months';
  entity: EntityKind;
  columns: number;
  showImages: boolean;
  showCounts: boolean;
  imageShape: ImageShape;
}

export interface ShapeBlock extends BlockBase {
  type: 'shape';
  shape: 'rect' | 'circle' | 'line';
  fill: string;
  useAccent: boolean;
  stroke: number;
}

export type Block = TextBlock | TopListBlock | LeaderboardBlock | StatBlock | ImageBlock | ChartBlock | MonthsBlock | ShapeBlock;
export type BlockType = Block['type'];

export interface Slide {
  id: string;
  name: string;
  blocks: Block[];
  /** per-slide theme overrides (background etc.) */
  theme?: Partial<Theme>;
}

export interface Project {
  id: string;
  name: string;
  created: number;
  updated: number;
  format: Format;
  theme: Theme;
  range: RangeSpec;
  slides: Slide[];
  avgTrackMinutes: number;
}

/* ---------------- block factories ---------------- */

const baseBlock = (over: Partial<BlockBase> = {}): BlockBase => ({
  id: uid(),
  x: 80,
  y: 80,
  w: 920,
  h: 300,
  rotation: 0,
  opacity: 1,
  range: null,
  card: 'none',
  radius: 36,
  padding: 0,
  title: '',
  showTitle: false,
  titleSize: 30,
  ...over,
});

export function makeBlock(type: BlockType, over: Partial<Block> = {}): Block {
  switch (type) {
    case 'text':
      return { ...baseBlock({ h: 160 }), type, text: 'Your title', size: 96, weight: 800, align: 'left', valign: 'top', fontRole: 'heading', uppercase: false, italic: false, letterSpacing: -2, lineHeight: 1, useAccent: false, ...over } as TextBlock;
    case 'toplist':
      return {
        ...baseBlock({ h: 760, title: 'Top Artists', showTitle: true }),
        type,
        entity: 'artist',
        discoveries: false,
        count: 5,
        offset: 0,
        layout: 'list',
        columns: 3,
        showImages: true,
        showCounts: true,
        showRank: true,
        showSub: true,
        imageShape: 'rounded',
        featureFirst: false,
        countLabel: 'plays',
        itemScale: 1,
        gap: 24,
        ...over,
      } as TopListBlock;
    case 'leaderboard':
      return {
        ...baseBlock({ h: 1100, title: 'The Leaderboard', showTitle: true, card: 'glass', padding: 40 }),
        type,
        entity: 'artist',
        count: 10,
        compare: 'previous',
        showMovement: true,
        showBars: true,
        showImages: true,
        showCounts: true,
        showSub: true,
        imageShape: 'rounded',
        itemScale: 1,
        countLabel: 'plays',
        ...over,
      } as LeaderboardBlock;
    case 'stat':
      return { ...baseBlock({ w: 440, h: 260, card: 'glass', padding: 36 }), type, stat: 'scrobbles', label: '', sub: 'auto', subText: '', size: 120, align: 'left', labelPosition: 'below', prefix: '', suffix: '', useAccent: false, ...over } as StatBlock;
    case 'image':
      return { ...baseBlock({ h: 920 }), type, source: 'artist', rank: 1, src: '', shape: 'rounded', grayscale: 0, brightness: 1, blur: 0, caption: true, captionSize: 64, zoom: 1, fx: 50, fy: 50, fade: true, ...over } as ImageBlock;
    case 'chart':
      return { ...baseBlock({ h: 420, title: 'When you listened', showTitle: true }), type, chart: 'timeline', bucket: 'auto', style: 'bars', showLabels: true, highlightPeak: true, ...over } as ChartBlock;
    case 'months':
      return { ...baseBlock({ h: 900, title: 'Your #1 every month', showTitle: true }), type, entity: 'artist', columns: 3, showImages: true, showCounts: false, imageShape: 'rounded', ...over } as MonthsBlock;
    case 'shape':
      return { ...baseBlock({ w: 400, h: 400 }), type, shape: 'rect', fill: '#ffffff', useAccent: true, stroke: 0, ...over } as ShapeBlock;
  }
}

export const BLOCK_LIBRARY: { type: BlockType; label: string; desc: string }[] = [
  { type: 'toplist', label: 'Top list', desc: 'Artists, albums or songs' },
  { type: 'leaderboard', label: 'Leaderboard', desc: 'Ranks with ▲▼ movement' },
  { type: 'stat', label: 'Big stat', desc: 'One number, big' },
  { type: 'image', label: 'Image', desc: 'Your #1 or an upload' },
  { type: 'text', label: 'Text', desc: 'Titles & captions' },
  { type: 'chart', label: 'Chart', desc: 'Timeline, clock, weekdays' },
  { type: 'months', label: '#1 by month', desc: 'Your year, month by month' },
  { type: 'shape', label: 'Shape', desc: 'Boxes, circles, lines' },
];

/* ---------------- templates ---------------- */

export interface Template {
  id: string;
  name: string;
  desc: string;
  format: string;
  theme: string;
  build: (f: Format) => Slide[];
}

const slide = (name: string, blocks: Block[]): Slide => ({ id: uid(), name, blocks });
const T = (over: Partial<TextBlock>) => makeBlock('text', over);

export const TEMPLATES: Template[] = [
  {
    id: 'vault',
    name: 'Vault Wrapped',
    desc: '7 archival story slides: silver on ink, ledgers, framed cards',
    format: 'story',
    theme: 'Vault',
    build: (f) => {
      const W = f.w;
      const P = 96;
      const IW = W - P * 2;
      const label = (over: Partial<TextBlock>) => T({ size: 26, weight: 400, fontRole: 'body', letterSpacing: 7, uppercase: true, useAccent: true, h: 50, x: P, w: IW, ...over });
      const big = (over: Partial<TextBlock>) => T({ weight: 400, letterSpacing: 0, lineHeight: 0.9, x: P, w: IW, ...over });
      const rule = (y: number) => makeBlock('shape', { x: P, y, w: IW, h: 4, shape: 'line', stroke: 2, useAccent: false, fill: 'rgba(200,205,214,0.28)' });
      const stat = (over: Partial<StatBlock>) => makeBlock('stat', { card: 'glass', padding: 36, radius: 3, ...over });
      const ledger = (over: Partial<TopListBlock>) => makeBlock('toplist', { layout: 'ledger', imageShape: 'square', showTitle: false, title: '', x: P, w: IW, ...over });
      return [
        slide('Intro', [
          label({ y: 150, text: 'Last.fm · {user}' }),
          big({ y: 420, h: 330, text: '{range}', size: 330 }),
          big({ y: 740, h: 200, text: 'Wrapped', size: 200 }),
          T({ x: P, y: 950, w: IW, h: 70, text: 'a listening record, in full', size: 52, weight: 300, fontRole: 'custom', font: 'cormorant', italic: true, letterSpacing: 0.5, useAccent: true }),
          rule(1300),
          stat({ x: P, y: 1340, w: IW, h: 230, stat: 'scrobbles', size: 170, card: 'none', padding: 0, label: 'scrobbles', labelPosition: 'below', sub: 'none' }),
          stat({ x: P, y: 1610, w: (IW - 24) / 2, h: 190, stat: 'uniqueArtists', size: 90, sub: 'none' }),
          stat({ x: P + (IW + 24) / 2, y: 1610, w: (IW - 24) / 2, h: 190, stat: 'hours', size: 90, sub: 'none' }),
        ]),
        slide('Top Artist', [
          label({ y: 150, text: 'No. 01 · Artist of the period' }),
          makeBlock('image', { x: P, y: 230, w: IW, h: IW, source: 'artist', rank: 1, shape: 'square', caption: true, captionSize: 110 }),
          label({ y: 1200, text: 'The rest of the top five' }),
          ledger({ y: 1260, h: 560, entity: 'artist', offset: 1, count: 4 }),
        ]),
        slide('Top Songs', [
          label({ y: 150, text: 'Songs · ranked by plays' }),
          big({ y: 210, h: 200, text: 'On Repeat', size: 210 }),
          ledger({ y: 470, h: 1340, entity: 'track', count: 10 }),
        ]),
        slide('Top Albums', [
          label({ y: 150, text: 'Albums · ranked by plays' }),
          big({ y: 210, h: 200, text: 'The Records', size: 168 }),
          makeBlock('toplist', { x: P, y: 470, w: IW, h: 1060, entity: 'album', count: 9, layout: 'grid', columns: 3, showRank: true, showCounts: true, title: '', showTitle: false, imageShape: 'square', gap: 28 }),
          rule(1590),
          stat({ x: P, y: 1620, w: IW, h: 180, stat: 'uniqueAlbums', size: 110, card: 'none', padding: 0, label: 'different albums played', sub: 'none' }),
        ]),
        slide('By the numbers', [
          label({ y: 150, text: 'The ledger' }),
          big({ y: 230, h: 180, text: 'By the Numbers', size: 128 }),
          stat({ x: P, y: 470, w: IW, h: 300, stat: 'minutes', size: 190 }),
          stat({ x: P, y: 800, w: (IW - 24) / 2, h: 300, stat: 'busiestDay', size: 130 }),
          stat({ x: P + (IW + 24) / 2, y: 800, w: (IW - 24) / 2, h: 300, stat: 'streak', size: 130 }),
          stat({ x: P, y: 1130, w: (IW - 24) / 2, h: 300, stat: 'newArtists', size: 130 }),
          stat({ x: P + (IW + 24) / 2, y: 1130, w: (IW - 24) / 2, h: 300, stat: 'obsession', size: 130 }),
          stat({ x: P, y: 1460, w: IW, h: 320, stat: 'artistStreak', size: 170 }),
        ]),
        slide('Habits', [
          label({ y: 150, text: 'When you pressed play' }),
          big({ y: 210, h: 200, text: 'The Hours', size: 210 }),
          makeBlock('chart', { x: P, y: 470, w: IW, h: 560, chart: 'clock', title: 'Hour by hour', showTitle: true, titleSize: 24 }),
          makeBlock('chart', { x: P, y: 1080, w: IW, h: 340, chart: 'weekdays', title: 'Day by day', showTitle: true, titleSize: 24 }),
          makeBlock('chart', { x: P, y: 1470, w: IW, h: 340, chart: 'timeline', style: 'area', title: 'Over time', showTitle: true, titleSize: 24 }),
        ]),
        slide('Summary', [
          makeBlock('image', { x: P, y: 130, w: 220, h: 220, source: 'album', rank: 1, shape: 'square', caption: false, fade: false }),
          label({ x: P + 260, y: 150, w: IW - 260, text: 'Listening review · {user}' }),
          big({ x: P + 260, y: 200, w: IW - 260, h: 110, text: '{range}', size: 120 }),
          T({ x: P + 260, y: 310, w: IW - 260, h: 50, text: 'top album: {topAlbum}', size: 38, weight: 300, fontRole: 'custom', font: 'cormorant', italic: true, letterSpacing: 0.5, useAccent: true }),
          rule(400),
          label({ y: 450, w: (IW - 40) / 2, text: 'Artists' }),
          label({ x: P + (IW + 40) / 2, y: 450, w: (IW - 40) / 2, text: 'Songs' }),
          ledger({ y: 510, w: (IW - 40) / 2, h: 880, entity: 'artist', count: 10, showImages: false, countLabel: '' }),
          ledger({ x: P + (IW + 40) / 2, y: 510, w: (IW - 40) / 2, h: 880, entity: 'track', count: 10, showImages: false, showSub: false, countLabel: '' }),
          stat({ x: P, y: 1450, w: (IW - 24) / 2, h: 230, stat: 'minutes', size: 100, label: 'minutes', sub: 'none' }),
          stat({ x: P + (IW + 24) / 2, y: 1450, w: (IW - 24) / 2, h: 230, stat: 'uniqueArtists', size: 100, label: 'artists', sub: 'none' }),
          label({ y: 1740, h: 40, size: 22, text: 'last.fm/user/{user}' }),
        ]),
      ];
    },
  },
  {
    id: 'wrapped',
    name: 'Bold Wrapped',
    desc: '7 colorful story slides: intro, top artist, songs, albums, stats, habits, summary',
    format: 'story',
    theme: 'Midnight',
    build: (f) => {
      const W = f.w;
      const P = 80;
      const IW = W - P * 2;
      return [
        slide('Intro', [
          T({ x: P, y: 260, w: IW, h: 120, text: '{user}', size: 52, weight: 600, fontRole: 'body', letterSpacing: 0, useAccent: true }),
          T({ x: P, y: 360, w: IW, h: 620, text: 'My\n{range}\nWrapped', size: 210, weight: 800, lineHeight: 0.92, letterSpacing: -8 }),
          makeBlock('stat', { x: P, y: 1240, w: IW, h: 300, stat: 'scrobbles', size: 190, card: 'none', padding: 0, label: 'scrobbles this time around' }),
          makeBlock('stat', { x: P, y: 1560, w: 440, h: 220, stat: 'uniqueArtists', size: 96, card: 'glass', padding: 32 }),
          makeBlock('stat', { x: P + 480, y: 1560, w: 440, h: 220, stat: 'hours', size: 96, card: 'glass', padding: 32 }),
        ]),
        slide('Top Artist', [
          T({ x: P, y: 120, w: IW, h: 90, text: 'Your top artist', size: 54, weight: 600, fontRole: 'body', letterSpacing: 0, useAccent: true }),
          makeBlock('image', { x: P, y: 230, w: IW, h: IW, source: 'artist', rank: 1, caption: true, captionSize: 92 }),
          makeBlock('toplist', { x: P, y: 1280, w: IW, h: 560, entity: 'artist', offset: 1, count: 4, title: 'And the rest of the top 5', showTitle: true, itemScale: 0.95 }),
        ]),
        slide('Top Songs', [
          T({ x: P, y: 140, w: IW, h: 220, text: 'Songs on\nrepeat', size: 140, weight: 800, lineHeight: 0.92, letterSpacing: -5 }),
          makeBlock('toplist', { x: P, y: 470, w: IW, h: 1350, entity: 'track', count: 8, layout: 'list', featureFirst: true, title: '', showTitle: false, gap: 22 }),
        ]),
        slide('Top Albums', [
          T({ x: P, y: 140, w: IW, h: 220, text: 'Albums you\nlived in', size: 140, weight: 800, lineHeight: 0.92, letterSpacing: -5 }),
          makeBlock('toplist', { x: P, y: 470, w: IW, h: 1060, entity: 'album', count: 9, layout: 'grid', columns: 3, showRank: true, showCounts: false, title: '', showTitle: false, imageShape: 'rounded', gap: 26 }),
          makeBlock('stat', { x: P, y: 1600, w: IW, h: 220, stat: 'uniqueAlbums', size: 110, card: 'glass', padding: 36, label: 'different albums played' }),
        ]),
        slide('By the numbers', [
          T({ x: P, y: 140, w: IW, h: 200, text: 'By the\nnumbers', size: 140, weight: 800, lineHeight: 0.92, letterSpacing: -5 }),
          makeBlock('stat', { x: P, y: 470, w: IW, h: 300, stat: 'minutes', size: 170, card: 'glass', padding: 40 }),
          makeBlock('stat', { x: P, y: 810, w: 440, h: 300, stat: 'busiestDay', size: 110, card: 'glass', padding: 36 }),
          makeBlock('stat', { x: P + 480, y: 810, w: 440, h: 300, stat: 'streak', size: 110, card: 'glass', padding: 36 }),
          makeBlock('stat', { x: P, y: 1150, w: 440, h: 300, stat: 'newArtists', size: 110, card: 'glass', padding: 36 }),
          makeBlock('stat', { x: P + 480, y: 1150, w: 440, h: 300, stat: 'obsession', size: 110, card: 'glass', padding: 36 }),
          makeBlock('stat', { x: P, y: 1490, w: IW, h: 300, stat: 'artistStreak', size: 130, card: 'glass', padding: 40 }),
        ]),
        slide('Habits', [
          T({ x: P, y: 140, w: IW, h: 200, text: 'When you\npressed play', size: 130, weight: 800, lineHeight: 0.92, letterSpacing: -5 }),
          makeBlock('chart', { x: P, y: 460, w: IW, h: 520, chart: 'clock', title: 'Hour by hour', showTitle: true }),
          makeBlock('chart', { x: P, y: 1040, w: IW, h: 360, chart: 'weekdays', title: 'Day by day', showTitle: true }),
          makeBlock('chart', { x: P, y: 1460, w: IW, h: 360, chart: 'timeline', title: 'Over time', showTitle: true }),
        ]),
        slide('Summary', [
          makeBlock('image', { x: P, y: 110, w: IW, h: 620, source: 'artist', rank: 1, caption: false, fade: false }),
          makeBlock('toplist', { x: P, y: 800, w: 440, h: 560, entity: 'artist', count: 5, showImages: false, showCounts: false, title: 'Top Artists', showSub: false, itemScale: 1.05, gap: 18 }),
          makeBlock('toplist', { x: P + 480, y: 800, w: 440, h: 560, entity: 'track', count: 5, showImages: false, showCounts: false, title: 'Top Songs', showSub: false, itemScale: 1.05, gap: 18 }),
          makeBlock('stat', { x: P, y: 1400, w: 440, h: 230, stat: 'minutes', size: 92, card: 'none', padding: 0, labelPosition: 'above', label: 'Minutes listened', sub: 'none' }),
          makeBlock('stat', { x: P + 480, y: 1400, w: 440, h: 230, stat: 'uniqueArtists', size: 92, card: 'none', padding: 0, labelPosition: 'above', label: 'Artists', sub: 'none' }),
          T({ x: P, y: 1720, w: IW, h: 80, text: 'last.fm/user/{user} · {range}', size: 34, weight: 500, fontRole: 'body', letterSpacing: 0, useAccent: true }),
        ]),
      ];
    },
  },
  {
    id: 'leaderboard',
    name: 'Leaderboard',
    desc: 'Top 10 with rank movement vs the previous period',
    format: 'story',
    theme: 'Mono',
    build: (f) => [
      slide('Leaderboard', [
        T({ x: 80, y: 120, w: f.w - 160, h: 100, text: '{range}', size: 48, weight: 500, fontRole: 'body', letterSpacing: 2, uppercase: true, useAccent: false }),
        T({ x: 80, y: 190, w: f.w - 160, h: 200, text: 'THE CHART', size: 170, weight: 400, letterSpacing: -2, fontRole: 'custom', font: 'anton' }),
        makeBlock('leaderboard', { x: 60, y: 430, w: f.w - 120, h: f.h - 560, count: 10, showTitle: false, card: 'none', padding: 20 }),
      ]),
    ],
  },
  {
    id: 'top5',
    name: 'Top 5 Post',
    desc: 'Square post: your top artists and songs side by side',
    format: 'square',
    theme: 'Acid',
    build: (f) => [
      slide('Top 5', [
        T({ x: 60, y: 50, w: f.w - 120, h: 150, text: 'MY {range} TOP 5', size: 120, weight: 400, letterSpacing: -1 }),
        makeBlock('toplist', { x: 60, y: 230, w: (f.w - 160) / 2, h: f.h - 290, entity: 'artist', count: 5, title: 'Artists', itemScale: 0.82, gap: 16 }),
        makeBlock('toplist', { x: 100 + (f.w - 160) / 2, y: 230, w: (f.w - 160) / 2, h: f.h - 290, entity: 'track', count: 5, title: 'Songs', itemScale: 0.82, gap: 16 }),
      ]),
    ],
  },
  {
    id: 'wall',
    name: 'Album Wall',
    desc: 'A 4×4 wall of your most played albums',
    format: 'portrait',
    theme: 'Editorial',
    build: (f) => [
      slide('Album Wall', [
        T({ x: 60, y: 60, w: f.w - 120, h: 120, text: '{range} in albums', size: 92, weight: 400, letterSpacing: -2 }),
        makeBlock('toplist', { x: 60, y: 210, w: f.w - 120, h: f.w - 120, entity: 'album', count: 16, layout: 'collage', columns: 4, gap: 8, imageShape: 'square', showTitle: false, title: '' }),
        T({ x: 60, y: f.h - 120, w: f.w - 120, h: 60, text: '{user} · {scrobbles} scrobbles', size: 32, weight: 500, fontRole: 'body', letterSpacing: 0, useAccent: true }),
      ]),
    ],
  },
  {
    id: 'blank',
    name: 'Blank canvas',
    desc: 'Start from nothing',
    format: 'story',
    theme: 'Midnight',
    build: () => [slide('Slide 1', [])],
  },
];

export function newProject(templateId = 'vault', range: RangeSpec = { preset: 'this-year' }): Project {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0];
  const format = FORMATS.find((f) => f.id === t.format) ?? FORMATS[0];
  const theme = THEMES.find((x) => x.name === t.theme) ?? THEMES[0];
  return {
    id: uid(),
    name: t.id === 'blank' ? 'Untitled wrapped' : t.name,
    created: Date.now(),
    updated: Date.now(),
    format,
    theme: { ...theme },
    range,
    slides: t.build(format),
    avgTrackMinutes: 3.5,
  };
}
