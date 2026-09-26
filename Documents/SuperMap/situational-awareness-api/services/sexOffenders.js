/**
 * CommunityGuardAPI client + on-disk sex-offender pack.
 * Runtime reads ONLY from disk. External API calls happen in the seed script
 * (or admin refresh) to stay within the 100 calls/month free tier.
 */
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data', 'sex-offenders')
const PACK_FILE = path.join(DATA_DIR, 'offenders-pack.json')
const DETAILS_DIR = path.join(DATA_DIR, 'details')
const BASE_URL = 'https://communityguardapi.com/api/data'

function apiKey() {
  return String(process.env.COMMUNITYGUARD_API_KEY || '').trim()
}

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DETAILS_DIR)) fs.mkdirSync(DETAILS_DIR, { recursive: true })
}

function emptyPack() {
  return {
    version: 1,
    source: 'CommunityGuardAPI',
    seededAt: null,
    radiusMiles: null,
    metros: [],
    apiUsage: null,
    offenders: [],
  }
}

function readPack() {
  ensureDirs()
  if (!fs.existsSync(PACK_FILE)) return emptyPack()
  try {
    return JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'))
  } catch {
    return emptyPack()
  }
}

function writePack(pack) {
  ensureDirs()
  fs.writeFileSync(PACK_FILE, JSON.stringify(pack, null, 0), 'utf8')
}

function detailPath(id) {
  return path.join(DETAILS_DIR, `${Number(id)}.json`)
}

function readDetail(id) {
  const full = detailPath(id)
  if (!fs.existsSync(full)) return null
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch {
    return null
  }
}

function writeDetail(id, record) {
  ensureDirs()
  fs.writeFileSync(detailPath(id), JSON.stringify(record, null, 0), 'utf8')
}

async function communityGuardFetch(pathname, query = {}) {
  const key = apiKey()
  if (!key) {
    const err = new Error('COMMUNITYGUARD_API_KEY not configured')
    err.code = 'NO_KEY'
    throw err
  }
  const url = new URL(`${BASE_URL}${pathname}`)
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url, {
    headers: { 'X-API-Key': key, Accept: 'application/json' },
  })
  const usage = {
    usage: res.headers.get('x-api-usage'),
    limit: res.headers.get('x-api-limit'),
    remaining: res.headers.get('x-api-remaining'),
  }
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  if (!res.ok) {
    const err = new Error(body?.detail || body?.error || `CommunityGuard ${res.status}`)
    err.status = res.status
    err.usage = usage
    err.body = body
    throw err
  }
  return { data: body, usage }
}

async function fetchNearby(lat, lon, radiusMiles = 10) {
  return communityGuardFetch('/offenders/nearby/', {
    latitude: lat,
    longitude: lon,
    radius: radiusMiles,
  })
}

async function fetchOffenderDetail(id) {
  return communityGuardFetch(`/offenders/${encodeURIComponent(id)}/`)
}

/** Map-safe marker projection — coords + id only (no names in list). */
function toMarker(row) {
  return {
    id: row.id,
    lat: row.latitude,
    lon: row.longitude,
    risk: row.risk_level || row.tier_level || null,
    state: row.state_id || row.source_state || null,
    metros: Array.isArray(row._metros) ? row._metros : [],
  }
}

const EARTH_RADIUS_MI = 3958.7613

function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (Number(d) * Math.PI) / 180
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δφ = toRad(lat2 - lat1)
  const Δλ = toRad(lon2 - lon1)
  const a = Math.sin(Δφ / 2) ** 2
    + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Every metro/city the pack exposes with valid coordinates.
 * Includes errored seed attempts that still have centroids — never drop a
 * represented city from coverage checks.
 */
function listPackMetros(pack) {
  const rows = Array.isArray(pack?.metros) ? pack.metros : []
  return rows
    .filter((m) => m && Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lon)))
    .map((m) => ({
      id: m.id,
      name: m.name,
      lat: Number(m.lat),
      lon: Number(m.lon),
      count: Number(m.count) || 0,
      error: m.error || null,
    }))
}

/** Metro-area coverage radius around each seeded centroid (miles). */
function coverageRadiusMiles(pack) {
  const seeded = Number(pack?.radiusMiles)
  // Seed pulls ~10 mi nearby; allow a metro-area buffer so suburbs still match.
  return Math.max(Number.isFinite(seeded) ? seeded : 10, 10) + 15
}

function nearestMetro(lat, lon, metros) {
  let best = null
  for (const m of metros) {
    const miles = haversineMiles(lat, lon, m.lat, m.lon)
    if (!best || miles < best.miles) best = { ...m, miles }
  }
  return best
}

/**
 * Coverage vs every pack metro centroid (and seed radius).
 * Covered when the user is within the metro coverage radius of any represented city.
 */
