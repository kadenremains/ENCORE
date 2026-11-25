import { createContext, useContext, useMemo } from 'react';
import { useApp } from '../../store';
import { getStats, type Library } from '../../lib/library';

/**
 * Looking at someone else's stats (a friend's artist / album / song pages): everything under this
 * uses their library instead of yours.
 */
export const LibScope = createContext<{ lib: Library; who: string } | null>(null);
export const useScope = () => useContext(LibScope);
import { compareLabel, compareRange, rangeLabel, resolveRange } from '../../lib/range';

/** The global date range + comparison period, resolved into stats. */
export function useRangeStats() {
  const scope = useContext(LibScope);
  const appLib = useApp((s) => s.lib)!;
  const lib = scope?.lib ?? appLib;
  const spec = useApp((s) => s.exploreRange);
  const compare = useApp((s) => s.compare);
  return useMemo(() => {
    const range = resolveRange(spec);
    const stats = getStats(lib, range);
    const cr = compareRange(spec, range, compare);
    const prev = cr ? getStats(lib, cr) : null;
    return {
      lib,
      spec,
      range,
      stats,
      prev,
      compare,
      cmpLabel: prev ? compareLabel(compare) : '',
      label: rangeLabel(spec, range, lib.n ? lib.ts[0] : undefined),
    };
  }, [lib, spec, compare]);
}
