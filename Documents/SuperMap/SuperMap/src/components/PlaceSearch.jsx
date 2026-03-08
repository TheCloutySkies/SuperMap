import { useState } from 'react'
import { geocodePlaceQuery } from '../lib/placeGeocoding'
import './PlaceSearch.css'

export default function PlaceSearch({ onFlyTo }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [places, setPlaces] = useState([])
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')

  const flyToIfValid = (place) => {
    const lat = Number(place?.lat ?? place?.latitude)
    const lon = Number(place?.lon ?? place?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
    onFlyTo?.({
      lat,
      lng: lon,
      zoom: 14,
      properties: { display_name: place.display_name || place.name || `${lat}, ${lon}` },
    })
    return true
  }

  const searchPlaces = () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setPlaces([])
    setStatus('')
    geocodePlaceQuery(q, { count: 8 })
      .then((rows) => {
        const data = Array.isArray(rows) ? rows : []
        setPlaces(data)
        setOpen(data.length > 0)
        setStatus(data.length > 0 ? '' : 'No locations found.')
      })
      .catch(() => setStatus('Lookup failed. Try a broader place name.'))
      .finally(() => setLoading(false))
  }

  const selectPlace = (place) => {
    if (flyToIfValid(place)) {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="place-search-wrap">
      <div className="place-search-bar">
        <span className="place-search-icon" aria-hidden>📍</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') searchPlaces()
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="Search places (address, city, country)"
          className="place-search-input"
          autoComplete="off"
        />
        <button
          type="button"
          className="place-search-btn"
          onClick={searchPlaces}
          disabled={loading}
        >
          {loading ? '…' : 'Find'}
        </button>
      </div>
      {open && places.length > 0 && (
        <div className="place-search-results">
          {places.map((place) => (
            <button
              key={place.place_id || place.id || `${place.lat},${place.lon}`}
              type="button"
              className="place-search-result"
              onMouseDown={() => selectPlace(place)}
            >
              <span className="place-search-result-name">
                {place.display_name || place.name || `${place.lat}, ${place.lon}`}
              </span>
              <span className="place-search-result-type">
                {place.type || place.class || place.osm_type || 'Place'}
              </span>
            </button>
          ))}
        </div>
      )}
      {!!status && <div className="place-search-status">{status}</div>}
    </div>
  )
}
