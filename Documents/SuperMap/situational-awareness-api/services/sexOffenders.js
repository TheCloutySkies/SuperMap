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

function getMarkers({ metro } = {}) {
  const pack = readPack()
  const metroFilter = String(metro || '').trim().toLowerCase()
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
  const metros = (pack.metros || [])
    .filter((m) => !m.error)
    .map((m) => ({
      id: m.id,
      name: m.name,
      lat: m.lat,
      lon: m.lon,
      count: m.count,
    }))
  return {
    data: markers,
    meta: {
      count: markers.length,
      seededAt: pack.seededAt,
      radiusMiles: pack.radiusMiles,
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
  getOffenderById,
  getPackStatus,
  toMarker,
}
