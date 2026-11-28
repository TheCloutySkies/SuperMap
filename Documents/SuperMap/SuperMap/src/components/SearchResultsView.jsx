function formatResultAge(ts) {
  if (ts == null) return null
  const ms = Number(ts)
  if (!Number.isFinite(ms)) {
    const parsed = new Date(ts).getTime()
    if (!Number.isFinite(parsed)) return null
    return formatResultAge(parsed)
  }
  const age = Date.now() - ms
  if (age < 0) return 'now'
  const sec = Math.floor(age / 1000)
  if (sec < 60) return 'now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Search results inside the window: a toolbar with the query and count, then
 * the app's own sections and the map/feed matches as Windows list rows.
 */
export default function SearchResultsView({ query, features = [], widgetMatches = [], onFlyTo, onShowOnMap, onBack, onNavigateToWidget }) {
  const hasCoords = (f) => f?.geometry?.coordinates?.length >= 2
  const totalCount = features.length + widgetMatches.length

  return (
    <div className="xp-page">
      <div className="xp-page-tools">
        <button type="button" onClick={onBack}>Back</button>
        <p>
          “{query || '—'}” · {totalCount} result{totalCount !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="xp-page-body">
        {totalCount === 0 ? (
          <>
            <p className="xp-note">No results. Try a different search in the bar above.</p>
            <p className="xp-note">
              Start both the app and the API with npm run dev from the project root (the folder that
              contains SuperMap and situational-awareness-api). The API runs on port 3001 so search
              and geocoding work.
            </p>
          </>
        ) : (
          <>
            {widgetMatches.length > 0 && (
              <fieldset>
                <legend>In the app</legend>
                <ul className="xp-list">
                  {widgetMatches.map((w) => (
                    <li key={w.id}>
                      <div className="xp-list-main">
                        <span className="xp-list-title">{w.title}</span>
                        {w.description && <span className="xp-list-desc">{w.description}</span>}
                      </div>
                      <div className="xp-list-actions">
                        {onNavigateToWidget && (
                          <button type="button" onClick={() => onNavigateToWidget(w.id)}>View</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            {features.length > 0 && (
              <fieldset>
                <legend>Map and feeds</legend>
                <ul className="xp-list">
                  {features.map((feature, i) => {
                    const props = feature.properties || {}
                    const title = props.title || props.name || 'Untitled'
                    const coords = feature.geometry?.coordinates
                    const canShowOnMap = hasCoords(feature)
                    const age = formatResultAge(props.timestamp || props.pubDate || props.publishedAt)
                    const typeLabel = props.type || props.source || 'Result'
                    return (
                      <li key={feature.id || i}>
                        <div className="xp-list-main">
                          <span className="xp-list-title">{title}</span>
                          <span className="xp-list-desc">
                            {typeLabel}
                            {props.source && props.source !== typeLabel ? ` · ${props.source}` : ''}
                            {age ? ` · ${age}` : ''}
                          </span>
                          {props.description && (
                            <span className="xp-list-desc">{String(props.description).slice(0, 200)}…</span>
                          )}
                        </div>
                        <div className="xp-list-actions">
                          {canShowOnMap && onShowOnMap && (
                            <button type="button" onClick={() => onShowOnMap(feature)}>Show on map</button>
                          )}
                          {canShowOnMap && onFlyTo && (
                            <button
                              type="button"
                              onClick={() => {
                                const [lng, lat] = coords
                                onFlyTo({ lng, lat, zoom: 12, properties: props })
                              }}
                            >
                              Fly to
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </fieldset>
            )}
          </>
        )}
      </div>
    </div>
  )
}
