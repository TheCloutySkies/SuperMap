const axios = require('axios')
const path = require('path')
const fs = require('fs/promises')

const WINDY_API = process.env.WINDY_API

/** Windy Webcams API v2 list by bounding box (path filter). */
const WINDY_WEBCAMS_V2_BASE = 'https://api.windy.com/api/webcams/v2/list'

/** Caltrans CWWP2 public CCTV status (no key). Districts 1–12 with rough AABBs. */
const CALTRANS_DISTRICTS = [
  { id: 1, west: -124.5, south: 38.5, east: -122.5, north: 42.1 },
  { id: 2, west: -123.0, south: 39.5, east: -119.5, north: 42.1 },
  { id: 3, west: -122.5, south: 38.0, east: -119.5, north: 40.0 },
  { id: 4, west: -123.2, south: 36.8, east: -121.2, north: 38.6 },
  { id: 5, west: -122.2, south: 34.4, east: -119.2, north: 37.2 },
  { id: 6, west: -121.0, south: 34.8, east: -117.5, north: 37.5 },
  { id: 7, west: -119.2, south: 33.4, east: -117.5, north: 34.9 },
  { id: 8, west: -118.0, south: 33.4, east: -114.0, north: 35.8 },
  { id: 9, west: -120.2, south: 35.5, east: -117.5, north: 38.2 },
  { id: 10, west: -122.0, south: 36.8, east: -119.5, north: 39.0 },
  { id: 11, west: -117.6, south: 32.4, east: -116.0, north: 33.6 },
  { id: 12, west: -118.2, south: 33.3, east: -117.4, north: 34.0 },
]
const CALTRANS_TTL_MS = 15 * 60 * 1000

/** NYC DOT Traffic Management Center public camera catalog (no key). */
const NYC_TMC_CAMERAS_URL = 'https://webcams.nyctmc.org/api/cameras'
const NYC_TTL_MS = 10 * 60 * 1000

const EMPTY_FC = Object.freeze({ type: 'FeatureCollection', features: [] })

let caltransCache = { at: 0, byDistrict: {} }
let nycCache = { at: 0, features: [] }
let caltransInflight = {}
let nycInflight = null

function windyConfigured() {
  return Boolean(WINDY_API && String(WINDY_API).trim())
}

function inBbox(lon, lat, { north, east, south, west }) {
  return lat <= north && lat >= south && lon <= east && lon >= west
}

/**
 * Normalize any provider cam into a GeoJSON Point feature.
 */
function toFeature({ id, title, lat, lon, city, region, country, image, url, playerEmbed, source }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return {
    type: 'Feature',
    id: String(id),
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      id: String(id),
      title: title || city || 'Webcam',
      city: city || '',
      region: region || '',
      country: country || '',
      image: image || '',
      playerEmbed: playerEmbed || '',
      playerLive: playerEmbed || '',
      url: url || '',
      source: source || 'Webcam',
    },
  }
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

  return toFeature({
    id: c.id,
    title: c.title || loc.city || 'Webcam',
    lat,
    lon,
    city: loc.city || '',
    region: loc.region || '',
    country: loc.country || '',
    image,
    url: detailUrl,
    playerEmbed: playerLive || playerDay || '',
    source: 'Windy',
  })
}

/** Sample points for local UI/screenshots when no live sources (WEBCAMS_DEMO=1). */
function demoWebcamsInBbox({ north, east, south, west }) {
  const samples = [
    { id: 'demo-nyc', title: 'New York · Times Square (demo)', lat: 40.758, lon: -73.9855, city: 'New York', country: 'United States', url: 'https://webcams.nyctmc.org/' },
    { id: 'demo-chi', title: 'Chicago · Lakefront (demo)', lat: 41.8827, lon: -87.6233, city: 'Chicago', country: 'United States', url: 'https://www.windy.com/webcams' },
    { id: 'demo-la', title: 'Los Angeles · Santa Monica (demo)', lat: 34.0195, lon: -118.4912, city: 'Los Angeles', country: 'United States', url: 'https://cwwp2.dot.ca.gov/' },
    { id: 'demo-sf', title: 'San Francisco · Embarcadero (demo)', lat: 37.7955, lon: -122.3937, city: 'San Francisco', country: 'United States', url: 'https://cwwp2.dot.ca.gov/' },
    { id: 'demo-mia', title: 'Miami · South Beach (demo)', lat: 25.7907, lon: -80.13, city: 'Miami', country: 'United States', url: 'https://www.windy.com/webcams' },
    { id: 'demo-den', title: 'Denver · Downtown (demo)', lat: 39.7392, lon: -104.9903, city: 'Denver', country: 'United States', url: 'https://www.windy.com/webcams' },
  ]
  const features = samples
    .filter((c) => inBbox(c.lon, c.lat, { north: Number(north), east: Number(east), south: Number(south), west: Number(west) }))
    .map((c) => toFeature({
      id: c.id,
      title: c.title,
      lat: c.lat,
      lon: c.lon,
      city: c.city,
      country: c.country,
      url: c.url,
      source: 'Demo',
    }))
    .filter(Boolean)
  return { type: 'FeatureCollection', features, total: features.length }
}

