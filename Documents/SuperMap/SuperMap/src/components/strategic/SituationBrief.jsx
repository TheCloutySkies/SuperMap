import { DOMAINS, REGIONS } from '../../lib/consoleSignals'

const GAUGE_LENGTH = 157

function clampText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * The brief: a computed headline, the numbers behind it and the posture gauge.
 * Every sentence here is assembled from signal counts and published fields.
 */
export default function SituationBrief({
  posture,
  convergence,
  anomalies,
  signals,
  mode,
  regionLabel,
  windowHours,
  threat,
  topSignal,
}) {
  const domainCount = new Set(signals.map((signal) => signal.domain)).size
  const heaviest = Object.entries(
    signals.reduce((acc, signal) => {
      acc[signal.domain] = (acc[signal.domain] || 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1])[0]

  const threatAverage = Number(threat?.average_score ?? threat?.threat_score)
  const threatSentence = threat?.threat_level && Number.isFinite(threatAverage)
    ? `The threat summary reads ${threat.threat_level} at ${threatAverage.toFixed(1)}/5.`
    : ''

  const headline = convergence.length
    ? `${convergence.length} convergence${convergence.length === 1 ? '' : 's'} in ${regionLabel}`
    : `Posture is ${posture.band.toLowerCase()} in ${regionLabel}`

  const convergedDomains = [...new Set(convergence.flatMap((cluster) => cluster.domains))]
    .map((id) => DOMAINS[id]?.short || id)
    .slice(0, 4)

  const lede = [
    `${signals.length} signal${signals.length === 1 ? '' : 's'} across ${domainCount} domain${domainCount === 1 ? '' : 's'} in ${regionLabel} over the last ${windowHours} h.`,
    heaviest ? `${DOMAINS[heaviest[0]]?.label || heaviest[0]} is the heaviest at ${heaviest[1]}.` : '',
    threatSentence,
    convergence.length
      ? `Independent ${convergedDomains.join(', ')} signals cluster together — that coincidence is the finding, not any single headline.`
      : 'Signals are dispersed; no multi-domain clustering in this window.',
  ].filter(Boolean).join(' ')

  const analystLede = [
    `Composite posture ${posture.score}/100 from ${signals.length} signals.`,
    `Activity term ${(posture.inputs.activity * 100).toFixed(0)}% (severity ${(posture.inputs.severity * 100).toFixed(0)}%, volume ${(posture.inputs.volume * 100).toFixed(0)}%, n=${posture.inputs.sample}).`,
    `Threat term ${(posture.inputs.threat * 100).toFixed(0)}%${posture.inputs.threatLevel ? ` (${posture.inputs.threatLevel})` : ''}.`,
    `DEFCON term ${(posture.inputs.tension * 100).toFixed(0)}%${posture.inputs.defcon ? ` (level ${posture.inputs.defcon})` : ''}.`,
    `Convergence term ${(posture.inputs.convergence * 100).toFixed(0)}%.`,
  ].join(' ')

  const items = mode === 'brief'
    ? [
      {
        key: "What's happening",
        color: '#ff3b5c',
        value: convergence.length
          ? convergence.length === 1
            ? `${convergence[0].domains.length} domains converging in ${REGIONS[convergence[0].region]?.label || convergence[0].region}`
            : `${convergence.length} theaters converging · ${REGIONS[convergence[0].region]?.label || convergence[0].region} first`
          : `${signals.length} signals, no clustering`,
        sub: convergence.length
          ? `${convergence[0].why}${convergence.length > 1 ? ` Plus ${convergence.length - 1} more theater${convergence.length === 2 ? '' : 's'}.` : ''}`
          : `Window ${windowHours} h · ${domainCount} domains active.`,
      },
      {
        key: 'Why it matters',
        color: '#ffb020',
        value: topSignal ? clampText(topSignal.title, 76) : 'Nothing notable in this window',
        sub: topSignal
          ? `${DOMAINS[topSignal.domain]?.label || topSignal.domain} · confidence ${(topSignal.confidence * 100).toFixed(0)}% · ${topSignal.corroboration} source${topSignal.corroboration === 1 ? '' : 's'}`
          : 'Widen the window or lower the confidence floor.',
      },
      {
        key: 'What to do',
        color: '#57e389',
        value: anomalies.length
          ? `${anomalies.length} high-severity signal${anomalies.length === 1 ? '' : 's'} to review`
          : 'Keep watching the board',
        sub: 'Open any tile for its evidence and sources.',
      },
    ]
    : [
      { key: 'Active signals', color: '#22d3ee', value: signals.length.toLocaleString(), sub: `${domainCount} domains · window ${windowHours} h` },
      { key: 'Convergences', color: '#ff3b5c', value: convergence.length.toLocaleString(), sub: convergence.length ? `top score ${convergence[0].score} · ${regionLabel}` : 'none ≥3 domains' },
      { key: 'High severity', color: '#ff4fd8', value: anomalies.length.toLocaleString(), sub: 'magnitude ≥ 0.8, last window' },
    ]

  const gaugeOffset = GAUGE_LENGTH - (posture.score / 100) * GAUGE_LENGTH

  return (
    <section className="console-brief" aria-label="Situation brief">
      <p className="console-brief-eyebrow">Synthesized situation brief · computed from published data</p>
      <h2 className="console-brief-head">{headline}</h2>
      <p className="console-lede">{mode === 'brief' ? lede : analystLede}</p>

      <div className="console-brief-grid">
        {items.map((item) => (
          <div className="console-brief-item" key={item.key}>
            <div className="console-k">
              <span className="console-k-dot" style={{ background: item.color }} aria-hidden />
              {item.key}
            </div>
            <div className="console-v">{item.value}</div>
            <div className="console-s">{item.sub}</div>
          </div>
        ))}
      </div>

      <div className="console-posture-meter">
        <div className="console-gauge">
          <svg viewBox="0 0 120 64" aria-hidden>
            <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="#16233c" strokeWidth="9" strokeLinecap="round" />
            <path
              d="M10 60 A50 50 0 0 1 110 60"
              fill="none"
              stroke={posture.color}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={GAUGE_LENGTH}
              strokeDashoffset={gaugeOffset}
            />
          </svg>
          <div className="console-gauge-val" style={{ color: posture.color }}>{posture.score}</div>
        </div>
        <div className="console-posture-text">
          {mode === 'brief' ? (
            <>
              Overall posture is <b style={{ color: posture.color }}>{posture.band}</b>.{' '}
              {posture.score >= 66
                ? 'Several stressors are compounding; stay close to the board.'
                : posture.score >= 48
                  ? 'Elevated but manageable; watch the convergences.'
                  : 'Routine. The console flags you when independent signals start clustering.'}
            </>
          ) : (
            <>
              score = clamp(activity × 0.42 + threat × 0.25 + DEFCON × 0.15 + convergence × 0.18, 2–99); bands
              at 28 / 48 / 66 / 82. Activity is magnitude × confidence, weighted by domain and saturating with volume.
            </>
          )}
        </div>
      </div>
    </section>
  )
}
