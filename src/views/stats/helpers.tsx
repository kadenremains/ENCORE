import type { RangeStats, Ranked } from '../../lib/library';
import type { EntityKind } from '../../lib/types';
import { entityPath } from '../../router';
import { Move, fmtDate, type LedgerItem } from '../../ui/charts';

export const KIND_LABEL: Record<EntityKind, { one: string; many: string }> = {
  artist: { one: 'Artist', many: 'Artists' },
  album: { one: 'Album', many: 'Albums' },
  track: { one: 'Song', many: 'Songs' },
};

export const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
export const fmtPct = (p: number) => `${p.toFixed(p < 1 ? 2 : 1)}%`;

/** Ranked rows -> ledger rows with movement, share and links. */
export function ledgerItems(
  stats: RangeStats,
  prev: RangeStats | null,
  kind: EntityKind,
  rows: Ranked[],
  opts: { startRank?: number; meta?: 'share' | 'first' | 'artist'; max?: number } = {},
): LedgerItem[] {
  const prevMap = prev?.rankMap(kind);
  const max = opts.max ?? rows[0]?.count ?? 1;
  return rows.map((r, i) => {
    const it = stats.item(kind, r, (opts.startRank ?? 1) + i);
    const share = fmtPct(pct(r.count, stats.total));
    const parts: string[] = [];
    if (kind !== 'artist') parts.push(it.artist);
    if (opts.meta === 'first') parts.push(`first heard ${fmtDate(stats.lib.firstSeen[kind][r.idx], { month: 'short', day: 'numeric', year: 'numeric' })}`);
    else if (opts.meta !== 'artist') parts.push(`${share} of plays`);
    return {
      key: `${kind}${r.idx}`,
      rank: it.rank,
      kind,
      name: it.name,
      artist: it.artist,
      meta: parts.join(' · '),
      value: r.count,
      frac: r.count / max,
      move: prevMap ? <Move rank={it.rank} prev={prevMap.get(r.idx)?.rank ?? null} /> : undefined,
      href: entityPath(kind, it.name, it.artist),
    };
  });
}
