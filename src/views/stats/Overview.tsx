import { useRangeStats } from './useRangeStats';
import { usePrefs } from '../../lib/prefs';
import { ACCOUNT_BG_KEY, bigAvatar, getOverride, useImagesVersion } from '../../lib/images';
import { useApp } from '../../store';
import { ledgerItems, KIND_LABEL, fmtPct, pct } from './helpers';
import { BarChart, CalendarHeatmap, Delta, Kpi, Ledger, Panel, WEEKDAYS, fmtDay, fmtHour } from '../../ui/charts';
import { EntityImg, fmtNum } from '../../render/primitives';
import { entityPath, routePath } from '../../router';
import type { EntityKind } from '../../lib/types';


const breakNote = (days?: number) => (days ? ` · after a ${days >= 60 ? `${Math.round(days / 30)}-month` : `${days}-day`} break` : '');

export function Overview() {
  const { stats, prev, label, cmpLabel, lib } = useRangeStats();
  const AVG_MIN = usePrefs((p) => p.minutesPerScrobble);
  if (!stats.total) return <EmptyRange label={label} />;
  const p = prev;
  const tl = stats.timeline('auto');
  const hours = stats.byHour();
  const wd = stats.byWeekday();
  const peakH = stats.peakHour();
  const busiest = stats.busiestDay();
  const streak = stats.longestStreak();
  const obs = stats.obsession();
  const aStreak = stats.artistStreak();
  const disc = stats.discoveries('artist');
  const months = stats.topPerMonth('artist');
  const heatEnd = stats.lastDay;
  const heatStart = Math.max(stats.firstDay, heatEnd - 370);
  const topArtist = stats.top('artist', 1)[0];

  return (
    <div className="page">
      <section className="hero grain">
        <HeroBackground />
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner br" />
        <span className="corner bl" />
        <div className="hero-top">
          <div>
            <div className="eyebrow">Your listening {cmpLabel && <span className="muted">· deltas {cmpLabel}</span>}</div>
            <h1>{label}</h1>
          </div>
          {topArtist && (
            <a className="hero-top-artist" href={entityPath('artist', topArtist.name, topArtist.artist)}>
              <EntityImg kind="artist" name={topArtist.name} artist={topArtist.artist} size={56} shape="square" />
              <span>
                <span className="eyebrow">No. 01 artist</span>
                <span className="hero-top-name">{topArtist.name}</span>
              </span>
            </a>
          )}
        </div>
        <div className="kpis">
          <Kpi value={fmtNum(stats.total)} label="Scrobbles" delta={<Delta cur={stats.total} prev={p?.total} />} />
          <Kpi value={fmtNum(stats.total * AVG_MIN)} label="Minutes (est.)" delta={<Delta cur={stats.total} prev={p?.total} />} sub={`≈ ${fmtNum((stats.total * AVG_MIN) / 60)} hours`} />
          <Kpi value={fmtNum(stats.unique('artist'))} label="Artists" delta={<Delta cur={stats.unique('artist')} prev={p?.unique('artist')} />} href={routePath({ name: 'top', kind: 'artist' })} />
          <Kpi value={fmtNum(stats.unique('album'))} label="Albums" delta={<Delta cur={stats.unique('album')} prev={p?.unique('album')} />} href={routePath({ name: 'top', kind: 'album' })} />
          <Kpi value={fmtNum(stats.unique('track'))} label="Songs" delta={<Delta cur={stats.unique('track')} prev={p?.unique('track')} />} href={routePath({ name: 'top', kind: 'track' })} />
          <Kpi value={(stats.total / stats.spanDays).toFixed(1)} label="Per day" delta={p ? <Delta cur={stats.total / stats.spanDays} prev={p.total / p.spanDays} /> : null} />
          <Kpi value={fmtNum(stats.activeDays)} label="Days with music" sub={`of ${fmtNum(stats.spanDays)} · ${fmtPct(pct(stats.activeDays, stats.spanDays))}`} />
          <Kpi value={fmtNum(disc.length)} label="New artists" delta={<Delta cur={disc.length} prev={p?.discoveries('artist').length} />} sub={disc[0] ? `led by ${lib.artists[disc[0].idx].name}` : undefined} />
        </div>
      </section>

      <div className="grid3">
        {(['artist', 'album', 'track'] as EntityKind[]).map((k) => (
          <Panel key={k} title={`Top ${KIND_LABEL[k].many}`} right={<a className="see-all" href={routePath({ name: 'top', kind: k })}>All {fmtNum(stats.unique(k))} →</a>}>
            <Ledger compact items={ledgerItems(stats, prev, k, stats.ranking(k).slice(0, 8))} />
          </Panel>
        ))}
      </div>

      <Panel title="Over time" right={<span className="muted small">{fmtNum(stats.total)} scrobbles</span>}>
        <BarChart
          height={180}
          data={tl.map((t, i) => ({
            label: t.label,
            value: t.value,
            axis: i % Math.max(1, Math.ceil(tl.length / 8)) === 0 ? t.label : '',
            afterBreak: t.afterBreak,
            tip: `${t.start.toLocaleDateString(undefined, { month: 'short', day: tl.length > 60 || t.label.length > 4 ? 'numeric' : undefined, year: 'numeric' })} · ${fmtNum(t.value)} plays${breakNote(t.afterBreak)}`,
          }))}
        />
      </Panel>

      <Panel title="Every day" right={<a className="see-all" href={routePath({ name: 'history', view: 'patterns' })}>Patterns →</a>}>
        <CalendarHeatmap counts={stats.dayCounts()} startDay={heatStart} endDay={heatEnd} />
      </Panel>

      <div className="grid2">
        <Panel title="Hour of day" right={<span className="muted small">peak {fmtHour(peakH)}</span>}>
          <BarChart height={130} data={hours.map((v, h) => ({ label: fmtHour(h), value: v, axis: h % 6 === 0 ? fmtHour(h) : '', tip: `${fmtHour(h)}–${fmtHour((h + 1) % 24)} · ${fmtNum(v)} plays` }))} />
        </Panel>
        <Panel title="Day of week">
          <BarChart height={130} data={wd.map((v, i) => ({ label: WEEKDAYS[i], value: v, axis: WEEKDAYS[i] }))} />
        </Panel>
      </div>

      <div className="highlights">
        {busiest && <Highlight label="Biggest day" value={fmtNum(busiest.count)} unit="plays" sub={fmtDay(busiest.day)} />}
        {streak && <Highlight label="Longest streak" value={fmtNum(streak.days)} unit="days" sub={`${fmtDay(streak.start, { month: 'short', day: 'numeric' })} – ${fmtDay(streak.end, { month: 'short', day: 'numeric', year: 'numeric' })}`} />}
        {obs && (
          <Highlight
            label="Obsession"
            value={fmtNum(obs.count)}
            unit="plays in a day"
            sub={`${lib.tracks[obs.track].name} · ${fmtDay(obs.day, { month: 'short', day: 'numeric' })}`}
            href={entityPath('track', lib.tracks[obs.track].name, lib.artists[lib.tracks[obs.track].artist].name)}
          />
        )}
        {aStreak && <Highlight label="Artist streak" value={fmtNum(aStreak.streak.days)} unit="days in a row" sub={lib.artists[aStreak.artist].name} href={entityPath('artist', lib.artists[aStreak.artist].name, lib.artists[aStreak.artist].name)} />}
        <Highlight label="Peak hour" value={fmtHour(peakH).replace('a', ' AM').replace('p', ' PM')} sub={`${fmtNum(hours[peakH])} plays`} />
        {topArtist && <Highlight label="Loyalty" value={fmtPct(pct(topArtist.count, stats.total))} unit="" sub={`of plays were ${topArtist.name}`} />}
      </div>

      <div className="grid2">
        <Panel title="Discoveries" right={<span className="muted small">{fmtNum(disc.length)} artists first heard in this range</span>}>
          <Ledger compact items={ledgerItems(stats, null, 'artist', disc.slice(0, 8), { meta: 'first' })} empty="No new artists in this range." />
        </Panel>
        <Panel title="Your #1, month by month">
          <div className="eras">
            {months.slice(-12).map((m) =>
              m.item ? (
                <a key={m.month.getTime()} className="era" href={entityPath('artist', m.item.name, m.item.artist)}>
                  <EntityImg kind="artist" name={m.item.name} artist={m.item.artist} shape="square" />
                  <span className="era-month">{m.month.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}</span>
                  <span className="era-name">{m.item.name}</span>
                </a>
              ) : null,
            )}
          </div>
        </Panel>
      </div>

      <a className="cta" href={routePath({ name: 'create' })}>
        <span className="eyebrow">Share it</span>
        <span className="cta-title">Make a wrapped of {label} →</span>
      </a>
    </div>
  );
}

