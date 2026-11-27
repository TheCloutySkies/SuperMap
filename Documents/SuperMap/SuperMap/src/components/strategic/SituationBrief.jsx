import { plainDomainList, plainDomainName } from '../../lib/consoleSignals'

const GAUGE_LENGTH = 157

function clampText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function plural(count, one, many) {
  return count === 1 ? one : many
}

/** What each band actually means, in ordinary words. */
const BAND_PLAIN = {
  CALM: 'nothing unusual',
  GUARDED: 'a little more than usual',
  ELEVATED: 'clearly more than usual',
  HIGH: 'a lot happening at once',
  CRITICAL: 'a major, widespread crisis',
}

/**
 * The brief: a computed headline, the numbers behind it and the posture gauge.
 * Every sentence here is assembled from signal counts and published fields, and
 * written so it reads without any of the desk's own vocabulary: no "signals",
 * no "domains", no "theaters", no "convergences". The analyst mode below is
 * where the technical wording belongs.
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
    ? `The overall threat level is ${threat.threat_level} — ${threatAverage.toFixed(1)} out of 5.`
    : ''

  // "all theaters" is the desk's name for the global scope; in a sentence read
  // by anyone else it is simply "everywhere".
  const everywhere = regionLabel === 'all theaters'
  const scope = everywhere ? 'everywhere' : regionLabel

  const headline = convergence.length
    ? everywhere
      ? `Trouble is lining up in ${convergence.length} ${plural(convergence.length, 'region', 'regions')}`
      : `${scope}: trouble is lining up on several fronts`
    : `Nothing is lining up right now${everywhere ? '' : ` in ${scope}`}`

  const convergedDomains = plainDomainList([...new Set(convergence.flatMap((cluster) => cluster.domains))].slice(0, 4))

  const lede = [
    `${signals.length} ${plural(signals.length, 'report', 'reports')} from ${domainCount} different ${plural(domainCount, 'kind', 'kinds')} of source${plural(domainCount, '', 's')}${everywhere ? '' : ` in ${scope}`} over the last ${windowHours} hours.`,
    heaviest ? `The biggest group is ${plainDomainName(heaviest[0])} (${heaviest[1]}).` : '',
    threatSentence,
    convergence.length
      ? `${convergedDomains} keep turning up in the same places at the same time. That overlap is the real signal — not any single report.`
      : 'The reports are spread out, so nothing lines up in one place.',
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
          ? everywhere
            ? `${convergence.length} ${plural(convergence.length, 'region', 'regions')} with several problems at once`
            : `${convergence[0].domains.length} kinds of trouble at once`
          : `${signals.length} reports, nothing lining up`,
        sub: convergence.length
          ? everywhere
            ? `${convergence[0].why}${convergence.length > 1 ? ` Plus ${convergence.length - 1} more region${convergence.length === 2 ? '' : 's'}.` : ''}`
            : convergence[0].why
          : `Last ${windowHours} hours · ${domainCount} kinds of sources reporting.`,
      },
      {
        key: 'Why it matters',
        color: '#ffb020',
        value: topSignal ? clampText(topSignal.title, 76) : 'Nothing notable in this window',
        sub: topSignal
          ? `${plainDomainList([topSignal.domain])} · ${Math.round(topSignal.confidence * 100)}% sure · ${topSignal.corroboration} ${plural(topSignal.corroboration, 'source', 'sources')}`
          : 'Nothing stands out — try a longer time window.',
      },
      {
        key: 'What to do',
        color: '#57e389',
        value: anomalies.length
          ? `${anomalies.length} urgent ${plural(anomalies.length, 'report', 'reports')} worth a look`
          : 'Nothing urgent right now',
        sub: 'Click any card to see where it came from.',
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
      <p className="console-brief-eyebrow">The short version · written from the latest published reports</p>
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
              Overall risk: <b style={{ color: posture.color }}>{posture.band}</b> — {posture.score} out of 100,{' '}
              {BAND_PLAIN[posture.band] || 'worth a look'}.{' '}
              {posture.score >= 66
                ? 'Several serious things are happening at once, so this deserves your attention.'
                : posture.score >= 48
                  ? 'Raised, but not a crisis: several problems overlap, and that overlap is what pushes it up.'
                  : 'Nothing unusual. We will point it out if separate reports start saying the same thing.'}
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
