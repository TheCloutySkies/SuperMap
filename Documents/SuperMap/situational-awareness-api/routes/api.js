const express = require('express')
const axios = require('axios')
const NodeCache = require('node-cache')
const turf = require('@turf/turf')
const router = express.Router()
const newsService = require('../services/news')
const osintService = require('../services/osint')
const safetyService = require('../services/safety')
const infrastructureService = require('../services/infrastructure')
const { searchAll } = require('../services/searchIndex')
const { getEventsForSearch, getEvents, getEventTagNames, getEventsWithAnyTagInTimeRange } = require('../database')
const { PRIORITY_ORDER } = require('../services/osintXFeedService')
const { correlate } = require('../services/correlation')
const rapidApi = require('../services/rapidApi')
const userConfig = require('../config/userConfig')
const { extractPlaces, geocodePlace, geotagArticle } = require('../services/geotagger')
const { normalizeToEvent, ingestEvent, eventToFeature } = require('../services/ingest')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const nodemailer = require('nodemailer')
const { createClient } = require('@supabase/supabase-js')
const Parser = require('rss-parser')
const { getAllCameras } = require('../camera-discovery/storage/saveCamera')
const { loadSeedCameras } = require('../camera-discovery/storage/cameraSeeds')

const searchCache = new NodeCache({ stdTTL: 15 })
const geocodeCache = new NodeCache({ stdTTL: 24 * 60 * 60, checkperiod: 120 })
const weatherNearbyCache = new NodeCache({ stdTTL: 10 * 60, checkperiod: 120 })
const weatherHourlyCache = new NodeCache({ stdTTL: 10 * 60, checkperiod: 120 })
const threatSummaryCache = new NodeCache({ stdTTL: 60 * 60, checkperiod: 300 })
const defconCache = new NodeCache({ stdTTL: 30 * 60, checkperiod: 120 })
const stocksCache = new NodeCache({ stdTTL: 5 * 60, checkperiod: 60 })
const netblocksCache = new NodeCache({ stdTTL: 15 * 60, checkperiod: 120 })
const earthquakesWidgetCache = new NodeCache({ stdTTL: 5 * 60, checkperiod: 60 })
const spaceCache = new NodeCache({ stdTTL: 60 * 60, checkperiod: 300 })
const conflictMetricsCache = new NodeCache({ stdTTL: 10 * 60, checkperiod: 120 })
const gasPricesCache = new NodeCache({ stdTTL: 30 * 60, checkperiod: 300 })
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || ''
const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY || ''
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ''

function feedsDebugEnabled() {
  const v = String(process.env.DEBUG_FEEDS || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function communityDebugEnabled() {
  const v = String(process.env.DEBUG_COMMUNITY || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null

const mailer = (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
  : null

function requireForumBackend(res) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Forum backend not configured: set SUPABASE_URL and SUPABASE_SERVICE_KEY' })
    return false
  }
  return true
}

async function getAuthUserId(req) {
  if (!supabaseAdmin) return null
  const auth = req.headers.authorization || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return null
  const token = auth.slice(7).trim()
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return data.user.id
}

function normalizeOpenMeteoGeocode(r) {
  const lat = Number(r?.latitude)
  const lon = Number(r?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return {
    id: r.id || `om-${lat}-${lon}`,
    place_id: r.id || `om-${lat}-${lon}`,
    name: r.name || 'Place',
    display_name: [r.name, r.admin1, r.country].filter(Boolean).join(', ') || r.name || `${lat}, ${lon}`,
    type: r.feature_code || 'place',
    lat,
    lon,
    source: 'open-meteo',
  }
}

function normalizeLatLonPlace(raw, fallbackType = 'place') {
  const lat = Number(raw?.lat ?? raw?.latitude)
  const lon = Number(raw?.lon ?? raw?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return {
    id: raw.id || raw.place_id || `${lat},${lon}`,
    place_id: raw.place_id || raw.id || `${lat},${lon}`,
    name: raw.name || raw.text || 'Place',
    display_name: raw.display_name || raw.place_name || raw.formatted || raw.name || `${lat}, ${lon}`,
    type: raw.type || raw.class || fallbackType,
    lat,
    lon,
    source: raw.source || 'geocoder',
  }
}

function searchResultsToGeoJSON(hits) {
  const features = hits
    .filter((r) => r.lat != null && r.lon != null)
    .map((r) => {
      const tags = (r.tagsStr || '').split(/\s+/).filter(Boolean)
      const entities = (r.entitiesStr || '').split(/\s+/).filter(Boolean)
      return {
        type: 'Feature',
        id: r.id,
        properties: {
          id: r.id,
          title: r.title,
          type: r.type,
          source: r.source,
          timestamp: r.timestamp,
          tags: tags.length ? tags : undefined,
          entities: entities.length ? entities : undefined,
        },
        geometry: { type: 'Point', coordinates: [Number(r.lon), Number(r.lat)] },
      }
    })
  return { type: 'FeatureCollection', features }
}

function filterByRadius(features, centerLat, centerLon, radiusKm) {
  if (!radiusKm || radiusKm <= 0) return features
  const center = turf.point([Number(centerLon), Number(centerLat)])
  const filtered = features.filter((f) => {
    const pt = turf.point(f.geometry.coordinates)
    const dist = turf.distance(center, pt, { units: 'kilometers' })
    return dist <= radiusKm
  })
  return filtered
}

router.get('/news', async (req, res) => {
  const t0 = Date.now()
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true'
    const cached = !forceRefresh ? newsService.getNewsCached() : null
    if (cached && Array.isArray(cached.features) && cached.features.length > 0) {
      if (feedsDebugEnabled()) {
        console.log('[FEEDS API /news] OUTPUT', { cached: true, features: cached.features.length, ms: Date.now() - t0 })
      }
      return res.json(cached)
    }
    const items = await newsService.getNews()
    if (feedsDebugEnabled()) {
      console.log('[FEEDS API /news] OUTPUT', { cached: false, features: items?.features?.length || 0, ms: Date.now() - t0 })
    }
    return res.json(items)
  } catch (err) {
    console.error('[API /news]', err.message)
    res.status(500).json({ error: 'Failed to fetch news' })
  }
})

router.get('/osint', (req, res) => {
  const t0 = Date.now()
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200)
    const data = osintService.getOsintFromDb(limit)
    if (feedsDebugEnabled()) {
      console.log('[FEEDS API /osint] OUTPUT', { limit, features: data?.features?.length || 0, ms: Date.now() - t0 })
    }
    res.json(data)
  } catch (err) {
    console.error('[API /osint]', err.message)
    res.status(500).json({ error: 'Failed to fetch OSINT' })
  }
})

const THREAT_SUMMARY_FILE = path.join(__dirname, '..', 'data', 'last-threat-summary.json')

function readPersistedThreatSummary() {
  try {
    const raw = fs.readFileSync(THREAT_SUMMARY_FILE, 'utf8')
    const data = JSON.parse(raw)
    if (data && typeof data.summary === 'string') return { ...data, _persisted: true }
  } catch (_) {}
  return null
}

function writePersistedThreatSummary(payload) {
  try {
    const dir = path.dirname(THREAT_SUMMARY_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(THREAT_SUMMARY_FILE, JSON.stringify(payload, null, 0), 'utf8')
  } catch (e) {
    console.warn('[API /threat-summary] Could not persist:', e.message)
  }
}

/** AI threat summary. Cached 60 min; persisted to file so we avoid extra requests. Use ?refresh=1 to regenerate. */
router.get('/threat-summary', async (req, res) => {
  const cacheKey = 'threat-summary'
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true'
  if (!forceRefresh) {
    const cached = threatSummaryCache.get(cacheKey)
    if (cached) return res.json(cached)
    const persisted = readPersistedThreatSummary()
    if (persisted) return res.json(persisted)
  }
  try {
    const threatSummaryService = require('../services/threatSummary')
    const result = await threatSummaryService.getThreatSummary()
    const payload = {
      summary: result.summary,
      narrative: result.narrative,
      threat_level: result.threat_level,
      threat_score: result.threat_score,
      sources: result.sources || [],
      timestamp: result.timestamp || new Date().toISOString(),
      bullets: result.bullets,
      fallback: result.fallback,
    }
    threatSummaryCache.set(cacheKey, payload)
    writePersistedThreatSummary(payload)
    res.json(payload)
  } catch (err) {
    console.error('[API /threat-summary]', err.message)
    const persisted = readPersistedThreatSummary()
    if (persisted) return res.json(persisted)
    res.status(500).json({
      error: 'Failed to generate threat summary',
      summary: '',
      threat_level: 'GUARDED',
      threat_score: 2,
      sources: [],
      timestamp: new Date().toISOString(),
    })
  }
})

/** DEFCON level from defconlevel.com (OSINT estimate). Cached 30 min. */
const DEFCONLEVEL_URL = 'https://www.defconlevel.com/current-level'
router.get('/defcon', async (_req, res) => {
  const cacheKey = 'defcon'
  const cached = defconCache.get(cacheKey)
  if (cached) return res.json({ ...cached, _cached: true })
  try {
    const { data } = await axios.get(DEFCONLEVEL_URL, {
      timeout: 10000,
      headers: { 'User-Agent': 'SuperMap/1.0 (https://github.com/TheCloutySkies/SuperMap)' },
      validateStatus: () => true,
    })
    const html = typeof data === 'string' ? data : ''
    const currentMatch = html.match(/Current Level DEFCON\s*([1-5])/i) || html.match(/DEFCON\s*([1-5])/i)
    const level = currentMatch ? parseInt(currentMatch[1], 10) : null
    const payload = {
      level: level >= 1 && level <= 5 ? level : null,
      label: level != null ? `DEFCON ${level}` : null,
      url: DEFCONLEVEL_URL,
      updatedAt: new Date().toISOString(),
    }
    defconCache.set(cacheKey, payload)
    return res.json(payload)
  } catch (err) {
    console.warn('[API /defcon]', err.message)
    return res.json({
      level: null,
      label: null,
      url: DEFCONLEVEL_URL,
      updatedAt: new Date().toISOString(),
      error: err.message,
    })
  }
})

/** OSINT X configured feeds and mirrors (for verification). GET /api/osint-x/feeds */
router.get('/osint-x/feeds', (req, res) => {
  try {
    const feeds = userConfig.getOsintXFeeds()
    const mirrors = userConfig.getNitterMirrors()
    res.json({
      count: feeds.length,
      mirrors,
      feeds: feeds.map((f) => ({ handle: f.handle, name: f.name, priority: f.priority })),
    })
  } catch (err) {
    console.error('[API /osint-x/feeds]', err.message)
    res.status(500).json({ error: 'Failed to get feeds' })
  }
})

const OSINT_X_MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12 hours

/** OSINT X (Twitter RSS) feed: GET /api/osint-x?limit=100. Only returns posts from the last 12 hours. */
router.get('/osint-x', (req, res) => {
  const t0 = Date.now()
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200)
    const rows = getEvents(limit, null, null, null, null, ['x'])
    const cutoff = Date.now() - OSINT_X_MAX_AGE_MS
    const posts = rows
      .filter((r) => (r.timestamp != null ? Number(r.timestamp) : 0) >= cutoff)
      .map((r) => {
        let raw = {}
        try {
          raw = r.raw_data ? JSON.parse(r.raw_data) : {}
        } catch (_) {}
        const tags = getEventTagNames(r.id)
        const priority = raw.priority || 'medium'
        return {
          id: r.id,
          source: 'x',
          account: raw.account || 'x',
          title: r.title,
          content: r.description,
          timestamp: r.timestamp,
          tags,
          priority,
          url: raw.link || raw.url,
          images: Array.isArray(raw.images) ? raw.images : [],
          videos: Array.isArray(raw.videos) ? raw.videos : [],
        }
      })
    posts.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 2
      const pb = PRIORITY_ORDER[b.priority] ?? 2
      if (pa !== pb) return pa - pb
      return (b.timestamp || 0) - (a.timestamp || 0)
    })
    if (feedsDebugEnabled()) {
      console.log('[FEEDS API /osint-x] OUTPUT', { limit, posts: posts.length, ms: Date.now() - t0 })
    }
    res.json(posts)
  } catch (err) {
    console.error('[API /osint-x]', err.message)
    res.status(500).json({ error: 'Failed to fetch OSINT X' })
  }
})

