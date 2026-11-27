import { useEffect, useState } from 'react'
import DataFreshness from '../DataFreshness'

function clockNow() {
  return new Date().toISOString().slice(11, 19)
}

/**
 * The desk's own header: posture, reading mode, clock and freshness.
 * The app's omnibar and mode rail stay exactly where they are.
 */
export default function ConsoleHeader({ mode, onMode, posture, onAsk, status }) {
  const [clock, setClock] = useState(clockNow)

  useEffect(() => {
    const id = setInterval(() => setClock(clockNow()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="console-head">
      <div className="console-head-brand">
        <p className="console-eyebrow">Good Palantir · assembled from the published snapshot</p>
        <h1 className="console-title">Strategic console</h1>
      </div>

      <div className="console-head-status">
        <span className="console-posture" title={`Composite posture ${posture.score} of 100`}>
          <span
            className="console-posture-dot"
            style={{ background: posture.color, boxShadow: `0 0 12px ${posture.color}` }}
            aria-hidden
          />
          <b>{posture.band}</b>
          <span className="console-posture-score">{posture.score}</span>
        </span>

        <div className="console-modes" role="tablist" aria-label="Reading mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'brief'}
            className={mode === 'brief' ? 'is-on' : ''}
            onClick={() => onMode('brief')}
          >
            BRIEF
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'analyst'}
            className={mode === 'analyst' ? 'is-on' : ''}
            onClick={() => onMode('analyst')}
          >
            ANALYST
          </button>
        </div>

        <span className="console-clock"><b>{clock}</b> UTC</span>

        <button type="button" className="console-ask-btn" onClick={onAsk}>
          ⌕ Ask the console
        </button>
      </div>

      <div className="console-head-freshness">
        <DataFreshness />
        {status === 'degraded' ? (
          <span className="console-warn">The snapshot is unreachable, so this desk is reading the API directly.</span>
        ) : null}
      </div>
    </header>
  )
}
