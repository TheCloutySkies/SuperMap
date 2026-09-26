const axios = require('axios')

const WINDY_API = process.env.WINDY_API

/** Windy Webcams API v2 list by bounding box (path filter). */
const WINDY_WEBCAMS_V2_BASE = 'https://api.windy.com/api/webcams/v2/list'

const EMPTY_FC = Object.freeze({ type: 'FeatureCollection', features: [] })

function windyConfigured() {
  return Boolean(WINDY_API && String(WINDY_API).trim())
}

/** Sample points for local UI/screenshots when WINDY_API is unset (WEBCAMS_DEMO=1). */
function demoWebcamsInBbox({ north, east, south, west }) {
  const samples = [
    { id: 'demo-nyc', title: 'New York · Times Square (demo)', lat: 40.758, lon: -73.9855, city: 'New York', country: 'United States', url: 'https://www.windy.com/webcams' },
    { id: 'demo-chi', title: 'Chicago · Lakefront (demo)', lat: 41.8827, lon: -87.6233, city: 'Chicago', country: 'United States', url: 'https://www.windy.com/webcams' },
    { id: 'demo-la', title: 'Los Angeles · Santa Monica (demo)', lat: 34.0195, lon: -118.4912, city: 'Los Angeles', country: 'United States', url: 'https://www.windy.com/webcams' },
    { id: 'demo-sf', title: 'San Francisco · Embarcadero (demo)', lat: 37.7955, lon: -122.3937, city: 'San Francisco', country: 'United States', url: 'https://www.windy.com/webcams' },
    { id: 'demo-mia', title: 'Miami · South Beach (demo)', lat: 25.7907, lon: -80.13, city: 'Miami', country: 'United States', url: 'https://www.windy.com/webcams' },
    { id: 'demo-den', title: 'Denver · Downtown (demo)', lat: 39.7392, lon: -104.9903, city: 'Denver', country: 'United States', url: 'https://www.windy.com/webcams' },
  ]
  const n = Number(north)
  const e = Number(east)
  const s = Number(south)
  const w = Number(west)
  const features = samples
    .filter((c) => c.lat <= n && c.lat >= s && c.lon <= e && c.lon >= w)
    .map((c) => webcamToFeature({
      id: c.id,
      title: c.title,
      location: { latitude: c.lat, longitude: c.lon, city: c.city, country: c.country },
      url: { current: { desktop: c.url } },
    }))
    .filter(Boolean)
  return { type: 'FeatureCollection', features, total: features.length }
}

/**
 * Normalize a Windy webcam object (v2 or loose v3-shaped) to a GeoJSON Point feature.
 */
function webcamToFeature(c) {
  if (!c) return null
  const loc = c.location || {}
  const lat = Number(loc.latitude ?? loc.lat ?? c.latitude)
  const lon = Number(loc.longitude ?? loc.lon ?? c.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const image =
    c.image?.current?.preview ||
    c.image?.current?.thumbnail ||
    c.images?.current?.preview ||
    c.images?.current?.thumbnail ||
    ''
  const playerLive =
    c.player?.live?.embed ||
    (c.player?.live?.available ? c.player?.live?.link : '') ||
    ''
  const playerDay = c.player?.day?.embed || c.player?.day?.link || ''
  const detailUrl =
    c.url?.current?.desktop ||
    c.url?.current?.mobile ||
    c.urls?.detail ||
    c.player?.day?.link ||
    (c.id ? `https://www.windy.com/webcams/${c.id}` : '')

  return {
    type: 'Feature',
    id: String(c.id),
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      id: String(c.id),
      title: c.title || loc.city || 'Webcam',
      city: loc.city || '',
      region: loc.region || '',
      country: loc.country || '',
      image: image || '',
      playerEmbed: playerLive || playerDay || '',
      playerLive: playerLive || '',
      url: detailUrl || '',
      source: 'Windy',
    },
  }
}

/**
 * Fetch Windy webcams inside a viewport bbox.
 * Windy v2 bbox path: /bbox={north},{east},{south},{west}
 * Docs: https://api.windy.com/webcams/docs (v2 list filters)
 *
 * @param {{ north:number, east:number, south:number, west:number, limit?:number }} bbox
 * @returns {Promise<{ type:'FeatureCollection', features:object[], configured:boolean, total?:number }>}
 */
async function getWebcamsByBbox(bbox = {}) {
  const { north, east, south, west } = bbox
  const limit = Math.min(Math.max(parseInt(bbox.limit, 10) || 50, 1), 50)

  if (!windyConfigured()) {
    // Local / screenshot demo points when WINDY_API is unset (opt-in via WEBCAMS_DEMO=1).
    if (String(process.env.WEBCAMS_DEMO || '').trim() === '1') {
      const demo = demoWebcamsInBbox({ north, east, south, west })
      return { ...demo, configured: false, provider: 'demo', endpoint: 'demo' }
    }
    return { ...EMPTY_FC, features: [], configured: false }
  }
  if (![north, east, south, west].every((n) => Number.isFinite(Number(n)))) {
    return { ...EMPTY_FC, features: [], configured: true, error: 'invalid_bbox' }
  }

  const n = Number(north)
  const e = Number(east)
  const s = Number(south)
  const w = Number(west)

  // Path filters (v2): bbox + limit. show= selects webcam parts.
  const path = `bbox=${n},${e},${s},${w}/limit=${limit}`
  const url = `${WINDY_WEBCAMS_V2_BASE}/${path}`

  try {
    const res = await axios.get(url, {
      params: {
        key: WINDY_API,
        show: 'webcams:location,image,player,url',
      },
      headers: {
        // Accept either header style used by Windy over time
        'X-WINDY-KEY': WINDY_API,
      },
      timeout: 12000,
    })
    const data = res.data
    const cams = data?.result?.webcams || data?.webcams || []
    const features = cams.map(webcamToFeature).filter(Boolean)
    return {
      type: 'FeatureCollection',
      features,
      configured: true,
      total: Number(data?.result?.total) || features.length,
      provider: 'windy-webcams-v2',
      endpoint: 'list/bbox',
    }
  } catch (err) {
    console.warn('[cameras/webcams]', err.response?.status || '', err.message)
    return {
      ...EMPTY_FC,
      features: [],
      configured: true,
      error: err.response?.status === 401 || err.response?.status === 403
        ? 'unauthorized'
        : 'upstream_error',
    }
  }
}

/**
 * Legacy nearby fetch (lat/lon/radius km). Kept for compatibility.
 */
async function getCameras(query = {}) {
  if (!windyConfigured()) {
    return { type: 'FeatureCollection', features: [] }
  }
  const { lat, lon, radius = 50 } = query
  try {
    let path = `limit=50`
    if (lat != null && lon != null) {
      path = `nearby=${lat},${lon},${radius}/limit=50`
    }
    const url = `${WINDY_WEBCAMS_V2_BASE}/${path}`
    const res = await axios.get(url, {
      params: {
        key: WINDY_API,
        show: 'webcams:location,image,player,url',
      },
      headers: { 'X-WINDY-KEY': WINDY_API },
      timeout: 10000,
    })
    const cams = res.data?.result?.webcams || []
    const features = cams.map(webcamToFeature).filter(Boolean)
    return { type: 'FeatureCollection', features }
  } catch (err) {
    console.warn('[cameras]', err.message)
    return { type: 'FeatureCollection', features: [] }
  }
}

module.exports = {
  getCameras,
  getWebcamsByBbox,
  windyConfigured,
  WINDY_WEBCAMS_V2_BASE,
}
