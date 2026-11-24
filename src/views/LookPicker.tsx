import { Logo } from '../ui/Logo';
import { Segmented } from '../ui/controls';
import { setPrefs, usePrefs } from '../lib/prefs';
import { ACCENTS, PALETTES } from '../lib/looks';
import { markLookChosen } from '../lib/look';
import { useApp } from '../store';
import { fmtNum } from '../render/primitives';

/** First run: choose the app's look before seeing your stats. Changes apply live. */
export function LookPicker() {
  const prefs = usePrefs();
  const user = useApp((s) => s.user?.name ?? (s.demo ? 'demo' : s.username));
  const lib = useApp((s) => s.lib);
  return (
    <div className="onboard look-picker">
      <div className="onboard-card grain look-card">
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner br" />
        <span className="corner bl" />
        <div className="brand big">
          <Logo /> Encore
        </div>
        <div>
          <div className="eyebrow">Welcome{user ? `, ${user}` : ''}</div>
          <h1>Pick your look</h1>
          <p className="lead">It changes the whole app. Your wrappeds keep their own themes.</p>
        </div>

        <div className="look-preview" aria-hidden>
          <div className="eyebrow">Your listening</div>
          <div className="look-preview-big">All time</div>
          <div className="look-preview-row">
            <span>
              <b>{fmtNum(lib?.n ? lib.n : 15589)}</b>
              <small>scrobbles</small>
            </span>
            <span>
              <b>{fmtNum(lib?.artists.length || 283)}</b>
              <small>artists</small>
            </span>
          </div>
          <div className="look-preview-bar">
            <i style={{ width: '82%' }} />
            <i style={{ width: '58%' }} />
            <i style={{ width: '36%' }} />
          </div>
        </div>

        <div>
          <div className="field-label">Palette</div>
          <div className="palette-grid">
            {PALETTES.map((p) => (
              <button key={p.id} className={`palette-card ${prefs.palette === p.id ? 'on' : ''}`} onClick={() => setPrefs({ palette: p.id })} style={{ background: p.colors[0], color: p.colors[2] }}>
                <span className="palette-swatch" style={{ background: p.colors[1], borderColor: `${p.colors[2]}33` }}>
                  <i style={{ background: p.colors[2] }} />
                  <i style={{ background: ACCENTS.find((a) => a.id === prefs.accent)?.color, width: '40%' }} />
                </span>
                <span className="palette-name">{p.name}</span>
                <span className="palette-desc">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="field-label">Accent</div>
          <div className="accent-row">
            {ACCENTS.map((a) => (
              <button key={a.id} className={`accent-dot ${prefs.accent === a.id ? 'on' : ''}`} onClick={() => setPrefs({ accent: a.id })} aria-label={a.name}>
                <i style={{ background: a.color }} />
                <span>{a.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="row gap wrap look-size">
          <span className="field-label">Text size</span>
          <Segmented
            value={prefs.textSize}
            onChange={(v) => setPrefs({ textSize: v })}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'normal', label: 'Normal' },
              { value: 'large', label: 'Large' },
            ]}
          />
        </div>

        <button className="btn primary big" onClick={() => markLookChosen()}>
          Continue
        </button>
        <p className="muted small">You can change all of this any time in Settings → Appearance.</p>
      </div>
    </div>
  );
}