function Highlight({ label, value, unit, sub, href }: { label: string; value: string; unit?: string; sub?: string; href?: string }) {
  const body = (
    <>
      <span className="eyebrow">{label}</span>
      <span className="hl-value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {sub && <span className="hl-sub">{sub}</span>}
    </>
  );
  return href ? (
    <a className="hl" href={href}>
      {body}
    </a>
  ) : (
    <div className="hl">{body}</div>
  );
}

export function EmptyRange({ label }: { label: string }) {
  return (
    <div className="page">
      <div className="empty big">
        <div className="eyebrow">{label}</div>
        <p>No scrobbles in this range yet. Pick another range above.</p>
      </div>
    </div>
  );
}

/** The blurred picture behind the Overview card: your Last.fm picture unless changed in Settings → Appearance. */
function HeroBackground() {
  const { stats } = useRangeStats();
  const choice = usePrefs((p) => p.heroBg);
  const strength = usePrefs((p) => p.heroBgStrength);
  const avatar = useApp((s) => s.user?.image);
  useImagesVersion(); // "My picture" can change or sync in
  const mine = getOverride(ACCOUNT_BG_KEY)?.src;
  const topAlbum = stats.top('album', 1)[0];
  const topArtist = stats.top('artist', 1)[0];
  // fall back to the #1 album when the chosen picture doesn't exist (no profile picture, no "My picture")
  const src = choice === 'avatar' ? bigAvatar(avatar) : choice === 'mine' ? mine : undefined;
  const kind = choice === 'artist' ? 'artist' : 'album';
  const entity = kind === 'artist' ? topArtist : topAlbum;
  if (choice === 'none') return null;
  return (
    <div className={`hero-art strength-${strength}`} aria-hidden>
      {src ? <img src={src} alt="" /> : entity ? <EntityImg kind={kind} name={entity.name} artist={entity.artist} /> : null}
    </div>
  );
}