router.get('/cameras', async (req, res) => {
  try {
    const [all, seeds] = await Promise.all([getAllCameras(), loadSeedCameras()])
    const q = String(req.query.q || '').trim().toLowerCase()
    const type = String(req.query.type || '').trim().toLowerCase()
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50000, 1), 50000)
    const minLat = req.query.minLat != null ? Number(req.query.minLat) : null
    const maxLat = req.query.maxLat != null ? Number(req.query.maxLat) : null
    const minLon = req.query.minLon != null ? Number(req.query.minLon) : null
    const maxLon = req.query.maxLon != null ? Number(req.query.maxLon) : null
    const lat = req.query.lat != null ? Number(req.query.lat) : null
    const lon = req.query.lon != null ? Number(req.query.lon) : null
    const radiusKm = req.query.radius != null ? Number(req.query.radius) : null

    let rows = [...(Array.isArray(all) ? all : []), ...(Array.isArray(seeds) ? seeds : [])]
    const dedup = new Map()
    rows.forEach((c) => {
      const key = String(c?.id || c?.stream || '')
      if (!key) return
      dedup.set(key, { id: key, ...c })
    })
    rows = Array.from(dedup.values())
    if ([minLat, maxLat, minLon, maxLon].every((n) => Number.isFinite(n))) {
      rows = rows.filter((c) => c.lat >= minLat && c.lat <= maxLat && c.lon >= minLon && c.lon <= maxLon)
    } else if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(radiusKm)) {
      const center = turf.point([lon, lat])
      rows = rows.filter((c) => {
        if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) return false
        const d = turf.distance(center, turf.point([c.lon, c.lat]), { units: 'kilometers' })
        return d <= radiusKm
      })
    }
    if (type) rows = rows.filter((c) => String(c.type || '').toLowerCase() === type)
    if (q) rows = rows.filter((c) => String(c.name || '').toLowerCase().includes(q) || String(c.stream || '').toLowerCase().includes(q))
    res.json(rows.slice(0, limit))
  } catch (err) {
    console.error('[API /cameras]', err.message)
    res.status(500).json({ error: 'Failed to fetch cameras' })
  }
})

router.get('/cameras/count', async (_req, res) => {
  try {
    const [all, seeds] = await Promise.all([getAllCameras(), loadSeedCameras()])
    const keys = new Set([...(all || []), ...(seeds || [])].map((c) => String(c?.id || c?.stream || '')).filter(Boolean))
    res.json({ count: keys.size })
  } catch (err) {
    res.status(500).json({ error: 'Failed to count cameras' })
  }
})

router.get('/seed-cameras', async (req, res) => {
  try {
    const all = await loadSeedCameras()
    const minLat = req.query.minLat != null ? Number(req.query.minLat) : null
    const maxLat = req.query.maxLat != null ? Number(req.query.maxLat) : null
    const minLon = req.query.minLon != null ? Number(req.query.minLon) : null
    const maxLon = req.query.maxLon != null ? Number(req.query.maxLon) : null
    let rows = all
    if ([minLat, maxLat, minLon, maxLon].every((n) => Number.isFinite(n))) {
      rows = rows.filter((c) => c.lat >= minLat && c.lat <= maxLat && c.lon >= minLon && c.lon <= maxLon)
    }
    res.json(rows)
  } catch (err) {
    console.error('[API /seed-cameras]', err.message)
    res.status(500).json({ error: 'Failed to load seed cameras' })
  }
})

router.get('/earthquakes', async (req, res) => {
  try {
    const data = await safetyService.getEarthquakes(req.query)
    res.json(data)
  } catch (err) {
    console.error('[API /earthquakes]', err.message)
    res.status(500).json({ error: 'Failed to fetch earthquakes' })
  }
})

/** Widget: recent earthquakes (USGS 2.5+ week). Cache 5 min. */
router.get('/earthquakes/widget', async (req, res) => {
  const cacheKey = 'earthquakes-widget'
  const cached = earthquakesWidgetCache.get(cacheKey)
  if (cached) return res.json({ ...cached, _cached: true })
  try {
    const resUsgs = await axios.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', { timeout: 10000 })
    const features = resUsgs.data?.features || []
    const events = features.slice(0, 12).map((f) => {
      const p = f.properties || {}
      const id = f.id
      return {
        id,
        mag: p.mag,
        place: (p.place || '').replace(/^\d+\s+km\s+(?:[NESW]+\s+of\s+)?/i, '').trim().slice(0, 50) || '—',
        time: p.time,
        depth: f.geometry?.coordinates?.[2] ?? null,
        url: id ? `https://earthquake.usgs.gov/earthquakes/eventpage/${id}` : null,
      }
    })
    const payload = {
      events,
      updatedAt: new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }),
    }
    earthquakesWidgetCache.set(cacheKey, payload)
    res.json(payload)
  } catch (err) {
    console.warn('[API /earthquakes/widget]', err.message)
    res.json({
      events: [],
      updatedAt: new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }),
    })
  }
})

router.get('/disasters', async (req, res) => {
  try {
    const data = await safetyService.getDisasters(req.query)
    res.json(data)
  } catch (err) {
    console.error('[API /disasters]', err.message)
    res.status(500).json({ error: 'Failed to fetch disasters' })
  }
})

router.get('/towers', async (req, res) => {
  try {
    const data = await infrastructureService.getTowers(req.query)
    res.json(data)
  } catch (err) {
    console.error('[API /towers]', err.message)
    res.status(500).json({ error: 'Failed to fetch towers' })
  }
})

/** FCC / tower data for map (FCC ASR or OpenCellID when configured). GET /api/fcc/towers?bbox=minLon,minLat,maxLon,maxLat */
router.get('/fcc/towers', async (req, res) => {
  try {
    const bboxStr = (req.query.bbox || '').trim()
    if (!bboxStr) return res.json({ type: 'FeatureCollection', features: [] })
    const data = await infrastructureService.getTowers({ bbox: bboxStr, limit: 500 })
    if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
      return res.json(data)
    }
    res.json({ type: 'FeatureCollection', features: [] })
  } catch (err) {
    console.warn('[API /fcc/towers]', err.message)
    res.json({ type: 'FeatureCollection', features: [] })
  }
})


/** Pin from text: extract place, geocode, ingest as high-confidence event. POST /api/events/pin-from-text body: { title, description?, source?, url? } */
router.post('/events/pin-from-text', async (req, res) => {
  const title = (req.body?.title || '').trim()
  const description = (req.body?.description || req.body?.content || '').trim().slice(0, 2000)
  const source = (req.body?.source || 'pinned').trim() || 'pinned'
  const url = (req.body?.url || req.body?.link || '').trim()
  if (!title) return res.status(400).json({ error: 'title required' })
  const text = [title, description].filter(Boolean).join(' ')
  const places = extractPlaces(text)
  let event = null
  for (const place of places) {
    const result = await geocodePlace(place)
    if (result && result.coords) {
      const raw = {
        title,
        description,
        link: url,
        coordinates: result.coords,
        lat: result.coords[1],
        lon: result.coords[0],
        country: result.countryCode || result.country,
        confidence: 'high',
        source,
      }
      event = normalizeToEvent(raw, 'conflict', source)
      event.raw_data = JSON.stringify({ ...raw, link: url, country: raw.country, confidence: 'high' })
      ingestEvent(event, { extraTags: ['pinned', 'osint'] })
      break
    }
  }
  // Fallback: use the same geotag pipeline we use for news/osint ingestion
  // (NLP place extraction + geocode) in case extractPlaces(text) misses.
  if (!event) {
    try {
      const tagged = await geotagArticle({ title, contentSnippet: description, content: description })
      if (tagged?.coordinates?.length >= 2) {
        const raw = {
          title,
          description,
          link: url,
          coordinates: tagged.coordinates,
          lat: tagged.coordinates[1],
          lon: tagged.coordinates[0],
          country: tagged.country || null,
          confidence: tagged.confidence || 'medium',
          source,
        }
        event = normalizeToEvent(raw, 'conflict', source)
        event.raw_data = JSON.stringify({ ...raw, link: url, country: raw.country, confidence: raw.confidence })
        ingestEvent(event, { extraTags: ['pinned', 'osint'] })
      }
    } catch (_) {}
  }
  if (!event || event.lat == null || event.lon == null) {
    return res.status(200).json({ error: 'No location found in text. Try adding a place name (e.g. city or country).' })
  }
  const feature = eventToFeature(event)
  res.setHeader('Content-Type', 'application/json')
  res.json(feature)
})

/** GeoJSON feed for map: GET /api/events?tag=&type=&startTime=&endTime=&bbox=minLon,minLat,maxLon,maxLat&limit=&country=&highConfidenceOnly=1 */
router.get('/events', (req, res) => {
  const tag = (req.query.tag || '').trim() || null
  const type = (req.query.type || '').trim() || null
  const startTime = req.query.startTime != null ? parseInt(req.query.startTime, 10) : null
  const endTime = req.query.endTime != null ? parseInt(req.query.endTime, 10) : null
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500)
  const country = (req.query.country || '').trim() || null
  const highConfidenceOnly = req.query.highConfidenceOnly === '1' || req.query.highConfidenceOnly === 'true'
  let bbox = null
  if (req.query.bbox) {
    const parts = String(req.query.bbox).split(',').map((n) => parseFloat(n.trim()))
    if (parts.length >= 4 && parts.every((n) => !Number.isNaN(n))) bbox = parts.slice(0, 4)
  }
  const events = getEventsForSearch({ tag, startTime, endTime, type, bbox, limit, country, highConfidenceOnly })
  const geo = searchResultsToGeoJSON(events)
  res.setHeader('Content-Type', 'application/geo+json')
  res.json(geo)
})

