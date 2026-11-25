import { useMemo, useState } from 'react';
import { useRangeStats } from './useRangeStats';
import { BarChart, CalendarHeatmap, Delta, Kpi, Panel, Punchcard, fmtDay } from '../../ui/charts';
import { fmtNum } from '../../render/primitives';
import { entityPath } from '../../router';
import { dayToDate } from '../../lib/library';

type Bucket = 'day' | 'week' | 'month' | 'year';

const breakNote = (days?: number) => (days ? ` · after a ${days >= 60 ? `${Math.round(days / 30)}-month` : `${days}-day`} break` : '');

/** History → Patterns: when you listen (the page this used to be, "Listening"). */
export function Patterns() {
  const { stats, prev, label, lib } = useRangeStats();
  const span = stats.spanDays;
  const [bucket, setBucket] = useState<Bucket>(span <= 45 ? 'day' : span <= 200 ? 'week' : span <= 1500 ? 'month' : 'year');

  const topDays = useMemo(() => {
    const days = stats.topDays(15);
    const want = new Set(days.map((d) => d.day));
    const per = new Map<number, Map<number, number>>();
    for (let i = stats.lo; i < stats.hi; i++) {
      const d = lib.day[i];
      if (!want.has(d)) continue;
      let m = per.get(d);
      if (!m) per.set(d, (m = new Map()));
      m.set(lib.artist[i], (m.get(lib.artist[i]) ?? 0) + 1);
    }
    return days.map((d) => {
      let best = -1;
      let bc = 0;
      for (const [a, c] of per.get(d.day) ?? []) {
        if (c > bc) {
          best = a;
          bc = c;
        }
      }
      return { ...d, artist: best >= 0 ? lib.artists[best].name : '', artistPlays: bc };
    });
  }, [stats, lib]);

  if (!stats.total) return <p className="empty big">No scrobbles in {label} yet. Pick another range above.</p>;

  const tl = stats.timeline(bucket);
  const months = stats.monthTable();
  const maxMonth = Math.max(1, ...months.map((m) => m.plays));
  const streak = stats.longestStreak();
  // longest gap without music
  const days = [...stats.dayCounts().keys()].sort((a, b) => a - b);
  let gap = { days: 0, start: 0 };
  const skipMin = stats.range.gapDays ?? Infinity; // skipped breaks don't count as silences
  for (let i = 1; i < days.length; i++) {
    const len = days[i] - days[i - 1] - 1;
    if (len > gap.days && len < skipMin) gap = { days: len, start: days[i - 1] + 1 };
  }
  const years: number[] = [];
  for (let y = dayToDate(stats.lastDay).getFullYear(); y >= dayToDate(stats.firstDay).getFullYear(); y--) years.push(y);
  const dayOf = (d: Date) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);

  return (
    <>
      <div className="stats-row">
        <Kpi value={fmtNum(stats.activeDays)} label="Days with music" sub={`of ${fmtNum(span)} days`} delta={<Delta cur={stats.activeDays} prev={prev?.activeDays} />} />
        <Kpi value={(stats.total / Math.max(1, stats.activeDays)).toFixed(1)} label="Plays per active day" />
        <Kpi value={streak ? fmtNum(streak.days) : '0'} label="Longest streak" sub={streak ? `${fmtDay(streak.start, { month: 'short', day: 'numeric' })} – ${fmtDay(streak.end, { month: 'short', day: 'numeric', year: 'numeric' })}` : undefined} />
        <Kpi value={fmtNum(gap.days)} label="Longest silence" sub={gap.days ? `from ${fmtDay(gap.start, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'never went a day without'} />
      </div>

      <Panel
        title="Over time"
        right={
          <div className="seg">
            {(['day', 'week', 'month', 'year'] as Bucket[]).map((b) => (
              <button key={b} aria-pressed={bucket === b} onClick={() => setBucket(b)}>
                {b}
              </button>
            ))}
          </div>
        }
      >
        <BarChart
          height={200}
          data={tl.map((t, i) => ({
            label: t.label,
            value: t.value,
            axis: i % Math.max(1, Math.ceil(tl.length / 8)) === 0 ? t.label : '',
            afterBreak: t.afterBreak,
            tip: `${bucket === 'week' ? 'Week of ' : ''}${t.start.toLocaleDateString(undefined, bucket === 'year' ? { year: 'numeric' } : bucket === 'month' ? { month: 'long', year: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })} · ${fmtNum(t.value)} plays${breakNote(t.afterBreak)}`,
          }))}
        />
      </Panel>

      <Panel title="Hour × weekday">
        <Punchcard matrix={stats.hourWeekday()} />
      </Panel>

      {years.slice(0, 6).map((y) => {
        const s = Math.max(stats.firstDay, dayOf(new Date(y, 0, 1)));
        const e = Math.min(stats.lastDay, dayOf(new Date(y, 11, 31)));
        let plays = 0;
        for (const [d, c] of stats.dayCounts()) if (d >= s && d <= e) plays += c;
        return (
          <Panel key={y} title={String(y)} right={<span className="muted small">{fmtNum(plays)} plays</span>}>
            <CalendarHeatmap counts={stats.dayCounts()} startDay={s} endDay={e} />
          </Panel>
        );
      })}

      <div className="grid2">
        <Panel title="Biggest days">
          <table className="table">
            <tbody>
              {topDays.map((d, i) => (
                <tr key={d.day}>
                  <td className="rk">{i + 1}</td>
                  <td>{fmtDay(d.day)}</td>
                  <td className="t-muted">
                    {d.artist && (
                      <a href={entityPath('artist', d.artist, d.artist)}>
                        {d.artist} ×{d.artistPlays}
                      </a>
                    )}
                  </td>
                  <td className="num">{fmtNum(d.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Month by month">
          <table className="table">
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.month.getTime()}>
                  <td>{m.month.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</td>
                  <td className="t-muted">{m.top && <a href={entityPath('artist', m.top.name, m.top.artist)}>{m.top.name}</a>}</td>
                  <td className="num">
                    {fmtNum(m.plays)}
                    <span className="tbar" style={{ width: `${(m.plays / maxMonth) * 100}%` }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