async function fetchCaltransDistrict(district) {
  const url = `https://cwwp2.dot.ca.gov/data/d${district}/cctv/cctvStatusD${String(district).padStart(2, '0')}.json`
  const res = await axios.get(url, {
    timeout: 20000,
    headers: { Accept: 'application/json', 'User-Agent': 'SuperMap/1.0 (situational-awareness; traffic-cams)' },
  })
  const rows = res.data?.data || []
  const features = []
  for (const row of rows) {
    const cam = row?.cctv || row
    const loc = cam?.location || {}
    const lat = Number(loc.latitude)
    const lon = Number(loc.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (String(cam.inService || '').toLowerCase() === 'false') continue
    const image = cam?.imageData?.static?.currentImageURL || ''
    const stream = cam?.imageData?.streamingVideoURL || ''
    const name = loc.locationName || loc.nearbyPlace || `Caltrans D${district} cam`
    const id = `caltrans-d${district}-${cam.index || `${lat},${lon}`}`
    features.push(toFeature({
      id,
      title: name,
      lat,
      lon,
      city: loc.nearbyPlace || loc.county || '',
      region: loc.route ? `Route ${loc.route}` : `District ${district}`,
      country: 'United States',
      image,
      url: stream || image || 'https://cwwp2.dot.ca.gov/',
      playerEmbed: stream || '',
      source: 'Caltrans CCTV',
    }))
  }
  return features.filter(Boolean)
}

async function loadCaltransDistrictCached(districtId) {
  const now = Date.now()
  const hit = caltransCache.byDistrict[districtId]
  if (hit && now - hit.at < CALTRANS_TTL_MS) return hit.features
  if (caltransInflight[districtId]) return caltransInflight[districtId]
  caltransInflight[districtId] = fetchCaltransDistrict(districtId)
    .then((features) => {
      caltransCache.byDistrict[districtId] = { at: Date.now(), features }
      caltransCache.at = Date.now()
      return features
    })
    .catch((err) => {
      console.warn('[cameras/caltrans]', districtId, err.message)
      return hit?.features || []
    })
    .finally(() => { delete caltransInflight[districtId] })
  return caltransInflight[districtId]
}

function districtsForBbox(bounds) {
  return CALTRANS_DISTRICTS
    .filter((d) => !(bounds.east < d.west || bounds.west > d.east || bounds.north < d.south || bounds.south > d.north))
    .map((d) => d.id)
}

async function loadCaltransForBbox(bounds) {
  const ids = districtsForBbox(bounds)
  if (!ids.length) return []
  const parts = await Promise.all(ids.map((id) => loadCaltransDistrictCached(id)))
  return parts.flat()
}

async function loadNycCatalog() {
  const now = Date.now()
  if (nycCache.features.length && now - nycCache.at < NYC_TTL_MS) {
    return nycCache.features
  }
  if (nycInflight) return nycInflight
  nycInflight = axios.get(NYC_TMC_CAMERAS_URL, {
    timeout: 15000,
    headers: { Accept: 'application/json', 'User-Agent': 'SuperMap/1.0 (situational-awareness; traffic-cams)' },
  })
    .then((res) => {
      const rows = Array.isArray(res.data) ? res.data : []
      const features = rows
        .map((c) => {
          const lat = Number(c.latitude)
          const lon = Number(c.longitude)
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
          if (String(c.isOnline).toLowerCase() === 'false') return null
          const id = `nyc-tmc-${c.id}`
          const image = c.imageUrl || (c.id ? `${NYC_TMC_CAMERAS_URL}/${c.id}/image` : '')
          return toFeature({
            id,
            title: c.name || 'NYC Traffic Cam',
            lat,
            lon,
            city: c.area || 'New York',
            region: 'NY',
            country: 'United States',
            image,
            url: image || 'https://webcams.nyctmc.org/',
            source: 'NYC DOT TMC',
          })
        })
        .filter(Boolean)
      nycCache = { at: Date.now(), features }
      return features
    })
    .catch((err) => {
      console.warn('[cameras/nyc-tmc]', err.response?.status || '', err.message)
      return nycCache.features || []
    })
    .finally(() => { nycInflight = null })
  return nycInflight
}

async function loadSeedFeatures() {
  try {
    const seedPath = path.join(__dirname, '../camera-discovery/storage/seedCameras.json')
    const raw = await fs.readFile(seedPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((c, i) => toFeature({
        id: c.id || `seed-${i}`,
        title: c.name || 'Seed Camera',
        lat: Number(c.lat),
        lon: Number(c.lon),
        city: '',
        country: '',
        image: c.type === 'jpeg' ? c.stream : (c.image || ''),
        url: c.link || c.stream || '',
        playerEmbed: c.type === 'hls' || c.type === 'rtsp' ? c.stream : '',
        source: 'Seed',
      }))
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Rough AABB overlap: skip loading a catalog when the viewport cannot hit it.
 * Caltrans ≈ CA mainland; NYC TMC ≈ NYC metro.
 */
function bboxMayHitCaltrans({ north, east, south, west }) {
  // California approx
  return !(east < -124.5 || west > -114 || north < 32.4 || south > 42.1)
}

function bboxMayHitNyc({ north, east, south, west }) {
  // NYC metro approx
  return !(east < -74.3 || west > -73.6 || north < 40.45 || south > 41.0)
}

async function fetchWindyWebcams({ north, east, south, west, limit }) {
  if (!windyConfigured()) {
    return { features: [], error: 'not_configured', provider: 'windy-webcams-v2' }
  }
  const pathFilter = `bbox=${north},${east},${south},${west}/limit=${limit}`
  const url = `${WINDY_WEBCAMS_V2_BASE}/${pathFilter}`
  try {
    const res = await axios.get(url, {
      params: {
        key: WINDY_API,
        show: 'webcams:location,image,player,url',
      },
      headers: {
        'X-WINDY-KEY': WINDY_API,
      },
      timeout: 12000,
    })
    const data = res.data
    const cams = data?.result?.webcams || data?.webcams || []
    const features = cams.map(webcamToFeature).filter(Boolean)
    return {
      features,
      total: Number(data?.result?.total) || features.length,
      provider: 'windy-webcams-v2',
    }
  } catch (err) {
    console.warn('[cameras/webcams]', err.response?.status || '', err.message)
    return {
      features: [],
      error: err.response?.status === 401 || err.response?.status === 403
        ? 'unauthorized'
        : 'upstream_error',
      provider: 'windy-webcams-v2',
      status: err.response?.status,
    }
  }
}

function filterAndLimit(features, bbox, limit) {
  const hit = features.filter((f) => {
    const [lon, lat] = f.geometry?.coordinates || []
    return inBbox(lon, lat, bbox)
  })
  // Prefer cams with images, then stable id order
  hit.sort((a, b) => {
    const ai = a.properties?.image ? 0 : 1
    const bi = b.properties?.image ? 0 : 1
    if (ai !== bi) return ai - bi
    return String(a.id).localeCompare(String(b.id))
  })
  return hit.slice(0, limit)
}

/**
 * Fetch live webcams inside a viewport bbox from multiple free/geo sources.
 *
 * Sources (ToS-friendly, no paid keys required):
 * - Caltrans CWWP2 CCTV (public CA DOT traffic cams)
 * - NYC DOT TMC cameras (public NYC traffic cams)
 * - Optional Windy Webcams API v2 when WINDY_API is a webcams-capable key
 * - Seed cameras shipped with the API (sparse global samples)
 *
 * @param {{ north:number, east:number, south:number, west:number, limit?:number }} bbox
 */
async function getWebcamsByBbox(bbox = {}) {
  const { north, east, south, west } = bbox
  const limit = Math.min(Math.max(parseInt(bbox.limit, 10) || 50, 1), 80)

  if (![north, east, south, west].every((n) => Number.isFinite(Number(n)))) {
    return { ...EMPTY_FC, features: [], configured: true, error: 'invalid_bbox' }
  }

  const n = Number(north)
  const e = Number(east)
  const s = Number(south)
  const w = Number(west)
  const bounds = { north: n, east: e, south: s, west: w }

  const sourcesTried = []
  const sourceErrors = {}
  const merged = []
  const seen = new Set()

  const pushAll = (feats, label) => {
    sourcesTried.push(label)
    let added = 0
    for (const f of feats) {
      const key = f.id || `${f.geometry?.coordinates?.[0]},${f.geometry?.coordinates?.[1]}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(f)
      added += 1
    }
    return added
  }

  // Free public catalogs first (always available without WINDY_API).
  const catalogJobs = []
  if (bboxMayHitCaltrans(bounds)) {
    catalogJobs.push(
      loadCaltransForBbox(bounds)
        .then((all) => pushAll(filterAndLimit(all, bounds, limit), 'caltrans-cctv'))
        .catch((err) => {
          sourceErrors.caltrans = err.message
          sourcesTried.push('caltrans-cctv')
        }),
    )
  }
  if (bboxMayHitNyc(bounds)) {
    catalogJobs.push(
      loadNycCatalog()
        .then((all) => pushAll(filterAndLimit(all, bounds, limit), 'nyc-dot-tmc'))
        .catch((err) => {
          sourceErrors.nyc = err.message
          sourcesTried.push('nyc-dot-tmc')
        }),
    )
  }
  catalogJobs.push(
    loadSeedFeatures()
      .then((all) => pushAll(filterAndLimit(all, bounds, limit), 'seed'))
      .catch(() => { sourcesTried.push('seed') }),
  )

  // Optional Windy (key-gated; Map Forecast keys often 401 webcams).
  const windyJob = fetchWindyWebcams({ north: n, east: e, south: s, west: w, limit })
    .then((result) => {
      if (result.error === 'not_configured') {
        sourcesTried.push('windy-skipped')
        return
      }
      if (result.error) sourceErrors.windy = result.error
      pushAll(result.features || [], result.provider || 'windy-webcams-v2')
    })

  await Promise.all([...catalogJobs, windyJob])

  let features = filterAndLimit(merged, bounds, limit)

  // Demo points only when explicitly opted in and still empty (local screenshots).
  if (!features.length && String(process.env.WEBCAMS_DEMO || '').trim() === '1') {
    const demo = demoWebcamsInBbox(bounds)
    features = demo.features
    sourcesTried.push('demo')
  }

  const freeSourcesReady = true
  return {
    type: 'FeatureCollection',
    features,
    configured: freeSourcesReady || windyConfigured(),
    windyConfigured: windyConfigured(),
    total: features.length,
    providers: sourcesTried,
    sourceErrors: Object.keys(sourceErrors).length ? sourceErrors : undefined,
    provider: features[0]?.properties?.source || 'multi',
  }
}

/**
 * Legacy nearby fetch (lat/lon/radius km). Kept for compatibility.
 */
async function getCameras(query = {}) {
  if (!windyConfigured()) {
    // Fall back to free catalogs around a point.
    const lat = Number(query.lat)
    const lon = Number(query.lon)
    const radiusKm = Number(query.radius) || 50
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { type: 'FeatureCollection', features: [] }
    }
    const deg = radiusKm / 111
    return getWebcamsByBbox({
      north: lat + deg,
      south: lat - deg,
      east: lon + deg,
      west: lon - deg,
      limit: 50,
    })
  }
  const { lat, lon, radius = 50 } = query
  try {
    let pathFilter = `limit=50`
    if (lat != null && lon != null) {
      pathFilter = `nearby=${lat},${lon},${radius}/limit=50`
    }
    const url = `${WINDY_WEBCAMS_V2_BASE}/${pathFilter}`
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
  NYC_TMC_CAMERAS_URL,
}
