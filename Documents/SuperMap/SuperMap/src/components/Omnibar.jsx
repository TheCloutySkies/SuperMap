import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import axios from 'axios'
import './Omnibar.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env?.DEV ? 'http://localhost:3001' : 'http://localhost:3001')

const DEFAULT_COMMANDS = [
  { id: 'cmd-home', label: 'Go Home', keywords: 'home dashboard', action: 'navigate', viewId: 'home' },
  { id: 'cmd-osint-map', label: 'OSINT Map', keywords: 'maps osint', action: 'navigate', viewId: 'osint-map' },
  { id: 'cmd-conflict-map', label: 'Conflict Map', keywords: 'maps conflict war', action: 'navigate', viewId: 'conflict-map' },
  { id: 'cmd-crime', label: 'Crime Intelligence', keywords: 'crime fbi ucr ask intelligence', action: 'navigate', viewId: 'crime' },
  { id: 'cmd-explore-map', label: 'Explore Map', keywords: 'maps explore', action: 'navigate', viewId: 'explore-map' },
  { id: 'cmd-geolocate', label: 'Geolocate', keywords: 'maps geolocate overpass', action: 'navigate', viewId: 'geolocate-map' },
  { id: 'cmd-news', label: 'News Feeds', keywords: 'feeds news', action: 'navigate', viewId: 'news-feeds' },
  { id: 'cmd-osint-feeds', label: 'OSINT Feeds', keywords: 'feeds osint', action: 'navigate', viewId: 'osint-feeds' },
  { id: 'cmd-osint-x', label: 'OSINT (X)', keywords: 'feeds twitter x', action: 'navigate', viewId: 'osint-x' },
  { id: 'cmd-videos', label: 'Recent Videos', keywords: 'feeds videos', action: 'navigate', viewId: 'recent-videos' },
  { id: 'cmd-broadcasts', label: 'Broadcasts', keywords: 'feeds broadcasts streams', action: 'navigate', viewId: 'broadcasts' },
  { id: 'cmd-tools', label: 'Tools', keywords: 'tools', action: 'navigate', viewId: 'tools' },
  { id: 'cmd-resources', label: 'Resources', keywords: 'resources links', action: 'navigate', viewId: 'resources' },
  { id: 'cmd-reports', label: 'Report Maker', keywords: 'report maker reports', action: 'navigate', viewId: 'report-maker' },
  { id: 'cmd-settings', label: 'Settings', keywords: 'settings prefs', action: 'navigate', viewId: 'settings' },
]

/** Omnibar: place/event search + command jump (Ctrl/Cmd+K). */
export default function Omnibar({
  query: controlledQuery,
  onQueryChange,
  onFlyTo,
  onKeywordChange,
  onSearchResults,
  onNavigateToMap,
  onNavigateToSearchResults,
  onNavigateToFeeds,
  onCommandNavigate,
  commands = DEFAULT_COMMANDS,
  placeholder = 'Search or jump (Ctrl+K)…',
}) {
  const [internalQuery, setInternalQuery] = useState('')
  const [places, setPlaces] = useState([])
  const [mapResults, setMapResults] = useState([])
  const [mapGeoJson, setMapGeoJson] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [commandMode, setCommandMode] = useState(false)
  const debounceRef = useRef(null)
  const inputRef = useRef(null)

  const isControlled = controlledQuery !== undefined
  const query = (isControlled ? controlledQuery : internalQuery) || ''

  const setQueryValue = (value) => {
    if (isControlled) onQueryChange?.(value)
    else setInternalQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onKeywordChange?.(String(value || '').trim()), 200)
  }

  const commandMatches = useMemo(() => {
    const q = String(query).trim().toLowerCase()
    if (!q && !commandMode) return []
    const list = commands || DEFAULT_COMMANDS
    if (!q) return list.slice(0, 8)
    return list
      .filter((c) => `${c.label} ${c.keywords || ''}`.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, commands, commandMode])

  const openCommandPalette = useCallback(() => {
    setCommandMode(true)
    setShowDropdown(true)
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openCommandPalette()
      }
      if (e.key === 'Escape') {
        setShowDropdown(false)
        setCommandMode(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openCommandPalette])

  const handleInputChange = (e) => {
    setQueryValue(e.target.value)
    setCommandMode(true)
    setShowDropdown(true)
  }

  const runCommand = (cmd) => {
    if (!cmd) return
    if (cmd.action === 'navigate' && cmd.viewId) {
      onCommandNavigate?.(cmd.viewId)
    }
    setShowDropdown(false)
    setCommandMode(false)
  }

  const searchInApp = () => {
    const q = String(query).trim()
    if (!q) return
    // If exact/close command match, prefer jump
    const exact = commandMatches.find((c) => c.label.toLowerCase() === q.toLowerCase())
    if (exact && onCommandNavigate) {
      runCommand(exact)
      return
    }
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
        setCommandMode(false)
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
  const showCommands = commandMode && commandMatches.length > 0

  return (
    <div className="omnibar-global-wrap">
      <div className="omnibar omnibar-global">
        <span className="omnibar-icon" aria-hidden>⌕</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (hasAny || commandMatches.length) setShowDropdown(true)
          }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (commandMode && commandMatches[0] && String(query).trim()) {
                // Prefer first command if query looks like a jump
                const q = String(query).trim().toLowerCase()
                const cmdHit = commandMatches.find((c) => c.label.toLowerCase().startsWith(q) || q.length >= 3)
                if (cmdHit && !hasAny) {
                  e.preventDefault()
                  runCommand(cmdHit)
                  return
                }
              }
              searchInApp()
            }
          }}
          placeholder={placeholder}
          className="omnibar-input"
          autoComplete="off"
          aria-label="Search or jump"
        />
        <button
          type="button"
          className="omnibar-search-btn omnibar-cmd-btn"
          onClick={openCommandPalette}
          title="Command jump (Ctrl/Cmd+K)"
        >
          ⌘K
        </button>
        <button
          type="button"
          className="omnibar-search-btn omnibar-search-btn--primary metallicss"
          onClick={searchInApp}
          disabled={loading || !String(query).trim()}
          title="Search within the app (map & feeds)"
        >
          {loading ? '…' : 'Search'}
        </button>
      </div>
      {showDropdown && (showCommands || hasAny) && (
        <div className="omnibar-results">
          {showCommands && (
            <>
              <div className="omnibar-results-head">Jump to</div>
              {commandMatches.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  className="omnibar-result"
                  onMouseDown={() => runCommand(cmd)}
                >
                  <span className="omnibar-result-type">Go</span>
                  <span className="omnibar-result-title">{cmd.label}</span>
                  <span className="omnibar-result-action">Open</span>
                </button>
              ))}
            </>
          )}
          {hasAny && (
            <>
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
                  <button type="button" className="omnibar-result" onMouseDown={viewAllResults}>
                    View all results
                  </button>
                )}
                {onNavigateToFeeds && (
                  <button type="button" className="omnibar-result" onMouseDown={goToFeeds}>
                    Filter feeds by “{String(query).trim()}”
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export { DEFAULT_COMMANDS }
