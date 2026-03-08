import axios from 'axios'

const DEFAULT_API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

function normalizeOpenMeteo(result) {
  const lat = Number(result?.latitude)
  const lon = Number(result?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const parts = [result?.name, result?.admin1, result?.country].filter(Boolean)
  return {
    id: result?.id || `om-${lat}-${lon}`,
    name: result?.name || parts[0] || 'Place',
    display_name: parts.join(', '),
    type: result?.feature_code || 'Place',
    lat,
    lon,
    source: 'open-meteo',
    raw: result,
  }
}

function normalizeGenericPlace(place, i = 0) {
  if (!place) return null
  const lat = Number(place.lat ?? place.latitude)
  const lon = Number(place.lon ?? place.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return {
    id: place.place_id || place.osm_id || place.id || `pl-${i}-${lat}-${lon}`,
    name: place.name || place.display_name || 'Place',
    display_name: place.display_name || place.name || `${lat}, ${lon}`,
    type: place.type || place.class || place.osm_type || 'Place',
    lat,
    lon,
    source: 'fallback',
    raw: place,
  }
}

export async function geocodePlaceQuery(query, options = {}) {
  const q = String(query || '').trim()
  if (!q) return []

  const count = Number(options.count) > 0 ? Number(options.count) : 8
  const apiBase = options.apiBase ?? DEFAULT_API_BASE

  try {
    const res = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: { name: q, count },
      timeout: 8000,
    })
    const normalized = (res.data?.results || []).map(normalizeOpenMeteo).filter(Boolean)
    if (normalized.length) return normalized
  } catch {
    // Fall through to backend/Nominatim fallback.
  }

  if (apiBase) {
    try {
      const res = await axios.get(`${apiBase}/api/geocode`, {
        params: { q, limit: count },
        timeout: 10000,
      })
      const rows = Array.isArray(res.data) ? res.data : []
      const normalized = rows.map((p, i) => normalizeGenericPlace(p, i)).filter(Boolean)
      if (normalized.length) return normalized
    } catch {
      // continue with direct providers
    }
  }

  const url = 'https://nominatim.openstreetmap.org/search'
  const opts = { params: { q, format: 'json', limit: count }, headers: { 'User-Agent': 'SuperMap/1.0' }, timeout: 8000 }

  try {
    const res = await axios.get(url, opts)
    const rows = Array.isArray(res.data) ? res.data : (res.data?.features || [])
    return rows.map((p, i) => normalizeGenericPlace(p, i)).filter(Boolean)
  } catch {
    return []
  }
}

