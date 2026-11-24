import { useMemo, useState } from 'react';
import { useRangeStats } from './useRangeStats';
import { KIND_LABEL, ledgerItems, fmtPct, pct } from './helpers';
import { Delta, Kpi, Ledger } from '../../ui/charts';
import { fmtNum } from '../../render/primitives';
import { routePath } from '../../router';
import type { EntityKind } from '../../lib/types';
import type { Ranked } from '../../lib/library';
import { EmptyRange } from './Overview';
import { SinglesLink } from './Singles';
import { MismatchLink } from '../Cleanup';
import { getPrefs } from '../../lib/prefs';

type Sort = 'plays' | 'climbing' | 'falling' | 'new' | 'recent';

export function TopView({ kind }: { kind: EntityKind }) {
  const { stats, prev, label, cmpLabel, lib } = useRangeStats();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('plays');
  const [limit, setLimit] = useState(() => getPrefs().listLength);
  const L = KIND_LABEL[kind];

  const { rows, rankOf } = useMemo(() => {
    const ranking = stats.ranking(kind);
    const rankOf = new Map<number, number>();
    ranking.forEach((r, i) => rankOf.set(r.idx, i + 1));
    let rows: Ranked[] = ranking;
    const prevMap = prev?.rankMap(kind);
    if (sort === 'new') rows = stats.discoveries(kind);
    else if (sort === 'recent') rows = [...stats.discoveries(kind)].sort((a, b) => lib.firstSeen[kind][b.idx] - lib.firstSeen[kind][a.idx]);
    else if ((sort === 'climbing' || sort === 'falling') && prevMap) {
      const delta = (r: Ranked) => {
        const p = prevMap.get(r.idx)?.rank;
        return p === undefined ? null : p - (rankOf.get(r.idx) ?? 0);
      };
      rows = ranking
        .filter((r) => delta(r) !== null && (sort === 'climbing' ? delta(r)! > 0 : delta(r)! < 0))
        .sort((a, b) => (sort === 'climbing' ? delta(b)! - delta(a)! : delta(a)! - delta(b)!));
    }
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      rows = rows.filter((r) => {
        const it = stats.item(kind, r, 0);
        return it.name.toLowerCase().includes(n) || it.artist.toLowerCase().includes(n);
      });
    }
    return { rows, rankOf };
  }, [stats, prev, kind, sort, q, lib]);

  if (!stats.total) return <EmptyRange label={label} />;
  const total = stats.unique(kind);
  const top10 = stats.ranking(kind).slice(0, 10).reduce((s, r) => s + r.count, 0);
  const disc = stats.discoveries(kind);
  const discPlays = disc.reduce((s, r) => s + r.count, 0);
  const max = stats.ranking(kind)[0]?.count ?? 1;

  // keep real ranks even when filtering / re-sorting
  const items = ledgerItems(stats, prev, kind, rows.slice(0, limit), { max, meta: sort === 'new' || sort === 'recent' ? 'first' : 'share' }).map((it, i) => ({
    ...it,
    rank: rankOf.get(rows[i].idx),
  }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{label} · ranked by plays</div>
          <h1 className="page-title">{L.many}</h1>
        </div>
        <nav className="seg kind-seg">
          {(['artist', 'album', 'track'] as EntityKind[]).map((k) => (
            <a key={k} href={routePath({ name: 'top', kind: k })} aria-pressed={k === kind}>
              {KIND_LABEL[k].many}
            </a>
          ))}
        </nav>
      </div>

      <div className="stats-row">
        <Kpi value={fmtNum(total)} label={`${L.many} played`} delta={<Delta cur={total} prev={prev?.unique(kind)} />} />
        <Kpi value={fmtPct(pct(top10, stats.total))} label="Plays from your top 10" />
        <Kpi value={fmtNum(disc.length)} label={`New ${L.many.toLowerCase()}`} sub={`${fmtPct(pct(discPlays, stats.total))} of plays`} />
        <Kpi value={(stats.total / Math.max(1, total)).toFixed(1)} label={`Plays per ${L.one.toLowerCase()}`} />
      </div>

      <div className="tools">
        <input className="text-input" placeholder={`Search ${L.many.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="plays">Most played</option>
          {prev && <option value="climbing">Climbing {cmpLabel}</option>}
          {prev && <option value="falling">Falling {cmpLabel}</option>}
          <option value="new">New in this range</option>
          <option value="recent">Newest discoveries first</option>
        </select>
      </div>

      <Ledger items={items} empty={q ? 'No matches.' : 'Nothing to show.'} />
      {rows.length > limit && (
        <button className="more" onClick={() => setLimit(limit + 200)}>
          Show more · {fmtNum(rows.length - limit)} left
        </button>
      )}
      {kind === 'album' && <SinglesLink />}
      <MismatchLink kind={kind} />
    </div>
  );
}
