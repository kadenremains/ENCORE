import { useMemo } from 'react';
import { useApp } from '../../store';
import { getStats } from '../../lib/library';
import { compareLabel, compareRange, rangeLabel, resolveRange } from '../../lib/range';

/** The global date range + comparison period, resolved into stats. */
export function useRangeStats() {
  const lib = useApp((s) => s.lib)!;
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
