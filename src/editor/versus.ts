import { FORMATS, THEMES, makeBlock, uid, type Block, type Project, type ShapeBlock, type TextBlock } from './model';
import type { Comparison, Side } from '../lib/compare';
import { useApp } from '../store';
import { getPrefs } from '../lib/prefs';

/**
 * A "You vs. them" wrapped. It's made of ordinary text and shape blocks (all editable), each one
 * labelled with the part of the comparison it shows (`vs`). Only who it compares you with is saved:
 * the numbers are filled in from a fresh comparison whenever it's opened (see versusBlank.ts).
 */

const fmt = (n: number) => Math.round(n).toLocaleString();
const W = 1080;
const P = 96;
const IW = W - P * 2;
const BAR = IW - 330; // longest bar

/** The layout, with every comparison part empty. */
export function makeVersusProject(meName: string, themName: string): Project {
  const format = FORMATS.find((f) => f.id === 'story')!;
  const theme = { ...(THEMES.find((t) => t.name === 'Vault') ?? THEMES[0]) };
  const T = (vs: string | undefined, over: Partial<TextBlock>) => makeBlock('text', { x: P, w: IW, text: '', ...(vs ? { vs } : {}), ...over });
  const label = (vs: string | undefined, over: Partial<TextBlock>) => T(vs, { size: 26, weight: 400, fontRole: 'body', letterSpacing: 7, uppercase: true, useAccent: true, h: 50, ...over });
  // names sized to fit their half on one line (usernames can be long)
  const nameSize = (text: string) => Math.max(30, Math.min(64, Math.floor((IW / 2 - 50) / (text.length * 0.62))));
  const rule = (y: number) => makeBlock('shape', { x: P, y, w: IW, h: 4, shape: 'line', stroke: 2, useAccent: false, fill: 'rgba(200,205,214,0.28)' });
  const bar = (vs: string | undefined, x: number, y: number, w: number, accent: boolean) => makeBlock('shape', { x, y, w, h: 14, shape: 'rect', useAccent: accent, fill: accent ? '' : 'rgba(200,205,214,0.35)', radius: 7, ...(vs ? { vs } : {}) } as Partial<ShapeBlock>);
  const slide = (n: string, blocks: Block[]) => ({ id: uid(), name: n, blocks });

  const intro = slide('Match', [
    label('title', { y: 150, text: `Last.fm · ${meName} vs ${themName}` }),
    T('score', { y: 330, h: 420, size: 380, weight: 400, letterSpacing: -8, lineHeight: 0.9, useAccent: true }),
    T('label', { y: 780, h: 120, size: 88, weight: 700, letterSpacing: -2 }),
    T('line', { y: 920, h: 140, size: 40, weight: 300, fontRole: 'body', letterSpacing: 0, lineHeight: 1.3 }),
    rule(1180),
    T('meName', { y: 1240, w: IW / 2 - 40, h: 90, text: meName, size: nameSize(meName), weight: 700, letterSpacing: -1 }),
    T(undefined, { x: P + IW / 2 - 40, y: 1250, w: 80, h: 80, text: 'vs', size: 48, weight: 300, align: 'center', fontRole: 'body', useAccent: true }),
    T('themName', { x: P + IW / 2 + 40, y: 1240, w: IW / 2 - 40, h: 90, text: themName, size: nameSize(themName), weight: 700, letterSpacing: -1, align: 'right' }),
    T('meTotal', { y: 1360, h: 60, w: IW / 2 - 40, size: 34, weight: 300, fontRole: 'body', letterSpacing: 0 }),
    T('themTotal', { x: P + IW / 2 + 40, y: 1360, h: 60, w: IW / 2 - 40, size: 34, weight: 300, fontRole: 'body', letterSpacing: 0, align: 'right' }),
    label('range', { y: 1760 }),
  ]);

  const rows: Block[] = [];
  for (let i = 0; i < 6; i++) {
    const y = 330 + i * 230;
    rows.push(
      T(`s${i}.rank`, { y, h: 50, w: 80, size: 34, weight: 300, fontRole: 'body', letterSpacing: 2, useAccent: true }),
      T(`s${i}.name`, { x: P + 90, y: y - 6, h: 70, w: IW - 90, size: 54, weight: 700, letterSpacing: -1 }),
      bar(`s${i}.barMe`, P + 90, y + 84, 6, true),
      T(`s${i}.mine`, { x: W - P - 200, y: y + 70, h: 44, w: 200, size: 30, weight: 500, fontRole: 'body', letterSpacing: 0, align: 'right', useAccent: true }),
      bar(`s${i}.barThem`, P + 90, y + 128, 6, false),
      T(`s${i}.theirs`, { x: W - P - 200, y: y + 114, h: 44, w: 200, size: 30, weight: 300, fontRole: 'body', letterSpacing: 0, align: 'right' }),
    );
  }
  const shared = slide('Shared', [
    label(undefined, { y: 150, text: 'Where you meet · plays' }),
    bar(undefined, P, 236, 60, true),
    T('keyMe', { x: P + 76, y: 218, h: 50, w: IW / 2 - 90, text: meName, size: 28, weight: 500, fontRole: 'body', letterSpacing: 0 }),
    bar(undefined, P + IW / 2, 236, 60, false),
    T('keyThem', { x: P + IW / 2 + 76, y: 218, h: 50, w: IW / 2 - 76, text: themName, size: 28, weight: 300, fontRole: 'body', letterSpacing: 0 }),
    ...rows,
  ]);

  const swap = slide('Swap', [
    label('onlyThemTitle', { y: 150, text: `${themName} would play you` }),
    T('onlyThem', { y: 230, h: 560, size: 50, weight: 600, letterSpacing: -0.5, lineHeight: 1.45 }),
    rule(880),
    label('onlyMeTitle', { y: 950, text: `You would play ${themName}` }),
    T('onlyMe', { y: 1030, h: 560, size: 50, weight: 600, letterSpacing: -0.5, lineHeight: 1.45 }),
    label('sharedSong', { y: 1760 }),
  ]);

  return {
    id: uid(),
    name: `You vs ${themName}`,
    created: Date.now(),
    updated: Date.now(),
    format,
    theme,
    range: useApp.getState().exploreRange,
    slides: [intro, shared, swap],
    avgTrackMinutes: getPrefs().minutesPerScrobble,
    versus: { friend: themName },
  };
}