router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim()
  const lat = req.query.lat != null ? parseFloat(req.query.lat) : null
  const lon = req.query.lon != null ? parseFloat(req.query.lon) : null
  const radius = req.query.radius != null ? parseFloat(req.query.radius) : null
  const tag = (req.query.tag || req.query.tags || '').trim() || null
  const entity = (req.query.entity || '').trim() || null
  const startTime = req.query.startTime != null ? parseInt(req.query.startTime, 10) : null
  const endTime = req.query.endTime != null ? parseInt(req.query.endTime, 10) : null

  const cacheKey = `search:${q}:${lat}:${lon}:${radius}:${tag}:${entity}:${startTime}:${endTime}`
  const cached = searchCache.get(cacheKey)
  if (cached != null) {
    return res.json(cached)
  }

  let hits
  if (q) {
    hits = searchAll(q, 80, { tag, startTime, endTime, entity })
  } else {
    hits = getEventsForSearch({ tag, startTime, endTime, limit: 80 })
    if (entity) {
      const e = entity.toLowerCase()
      hits = hits.filter((r) => (r.entitiesStr || '').toLowerCase().includes(e))
    }
  }
  let geo = searchResultsToGeoJSON(hits)

  if (lat != null && lon != null && radius != null && !Number.isNaN(lat) && !Number.isNaN(lon) && !Number.isNaN(radius)) {
    const filtered = filterByRadius(geo.features, lat, lon, radius)
    geo = { type: 'FeatureCollection', features: filtered }
  }

  searchCache.set(cacheKey, geo)
  res.json(geo)
})

/** Flock cameras (RapidAPI). GET /api/flock/cameras?city=SanDiego */
router.get('/flock/cameras', async (req, res) => {
  const city = (req.query.city || 'SanDiego').trim()
  try {
    const geo = await rapidApi.fetchFlockCameras(city)
    res.json(geo)
  } catch (err) {
    console.error('[API /flock/cameras]', err.message)
    res.status(500).json({ error: 'Failed to fetch Flock cameras' })
  }
})

/** Yahoo Finance screener. GET /api/finance/screener?list=day_gainers */
router.get('/finance/screener', async (req, res) => {
  if (!rapidApi.requireKey(res)) return
  const list = (req.query.list || 'day_gainers').trim()
  try {
    const { body, error } = await rapidApi.fetchFinanceScreener(list)
    if (error) return res.status(200).json({ body: { body: [] }, error })
    res.json(body || {})
  } catch (err) {
    console.error('[API /finance/screener]', err.message)
    res.status(500).json({ error: err.message })
  }
})

/** Yahoo Finance stock search. GET /api/finance/search?search=AA */
router.get('/finance/search', async (req, res) => {
  if (!rapidApi.requireKey(res)) return
  const search = (req.query.search || req.query.q || '').trim()
  try {
    const { body, error } = await rapidApi.fetchFinanceSearch(search)
    if (error) return res.status(200).json({ body: null, error })
    res.json(body || {})
  } catch (err) {
    console.error('[API /finance/search]', err.message)
    res.status(500).json({ error: err.message })
  }
})

/** Real-time news by topic. GET /api/news/rapid?topic=TECHNOLOGY&limit=50&country=US&lang=en */
router.get('/news/rapid', async (req, res) => {
  if (!rapidApi.requireKey(res)) return
  const { topic, section, limit, country, lang } = req.query
  try {
    const { body, error } = await rapidApi.fetchTopicNews({
      topic: topic || 'TECHNOLOGY',
      section: section || undefined,
      limit: limit || '50',
      country: country || 'US',
      lang: lang || 'en',
    })
    if (error) return res.status(200).json({ body: { data: [] }, error })
    res.json(body || {})
  } catch (err) {
    console.error('[API /news/rapid]', err.message)
    res.status(500).json({ error: err.message })
  }
})

/** Advanced Google search. POST /api/search/advanced body: { query: "..." } */
router.post('/search/advanced', async (req, res) => {
  if (!rapidApi.requireGoogleSearchKey(res)) return
  const query = (req.body?.query || req.query?.q || '').trim()
  if (!query) return res.status(400).json({ error: 'query required' })
  try {
    const { body, error } = await rapidApi.fetchGoogleSearch(query)
    if (error) return res.status(200).json({ results: [], data: [], error })
    res.json(body || {})
  } catch (err) {
    console.error('[API /search/advanced]', err.message)
    res.status(500).json({ error: err.message })
  }
})

/** Meteostat hourly weather. GET /api/weather/hourly?station=10637&start=2020-01-01&end=2020-01-01&tz=America/New_York */
router.get('/weather/hourly', async (req, res) => {
  // Weather is optional; avoid noisy 5xx responses when RapidAPI isn't configured/subscribed.
  if (!process.env.RAPIDAPI_KEY || !String(process.env.RAPIDAPI_KEY).trim()) {
    return res.status(200).json({ error: 'RAPIDAPI_KEY not configured. Set in API .env to enable Meteostat.', body: null, _failed: true })
  }
  const { station, start, end, tz } = req.query
  const cacheKey = `${String(station || '10637')}::${String(start || '')}::${String(end || '')}::${String(tz || '')}`
  const cached = weatherHourlyCache.get(cacheKey)
  if (cached) return res.json({ ...cached, _cached: true })
  try {
    const { body, error } = await rapidApi.fetchMeteostatHourly({
      station: station || '10637',
      start: start || new Date().toISOString().slice(0, 10),
      end: end || new Date().toISOString().slice(0, 10),
      tz: tz || 'America/New_York',
    })
    if (error) {
      // Prefer returning last known payload when RapidAPI rate-limits.
      const stale = weatherHourlyCache.get(cacheKey)
      if (stale) return res.json({ ...stale, _cached: true, _staleOnError: true, _error: error })
      return res.status(200).json({ error, body: null, _failed: true })
    }
    const payload = body || {}
    weatherHourlyCache.set(cacheKey, payload)
    res.json(payload)
  } catch (err) {
    console.error('[API /weather/hourly]', err.message)
    res.status(200).json({ error: err.message, body: null, _failed: true })
  }
})

/** Meteostat nearby station (for weather by lat/lon). GET /api/weather/nearby?lat=40&lon=-74 */
router.get('/weather/nearby', async (req, res) => {
  // Weather is optional; avoid noisy 5xx responses when RapidAPI isn't configured/subscribed.
  if (!process.env.RAPIDAPI_KEY || !String(process.env.RAPIDAPI_KEY).trim()) {
    return res.status(200).json({ error: 'RAPIDAPI_KEY not configured. Set in API .env to enable Meteostat.', body: null, _failed: true })
  }
  const lat = req.query.lat != null ? parseFloat(req.query.lat) : null
  const lon = req.query.lon != null ? parseFloat(req.query.lon) : null
  const cacheKey = `${Number.isFinite(lat) ? lat.toFixed(2) : 'na'},${Number.isFinite(lon) ? lon.toFixed(2) : 'na'}`
  const cached = weatherNearbyCache.get(cacheKey)
  if (cached) return res.json({ ...cached, _cached: true })
  try {
    const { body, error } = await rapidApi.fetchMeteostatNearest(lat, lon)
    if (error) {
      const stale = weatherNearbyCache.get(cacheKey)
      if (stale) return res.json({ ...stale, _cached: true, _staleOnError: true, _error: error })
      return res.status(200).json({ error, body: null, _failed: true })
    }
    const payload = body || {}
    weatherNearbyCache.set(cacheKey, payload)
    res.json(payload)
  } catch (err) {
    console.error('[API /weather/nearby]', err.message)
    res.status(200).json({ error: err.message, body: null, _failed: true })
  }
})

/** ADS-B aircraft via backend RapidAPI key. GET /api/adsb?lat=..&lon=.. */
router.get('/adsb', async (req, res) => {
  if (!rapidApi.requireKey(res)) return
  const lat = req.query.lat != null ? parseFloat(req.query.lat) : NaN
  const lon = req.query.lon != null ? parseFloat(req.query.lon) : NaN
  if (Number.isNaN(lat) || Number.isNaN(lon)) return res.status(400).json({ error: 'lat and lon required' })
  try {
    const { body, error } = await rapidApi.fetchAdsbAircraft(lat, lon)
    if (error) return res.status(200).json(body || { type: 'FeatureCollection', features: [] })
    res.json(body || { type: 'FeatureCollection', features: [] })
  } catch (err) {
    console.error('[API /adsb]', err.message)
    res.status(500).json({ error: err.message })
  }
})

/** adsb.lol API proxy (see https://api.adsb.lol/docs). GET /api/adsb-lol/airport/:icao */
router.get('/adsb-lol/airport/:icao', async (req, res) => {
  const icao = (req.params.icao || '').trim().toUpperCase()
  if (!icao || icao.length !== 4) return res.status(400).json({ error: 'ICAO code required (4 characters)' })
  try {
    const { data, status } = await axios.get(`https://api.adsb.lol/api/0/airport/${encodeURIComponent(icao)}`, {
      timeout: 10000,
      validateStatus: (s) => s >= 200 && s < 500,
      responseType: 'json',
    })
    if (status !== 200) return res.status(status).json(data || { error: 'adsb.lol airport lookup failed' })
    res.json(data)
  } catch (err) {
    console.warn('[API /adsb-lol/airport]', err.message)
    res.status(502).json({ error: err.message || 'adsb.lol unavailable' })
  }
})

/** adsb.lol mil feed proxy (avoids browser CORS). GET /api/adsb/mil */
router.get('/adsb/mil', async (_req, res) => {
  try {
    const { data, status } = await axios.get('https://api.adsb.lol/v2/mil', {
      timeout: 15000,
      validateStatus: () => true,
      responseType: 'json',
    })
    if (status !== 200 || !data) {
      return res.status(200).json(typeof data === 'object' ? data : {})
    }
    res.json(data)
  } catch (err) {
    console.warn('[API /adsb/mil]', err.message)
    res.status(502).json({ error: 'Failed to fetch mil aircraft feed' })
  }
})

