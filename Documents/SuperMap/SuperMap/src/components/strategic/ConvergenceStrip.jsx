import { DOMAINS, REGIONS, relTime } from '../../lib/consoleSignals'

/** Where independent domains co-occur in place and time. */
export default function ConvergenceStrip({ convergence, mode, now, onFocus }) {
  if (!convergence.length) {
    return (
      <section className="console-section" aria-label="Convergence alerts">
        <div className="console-section-head">
          <span className="console-tag">Correlation engine</span>
          <h2>Convergence alerts</h2>
        </div>
        <p className="console-section-sub">
          No multi-domain convergence right now. The engine flags a theater when three or more
          independent domains report inside the same six hours.
        </p>
        <div className="console-conv-strip">
          <div className="console-conv is-med is-quiet">
            <div className="console-conv-head">
              <span className="console-conv-icon" aria-hidden>✓</span>
              <b>Dispersed activity</b>
            </div>
            <p>Nothing is clustering. Single headlines are not treated as a finding.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="console-section" aria-label="Convergence alerts">
      <div className="console-section-head">
        <span className="console-tag">Correlation engine</span>
        <h2>Convergence alerts</h2>
      </div>
      <p className="console-section-sub">
        Independent domains reporting from the same theater in the same six hours. Click one to focus the map and board.
      </p>

      <div className="console-conv-strip">
        {convergence.map((cluster) => (
          <button
            type="button"
            key={cluster.region}
            className={`console-conv ${cluster.score >= 78 ? 'is-high' : 'is-med'}`}
            onClick={() => onFocus(cluster.region)}
          >
            <span className="console-conv-head">
              <span className="console-conv-icon" aria-hidden>{cluster.score >= 78 ? '🔴' : '🟠'}</span>
              <b>{REGIONS[cluster.region]?.label || cluster.region}</b>
              <span className="console-conv-score">{cluster.score}</span>
            </span>
            <span className="console-conv-copy">
              {mode === 'brief'
                ? `${cluster.domains.map((id) => DOMAINS[id]?.label.toLowerCase() || id).join(', ')} signals are clustering here at once.`
                : `${cluster.domains.length}-domain coincidence over ${cluster.count} signals, composite ${cluster.score}.`}
            </span>
            <span className="console-conv-domains">
              {cluster.domains.map((id) => (
                <span key={id} style={{ color: DOMAINS[id]?.hex || '#8494b3' }}>
                  {DOMAINS[id]?.icon} {DOMAINS[id]?.short || id}
                </span>
              ))}
            </span>
            <span className="console-conv-why">{cluster.why}</span>
            <span className="console-conv-foot">
              Top: {cluster.signals[0]?.title?.slice(0, 64) || '—'} · {relTime(cluster.signals[0]?.at, now)}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
