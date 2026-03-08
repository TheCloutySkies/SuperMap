const axios = require('axios')

const AIRPORT_CITY_HINTS = {
  lax: 'Los Angeles',
  jfk: 'New York',
  ord: 'Chicago',
  sfo: 'San Francisco',
  sea: 'Seattle',
  den: 'Denver',
}

function parseCoordsFromText(text = '') {
  const m = String(text).match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

function extractHint(input = '') {
  const text = String(input).toLowerCase()
  const airport = text.match(/\b([a-z]{3})\b/)
  if (airport && AIRPORT_CITY_HINTS[airport[1]]) return AIRPORT_CITY_HINTS[airport[1]]
  const cityLike = text.match(/\b([a-z]{3,})(?:[-_\s]+)([a-z]{3,})\b/)
  if (cityLike) return `${cityLike[1]} ${cityLike[2]}`
  return ''
}

async function geocodeText(text) {
  const q = String(text || '').trim()
  if (!q) return null
  try {
    const { data } = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: { name: q, count: 1 },
      timeout: 7000,
    })
    const first = data?.results?.[0]
    if (first?.latitude != null && first?.longitude != null) {
      return { lat: Number(first.latitude), lon: Number(first.longitude), name: [first.name, first.admin1, first.country].filter(Boolean).join(', ') }
    }
  } catch {}
  return null
}

async function geolocateCamera(candidate) {
  const direct = parseCoordsFromText(`${candidate?.url || ''} ${candidate?.name || ''} ${candidate?.context || ''}`)
  if (direct) return direct
  const hint = extractHint(`${candidate?.url || ''} ${candidate?.name || ''} ${candidate?.context || ''}`)
  if (hint) {
    const geo = await geocodeText(hint)
    if (geo) return geo
  }
  const fallback = await geocodeText(candidate?.name || '')
  return fallback || null
}

module.exports = {
  geolocateCamera,
}