/** GeoConfirmed.org map pins (KML → GeoJSON). GET /api/geoconfirmed?bbox=w,s,e,n */
router.get('/geoconfirmed', async (req, res) => {
  const GEOCONFIRMED_KML = 'https://geoconfirmed.org/api/map/ExportAsKml/World'
  let bbox = null
  if (req.query.bbox) {
    const parts = String(req.query.bbox).split(',').map((n) => parseFloat(n.trim()))
    if (parts.length >= 4 && parts.every((n) => !Number.isNaN(n))) bbox = parts
  }
  try {
    const { data: kml } = await axios.get(GEOCONFIRMED_KML, { timeout: 20000, responseType: 'text' })
    const features = []
    const placemarkRe = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/gi
    let m
    while ((m = placemarkRe.exec(kml)) !== null) {
      const block = m[1]
      const nameMatch = block.match(/<name[^>]*>([\s\S]*?)<\/name>/i)
      const name = (nameMatch && nameMatch[1].replace(/<[^>]+>/g, '').trim()) || ''
      const coordMatch = block.match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i)
      if (!coordMatch) continue
      const coordStr = coordMatch[1].trim().split(/[\s]+/)[0] || ''
      const parts = coordStr.split(',')
      const lon = parseFloat(parts[0])
      const lat = parseFloat(parts[1])
      if (Number.isNaN(lon) || Number.isNaN(lat)) continue
      if (bbox && bbox.length >= 4) {
        const [w, s, e, n] = bbox
        if (lon < w || lon > e || lat < s || lat > n) continue
      }
      const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)
      const description = (descMatch && descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 300)) || ''
      features.push({
        type: 'Feature',
        properties: { name, title: name, source: 'GeoConfirmed', description, link: 'https://geoconfirmed.org' },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      })
    }
    res.setHeader('Content-Type', 'application/json')
    res.json({ type: 'FeatureCollection', features })
  } catch (err) {
    console.warn('[API /geoconfirmed]', err.message)
    res.status(502).json({ error: 'Failed to fetch GeoConfirmed data' })
  }
})

/** Geocode place search (Nominatim) so map place search works without CORS. */
router.get('/geocode', async (req, res) => {
  const q = (req.query.q || '').trim()
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 10)
  if (!q) return res.status(400).json({ error: 'q required' })
  const cacheKey = `${q.toLowerCase()}::${limit}`
  const cached = geocodeCache.get(cacheKey)
  if (cached) return res.json(cached)

  // Provider 0: Mapbox
  if (MAPBOX_TOKEN) {
    try {
      const { data } = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`, {
        params: { access_token: MAPBOX_TOKEN, limit },
        timeout: 7000,
      })
      const rows = (Array.isArray(data?.features) ? data.features : [])
        .map((f) => normalizeLatLonPlace({
          id: f.id,
          place_id: f.id,
          name: f.text,
          display_name: f.place_name,
          type: Array.isArray(f.place_type) ? f.place_type[0] : 'place',
          lat: Array.isArray(f.center) ? f.center[1] : null,
          lon: Array.isArray(f.center) ? f.center[0] : null,
          source: 'mapbox',
        }))
        .filter(Boolean)
      if (rows.length) {
        geocodeCache.set(cacheKey, rows)
        return res.json(rows)
      }
    } catch (err) {
      console.warn('[API /geocode] mapbox:', err.message)
    }
  }

  // Provider 1: Geoapify
  if (GEOAPIFY_KEY) {
    try {
      const { data } = await axios.get('https://api.geoapify.com/v1/geocode/search', {
        params: { text: q, apiKey: GEOAPIFY_KEY, limit },
        timeout: 7000,
      })
      const rows = (Array.isArray(data?.features) ? data.features : [])
        .map((f) => normalizeLatLonPlace({
          id: f.properties?.place_id || f.properties?.result_type || f.properties?.name,
          place_id: f.properties?.place_id || f.properties?.name,
          name: f.properties?.name || f.properties?.city || 'Place',
          display_name: f.properties?.formatted || f.properties?.name,
          type: f.properties?.result_type || 'place',
          lat: Array.isArray(f.geometry?.coordinates) ? f.geometry.coordinates[1] : null,
          lon: Array.isArray(f.geometry?.coordinates) ? f.geometry.coordinates[0] : null,
          source: 'geoapify',
        }))
        .filter(Boolean)
      if (rows.length) {
        geocodeCache.set(cacheKey, rows)
        return res.json(rows)
      }
    } catch (err) {
      console.warn('[API /geocode] geoapify:', err.message)
    }
  }

  // Provider 1: Open-Meteo geocoding (usually fast and stable).
  try {
    const { data } = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: { name: q, count: limit },
      timeout: 7000,
    })
    const rows = (data?.results || []).map(normalizeOpenMeteoGeocode).filter(Boolean)
    if (rows.length) {
      geocodeCache.set(cacheKey, rows)
      return res.json(rows)
    }
  } catch (err) {
    console.warn('[API /geocode] open-meteo:', err.message)
  }

  // Provider 2: Nominatim fallback.
  try {
    const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q, format: 'json', limit },
      headers: { 'User-Agent': 'SuperMap/1.0 (https://github.com/supermap)' },
      timeout: 8000,
    })
    const rows = Array.isArray(data) ? data : []
    geocodeCache.set(cacheKey, rows)
    res.json(rows)
  } catch (err) {
    console.warn('[API /geocode]', err.message)
    res.json([])
  }
})

/** Web search: Brave Search (if BRAVE_SEARCH_API_KEY set) else rotating SearXNG instances. Same response shape. */
const { performBraveSearch } = require('../services/search/braveSearch')
const { performSearxSearch } = require('../services/search/searxRouter')

const BRAVE_SEARCH_API_KEY = (process.env.BRAVE_SEARCH_API_KEY || '').trim()

router.get('/search/searxng', async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'q required' })

  // 1) Try Brave Search first when key is set (reliable, same styling in-app)
  if (BRAVE_SEARCH_API_KEY) {
    try {
      const brave = await performBraveSearch(q, BRAVE_SEARCH_API_KEY)
      if (brave && Array.isArray(brave.results)) {
        return res.json({ results: brave.results, query: brave.query || q })
      }
    } catch (err) {
      console.warn('[API /search/searxng] Brave fallback', err.message)
    }
  }

  // 2) Fallback: rotating SearXNG instances
  try {
    const data = await performSearxSearch(q)
    if (data.error) {
      return res.status(502).json({
        error: BRAVE_SEARCH_API_KEY
          ? 'Search failed. Try again or use "Open DuckDuckGo in new tab" below.'
          : 'Search failed. Set BRAVE_SEARCH_API_KEY in the API .env for reliable results, or use "Open DuckDuckGo in new tab" below.',
      })
    }
    const results = (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.snippet || r.content || '',
    }))
    return res.json({ results, query: data.query || q })
  } catch (err) {
    console.warn('[API /search/searxng]', err.message)
    return res.status(502).json({
      error: BRAVE_SEARCH_API_KEY
        ? 'Search failed. Try again or use "Open DuckDuckGo in new tab" below.'
        : 'Search failed. Set BRAVE_SEARCH_API_KEY in the API .env for reliable results, or use "Open DuckDuckGo in new tab" below.',
    })
  }
})

/** Stream proxy for HLS (works from localhost when streams require Referer/CORS). Allowlist only. */
const STREAM_PROXY_ALLOWED_HOSTS = [
  'getaj.net',
  'live.france24.com',
  'france24.com',
  'live-hls-web-aje.getaj.net',
  'live-hls-apps-aje-fa.getaj.net',
  'live-hls-apps-aje-v3-fa.getaj.net',
]
function isStreamUrlAllowed(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const host = u.hostname.toLowerCase()
    return STREAM_PROXY_ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith('.' + allowed))
  } catch {
    return false
  }
}
function rewriteM3u8Playlist(body, baseUrl, proxyPath, referer) {
  const base = new URL(baseUrl)
  const lines = body.split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line || line.startsWith('#')) {
      out.push(line)
      continue
    }
    const segmentUrl = line.trim()
    if (!segmentUrl) { out.push(line); continue }
    let absolute
    try {
      absolute = new URL(segmentUrl, base).href
    } catch {
      out.push(line)
      continue
    }
    const proxySeg = `${proxyPath}?url=${encodeURIComponent(absolute)}${referer ? '&referer=' + encodeURIComponent(referer) : ''}`
    out.push(proxySeg)
  }
  return out.join('\n')
}

router.get('/stream/proxy', async (req, res) => {
  const rawUrl = (req.query.url || '').trim()
  const referer = (req.query.referer || '').trim() || undefined
  if (!rawUrl) return res.status(400).json({ error: 'url required' })
  let url
  try {
    url = decodeURIComponent(rawUrl)
  } catch {
    return res.status(400).json({ error: 'invalid url' })
  }
  if (!isStreamUrlAllowed(url)) return res.status(403).json({ error: 'URL not in stream allowlist' })
  try {
    const headers = { 'User-Agent': 'SuperMap/1.0' }
    if (referer) headers['Referer'] = referer
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers,
      validateStatus: () => true,
    })
    let data = resp.data
    const contentType = resp.headers?.['content-type'] || ''
    const isM3u8 = contentType.includes('mpegurl') || contentType.includes('m3u8') || url.includes('.m3u8')
    if (isM3u8 && Buffer.isBuffer(data)) {
      const text = data.toString('utf8')
      const baseUrl = url.replace(/\/[^/]*$/, '/')
      const proxyPath = `${req.protocol}://${req.get('host') || 'localhost'}${(req.originalUrl || '/api/stream/proxy').split('?')[0]}`
      const rewritten = rewriteM3u8Playlist(text, baseUrl, proxyPath, referer)
      data = Buffer.from(rewritten, 'utf8')
    }
    res.setHeader('Content-Type', contentType || 'application/vnd.apple.mpegurl')
    res.setHeader('Cache-Control', 'no-cache')
    res.status(resp.status).send(data)
  } catch (err) {
    console.warn('[API /stream/proxy]', err.message)
    res.status(502).json({ error: 'Stream proxy failed' })
  }
})

/** User config (X handles, subreddits). GET returns current; POST merges and saves. */
router.get('/config', (req, res) => {
  try {
    res.json(userConfig.getConfig())
  } catch (err) {
    console.error('[API /config]', err.message)
    res.status(500).json({ error: 'Failed to read config' })
  }
})

router.post('/config', (req, res) => {
  try {
    const { osintXHandles, subreddits } = req.body || {}
    const updates = {}
    if (Array.isArray(osintXHandles)) updates.osintXHandles = osintXHandles
    if (Array.isArray(subreddits)) updates.subreddits = subreddits
    const updated = userConfig.setConfig(updates)
    res.json(updated)
  } catch (err) {
    console.error('[API POST /config]', err.message)
    res.status(500).json({ error: 'Failed to save config' })
  }
})

