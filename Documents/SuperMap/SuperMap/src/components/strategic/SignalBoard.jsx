import {
  DOMAINS,
  REGIONS,
  confidenceBand,
  relTime,
} from '../../lib/consoleSignals'

function Sparkline({ series, color }) {
  const values = Array.isArray(series) && series.length ? series : [0]
  const max = Math.max(...values, 1)
  const width = 100
  const height = 30
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width
      const y = height - (value / max) * (height - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className="console-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,${height} ${points} ${width},${height}`} fill={color} opacity="0.1" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" opacity="0.9" />
    </svg>
  )
}

/**
 * The signal board. One tile per published item that earned a domain, with the
 * domain's real 14-day activity behind it — no synthetic sparklines. The tiles
 * arrive pre-composed (round-robin by domain) so the counter always matches.
 */
export default function SignalBoard({
  tiles,
  mode,
  density,
  series,
  watch,
  onToggleWatch,
  onOpen,
  now,
  emptyCopy,
}) {
  if (!tiles.length) {
    return <p className="console-empty">{emptyCopy || 'No signals match these filters. Widen the window or lower the confidence floor.'}</p>
  }

  return (
    <div className={`console-sig-grid ${density === 'compact' ? 'is-compact' : ''}`}>
      {tiles.map((signal) => {
        const domain = DOMAINS[signal.domain] || DOMAINS.conflict
        const band = confidenceBand(signal.confidence)
        const flagged = signal.magnitude >= 0.8
        const watched = watch.includes(signal.id)

        return (
          <article
            key={signal.id}
            className={`console-sig ${flagged ? 'is-flagged' : ''}`}
            style={{ '--dc': domain.hex }}
            onClick={() => onOpen(signal.id)}
          >
            {flagged ? <span className="console-sig-anom" aria-hidden /> : null}

            <div className="console-sig-top">
              <span className="console-sig-dom">{domain.icon} {domain.label}</span>
              <span className="console-sig-region">{REGIONS[signal.region]?.label || signal.region}</span>
              <button
                type="button"
                className={`console-sig-star ${watched ? 'is-on' : ''}`}
                aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                aria-pressed={watched}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleWatch(signal.id)
                }}
              >
                ★
              </button>
            </div>

            <h3>
              <button
                type="button"
                className="console-sig-open"
                onClick={(event) => {
                  event.stopPropagation()
                  onOpen(signal.id)
                }}
              >
                {signal.title}
              </button>
            </h3>

            <p className="console-sig-copy">
              {mode === 'brief' ? (signal.detail || signal.title) : signal.raw}
            </p>

            <div className="console-sig-foot">
              <Sparkline series={series?.[signal.domain]} color={domain.hex} />
              <span className="console-conf" style={{ color: band.color }}>
                {mode === 'brief' ? band.label : `${Math.round(signal.confidence * 100)}%`}
              </span>
              <span className="console-conf-bar" aria-hidden>
                <i style={{ width: `${Math.round(signal.confidence * 100)}%`, background: band.color }} />
              </span>
              <span className="console-sig-time">{relTime(signal.at, now)}</span>
            </div>
          </article>
        )
      })}
    </div>
  )
}