function checkCoverage({ lat, lon } = {}) {
  const pack = readPack()
  const latitude = Number(lat)
  const longitude = Number(lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const err = new Error('lat and lon are required')
    err.code = 'BAD_REQUEST'
    throw err
  }
  const metros = listPackMetros(pack)
  const radius = coverageRadiusMiles(pack)
  const nearest = nearestMetro(latitude, longitude, metros)
  const covered = Boolean(nearest && nearest.miles <= radius)
  return {
    data: {
      covered,
      lat: latitude,
      lon: longitude,
      coverageRadiusMiles: radius,
      nearestMetro: nearest
        ? {
          id: nearest.id,
          name: nearest.name,
          lat: nearest.lat,
          lon: nearest.lon,
          count: nearest.count,
          miles: Math.round(nearest.miles * 10) / 10,
        }
        : null,
      metroCount: metros.length,
      message: covered
        ? null
        : 'Your area is not in the current coverage set. Offenders are seeded for about 35 major U.S. metros only.',
    },
    meta: {
      seededAt: pack.seededAt,
      radiusMiles: pack.radiusMiles,
      source: pack.source,
      metros,
    },
  }
}

/** Markers within radiusMiles of a point, from the on-disk pack only. */
function getNearbyMarkers({ lat, lon, radiusMiles } = {}) {
  const pack = readPack()
  const latitude = Number(lat)
  const longitude = Number(lon)
  const radius = Math.min(Math.max(Number(radiusMiles) || Number(pack.radiusMiles) || 10, 1), 50)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const err = new Error('lat and lon are required')
    err.code = 'BAD_REQUEST'
    throw err
  }
  const coverage = checkCoverage({ lat: latitude, lon: longitude })
  const rows = pack.offenders || []
  const markers = rows
    .filter((o) => Number.isFinite(Number(o.latitude)) && Number.isFinite(Number(o.longitude)))
    .map((o) => {
      const miles = haversineMiles(latitude, longitude, o.latitude, o.longitude)
      if (miles > radius) return null
      return { ...toMarker(o), miles: Math.round(miles * 100) / 100 }
    })
    .filter(Boolean)
    .sort((a, b) => a.miles - b.miles)

  return {
    data: markers,
    meta: {
      count: markers.length,
      lat: latitude,
      lon: longitude,
      radiusMiles: radius,
      covered: coverage.data.covered,
      coverage: coverage.data,
      seededAt: pack.seededAt,
      source: pack.source,
      metros: listPackMetros(pack),
    },
  }
}

function getMarkers({ metro, pinsOnly, lat, lon, radiusMiles } = {}) {
  if (lat != null && lon != null && String(lat) !== '' && String(lon) !== '') {
    return getNearbyMarkers({ lat, lon, radiusMiles })
  }
  const pack = readPack()
  const metroFilter = String(metro || '').trim().toLowerCase()
  const metros = listPackMetros(pack)
  if (pinsOnly === true || pinsOnly === '1' || pinsOnly === 'true') {
    return {
      data: [],
      meta: {
        count: 0,
        pinsOnly: true,
        seededAt: pack.seededAt,
        radiusMiles: pack.radiusMiles,
        coverageRadiusMiles: coverageRadiusMiles(pack),
        metro: null,
        metros,
        source: pack.source,
        remainingHint: pack.apiUsage?.remaining ?? null,
        offenderCount: (pack.offenders || []).length,
      },
    }
  }
  let rows = pack.offenders || []
  if (metroFilter) {
    rows = rows.filter((o) => {
      const list = o._metros || []
      return list.some((m) => String(m).toLowerCase() === metroFilter)
    })
  }
  const markers = rows
    .filter((o) => Number.isFinite(Number(o.latitude)) && Number.isFinite(Number(o.longitude)))
    .map(toMarker)
  return {
    data: markers,
    meta: {
      count: markers.length,
      seededAt: pack.seededAt,
      radiusMiles: pack.radiusMiles,
      coverageRadiusMiles: coverageRadiusMiles(pack),
      metro: metroFilter || null,
      metros,
      source: pack.source,
      remainingHint: pack.apiUsage?.remaining ?? null,
    },
  }
}

function getOffenderById(id) {
  const needle = Number(id)
  if (!Number.isFinite(needle)) return null
  const detail = readDetail(needle)
  const pack = readPack()
  const summary = (pack.offenders || []).find((o) => Number(o.id) === needle) || null
  if (!summary && !detail) return null
  return {
    data: {
      ...(summary || {}),
      ...(detail || {}),
      id: needle,
      _fromPack: Boolean(summary),
      _fromDetailCache: Boolean(detail),
    },
    meta: {
      seededAt: pack.seededAt,
      source: pack.source,
    },
  }
}

function getPackStatus() {
  const pack = readPack()
  const detailFiles = fs.existsSync(DETAILS_DIR)
    ? fs.readdirSync(DETAILS_DIR).filter((f) => f.endsWith('.json')).length
    : 0
  return {
    data: {
      seededAt: pack.seededAt,
      offenderCount: (pack.offenders || []).length,
      metroCount: (pack.metros || []).length,
      radiusMiles: pack.radiusMiles,
      detailCacheCount: detailFiles,
      apiUsage: pack.apiUsage,
      hasKey: Boolean(apiKey()),
    },
  }
}

module.exports = {
  DATA_DIR,
  PACK_FILE,
  DETAILS_DIR,
  apiKey,
  ensureDirs,
  readPack,
  writePack,
  readDetail,
  writeDetail,
  fetchNearby,
  fetchOffenderDetail,
  getMarkers,
  getNearbyMarkers,
  checkCoverage,
  listPackMetros,
  coverageRadiusMiles,
  haversineMiles,
  getOffenderById,
  getPackStatus,
  toMarker,
}