router.get('/clusters', (req, res) => {
  const lat = req.query.lat != null ? parseFloat(req.query.lat) : null
  const lon = req.query.lon != null ? parseFloat(req.query.lon) : null
  const radius = req.query.radius != null ? parseFloat(req.query.radius) : 100
  const radiusKm = req.query.radiusKm != null ? parseFloat(req.query.radiusKm) : 50
  const timeWindowMs = req.query.days != null ? parseInt(req.query.days, 10) * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  try {
    let events = getEventsForSearch({ limit: 500 })
    if (lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
      const center = turf.point([lon, lat])
      events = events.filter((e) => {
        if (e.lat == null || e.lon == null) return false
        return turf.distance(center, turf.point([e.lon, e.lat]), { units: 'kilometers' }) <= radius
      })
    }
    const clusters = correlate(events, { radiusKm, timeWindowMs })
    res.json({ clusters, count: clusters.length })
  } catch (err) {
    console.error('[API /clusters]', err.message)
    res.status(500).json({ error: 'Failed to compute clusters' })
  }
})

router.get('/forum/categories', async (_req, res) => {
  if (!requireForumBackend(res)) return
  const t0 = Date.now()
  const { data, error } = await supabaseAdmin
    .from('forum_categories')
    .select('*')
    .order('name', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  if (communityDebugEnabled()) console.log('[COMMUNITY API /forum/categories] OUTPUT', { count: data?.length || 0, ms: Date.now() - t0 })
  res.json(data || [])
})

router.get('/forum/communities', async (req, res) => {
  if (!requireForumBackend(res)) return
  const t0 = Date.now()
  const categoryId = String(req.query.category_id || '').trim()
  let query = supabaseAdmin
    .from('forum_communities')
    .select('id,name,description,category_id,creator_user_id,created_at')
    .order('created_at', { ascending: false })
  if (categoryId) query = query.eq('category_id', categoryId)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  if (communityDebugEnabled()) console.log('[COMMUNITY API /forum/communities] OUTPUT', { categoryId: categoryId || null, count: data?.length || 0, ms: Date.now() - t0 })
  res.json(data || [])
})

router.post('/forum/community', async (req, res) => {
  if (!requireForumBackend(res)) return
  const userId = await getAuthUserId(req)
  if (!userId) return res.status(401).json({ error: 'Authentication required' })
  const name = String(req.body?.name || '').trim().slice(0, 120)
  const description = String(req.body?.description || '').trim().slice(0, 1200)
  const categoryId = String(req.body?.category_id || '').trim()
  if (!name || !categoryId) return res.status(400).json({ error: 'name and category_id are required' })
  const { data, error } = await supabaseAdmin
    .from('forum_communities')
    .insert([{ name, description, category_id: categoryId, creator_user_id: userId }])
    .select('*')
    .limit(1)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data?.[0] || null)
})

router.get('/forum/posts', async (req, res) => {
  if (!requireForumBackend(res)) return
  const t0 = Date.now()
  const communityId = String(req.query.community_id || '').trim()
  const category = String(req.query.category || '').trim()
  let query = supabaseAdmin
    .from('forum_posts')
    .select('id,user_id,community_id,category,title,content,created_at,upvotes,latitude,longitude')
    .order('created_at', { ascending: false })
  if (communityId) query = query.eq('community_id', communityId)
  if (category) query = query.eq('category', category)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  if (communityDebugEnabled()) console.log('[COMMUNITY API /forum/posts] OUTPUT', { communityId: communityId || null, category: category || null, count: data?.length || 0, ms: Date.now() - t0 })
  res.json(data || [])
})

router.get('/forum/post/:id', async (req, res) => {
  if (!requireForumBackend(res)) return
  const t0 = Date.now()
  const id = String(req.params.id || '').trim()
  if (!id) return res.status(400).json({ error: 'post id required' })
  const { data: postData, error: postError } = await supabaseAdmin
    .from('forum_posts')
    .select('*')
    .eq('id', id)
    .limit(1)
  if (postError) return res.status(500).json({ error: postError.message })
  const post = postData?.[0] || null
  if (!post) return res.status(404).json({ error: 'Post not found' })
  const { data: comments, error: commentError } = await supabaseAdmin
    .from('forum_comments')
    .select('*')
    .eq('post_id', id)
    .order('created_at', { ascending: true })
  if (commentError) return res.status(500).json({ error: commentError.message })
  const { data: links } = await supabaseAdmin
    .from('post_saved_links')
    .select('*')
    .eq('post_id', id)
  if (communityDebugEnabled()) console.log('[COMMUNITY API /forum/post/:id] OUTPUT', { found: !!post, comments: comments?.length || 0, links: links?.length || 0, ms: Date.now() - t0 })
  res.json({ post, comments: comments || [], links: links || [] })
})

router.post('/forum/post', async (req, res) => {
  if (!requireForumBackend(res)) return
  const userId = await getAuthUserId(req)
  if (!userId) return res.status(401).json({ error: 'Authentication required' })
  const title = String(req.body?.title || '').trim().slice(0, 240)
  const content = String(req.body?.content || '').trim()
  const communityId = String(req.body?.community_id || '').trim() || null
  const category = String(req.body?.category || '').trim() || null
  const latitude = req.body?.latitude != null ? Number(req.body.latitude) : null
  const longitude = req.body?.longitude != null ? Number(req.body.longitude) : null
  const linkedSaved = Array.isArray(req.body?.linked_saved_post_ids) ? req.body.linked_saved_post_ids : []
  if (!title || !content) return res.status(400).json({ error: 'title and content are required' })
  const insertRow = {
    user_id: userId,
    title,
    content,
    community_id: communityId,
    category,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  }
  const { data, error } = await supabaseAdmin
    .from('forum_posts')
    .insert([insertRow])
    .select('*')
    .limit(1)
  if (error) return res.status(500).json({ error: error.message })
  const post = data?.[0] || null
  if (post && linkedSaved.length) {
    const links = linkedSaved
      .filter((id) => id != null && String(id).trim())
      .map((id) => ({
        post_id: post.id,
        saved_post_id: String(id).trim(),
        user_id: userId,
      }))
    if (links.length) {
      const { error: linkError } = await supabaseAdmin.from('post_saved_links').insert(links)
      if (linkError) return res.status(500).json({ error: linkError.message, post })
    }
  }
  res.json(post)
})

router.post('/forum/comment', async (req, res) => {
  if (!requireForumBackend(res)) return
  const userId = await getAuthUserId(req)
  if (!userId) return res.status(401).json({ error: 'Authentication required' })
  const postId = String(req.body?.post_id || '').trim()
  const content = String(req.body?.content || '').trim().slice(0, 4000)
  const parentId = String(req.body?.parent_id || '').trim() || null
  if (!postId || !content) return res.status(400).json({ error: 'post_id and content are required' })
  const { data, error } = await supabaseAdmin
    .from('forum_comments')
    .insert([{ post_id: postId, user_id: userId, content, parent_id: parentId }])
    .select('*')
    .limit(1)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data?.[0] || null)
})

router.post('/forum/profile', async (req, res) => {
  if (!requireForumBackend(res)) return
  const userId = await getAuthUserId(req)
  if (!userId) return res.status(401).json({ error: 'Authentication required' })
  const displayName = String(req.body?.display_name || '').trim().slice(0, 80)
  const avatarUrl = String(req.body?.avatar_url || '').trim().slice(0, 600)
  const bio = String(req.body?.bio || '').trim().slice(0, 1200)
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .upsert([{
      user_id: userId,
      display_name: displayName,
      avatar_url: avatarUrl || null,
      bio,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'user_id', ignoreDuplicates: false })
    .select('*')
    .limit(1)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data?.[0] || null)
})

router.post('/category-request', async (req, res) => {
  if (!requireForumBackend(res)) return
  const userId = await getAuthUserId(req)
  if (!userId) return res.status(401).json({ error: 'Authentication required' })
  const categoryName = String(req.body?.category_name || '').trim().slice(0, 120)
  const description = String(req.body?.description || '').trim().slice(0, 1200)
  if (!categoryName) return res.status(400).json({ error: 'category_name is required' })
  const { data, error } = await supabaseAdmin
    .from('category_requests')
    .insert([{ user_id: userId, category_name: categoryName, description, status: 'pending' }])
    .select('*')
    .limit(1)
  if (error) return res.status(500).json({ error: error.message })
  if (mailer && ADMIN_EMAIL) {
    try {
      await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: ADMIN_EMAIL,
        subject: `SuperMap category request: ${categoryName}`,
        text: `User: ${userId}\nCategory: ${categoryName}\nDescription: ${description || '(none)'}`,
      })
    } catch (mailError) {
      console.warn('[API /category-request] email warning:', mailError.message)
    }
  }
  res.json(data?.[0] || null)
})

