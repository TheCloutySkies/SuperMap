import { useState } from 'react'
import axios from 'axios'
import './Omnibar.css'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

export default function LocationSearchBar({ onFlyTo, placeholder = 'Search city or place…' }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [focused, setFocused] = useState(false)

  const search = () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setResults([])
    axios
      .get(NOMINATIM, {
        params: { q, format: 'json', limit: 8 },
        headers: { Accept: 'application/json' },
        timeout: 8000,
      })
      .then((res) => {
        setResults(res.data || [])
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }

  const handleSelect = (item) => {
    const lat = parseFloat(item.lat)
    const lon = parseFloat(item.lon)
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      onFlyTo?.({ lng: lon, lat, zoom: 12, properties: { display_name: item.display_name } })
    }
    setQuery('')
    setResults([])
    setFocused(false)
  }

  return (
    <div className="omnibar-wrap">
      <div className="omnibar">
        <span className="omnibar-icon" aria-hidden>⌕</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder={placeholder}
          className="omnibar-input"
          autoComplete="off"
        />
        <button type="button" className="omnibar-search-btn" onClick={search} disabled={loading}>
          {loading ? '…' : 'Go'}
        </button>
      </div>
      {focused && results.length > 0 && (
        <div className="omnibar-results">
          {results.map((item, i) => (
            <button
              key={item.place_id || i}
              type="button"
              className="omnibar-result"
              onMouseDown={() => handleSelect(item)}
            >
              <span className="omnibar-result-type">Place</span>
              <span className="omnibar-result-title">{item.display_name}</span>
              <span className="omnibar-result-action">Fly to</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
