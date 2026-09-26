import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import axios from 'axios'
import {
  DEFAULT_COMMANDS,
  searchOmnibarIndex,
  mergeOmnibarResults,
  omnibarDisplayCategory,
} from '../lib/omnibarIndex'
import './Omnibar.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env?.DEV ? 'http://localhost:3001' : 'http://localhost:3001')

const MAX_JUMP = 8
const MAX_MERGED = 14
const CONTENT_DEBOUNCE_MS = 220

function resultKind(item) {
  if (item._kind === 'place') return 'Place'
  if (item._kind === 'map') return item.properties?.type || 'Result'
  if (item._kind === 'content' || item.category === 'News' || item.category === 'OSINT') {
    return omnibarDisplayCategory(item)
  }
  if (item.crimeAbbr || item.crimeCitySlug || item.nationalMetric) return 'Crime'
  return omnibarDisplayCategory(item)
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
  if (item.action === 'open' || item.url) return 'Open'
  if (item.category === 'News' || item.category === 'OSINT') return 'Open'
  return 'Jump'
}

function resultSubtitle(item) {
  if (item.subtitle) return item.subtitle
  return null
}

/** Omnibar: place/event search + whole-app command jump + content (news/OSINT/crime). */
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
  const [contentHits, setContentHits] = useState([])
  const [contentLoading, setContentLoading] = useState(false)
  const debounceRef = useRef(null)
  const contentDebounceRef = useRef(null)
  const contentAbortRef = useRef(null)
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
    if (commands?.length) {
      const qLower = q.toLowerCase()
      const list = !q
        ? commands.slice(0, MAX_JUMP)
        : commands
          .filter((c) => `${c.label} ${c.keywords || ''} ${c.category || ''}`.toLowerCase().includes(qLower))
          .slice(0, MAX_JUMP)
      return list.map((c) => ({ ...c, category: c.category || 'Go', score: 50 }))
    }
    return searchOmnibarIndex(q, { limit: MAX_JUMP })
  }, [query, commands, commandMode])

  // Debounced content search against /api/search/omnibar (cached news/osint/crime)
  useEffect(() => {
    const q = String(query).trim()
    if (contentDebounceRef.current) clearTimeout(contentDebounceRef.current)
    if (contentAbortRef.current) {
      contentAbortRef.current.abort()
      contentAbortRef.current = null
    }

    if (!q || !commandMode || !API_BASE) {
      setContentHits([])
      setContentLoading(false)
      return undefined
    }

    contentDebounceRef.current = setTimeout(() => {
      const controller = new AbortController()
      contentAbortRef.current = controller
      setContentLoading(true)
      axios
        .get(`${API_BASE}/api/search/omnibar`, {
          params: { q, limit: 12 },
          timeout: 6000,
          signal: controller.signal,
        })
        .then((res) => {
          const rows = Array.isArray(res.data?.results) ? res.data.results : []
          setContentHits(rows)
        })
        .catch((err) => {
          if (axios.isCancel?.(err) || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return
          setContentHits([])
        })
        .finally(() => {
          if (contentAbortRef.current === controller) {
            setContentLoading(false)
            contentAbortRef.current = null
          }
        })
    }, CONTENT_DEBOUNCE_MS)

    return () => {
      if (contentDebounceRef.current) clearTimeout(contentDebounceRef.current)
    }
  }, [query, commandMode])

  const mergedMatches = useMemo(() => {
    const q = String(query).trim()
    if (!q && !commandMode) return []
    if (!q) {
      // Empty command palette: jumps only (rich categories → Jump chip)
      return jumpMatches.map((j) => ({ ...j, category: 'Jump', _kind: 'jump' }))
    }
    return mergeOmnibarResults(jumpMatches, contentHits, { limit: MAX_MERGED })
  }, [query, commandMode, jumpMatches, contentHits])

  const flatResults = useMemo(() => {
    const rows = []
    if (commandMode && mergedMatches.length) {
      for (const cmd of mergedMatches) {
        rows.push({
          ...cmd,
          _kind: cmd._kind || (cmd.category === 'News' || cmd.category === 'OSINT' || cmd.crimeAbbr || cmd.crimeCitySlug || cmd.nationalMetric ? 'content' : 'jump'),
        })
      }
    }
    if (places.length) {
      for (const f of places.slice(0, 5)) rows.push({ ...f, _kind: 'place' })
    }
    if (mapResults.length) {
      for (const f of mapResults.slice(0, 8)) rows.push({ ...f, _kind: 'map' })
    }
    return rows
  }, [commandMode, mergedMatches, places, mapResults])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, commandMode, places, mapResults, contentHits])

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
    if (cmd.action === 'open' && cmd.url) {
      try {
        window.open(cmd.url, '_blank', 'noopener,noreferrer')
      } catch { /* ignore */ }
      // Also navigate to the feed with focus when possible
      if (cmd.viewId || cmd.focusQuery) {
        onCommandNavigate?.(cmd)
      }
    } else if (cmd.action === 'navigate' || cmd.viewId || cmd._kind === 'jump' || cmd._kind === 'content') {
      onCommandNavigate?.(cmd)
    }
    setShowDropdown(false)
    setCommandMode(false)
  }

  const searchInApp = () => {
    const q = String(query).trim()
    if (!q) return
    const exact = mergedMatches.find((c) => c.label.toLowerCase() === q.toLowerCase())
    if (exact && onCommandNavigate) {
      runCommand(exact)
      return
    }
    const top = mergedMatches[0]
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
    if (item._kind === 'jump' || item._kind === 'content') runCommand(item)
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
  const showCommands = commandMode && mergedMatches.length > 0
  const showDropdownPanel = showDropdown && (showCommands || hasAny || (commandMode && contentLoading && String(query).trim()))

  const onInputKeyDown = (e) => {
    if (!showDropdownPanel && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      if (mergedMatches.length || hasAny) {
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
      if (commandMode && mergedMatches[0] && String(query).trim() && !hasAny) {
        e.preventDefault()
        runCommand(mergedMatches[0])
        return
      }
      searchInApp()
    }
  }

  let jumpOffset = 0
  const placeOffset = showCommands ? mergedMatches.length : 0
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
            if (hasAny || mergedMatches.length || commandMode) setShowDropdown(true)
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
              <div className="omnibar-results-head">
                {String(query).trim() ? 'Results' : 'Jump to'}
                {contentLoading ? <span className="omnibar-results-head-hint"> · searching…</span> : null}
              </div>
              {mergedMatches.map((cmd, i) => {
                const idx = jumpOffset + i
                const sub = resultSubtitle(cmd)
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
                    <span className="omnibar-result-type">{resultKind(cmd)}</span>
                    <span className="omnibar-result-main">
                      <span className="omnibar-result-title">{cmd.label}</span>
                      {sub ? <span className="omnibar-result-sub">{sub}</span> : null}
                    </span>
                    <span className="omnibar-result-action">{resultAction(cmd)}</span>
                  </button>
                )
              })}
            </>
          )}
          {!showCommands && commandMode && contentLoading && String(query).trim() && (
            <div className="omnibar-results-hint">Searching news, OSINT, crime…</div>
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
              ↑↓ navigate · Enter select · Esc close · News / OSINT / Crime / Jump
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export { DEFAULT_COMMANDS }