router.post('/category-approve', async (req, res) => {
  if (!requireForumBackend(res)) return
  const adminToken = String(req.headers['x-admin-token'] || '')
  if (!process.env.FORUM_ADMIN_TOKEN || adminToken !== process.env.FORUM_ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  const requestId = String(req.body?.request_id || '').trim()
  if (!requestId) return res.status(400).json({ error: 'request_id required' })
  const { data: requestRows, error: requestError } = await supabaseAdmin
    .from('category_requests')
    .select('*')
    .eq('id', requestId)
    .limit(1)
  if (requestError) return res.status(500).json({ error: requestError.message })
  const request = requestRows?.[0]
  if (!request) return res.status(404).json({ error: 'Request not found' })
  const { data: categoryRows, error: categoryError } = await supabaseAdmin
    .from('forum_categories')
    .upsert([{ name: request.category_name }], { onConflict: 'name', ignoreDuplicates: false })
    .select('*')
    .limit(1)
  if (categoryError) return res.status(500).json({ error: categoryError.message })
  const { error: updateError } = await supabaseAdmin
    .from('category_requests')
    .update({ status: 'approved' })
    .eq('id', requestId)
  if (updateError) return res.status(500).json({ error: updateError.message })
  res.json({ approved: true, category: categoryRows?.[0] || null })
})

/** Valid range/interval for Yahoo chart. interval chosen by range. */
const STOCK_RANGES = { '1d': '1h', '5d': '1d', '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1d', '2y': '1d' }
function normalizeStockRange(r) {
  const s = (r || '5d').toLowerCase()
  return STOCK_RANGES[s] ? s : '5d'
}

/** Format chart timestamps for display: time for 1d, short date for longer. */
function formatChartTimestamps(unixtimes, range) {
  if (!Array.isArray(unixtimes) || unixtimes.length === 0) return []
  const isIntraday = (range || '5d').toLowerCase() === '1d'
  return unixtimes.map((t) => {
    const d = new Date(t * 1000)
    return isIntraday
      ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })
}

/** Homepage widgets: stocks. Uses Finnhub (candles), else Alpha Vantage (quotes), else demo. Cache 2 min (demo) / 5 min (live). */
router.get('/stocks', async (req, res) => {
  let symbols = userConfig.getStockTickers()
  const querySymbols = (req.query.symbols || '').trim()
  if (querySymbols) {
    symbols = querySymbols.split(/[\s,]+/).filter(Boolean).map((s) => { const sym = s.trim(); return { symbol: sym, name: sym } })
  }
  if (!symbols.length) symbols = [{ symbol: 'SPY', name: 'S&P 500' }]
  const range = normalizeStockRange(req.query.range)
  const interval = STOCK_RANGES[range] || '1d'
  const cacheKey = 'stocks:' + range + ':' + symbols.map((s) => s.symbol).sort().join(',')
  const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true'
  const cached = !forceRefresh ? stocksCache.get(cacheKey) : null
  if (cached) return res.json({ ...cached, _cached: true })

  const FINNHUB_KEY = (process.env.FINNHUB_API_KEY || '').trim()
  const ALPHA_KEY = (process.env.ALPHAVANTAGE_API_KEY || '').trim()
  const now = Date.now()
  const timestamps = []
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now - i * 60 * 60 * 1000)
    timestamps.push(d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }))
  }

  const pushPayload = (payload, ttlSec = 300) => {
    stocksCache.set(cacheKey, payload, ttlSec)
    return res.json(payload)
  }

  // Keyless first: Yahoo Finance chart API + CoinGecko. No API keys, accurate data.
  const normalizeKeyless = (s) => {
    const raw = (s.symbol || '').toUpperCase().replace(/=F$/, '').trim()
    const name = (s.name || s.symbol || '').trim()
    const nameLower = name.toLowerCase()
    if (/^(CL|WTI|USO)$/.test(raw) || nameLower.includes('oil')) return { source: 'yahoo', symbol: 'USO', name: name || 'Oil (WTI)' }
    if (/^(GC|GLD)$/.test(raw) || nameLower.includes('gold')) return { source: 'yahoo', symbol: 'GLD', name: name || 'Gold' }
    if (/^(BTC|BTCUSD|BINANCE:BTCUSDT)$/.test(raw) || nameLower.includes('bitcoin')) return { source: 'coingecko', id: 'bitcoin', name: name || 'Bitcoin' }
    return { source: 'yahoo', symbol: raw || s.symbol, name: name || raw || s.symbol }
  }

  try {
    const keylessSymbols = symbols.slice(0, 5).map(normalizeKeyless)
    const current = []
    const series = []
    let chartTimestamps = null
    for (const n of keylessSymbols) {
      if (n.source === 'yahoo') {
        const chartRes = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(n.symbol)}?interval=${interval}&range=${range}`,
          { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }
        )
        const result = chartRes.data?.chart?.result?.[0]
        const meta = result?.meta
        const quote = result?.indicators?.quote?.[0]
        const price = meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? (Array.isArray(quote?.close) ? quote.close.filter((v) => v != null).pop() : null)
        const numPrice = price != null ? Number(price) : null
        const prevClose = meta?.previousClose ?? meta?.chartPreviousClose ?? null
        const numPrev = prevClose != null ? Number(prevClose) : null
        const closes = Array.isArray(quote?.close) ? quote.close.filter((v) => v != null) : []
        if (Array.isArray(result?.timestamp) && result.timestamp.length > 0 && !chartTimestamps) {
          chartTimestamps = formatChartTimestamps(result.timestamp, range)
        }
        const pct = (numPrice != null && numPrev != null && numPrev !== 0)
          ? (((numPrice - numPrev) / numPrev) * 100).toFixed(2) + '%'
          : (numPrice != null ? '0.00%' : '—')
        current.push({ symbol: n.name, value: numPrice != null ? Number(numPrice).toFixed(2) : '—', change: pct })
        series.push({
          name: n.name,
          values: closes.length ? closes : (numPrice != null ? [numPrice] : []),
        })
      } else if (n.source === 'coingecko') {
        const cgDays = { '1d': 1, '5d': 7, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 365 }[range] || 7
        const cgRes = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(n.id)}&vs_currencies=usd&include_24hr_change=true`,
          { timeout: 8000 }
        )
        const data = cgRes.data?.[n.id]
        const price = data?.usd != null ? Number(data.usd) : null
        const change24 = data?.usd_24h_change != null ? Number(data.usd_24h_change) : null
        const pct = change24 != null ? (change24 >= 0 ? '+' : '') + change24.toFixed(2) + '%' : (price != null ? '0.00%' : '—')
        current.push({ symbol: n.name, value: price != null ? Number(price).toFixed(2) : '—', change: pct })
        let sparkline = []
        try {
          const mcRes = await axios.get(
            `https://api.coingecko.com/api/v3/coins/${n.id}/market_chart?vs_currency=usd&days=${cgDays}`,
            { timeout: 6000 }
          )
          const prices = mcRes.data?.prices
          if (Array.isArray(prices) && prices.length > 0) {
            sparkline = prices.map((p) => p[1]).filter((v) => v != null)
            if (!chartTimestamps && prices.length > 0) {
              chartTimestamps = prices.map((p) => {
                const d = new Date(p[0])
                return range === '1d' ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              })
            }
          }
        } catch (_) { /* optional */ }
        series.push({ name: n.name, values: sparkline.length ? sparkline : (price != null ? [price] : []) })
      }
    }
    if (current.length > 0) {
      const want = chartTimestamps ? chartTimestamps.length : (range === '1d' ? 24 : 31)
      const padSeries = series.map((s) => {
        const vals = s.values
        if (vals.length >= want) return { ...s, values: vals.slice(-want) }
        return { ...s, values: [...Array(want - vals.length).fill(null), ...vals] }
      })
      const n = padSeries[0]?.values?.length || want
      const outTs = chartTimestamps && chartTimestamps.length >= n ? chartTimestamps.slice(-n) : (() => {
        const arr = []
        for (let i = 0; i < n; i++) {
          const d = new Date(now - (n - 1 - i) * (range === '1d' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000))
          arr.push(range === '1d' ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
        }
        return arr
      })()
      return pushPayload({
        timestamps: outTs,
        series: padSeries,
        current,
        updatedAt: new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }),
      })
    }
  } catch (err) {
    console.warn('[API /stocks] Keyless (Yahoo/CoinGecko) error:', err.message)
  }

  try {
    if (FINNHUB_KEY) {
      const series = []
      const current = []
      for (const s of symbols) {
        const candleRes = await axios.get(
          `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(s.symbol)}&resolution=60&from=${Math.floor((now - 24 * 60 * 60 * 1000) / 1000)}&to=${Math.floor(now / 1000)}&token=${FINNHUB_KEY}`,
          { timeout: 8000 }
        )
        const c = candleRes.data
        const values = Array.isArray(c?.c) ? c.c : []
        const v = values.length ? values[values.length - 1] : null
        const prev = values.length > 1 ? values[values.length - 2] : v
        const pct = (v != null && prev != null && prev !== 0) ? (((v - prev) / prev) * 100).toFixed(2) + '%' : (v != null ? '0.00%' : '—')
        series.push({ name: s.name || s.symbol, values: values.length ? values : Array(24).fill(null) })
        current.push({ symbol: s.name || s.symbol, value: v != null ? String(Number(v).toFixed(2)) : '—', change: pct })
      }
      return pushPayload({
        timestamps: timestamps.slice(-(series[0]?.values?.length || 24)),
        series,
        current,
        updatedAt: new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }),
      })
    }
  } catch (err) {
    console.warn('[API /stocks] Finnhub error:', err.message)
  }

  if (ALPHA_KEY) {
    try {
      // Map user tickers to Alpha Vantage–supported symbols. GLOBAL_QUOTE only supports equities;
      // use ETF proxies for oil/gold and CRYPTO_INTRADAY for Bitcoin.
      const normalizeTicker = (s) => {
        const raw = (s.symbol || '').toUpperCase().replace(/=F$/, '').trim()
        const name = (s.name || s.symbol || '').trim()
        const nameLower = name.toLowerCase()
        if (/^(CL|WTI|USO)$/.test(raw) || nameLower.includes('oil')) {
          return { api: 'quote', symbol: 'USO', name: name || 'Oil (WTI)' }
        }
        if (/^(GC|GLD)$/.test(raw) || nameLower.includes('gold')) {
          return { api: 'quote', symbol: 'GLD', name: name || 'Gold' }
        }
        if (/^(BTC|BTCUSD|BINANCE:BTCUSDT)$/.test(raw) || nameLower.includes('bitcoin')) {
          return { api: 'crypto', symbol: 'BTC', name: name || 'Bitcoin' }
        }
        return { api: 'quote', symbol: raw || s.symbol, name: name || raw || s.symbol }
      }

      const current = []
      const series = []
      const normalized = symbols.slice(0, 5).map(normalizeTicker)

      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      for (let i = 0; i < normalized.length; i++) {
        if (i > 0) await delay(350)
        const n = normalized[i]
        const displayName = n.name

        if (n.api === 'crypto') {
          const cryptoRes = await axios.get(
            `https://www.alphavantage.co/query?function=CRYPTO_INTRADAY&symbol=${n.symbol}&market=USD&interval=5min&apikey=${ALPHA_KEY}`,
            { timeout: 10000 }
          )
          const tsKey = Object.keys(cryptoRes.data || {}).find((k) => k.toLowerCase().includes('time series'))
          const timeSeries = tsKey ? cryptoRes.data[tsKey] : null
          const entries = timeSeries && typeof timeSeries === 'object'
            ? Object.entries(timeSeries)
              .sort((a, b) => new Date(a[0]) - new Date(b[0]))
              .slice(-24)
            : []
          const values = entries.map(([, v]) => (v && v['4. close'] != null) ? Number(v['4. close']) : null)
          const last = values.length ? values[values.length - 1] : null
          const prev = values.length > 1 ? values[values.length - 2] : last
          const pct = (last != null && prev != null && prev !== 0)
            ? (((last - prev) / prev) * 100).toFixed(2) + '%'
            : (last != null ? '0.00%' : '—')
          current.push({
            symbol: displayName,
            value: last != null ? Number(last).toFixed(2) : '—',
            change: pct,
          })
          series.push({
            name: displayName,
            values: values.length ? values : Array(24).fill(null),
          })
          continue
        }

        const q = await axios.get(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(n.symbol)}&apikey=${ALPHA_KEY}`,
          { timeout: 8000 }
        )
        const quote = q.data?.['Global Quote']
        const price = quote?.['05. price'] != null ? Number(quote['05. price']) : null
        const change = quote?.['09. change'] != null ? Number(quote['09. change']) : null
        const pct = quote?.['10. change percent'] != null ? String(quote['10. change percent']).replace('%', '').trim() + '%' : (price != null ? '0.00%' : '—')
        current.push({
          symbol: displayName,
          value: price != null ? price.toFixed(2) : '—',
          change: pct,
        })
        const base = price != null ? price : 0
        const vals = []
        for (let j = 0; j < 24; j++) vals.push(base + (j - 12) * (change != null ? change / 12 : 0))
        series.push({ name: displayName, values: vals })
      }

      if (current.length > 0) {
        return pushPayload({
          timestamps,
          series,
          current,
          updatedAt: new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }),
        })
      }
    } catch (err) {
      console.warn('[API /stocks] Alpha Vantage error:', err.message)
    }
  }

  const daySeed = Math.floor(now / (24 * 60 * 60 * 1000))
  const seeded = (i, j) => {
    const x = Math.sin(daySeed * 1000 + i * 7 + j * 13) * 10000
    return x - Math.floor(x)
  }
  const demoValues = (base, drift, symbolIndex) => {
    const out = []
    let v = base
    for (let j = 0; j < 24; j++) {
      v = v + (seeded(symbolIndex, j) - 0.48) * drift
      out.push(Number(v.toFixed(2)))
    }
    return out
  }
  const bases = [580, 72, 2650, 97500]
  const drifts = [4, 0.8, 6, 800]
  const series = symbols.slice(0, 8).map((s, i) => {
    const b = bases[i % bases.length]
    const d = drifts[i % drifts.length]
    return { name: s.name || s.symbol, values: demoValues(b, d, i) }
  })
  const current = series.map((s) => {
    const vals = s.values
    const v = vals[vals.length - 1]
    const prev = vals[vals.length - 2]
    const pct = (v != null && prev != null && prev !== 0) ? (((v - prev) / prev) * 100).toFixed(2) + '%' : (v != null ? '0.00%' : '—')
    return { symbol: s.name, value: v != null ? Number(v).toFixed(2) : '—', change: pct }
  })
  pushPayload({
    timestamps,
    series,
    current,
    updatedAt: new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }),
  }, 120)
})

const NAV_JUNK = /^(posts\s*navigation|more|report|next|previous|menu|home|search)$/i
function isOutageJunk(title) {
  if (!title || title.length < 4) return true
  const t = title.trim()
  if (NAV_JUNK.test(t)) return true
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t)) return true
  return false
}

/** Internet outage events. Cache 15 min. Tries NetBlocks; filters nav junk; fallback to DownDetector-style placeholder. */
router.get('/netblocks', async (req, res) => {
  const cacheKey = 'netblocks'
  const cached = netblocksCache.get(cacheKey)
  if (cached) return res.json({ ...cached, _cached: true })

  const events = []
  try {
    const reportRes = await axios.get('https://netblocks.org/reports/', { timeout: 10000, headers: { 'User-Agent': 'SuperMap/1.0' } })
    const html = reportRes.data && typeof reportRes.data === 'string' ? reportRes.data : ''
    let idx = 0
    for (const m of html.matchAll(/<article[\s\S]*?<h[23][^>]*>([\s\S]*?)<\/h[\d]>[\s\S]*?<time[^>]*>([^<]*)<\/time>/gi)) {
      const title = (m[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
      const time = (m[2] || '').trim().slice(0, 30)
      if (isOutageJunk(title)) continue
      events.push({ id: `nb-${idx++}`, country: title || 'Outage report', status: 'Outage', time: time || new Date().toLocaleDateString() })
    }
    const fromH2 = html.match(/<h2[^>]*>([^<]+)<\/h2>/gi)
    if (events.length === 0 && fromH2) {
      fromH2.slice(0, 8).forEach((t, i) => {
        const title = t.replace(/<[^>]+>/g, '').trim().slice(0, 60)
        if (!isOutageJunk(title)) events.push({ id: `nb-h2-${i}`, country: title, status: 'Report', time: new Date().toLocaleDateString() })
      })
    }
  } catch (err) {
    console.warn('[API /netblocks] fetch error:', err.message)
  }

  if (events.length === 0) {
    events.push(
      { id: 'nb-1', country: 'No structured outages', status: '—', time: new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }) },
      { id: 'nb-2', country: 'Check netblocks.org/reports', status: 'Source', time: '' },
    )
  }

  const payload = {
    events: events.slice(0, 10),
    updatedAt: new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }),
  }
  netblocksCache.set(cacheKey, payload)
  res.json(payload)
})

/** NASA space: EONET (global hazards), NASA News, optional APOD. Cache 1 hour. */
router.get('/space', async (req, res) => {
  const cacheKey = 'space'
  const cached = spaceCache.get(cacheKey)
  if (cached) return res.json({ ...cached, _cached: true })

  const NASA_KEY = (process.env.NASA_API_KEY || '').trim() || 'DEMO_KEY'
  const out = { updatedAt: new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }) }

  const prescribedFire = /prescribed\s*fire|rx\s*pcs|controlled\s*burn/i
  try {
    const eonetRes = await axios.get('https://eonet.gsfc.nasa.gov/api/v3/events?limit=20&status=open', { timeout: 10000 })
    const events = eonetRes.data?.events
    if (Array.isArray(events) && events.length > 0) {
      out.eonet = events
        .filter((e) => !prescribedFire.test(e.title || '') && !prescribedFire.test((e.categories?.[0]?.title || '')))
        .slice(0, 8)
        .map((e) => ({
          id: e.id,
          title: e.title || 'Event',
          category: e.categories?.[0]?.title || 'Natural',
          date: e.geometry?.[0]?.date || e.lastDate,
          closed: e.closed || null,
        }))
    }
  } catch (e) {
    console.warn('[API /space] EONET error:', e.message)
  }

  try {
    const parser = new Parser({ timeout: 8000 })
    const feed = await parser.parseURL('https://www.nasa.gov/rss/dyn/breaking_news.rss')
    if (feed?.items?.length) {
      out.nasaNews = feed.items.slice(0, 5).map((i) => ({
        title: (i.title || '').trim().slice(0, 120),
        link: i.link || i.guid || '',
      })).filter((i) => i.title)
    }
  } catch (e) {
    console.warn('[API /space] NASA News RSS error:', e.message)
  }

  try {
    const apodRes = await axios.get(`https://api.nasa.gov/planetary/apod?api_key=${NASA_KEY}`, { timeout: 8000 })
    if (apodRes.data && apodRes.data.url) {
      out.apod = { url: apodRes.data.url, title: apodRes.data.title || 'Image of the Day' }
    }
  } catch (e) {
    console.warn('[API /space] APOD error:', e.message)
  }

  spaceCache.set(cacheKey, out)
  res.json(out)
})

