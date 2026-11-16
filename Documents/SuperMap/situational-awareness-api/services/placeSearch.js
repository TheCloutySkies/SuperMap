/**
 * The same place lookup the map search bar uses.
 * Open-Meteo first, then Mapbox, Geoapify, and Nominatim.
 */

const axios = require('axios')
const NodeCache = require('node-cache')

const cache = new NodeCache({ stdTTL: 24 * 60 * 60, checkperiod: 120 })
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || ''
const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY || ''

function normalizeOpenMeteo(row) {
  const lat = Number(row?.latitude)
  const lon = Number(row?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return {
    id: row.id || `om-${lat}-${lon}`,
    place_id: row.id || `om-${lat}-${lon}`,
    name: row.name || 'Place',
    display_name: [row.name, row.admin1, row.country].filter(Boolean).join(', ') || row.name || `${lat}, ${lon}`,
    type: row.feature_code || 'place',
    lat,
    lon,
    source: 'open-meteo',
  }
}

function normalizePlace(raw) {
  const lat = Number(raw?.lat ?? raw?.latitude)
  const lon = Number(raw?.lon ?? raw?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return {
    id: raw.id || raw.place_id || `${lat},${lon}`,
    place_id: raw.place_id || raw.id || `${lat},${lon}`,
    name: raw.name || raw.text || 'Place',
    display_name: raw.display_name || raw.place_name || raw.formatted || raw.name || `${lat}, ${lon}`,
    type: raw.type || raw.class || raw.osm_type || 'place',
    lat,
    lon,
    source: raw.source || 'geocoder',
  }
}

async function searchPlaces(query, limit = 5) {
  const q = String(query || '').trim()
  const count = Math.min(Math.max(Number(limit) || 5, 1), 10)
  if (!q) return []
  const cacheKey = `${q.toLowerCase()}::${count}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  try {
    const { data } = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: { name: q, count },
      timeout: 7000,
    })
    const rows = (data?.results || []).map(normalizeOpenMeteo).filter(Boolean)
    if (rows.length) {
      cache.set(cacheKey, rows)
      return rows
    }
  } catch (error) {
    console.warn('[place-search] open-meteo:', error.message)
  }

  if (MAPBOX_TOKEN) {
    try {
      const { data } = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`, {
        params: { access_token: MAPBOX_TOKEN, limit: count },
        timeout: 7000,
      })
      const rows = (Array.isArray(data?.features) ? data.features : [])
        .map((feature) => normalizePlace({
          id: feature.id,
          place_id: feature.id,
          name: feature.text,
          display_name: feature.place_name,
          type: Array.isArray(feature.place_type) ? feature.place_type[0] : 'place',
          lat: Array.isArray(feature.center) ? feature.center[1] : null,
          lon: Array.isArray(feature.center) ? feature.center[0] : null,
          source: 'mapbox',
        }))
        .filter(Boolean)
      if (rows.length) {
        cache.set(cacheKey, rows)
        return rows
      }
    } catch (error) {
      console.warn('[place-search] mapbox:', error.message)
    }
  }

  if (GEOAPIFY_KEY) {
    try {
      const { data } = await axios.get('https://api.geoapify.com/v1/geocode/search', {
        params: { text: q, apiKey: GEOAPIFY_KEY, limit: count },
        timeout: 7000,
      })
      const rows = (Array.isArray(data?.features) ? data.features : [])
        .map((feature) => normalizePlace({
          id: feature.properties?.place_id || feature.properties?.name,
          place_id: feature.properties?.place_id || feature.properties?.name,
          name: feature.properties?.name || feature.properties?.city || 'Place',
          display_name: feature.properties?.formatted || feature.properties?.name,
          type: feature.properties?.result_type || 'place',
          lat: Array.isArray(feature.geometry?.coordinates) ? feature.geometry.coordinates[1] : null,
          lon: Array.isArray(feature.geometry?.coordinates) ? feature.geometry.coordinates[0] : null,
          source: 'geoapify',
        }))
        .filter(Boolean)
      if (rows.length) {
        cache.set(cacheKey, rows)
        return rows
      }
    } catch (error) {
      console.warn('[place-search] geoapify:', error.message)
    }
  }

  try {
    const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q, format: 'json', limit: count },
      headers: { 'User-Agent': 'SuperMap/1.0 (https://github.com/supermap)' },
      timeout: 8000,
    })
    const rows = (Array.isArray(data) ? data : []).map((row) => normalizePlace({ ...row, source: 'nominatim' })).filter(Boolean)
    cache.set(cacheKey, rows)
    return rows
  } catch (error) {
    console.warn('[place-search] nominatim:', error.message)
    return []
  }
}

module.exports = { searchPlaces }
