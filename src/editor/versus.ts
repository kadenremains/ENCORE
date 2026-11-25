import { FORMATS, THEMES, makeBlock, uid, type Block, type Project, type ShapeBlock, type TextBlock } from './model';
import type { Comparison, Side } from '../lib/compare';
import { useApp } from '../store';
import { getPrefs } from '../lib/prefs';

/**
 * A "You vs. them" wrapped, made from a comparison. The numbers are written into ordinary text and
 * shape blocks (a snapshot of the comparison when you made it), so every part stays editable in the
 * editor like any other wrapped, and exports exactly like one.
 */

const fmt = (n: number) => Math.round(n).toLocaleString();

export function makeVersusProject(cmp: Comparison, me: Side, them: Side, rangeNote: string): Project {
  const format = FORMATS.find((f) => f.id === 'story')!;
  const theme = { ...(THEMES.find((t) => t.name === 'Vault') ?? THEMES[0]) };
  const W = format.w;
  const P = 96;
  const IW = W - P * 2;
  const T = (over: Partial<TextBlock>) => makeBlock('text', { x: P, w: IW, ...over });
  const label = (over: Partial<TextBlock>) => T({ size: 26, weight: 400, fontRole: 'body', letterSpacing: 7, uppercase: true, useAccent: true, h: 50, ...over });
  // names sized to fit their half on one line (usernames can be long)
  const name = (text: string, over: Partial<TextBlock>) => T({ text, size: Math.max(30, Math.min(64, Math.floor((IW / 2 - 50) / (text.length * 0.62)))), weight: 700, letterSpacing: -1, h: 90, ...over });
  const rule = (y: number) => makeBlock('shape', { x: P, y, w: IW, h: 4, shape: 'line', stroke: 2, useAccent: false, fill: 'rgba(200,205,214,0.28)' });
  const bar = (x: number, y: number, w: number, accent: boolean) => makeBlock('shape', { x, y, w: Math.max(6, w), h: 14, shape: 'rect', useAccent: accent, fill: accent ? '' : 'rgba(200,205,214,0.35)', radius: 7 } as Partial<ShapeBlock>);
  const slide = (n: string, blocks: Block[]) => ({ id: uid(), name: n, blocks });

  // 1) the score
  const intro = slide('Match', [
    label({ y: 150, text: `Last.fm · ${me.name} vs ${them.name}` }),
    T({ y: 330, h: 420, text: `${cmp.score}%`, size: 380, weight: 400, letterSpacing: -8, lineHeight: 0.9, useAccent: true }),
    T({ y: 780, h: 120, text: cmp.label, size: 88, weight: 700, letterSpacing: -2 }),
    T({ y: 920, h: 140, text: cmp.line, size: 40, weight: 300, fontRole: 'body', letterSpacing: 0, lineHeight: 1.3 }),
    rule(1180),
    name(me.name, { y: 1240, w: IW / 2 - 40 }),
    T({ x: P + IW / 2 - 40, y: 1250, w: 80, h: 80, text: 'vs', size: 48, weight: 300, align: 'center', fontRole: 'body', useAccent: true }),
    name(them.name, { x: P + IW / 2 + 40, y: 1240, w: IW / 2 - 40, align: 'right' }),
    T({ y: 1360, h: 60, w: IW / 2 - 40, text: `${fmt(me.total)} plays`, size: 34, weight: 300, fontRole: 'body', letterSpacing: 0 }),
    T({ x: P + IW / 2 + 40, y: 1360, h: 60, w: IW / 2 - 40, text: `${fmt(them.total)} plays`, size: 34, weight: 300, fontRole: 'body', letterSpacing: 0, align: 'right' }),
    label({ y: 1760, text: rangeNote }),
  ]);

  // 2) the artists you share, with both counts
  const top = cmp.sharedArtists.slice(0, 6);
  const maxMe = Math.max(1, ...top.map((s) => s.mine));
  const maxThem = Math.max(1, ...top.map((s) => s.theirs));
  const rows: Block[] = [];
  top.forEach((s, i) => {
    const y = 330 + i * 230;
    rows.push(
      T({ y, h: 50, w: 80, text: String(i + 1).padStart(2, '0'), size: 34, weight: 300, fontRole: 'body', letterSpacing: 2, useAccent: true }),
      T({ x: P + 90, y: y - 6, h: 70, w: IW - 90, text: s.name, size: 54, weight: 700, letterSpacing: -1 }),
      bar(P + 90, y + 84, (IW - 330) * (s.mine / maxMe), true),
      T({ x: W - P - 200, y: y + 70, h: 44, w: 200, text: fmt(s.mine), size: 30, weight: 500, fontRole: 'body', letterSpacing: 0, align: 'right', useAccent: true }),
      bar(P + 90, y + 128, (IW - 330) * (s.theirs / maxThem), false),
      T({ x: W - P - 200, y: y + 114, h: 44, w: 200, text: fmt(s.theirs), size: 30, weight: 300, fontRole: 'body', letterSpacing: 0, align: 'right' }),
    );
  });
  // which bar is whose
  const key = [
    bar(P, 236, 60, true),
    T({ x: P + 76, y: 218, h: 50, w: IW / 2 - 90, text: me.name, size: 28, weight: 500, fontRole: 'body', letterSpacing: 0 }),
    bar(P + IW / 2, 236, 60, false),
    T({ x: P + IW / 2 + 76, y: 218, h: 50, w: IW / 2 - 76, text: them.name, size: 28, weight: 300, fontRole: 'body', letterSpacing: 0 }),
  ];
  const shared = slide('Shared', [label({ y: 150, text: 'Where you meet · plays' }), ...(rows.length ? [...key, ...rows] : [T({ y: 600, h: 200, text: 'Not a single artist in common.', size: 72 })])]);

  // 3) what each of you would hand the other
  const list = (items: { name: string }[]) => items.slice(0, 6).map((x, i) => `${String(i + 1).padStart(2, '0')}  ${x.name}`).join('\n') || '—';
  const swap = slide('Swap', [
    label({ y: 150, text: `${them.name} would play you` }),
    T({ y: 230, h: 560, text: list(cmp.onlyThem), size: 50, weight: 600, letterSpacing: -0.5, lineHeight: 1.45 }),
    rule(880),
    label({ y: 950, text: `You would play ${them.name}` }),
    T({ y: 1030, h: 560, text: list(cmp.onlyMe), size: 50, weight: 600, letterSpacing: -0.5, lineHeight: 1.45 }),
    label({ y: 1760, text: cmp.sharedTracks[0] ? `Your shared song: ${cmp.sharedTracks[0].name}` : rangeNote }),
  ]);

  return {
    id: uid(),
    name: `You vs ${them.name}`,
    created: Date.now(),
    updated: Date.now(),
    format,
    theme,
    range: useApp.getState().exploreRange,
    slides: [intro, shared, swap],
    avgTrackMinutes: getPrefs().minutesPerScrobble,
  };
}