/** NIFC WFIGS: enrich wildfire with acres, containment %, discovery date. GET /api/wildfire-detail?name=Yellow&state=Texas */
const NIFC_WFIGS_QUERY = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query'
const STATE_NAME_TO_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT',
  Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME',
  Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
  Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
  'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
  Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN',
  Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
}
router.get('/wildfire-detail', async (req, res) => {
  const name = (req.query.name || req.query.q || '').trim().replace(/,.*$/, '').slice(0, 40)
  const stateRaw = (req.query.state || '').trim()
  const stateAbbr = stateRaw.length === 2 ? stateRaw.toUpperCase() : (STATE_NAME_TO_ABBR[stateRaw] || stateRaw.slice(0, 2).toUpperCase())
  if (!name) return res.json({ ok: false, nifc: null })

  try {
    let where = "poly_FeatureAccess = 'Public' AND poly_FeatureStatus = 'Approved' AND poly_IsVisible = 'Yes' AND poly_DeleteThis = 'No'"
    const esc = (s) => String(s).replace(/'/g, "''").slice(0, 50)
    if (name) where += ` AND (poly_IncidentName LIKE '%${esc(name)}%' OR attr_IncidentName LIKE '%${esc(name)}%')`
    if (stateAbbr && stateAbbr.length === 2) where += ` AND (attr_POOState = '${esc(stateAbbr)}' OR attr_POOState = ' ${esc(stateAbbr)}')`

    const resp = await axios.get(NIFC_WFIGS_QUERY, {
      timeout: 12000,
      params: {
        where,
        outFields: 'poly_IncidentName,attr_IncidentName,poly_GISAcres,attr_IncidentSize,attr_CalculatedAcres,attr_FinalAcres,attr_PercentContained,attr_FireDiscoveryDateTime,attr_POOState,attr_IncidentShortDescription',
        returnGeometry: false,
        resultRecordCount: 5,
        orderByFields: 'attr_IncidentSize DESC',
        f: 'json',
      },
    })
    const features = resp.data?.features || []
    const attrs = features[0]?.attributes
    if (!attrs) return res.json({ ok: true, nifc: null })

    const acres = attrs.poly_GISAcres ?? attrs.attr_IncidentSize ?? attrs.attr_CalculatedAcres ?? attrs.attr_FinalAcres
    const discovery = attrs.attr_FireDiscoveryDateTime ? new Date(attrs.attr_FireDiscoveryDateTime).toISOString() : null
    res.json({
      ok: true,
      nifc: {
        incidentName: attrs.poly_IncidentName || attrs.attr_IncidentName,
        acres: acres != null ? Math.round(Number(acres)) : null,
        percentContained: attrs.attr_PercentContained != null ? Math.round(Number(attrs.attr_PercentContained)) : null,
        discoveryDate: discovery,
        state: attrs.attr_POOState ? String(attrs.attr_POOState).trim() : null,
        description: attrs.attr_IncidentShortDescription ? String(attrs.attr_IncidentShortDescription).slice(0, 300) : null,
      },
    })
  } catch (e) {
    console.warn('[API /wildfire-detail] NIFC error:', e.message)
    res.json({ ok: false, nifc: null })
  }
})

/** US states + DC for gas price lookup. Order: name for dropdown. */
const US_GAS_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' }, { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' }, { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
]

router.get('/gas-prices/states', (_req, res) => {
  res.json(US_GAS_STATES)
})

/** Representative ZIP per state for GasBuddy fallback (one per state). */
const GASBUDDY_STATE_ZIPS = {
  AL: '35203', AK: '99501', AZ: '85001', AR: '72201', CA: '90210', CO: '80202', CT: '06101', DE: '19901',
  DC: '20001', FL: '33101', GA: '30301', HI: '96801', ID: '83701', IL: '60601', IN: '46201', IA: '50301',
  KS: '66101', KY: '40201', LA: '70112', ME: '04101', MD: '21201', MA: '02101', MI: '48201', MN: '55401',
  MS: '39101', MO: '63101', MT: '59101', NE: '68101', NV: '89101', NH: '03431', NJ: '07101', NM: '87101',
  NY: '10001', NC: '28201', ND: '58102', OH: '43201', OK: '73101', OR: '97201', PA: '19101', RI: '02901',
  SC: '29201', SD: '57101', TN: '37201', TX: '75201', UT: '84101', VT: '05401', VA: '23219', WA: '98101',
  WV: '25301', WI: '53201', WY: '82001',
}

const GASBUDDY_GRAPHQL_URLS = [
  'https://www.gasbuddy.com/graphql',
  'https://gasbuddy.com/graphql',
]

function parseGasBuddyTrends(data) {
  const loc = data?.data?.locationBySearchTerm
  const trends = loc?.trends ?? loc?.trend
  const arr = Array.isArray(trends) ? trends : (trends ? [trends] : [])
  const first = arr[0]
  if (!first) return null
  const price = first.today != null ? Number(first.today) : (first.todayLow != null ? Number(first.todayLow) : null)
  if (price == null || Number.isNaN(price)) return null
  return { price: Number(price.toFixed(2)), areaName: first.areaName || '' }
}

