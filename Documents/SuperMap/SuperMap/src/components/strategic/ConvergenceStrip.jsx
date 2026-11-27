import { DOMAINS, REGIONS, plainDomainList, relTime } from '../../lib/consoleSignals'

/** Where independent domains co-occur in place and time. */
export default function ConvergenceStrip({ convergence, mode, now, onFocus }) {
  if (!convergence.length) {
    return (
      <section className="console-section" aria-label="Places where trouble lines up">
        <div className="console-section-head">
          <span className="console-tag">Where things overlap</span>
          <h2>Places where trouble lines up</h2>
        </div>
        <p className="console-section-sub">
          Nothing lines up right now. A place only appears here when three or more unrelated
          kinds of reports land inside the same six hours.
        </p>
        <div className="console-conv-strip">
          <div className="console-conv is-med is-quiet">
            <div className="console-conv-head">
              <span className="console-conv-icon" aria-hidden>✓</span>
              <b>Nothing lines up</b>
            </div>
            <p>One report on its own is not a pattern.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="console-section" aria-label="Places where trouble lines up">
      <div className="console-section-head">
        <span className="console-tag">Where things overlap</span>
        <h2>Places where trouble lines up</h2>
      </div>
      <p className="console-section-sub">
        Unrelated kinds of reports from the same place in the same six hours. Click one to focus
        the map and the board.
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
                ? `${plainDomainList(cluster.domains)} are all happening here at the same time.`
                : `${cluster.domains.length}-domain coincidence over ${cluster.count} signals, composite ${cluster.score}.`}
            </span>
            <span className="console-conv-domains">
              {cluster.domains.map((id) => (
                <span key={id} style={{ color: DOMAINS[id]?.hex || '#8494b3' }}>
                  {DOMAINS[id]?.icon} {DOMAINS[id]?.short || id}
                </span>
              ))}
            </span>
            {/* The head already names the place; the brief copy above already
                says what is happening, so the desk's own sentence is analyst-only. */}
            {mode === 'brief' ? null : <span className="console-conv-why">{cluster.why}</span>}
            <span className="console-conv-foot">
              Top: {cluster.signals[0]?.title?.slice(0, 64) || '—'} · {relTime(cluster.signals[0]?.at, now)}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