/** Put a comparison into the wrapped (blocks you've rewritten yourself have no `vs` and are left alone). */
export function fillVersus(p: Project, cmp: Comparison, me: Side, them: Side, rangeNote: string): Project {
  const top = cmp.sharedArtists.slice(0, 6);
  const maxMe = Math.max(1, ...top.map((s) => s.mine));
  const maxThem = Math.max(1, ...top.map((s) => s.theirs));
  const list = (items: { name: string }[]) => items.slice(0, 6).map((x, i) => `${String(i + 1).padStart(2, '0')}  ${x.name}`).join('\n') || '—';
  const text: Record<string, string> = {
    score: `${cmp.score}%`,
    label: cmp.label,
    line: cmp.line,
    meTotal: `${fmt(me.total)} plays`,
    themTotal: `${fmt(them.total)} plays`,
    range: rangeNote,
    onlyThem: list(cmp.onlyThem),
    onlyMe: list(cmp.onlyMe),
    sharedSong: cmp.sharedTracks[0] ? `Your shared song: ${cmp.sharedTracks[0].name}` : rangeNote,
  };
  const width: Record<string, number> = {};
  top.forEach((s, i) => {
    text[`s${i}.rank`] = String(i + 1).padStart(2, '0');
    text[`s${i}.name`] = s.name;
    text[`s${i}.mine`] = fmt(s.mine);
    text[`s${i}.theirs`] = fmt(s.theirs);
    width[`s${i}.barMe`] = Math.max(6, BAR * (s.mine / maxMe));
    width[`s${i}.barThem`] = Math.max(6, BAR * (s.theirs / maxThem));
  });
  if (!top.length) text['s0.name'] = 'Not a single artist in common.';
  return {
    ...p,
    slides: p.slides.map((sl) => ({
      ...sl,
      blocks: sl.blocks.map((b) => {
        if (!b.vs) return b;
        if (b.type === 'text' && b.vs in text) return { ...b, text: text[b.vs] };
        if (b.type === 'text' && /^s\d\./.test(b.vs)) return { ...b, text: '' }; // fewer shared artists than rows
        if (b.type === 'shape' && b.vs in width) return { ...b, w: width[b.vs] };
        if (b.type === 'shape') return { ...b, w: 6 };
        return b;
      }),
    })),
  };
}