/** GasBuddy GraphQL: fetch price for a zip. Returns { price, areaName } or null. */
async function fetchGasBuddyPrice(searchTerm) {
  const body = {
    operationName: 'LocationBySearchTerm',
    variables: { fuel: 1, maxAge: 0, search: String(searchTerm || '') },
    query: `query LocationBySearchTerm($search: String, $fuel: Int, $maxAge: Int) {
  locationBySearchTerm(search: $search, fuel: $fuel, maxAge: $maxAge) {
    trends { areaName country today todayLow }
  }
}`,
  }
  const opts = {
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    validateStatus: () => true,
  }
  for (const url of GASBUDDY_GRAPHQL_URLS) {
    try {
      const res = await axios.post(url, body, opts)
      if (res.data?.errors?.length) {
        console.warn('[API /gas-prices] GasBuddy GraphQL errors:', res.data.errors[0]?.message || res.data.errors)
        continue
      }
      const parsed = parseGasBuddyTrends(res.data)
      if (parsed) return { ...parsed, areaName: parsed.areaName || searchTerm }
      if (res.status === 403 || res.status === 429) {
        console.warn('[API /gas-prices] GasBuddy', res.status, url)
        continue
      }
    } catch (err) {
      console.warn('[API /gas-prices] GasBuddy', url, err.message)
    }
  }
  return null
}

/** US gas prices: EIA when key set; else GasBuddy (no key). Real data only. */
router.get('/gas-prices', async (req, res) => {
  const stateCode = (req.query.state || '').trim().toUpperCase().slice(0, 2)
  const zip = (req.query.zip || '').trim().slice(0, 10)
  const cacheKey = stateCode ? `gas-prices:${stateCode}` : zip ? `gas-prices:zip:${zip}` : 'gas-prices'
  const cached = gasPricesCache.get(cacheKey)
  if (cached) return res.json({ ...cached, _cached: true })

  const EIA_KEY = (process.env.EIA_API_KEY || '').trim()
  const unit = 'USD/gal'
  const updatedAt = new Date().toLocaleTimeString(undefined, { timeStyle: 'short' })

  const emptyPayload = (opts = {}) => {
    const { requiresEiaKey = false, gasUnavailable = false } = opts
    const payload = {
      national: null,
      unit,
      regions: [],
      states: [],
      requiresEiaKey,
      gasUnavailable,
      updatedAt,
    }
    gasPricesCache.set(cacheKey, payload)
    return res.json(payload)
  }

  if (!EIA_KEY) {
    const defaultZip = (process.env.GASBUDDY_DEFAULT_ZIP || '10001').trim()
    const searchTerm = stateCode && GASBUDDY_STATE_ZIPS[stateCode]
      ? GASBUDDY_STATE_ZIPS[stateCode]
      : zip || defaultZip
    const gasbuddy = await fetchGasBuddyPrice(searchTerm)
    if (gasbuddy) {
      const st = stateCode ? US_GAS_STATES.find((s) => s.code === stateCode) : null
      const payload = {
        national: gasbuddy.price,
        unit,
        regions: [],
        states: stateCode && st ? [{ code: stateCode, name: st.name, price: gasbuddy.price }] : [],
        updatedAt,
      }
      gasPricesCache.set(cacheKey, payload)
      return res.json(payload)
    }
    return emptyPayload({ gasUnavailable: true })
  }

  let nationalVal = null
  let statePrice = null

  // EIA API v2: petroleum/pri/gnd weekly retail price. Revised endpoint with X-Params header.
  const eiaV2Base = 'https://api.eia.gov/v2/petroleum/pri/gnd/data/'
  const eiaV2XParams = JSON.stringify({
    frequency: 'weekly',
    data: ['value'],
    facets: {},
    start: null,
    end: null,
    sort: [{ column: 'period', direction: 'desc' }],
    offset: 0,
    length: 5000,
  })
  const eiaV2Params = new URLSearchParams({
    frequency: 'weekly',
    'data[0]': 'value',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    offset: '0',
    length: '5000',
    api_key: EIA_KEY,
  })
  try {
    const v2Res = await axios.get(`${eiaV2Base}?${eiaV2Params.toString()}`, {
      timeout: 10000,
      headers: {
        'X-Api-Key': EIA_KEY,
        'X-Params': eiaV2XParams,
        Accept: 'application/json',
      },
    })
    const v2Data = v2Res.data?.response?.data ?? v2Res.data?.data
    const v2Rows = Array.isArray(v2Data) ? v2Data : []
    const latestRow = v2Rows[0]
    if (latestRow && (latestRow.value != null || latestRow.Value != null)) {
      const val = latestRow.value ?? latestRow.Value
      nationalVal = Number(val)
    }
    if (nationalVal != null && !Number.isNaN(nationalVal)) nationalVal = Number(nationalVal.toFixed(2))
  } catch (err) {
    console.warn('[API /gas-prices] EIA v2 error:', err.message)
  }

  // Fallback: EIA v1 series for national if v2 did not return a value
  if (nationalVal == null || Number.isNaN(nationalVal)) {
    try {
      const eiaRes = await axios.get(
        `https://api.eia.gov/series/?api_key=${EIA_KEY}&series_id=PET.EER_EPMRU_PF4_Y35US_DPG.W`,
        { timeout: 10000 }
      )
      const series = eiaRes.data?.series?.[0]
      const data = series?.data
      const latest = Array.isArray(data) && data.length ? data[0] : null
      if (latest != null && latest[1] != null) nationalVal = Number(Number(latest[1]).toFixed(2))
    } catch (err) {
      console.warn('[API /gas-prices] EIA v1 national error:', err.message)
    }
  }

  // State: v2 gnd may return multiple areas in same dataset; otherwise use v1 state series
  if (stateCode && US_GAS_STATES.some((s) => s.code === stateCode)) {
    try {
      const v2StateParams = new URLSearchParams({
        frequency: 'weekly',
        'data[0]': 'value',
        'sort[0][column]': 'period',
        'sort[0][direction]': 'desc',
        offset: '0',
        length: '5000',
        api_key: EIA_KEY,
      })
      const v2StateRes = await axios.get(`${eiaV2Base}?${v2StateParams.toString()}`, {
        timeout: 10000,
        headers: { 'X-Api-Key': EIA_KEY, 'X-Params': eiaV2XParams, Accept: 'application/json' },
      })
      const v2StateData = v2StateRes.data?.response?.data ?? v2StateRes.data?.data
      const v2StateRows = Array.isArray(v2StateData) ? v2StateData : []
      const stateRow = v2StateRows.find((r) => (r.area || r.Area || r.state || r.State) === stateCode) ?? v2StateRows[0]
      if (stateRow && (stateRow.value != null || stateRow.Value != null)) {
        const val = stateRow.value ?? stateRow.Value
        statePrice = Number(val)
      }
      if (statePrice != null && !Number.isNaN(statePrice)) statePrice = Number(statePrice.toFixed(2))
    } catch (err) {
      console.warn('[API /gas-prices] EIA v2 state error:', err.message)
    }
    if (statePrice == null || Number.isNaN(statePrice)) {
      try {
        const stateRes = await axios.get(
          `https://api.eia.gov/series/?api_key=${EIA_KEY}&series_id=PET.EER_EPMRU_PF4_Y35${stateCode}_DPG.W`,
          { timeout: 10000 }
        )
        const stateSeries = stateRes.data?.series?.[0]
        const stateData = stateSeries?.data
        const stateLatest = Array.isArray(stateData) && stateData.length ? stateData[0] : null
        if (stateLatest != null && stateLatest[1] != null) statePrice = Number(Number(stateLatest[1]).toFixed(2))
      } catch (err) {
        console.warn('[API /gas-prices] EIA v1 state error:', err.message)
      }
    }
  }

  const st = stateCode ? US_GAS_STATES.find((s) => s.code === stateCode) : null
  const payload = {
    national: nationalVal != null ? Number(nationalVal.toFixed(2)) : null,
    unit,
    regions: [],
    updatedAt,
  }
  if (stateCode && st) {
    payload.states = statePrice != null
      ? [{ code: stateCode, name: st.name, price: Number(statePrice.toFixed(2)) }]
      : []
  } else {
    payload.states = []
  }

  gasPricesCache.set(cacheKey, payload)
  res.json(payload)
})

/** Conflict / intel metrics from ingested events (last 24h). Chart by event type (primary); optional by region. Cache 10 min. */
router.get('/conflict-metrics', (req, res) => {
  const cacheKey = 'conflict-metrics'
  const cached = conflictMetricsCache.get(cacheKey)
  if (cached) return res.json({ ...cached, _cached: true })

  try {
    const since = Date.now() - 24 * 60 * 60 * 1000
    const rows = getEventsWithAnyTagInTimeRange(
      ['geopolitics', 'war', 'conflict', 'military', 'osint', 'intelligence', 'security', 'cyber'],
      since,
      500
    )
    if (rows.length === 0) {
      const any = getEvents(200, since, null, null, null)
      rows.push(...any)
    }

    const byType = {}
    const byCountry = {}
    for (const r of rows) {
      const type = (r.type || 'event').trim() || 'event'
      byType[type] = (byType[type] || 0) + 1
      let raw = {}
      try {
        raw = r.raw_data ? (typeof r.raw_data === 'string' ? JSON.parse(r.raw_data) : r.raw_data) : {}
      } catch (_) {}
      const country = (raw.countryCode || raw.country || 'Unspecified').toString().trim() || 'Unspecified'
      byCountry[country] = (byCountry[country] || 0) + 1
    }

    const byTypeList = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([type, count]) => ({ type, count }))

    const byRegion = Object.entries(byCountry)
      .filter(([name]) => name.toLowerCase() !== 'unknown' && name.toLowerCase() !== 'unspecified')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([region, count]) => ({ region, count }))

    const cyber = rows.filter((r) => (r.type || '').toLowerCase().includes('cyber') || (r.title || '').toLowerCase().includes('cyber')).length
    const military = rows.filter((r) => (r.type || '').toLowerCase().includes('military') || (r.title || '').toLowerCase().includes('military')).length

    const headlines = rows
      .slice(0, 5)
      .map((r) => (r.title || '').trim().slice(0, 80))
      .filter(Boolean)

    const payload = {
      totals: { events: rows.length, cyber, military },
      byType: byTypeList.length ? byTypeList : null,
      byRegion: byRegion.length ? byRegion : null,
      headlines: headlines.length ? headlines : null,
      updatedAt: new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }),
    }
    conflictMetricsCache.set(cacheKey, payload)
    res.json(payload)
  } catch (err) {
    console.error('[API /conflict-metrics]', err.message)
    res.status(500).json({
      error: err.message,
      totals: { events: 0 },
      updatedAt: new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }),
    })
  }
})

module.exports = router
