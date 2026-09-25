import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import axios from 'axios'
import { DEFAULT_COMMANDS, searchOmnibarIndex } from '../lib/omnibarIndex'
import './Omnibar.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env?.DEV ? 'http://localhost:3001' : 'http://localhost:3001')

const MAX_JUMP = 10

function resultKind(item) {
  if (item._kind === 'place') return 'Place'
  if (item._kind === 'map') return item.properties?.type || 'Result'
  return item.category || 'Go'
}

function resultTitle(item) {
  if (item._kind === 'place' || item._kind === 'map') {
    return item.properties?.title || 'Untitled'
  }
  return item.label
}

function resultAction(item) {
  if (item._kind === 'place') return 'Fly to'
  if (item._kind === 'map') return 'Show on map'
  return 'Jump'
}

/** Omnibar: place/event search + whole-app command jump (Ctrl/Cmd+K). */
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
  commands,
  placeholder = 'Search or jump (Ctrl+K)…',
}) {
  const [internalQuery, setInternalQuery] = useState('')
  const [places, setPlaces] = useState([])
  const [mapResults, setMapResults] = useState([])
  const [mapGeoJson, setMapGeoJson] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [commandMode, setCommandMode] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const debounceRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const isControlled = controlledQuery !== undefined
  const query = (isControlled ? controlledQuery : internalQuery) || ''

  const setQueryValue = (value) => {
    if (isControlled) onQueryChange?.(value)
    else setInternalQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onKeywordChange?.(String(value || '').trim()), 200)
  }

  const jumpMatches = useMemo(() => {
    const q = String(query).trim()
    if (!q && !commandMode) return []
    // Prefer full registry; optional `commands` override for tests/custom indexes
    if (commands?.length) {
      const qLower = q.toLowerCase()
      const list = !q
        ? commands.slice(0, MAX_JUMP)
        : commands
          .filter((c) => `${c.label} ${c.keywords || ''} ${c.category || ''}`.toLowerCase().includes(qLower))
          .slice(0, MAX_JUMP)
      return list.map((c) => ({ ...c, category: c.category || 'Go' }))
    }
    return searchOmnibarIndex(q, { limit: MAX_JUMP })
  }, [query, commands, commandMode])

  const flatResults = useMemo(() => {
    const rows = []
    if (commandMode && jumpMatches.length) {
      for (const cmd of jumpMatches) rows.push({ ...cmd, _kind: 'jump' })
    }
    if (places.length) {
      for (const f of places.slice(0, 5)) rows.push({ ...f, _kind: 'place' })
    }
    if (mapResults.length) {
      for (const f of mapResults.slice(0, 8)) rows.push({ ...f, _kind: 'map' })
    }
    return rows
  }, [commandMode, jumpMatches, places, mapResults])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, commandMode, places, mapResults])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-omnibar-idx="${activeIndex}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex])

  const openCommandPalette = useCallback(() => {
    setCommandMode(true)
    setShowDropdown(true)
    setActiveIndex(0)
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
    if (cmd.action === 'navigate' && (cmd.viewId || cmd._kind === 'jump')) {
      onCommandNavigate?.(cmd)
    }
    setShowDropdown(false)
    setCommandMode(false)
  }

  const searchInApp = () => {
    const q = String(query).trim()
    if (!q) return
    const exact = jumpMatches.find((c) => c.label.toLowerCase() === q.toLowerCase())
    if (exact && onCommandNavigate) {
      runCommand(exact)
      return
    }
    // Strong jump hit: prefer navigate over geocode when score is high
    const top = jumpMatches[0]
    if (top && top.score >= 100 && onCommandNavigate && !places.length && !mapResults.length) {
      runCommand(top)
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

  const activateRow = (item) => {
    if (!item) return
    if (item._kind === 'jump') runCommand(item)
    else if (item._kind === 'place') handleSelectPlace(item)
    else if (item._kind === 'map') handleSelectMapResult(item)
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
  const showCommands = commandMode && jumpMatches.length > 0
  const showDropdownPanel = showDropdown && (showCommands || hasAny)

  const onInputKeyDown = (e) => {
    if (!showDropdownPanel && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      if (jumpMatches.length || hasAny) {
        setShowDropdown(true)
        setCommandMode(true)
      }
    }
    if (e.key === 'ArrowDown') {
      if (!flatResults.length) return
      e.preventDefault()
      setShowDropdown(true)
      setActiveIndex((i) => (i + 1) % flatResults.length)
      return
    }
    if (e.key === 'ArrowUp') {
      if (!flatResults.length) return
      e.preventDefault()
      setShowDropdown(true)
      setActiveIndex((i) => (i - 1 + flatResults.length) % flatResults.length)
      return
    }
    if (e.key === 'Enter') {
      if (showDropdownPanel && flatResults[activeIndex]) {
        e.preventDefault()
        activateRow(flatResults[activeIndex])
        return
      }
      if (commandMode && jumpMatches[0] && String(query).trim() && !hasAny) {
        e.preventDefault()
        runCommand(jumpMatches[0])
        return
      }
      searchInApp()
    }
  }

  let jumpOffset = 0
  const placeOffset = showCommands ? jumpMatches.length : 0
  const mapOffset = placeOffset + (places.length ? Math.min(places.length, 5) : 0)

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
            if (hasAny || jumpMatches.length || commandMode) setShowDropdown(true)
          }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          onKeyDown={onInputKeyDown}
          placeholder={placeholder}
          className="omnibar-input"
          autoComplete="off"
          aria-label="Search or jump"
          aria-autocomplete="list"
          aria-controls="omnibar-results-list"
          aria-expanded={showDropdownPanel}
          role="combobox"
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
      {showDropdownPanel && (
        <div
          className="omnibar-results"
          id="omnibar-results-list"
          role="listbox"
          ref={listRef}
        >
          {showCommands && (
            <>
              <div className="omnibar-results-head">Jump to</div>
              {jumpMatches.map((cmd, i) => {
                const idx = jumpOffset + i
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === idx}
                    data-omnibar-idx={idx}
                    className={`omnibar-result${activeIndex === idx ? ' is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(ev) => {
                      ev.preventDefault()
                      runCommand(cmd)
                    }}
                  >
                    <span className="omnibar-result-type">{cmd.category || 'Go'}</span>
                    <span className="omnibar-result-title">{cmd.label}</span>
                    <span className="omnibar-result-action">Jump</span>
                  </button>
                )
              })}
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
                  {places.slice(0, 5).map((feature, i) => {
                    const idx = placeOffset + i
                    return (
                      <button
                        key={feature.id || i}
                        type="button"
                        role="option"
                        aria-selected={activeIndex === idx}
                        data-omnibar-idx={idx}
                        className={`omnibar-result${activeIndex === idx ? ' is-active' : ''}`}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(ev) => {
                          ev.preventDefault()
                          handleSelectPlace(feature)
                        }}
                      >
                        <span className="omnibar-result-type">Place</span>
                        <span className="omnibar-result-title">{resultTitle({ ...feature, _kind: 'place' })}</span>
                        <span className="omnibar-result-action">{resultAction({ _kind: 'place' })}</span>
                      </button>
                    )
                  })}
                </>
              )}
              {mapResults.length > 0 && (
                <>
                  <div className="omnibar-results-head">Map results</div>
                  {mapResults.slice(0, 8).map((feature, i) => {
                    const idx = mapOffset + i
                    return (
                      <button
                        key={feature.id || i}
                        type="button"
                        role="option"
                        aria-selected={activeIndex === idx}
                        data-omnibar-idx={idx}
                        className={`omnibar-result${activeIndex === idx ? ' is-active' : ''}`}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(ev) => {
                          ev.preventDefault()
                          handleSelectMapResult(feature)
                        }}
                      >
                        <span className="omnibar-result-type">{resultKind({ ...feature, _kind: 'map' })}</span>
                        <span className="omnibar-result-title">{resultTitle({ ...feature, _kind: 'map' })}</span>
                        <span className="omnibar-result-action">{resultAction({ _kind: 'map' })}</span>
                      </button>
                    )
                  })}
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
          {showCommands && !hasAny && (
            <div className="omnibar-results-hint" aria-hidden>
              ↑↓ navigate · Enter jump · Esc close
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export { DEFAULT_COMMANDS }
