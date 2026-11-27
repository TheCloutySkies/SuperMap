import { DOMAINS, REGIONS, confidenceBand, relTime } from '../../lib/consoleSignals'

function MetaRow({ label, value }) {
  return (
    <div className="console-meta-item">
      <span className="console-meta-key">{label}</span>
      <span className="console-meta-value">{value}</span>
    </div>
  )
}

/**
 * Evidence drawer for one signal: what it says, how confident the desk is and
 * what published fields produced it.
 */
export default function SignalDrawer({ signal, mode, watch, onToggleWatch, onClose, onFocus, onOpen, related, now }) {
  if (!signal) return null
  const domain = DOMAINS[signal.domain] || DOMAINS.conflict
  const band = confidenceBand(signal.confidence)
  const watched = watch.includes(signal.id)
  const metaEntries = Object.entries(signal.meta || {})

  return (
    <>
      <div className="console-drawer-scrim" onClick={onClose} aria-hidden />
      <aside className="console-drawer" role="dialog" aria-modal="true" aria-label={signal.title}>
        <div className="console-drawer-head">
          <div>
            <p className="console-drawer-dom" style={{ color: domain.hex }}>
              {domain.icon} {domain.label} · {REGIONS[signal.region]?.label || signal.region}
            </p>
            <h2>{signal.title}</h2>
          </div>
          <button type="button" className="console-drawer-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="console-drawer-body">
          <div className="console-drawer-block">
            <h3>{mode === 'brief' ? 'What this means' : 'Published record'}</h3>
            <p className="console-drawer-plain">
              {mode === 'brief' ? (signal.detail || signal.title) : (signal.raw || signal.title)}
            </p>
            <p className="console-drawer-source-line">
              Source: <b>{signal.source || '—'}</b> · {relTime(signal.at, now)} ago · tier {signal.tier}
            </p>
            {signal.link ? (
              <a className="console-drawer-link" href={signal.link} target="_blank" rel="noopener noreferrer">
                Open the original →
              </a>
            ) : null}
          </div>

          <div className="console-drawer-block">
            <h3>Confidence breakdown</h3>
            <div className="console-conf-rows">
              <div className="console-conf-row">
                <span className="console-conf-label">Corroboration</span>
                <span className="console-conf-track"><i style={{ width: `${(signal.corroboration / 5) * 100}%`, background: '#22d3ee' }} /></span>
                <span className="console-conf-num">{signal.corroboration}/5</span>
              </div>
              <div className="console-conf-row">
                <span className="console-conf-label">Source tier</span>
                <span className="console-conf-track"><i style={{ width: `${((5 - signal.tier) / 4) * 100}%`, background: '#57e389' }} /></span>
                <span className="console-conf-num">T{signal.tier}</span>
              </div>
              <div className="console-conf-row">
                <span className="console-conf-label">Severity</span>
                <span className="console-conf-track"><i style={{ width: `${signal.magnitude * 100}%`, background: '#ffb020' }} /></span>
                <span className="console-conf-num">{Math.round(signal.magnitude * 100)}%</span>
              </div>
              <div className="console-conf-row">
                <span className="console-conf-label">Composite</span>
                <span className="console-conf-track"><i style={{ width: `${signal.confidence * 100}%`, background: band.color }} /></span>
                <span className="console-conf-num" style={{ color: band.color }}>{Math.round(signal.confidence * 100)}%</span>
              </div>
            </div>
            <p className="console-note">
              {mode === 'brief'
                ? `Rated ${band.label.toLowerCase()} confidence from ${signal.corroboration} published feed${signal.corroboration === 1 ? '' : 's'} reporting this item.`
                : 'confidence = 0.40 + corroboration × 0.06 + tier bonus + freshness + severity nudge, clamped 0.18–0.98. Corroboration counts the distinct published feeds that described the same place and hour.'}
            </p>
          </div>

          {metaEntries.length ? (
            <div className="console-drawer-block">
              <h3>Published fields</h3>
              <div className="console-meta">
                {metaEntries.map(([key, value]) => (
                  <MetaRow key={key} label={key.replace(/_/g, ' ')} value={String(value)} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="console-drawer-block">
            <h3>Sources ({signal.sources.length || 1})</h3>
            {(signal.sources.length ? signal.sources : [{ name: signal.source, tier: signal.tier }]).map((source, index) => (
              <div className="console-src" key={`${source.name}-${index}`}>
                <span className={`console-tier is-t${source.tier}`}>T{source.tier}</span>
                <span className="console-src-name">{source.name || '—'}</span>
              </div>
            ))}
          </div>

          <div className="console-drawer-block">
            <h3>Related in {REGIONS[signal.region]?.label || signal.region}</h3>
            <div className="console-related">
              {related.length ? related.map((item) => (
                <button type="button" key={item.id} className="console-related-item" onClick={() => onOpen(item.id)}>
                  <span className="console-related-dot" style={{ background: DOMAINS[item.domain].hex }} aria-hidden />
                  <span>{item.title.slice(0, 72)}</span>
                </button>
              )) : <p className="console-note">Nothing else published in this theater yet.</p>}
            </div>
          </div>

          <div className="console-drawer-actions">
            <button type="button" className="console-btn" onClick={() => onToggleWatch(signal.id)}>
              {watched ? '★ Watching' : '☆ Add to watchlist'}
            </button>
            <button type="button" className="console-btn" onClick={() => onFocus(signal.region)}>
              🎯 Focus theater
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
