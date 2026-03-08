import { useState, useRef } from 'react'
import axios from 'axios'
import './Omnibar.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env?.DEV ? 'http://localhost:3001' : 'http://localhost:3001')

/** Omnibar: search only within the app. Results link to map (fly to / show on map) or feeds (filter by keyword). */
export default function Omnibar({
  query: controlledQuery,
  onQueryChange,
  onFlyTo,
  onKeywordChange,
  onSearchResults,
  onNavigateToMap,
  onNavigateToSearchResults,
  onNavigateToFeeds,
  placeholder = 'Search map, events, and feeds…',
}) {
  const [internalQuery, setInternalQuery] = useState('')
  const [places, setPlaces] = useState([])
  const [mapResults, setMapResults] = useState([])
  const [mapGeoJson, setMapGeoJson] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef(null)

  const isControlled = controlledQuery !== undefined
  const query = (isControlled ? controlledQuery : internalQuery) || ''

  const setQueryValue = (value) => {
    if (isControlled) onQueryChange?.(value)
    else setInternalQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onKeywordChange?.(String(value || '').trim()), 200)
  }

  const handleInputChange = (e) => {
    setQueryValue(e.target.value)
  }

  /** Search within app only: geocode (places) + backend events. All results are in-app actions. */
  const searchInApp = () => {
    const q = String(query).trim()
    if (!q) return
    setLoading(true)
    setPlaces([])
    setMapResults([])
    setMapGeoJson(null)
    onSearchResults?.(null)
    const geoPromise = API_BASE
      ? axios.get(`${API_BASE}/api/geocode`, { params: { q }, timeout: 8000 }).then((res) => res.data || [])
      : Promise.resolve([])
    const searchPromise = API_BASE
      ? axios.get(`${API_BASE}/api/search`, { params: { q }, timeout: 10000 }).then((res) => res.data)
      : Promise.resolve({ type: 'FeatureCollection', features: [] })
    Promise.all([geoPromise, searchPromise])
      .then(([geocodeList, fc]) => {
        const placeFeatures = (geocodeList || []).slice(0, 5).map((p, i) => ({
          type: 'Feature',
          id: `place-${i}`,
          properties: { type: 'Place', title: p.display_name || p.name || 'Place', source: 'geocode' },
          geometry: { type: 'Point', coordinates: [parseFloat(p.lon), parseFloat(p.lat)] },
          _isPlace: true,
        }))
        const features = fc?.features || []
        setPlaces(placeFeatures)
        setMapResults(features)
        const merged = { type: 'FeatureCollection', features: [...placeFeatures, ...features] }
        setMapGeoJson(merged)
        onSearchResults?.(merged)
        setShowDropdown(true)
        const firstPlace = placeFeatures[0]
        const firstEvent = features.find((f) => f.geometry?.coordinates?.length >= 2)
        const first = firstPlace || firstEvent
        if (first && onFlyTo) {
          const [lng, lat] = first.geometry.coordinates
          onFlyTo({ lng, lat, zoom: firstPlace ? 12 : 8, properties: first.properties })
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            onNavigateToSearchResults?.(String(q).trim())
          })
        })
      })
      .catch(() => {
        setPlaces([])
        setMapResults([])
        setMapGeoJson(null)
        onSearchResults?.(null)
        setShowDropdown(false)
        onNavigateToSearchResults?.(String(q).trim())
      })
      .finally(() => setLoading(false))
  }

  const handleSelectPlace = (feature) => {
    const coords = feature.geometry?.coordinates
    if (coords?.length >= 2) {
      if (onNavigateToMap) onNavigateToMap()
      if (onFlyTo) onFlyTo({ lng: coords[0], lat: coords[1], zoom: 12, properties: feature.properties })
    }
    setShowDropdown(false)
  }

  const handleSelectMapResult = (feature) => {
    const coords = feature.geometry?.coordinates
    if (coords?.length >= 2) {
      if (onNavigateToMap) onNavigateToMap()
      if (onFlyTo) onFlyTo({ lng: coords[0], lat: coords[1], zoom: 12, properties: feature.properties })
    }
    setShowDropdown(false)
  }

  const goToFeeds = () => {
    const q = String(query).trim()
    if (q && onNavigateToFeeds) onNavigateToFeeds(q)
    setShowDropdown(false)
  }

  const viewAllResults = () => {
    onNavigateToSearchResults?.(String(query).trim())
    setShowDropdown(false)
  }

  const hasAny = places.length > 0 || mapResults.length > 0
  const totalCount = places.length + mapResults.length

  return (
    <div className="omnibar-global-wrap">
      <div className="omnibar omnibar-global">
        <span className="omnibar-icon" aria-hidden>⌕</span>
        <input
          type="search"
          value={query}
          onChange={handleInputChange}
          onFocus={() => hasAny && setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          onKeyDown={(e) => e.key === 'Enter' && searchInApp()}
          placeholder={placeholder}
          className="omnibar-input"
          autoComplete="off"
        />
        <button
          type="button"
          className="omnibar-search-btn omnibar-search-btn--primary"
          onClick={searchInApp}
          disabled={loading || !String(query).trim()}
          title="Search within the app (map & feeds)"
        >
          {loading ? '…' : 'Search'}
        </button>
      </div>
      {showDropdown && hasAny && (
        <div className="omnibar-results">
          <div className="omnibar-results-actions omnibar-results-actions--top">
            {onNavigateToSearchResults && (
              <button type="button" className="omnibar-result omnibar-result--view-all" onMouseDown={viewAllResults}>
                View all {totalCount} result{totalCount !== 1 ? 's' : ''} →
              </button>
            )}
          </div>
          {places.length > 0 && (
            <>
              <div className="omnibar-results-head">Places</div>
              {places.slice(0, 5).map((feature, i) => (
                <button
                  key={feature.id || i}
                  type="button"
                  className="omnibar-result"
                  onMouseDown={() => handleSelectPlace(feature)}
                >
                  <span className="omnibar-result-type">Place</span>
                  <span className="omnibar-result-title">{feature.properties?.title || 'Place'}</span>
                  <span className="omnibar-result-action">Fly to</span>
                </button>
              ))}
            </>
          )}
          {mapResults.length > 0 && (
            <>
              <div className="omnibar-results-head">Map results</div>
              {mapResults.slice(0, 8).map((feature, i) => (
                <button
                  key={feature.id || i}
                  type="button"
                  className="omnibar-result"
                  onMouseDown={() => handleSelectMapResult(feature)}
                >
                  <span className="omnibar-result-type">{feature.properties?.type || 'Result'}</span>
                  <span className="omnibar-result-title">{feature.properties?.title || 'Untitled'}</span>
                  <span className="omnibar-result-action">Show on map</span>
                </button>
              ))}
            </>
          )}
          <div className="omnibar-results-actions">
            {onNavigateToSearchResults && (
              <button type="button" className="omnibar-result omnibar-result--see-all" onMouseDown={viewAllResults}>
                View full results page →
              </button>
            )}
            {onNavigateToFeeds && String(query).trim() && (
              <button type="button" className="omnibar-result omnibar-result--feeds" onMouseDown={goToFeeds}>
                Search in Feeds for “{String(query).trim().slice(0, 24)}{String(query).trim().length > 24 ? '…' : ''}” →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
