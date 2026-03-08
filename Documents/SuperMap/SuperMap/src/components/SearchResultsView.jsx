import './SearchResultsView.css'

/**
 * Full-page search results (hidden from main nav). Opened when user searches from the Omnibar.
 * Shows every result related to the search query.
 */
export default function SearchResultsView({ query, features = [], onFlyTo, onShowOnMap, onBack }) {
  const hasCoords = (f) => f?.geometry?.coordinates?.length >= 2

  return (
    <div className="search-results-view">
      <header className="search-results-header">
        <button type="button" className="search-results-back" onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <h1 className="search-results-title">Search results</h1>
        <p className="search-results-query">“{query || '—'}”</p>
        <p className="search-results-meta">
          {features.length} result{features.length !== 1 ? 's' : ''}
        </p>
      </header>
      {features.length === 0 ? (
        <div className="search-results-empty">
          <p>No results. Try a different search in the bar above.</p>
          <p className="search-results-empty-hint">Start both the app and the API with <strong>npm run dev</strong> from the project root (the folder that contains SuperMap and situational-awareness-api). The API runs on port 3001 so search and geocoding work.</p>
        </div>
      ) : (
        <ul className="search-results-list">
          {features.map((feature, i) => {
            const props = feature.properties || {}
            const title = props.title || props.name || 'Untitled'
            const coords = feature.geometry?.coordinates
            const canShowOnMap = hasCoords(feature)
            return (
              <li key={feature.id || i} className="search-results-item">
                <div className="search-results-item-main">
                  <span className="search-results-item-type">{props.type || props.source || 'Result'}</span>
                  <h3 className="search-results-item-title">{title}</h3>
                  {props.source && (
                    <span className="search-results-item-source">{props.source}</span>
                  )}
                  {props.description && (
                    <p className="search-results-item-desc">{String(props.description).slice(0, 200)}…</p>
                  )}
                </div>
                <div className="search-results-item-actions">
                  {canShowOnMap && onShowOnMap && (
                    <button
                      type="button"
                      className="search-results-item-btn"
                      onClick={() => onShowOnMap(feature)}
                    >
                      Show on map
                    </button>
                  )}
                  {canShowOnMap && onFlyTo && (
                    <button
                      type="button"
                      className="search-results-item-btn search-results-item-btn--primary"
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
      )}
    </div>
  )
}
