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
const { getEventsForSearch, getEvents, getSignalEvents, getEventTagNames } = require('../database')
const { PRIORITY_ORDER } = require('../services/osintXFeedService')
const { correlate } = require('../services/correlation')
const rapidApi = require('../services/rapidApi')
const userConfig = require('../config/userConfig')
const { extractPlaces, geocodePlace } = require('../services/geotagger')
const { normalizeToEvent, ingestEvent, eventToFeature } = require('../services/ingest')
const crypto = require('crypto')
const { getAllCameras } = require('../camera-discovery/storage/saveCamera')
const { loadSeedCameras } = require('../camera-discovery/storage/cameraSeeds')

const searchCache = new NodeCache({ stdTTL: 15 })
const geocodeCache = new NodeCache({ stdTTL: 24 * 60 * 60, checkperiod: 120 })
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || ''
const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY || ''

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
  try {
    const cached = newsService.getNewsCached()
    if (cached && Array.isArray(cached.features) && cached.features.length > 0) {
      return res.json(cached)
    }
    const items = await newsService.getNews()
    return res.json(items)
  } catch (err) {
    console.error('[API /news]', err.message)
    res.status(500).json({ error: 'Failed to fetch news' })
  }
})

router.get('/osint', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200)
    const data = osintService.getOsintFromDb(limit)
    res.json(data)
  } catch (err) {
    console.error('[API /osint]', err.message)
    res.status(500).json({ error: 'Failed to fetch OSINT' })
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

/** OSINT X (Twitter RSS) feed: GET /api/osint-x?limit=100 */
router.get('/osint-x', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200)
    const rows = getEvents(limit, null, null, null, null, ['x'])
    const posts = rows.map((r) => {
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
    res.json(posts)
  } catch (err) {
    console.error('[API /osint-x]', err.message)
    res.status(500).json({ error: 'Failed to fetch OSINT X' })
  }
})

/** Live Reddit comment signals: GET /api/reddit-signals?limit=50 */
router.get('/reddit-signals', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200)
    const rows = getSignalEvents(limit)
    const signals = rows.map((r) => {
      let raw = {}
      try {
        raw = r.raw_data ? JSON.parse(r.raw_data) : {}
      } catch (_) {}
      const tags = (r.tagsStr || '').split(/\s+/).filter(Boolean)
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        subreddit: raw.subreddit || 'reddit',
        author: raw.author,
        score: raw.score,
        signals: raw.signals || tags,
        signalScore: raw.signalScore,
        confidence: raw.confidence || 'low',
        link: raw.link,
        timestamp: r.timestamp,
        lat: r.lat,
        lon: r.lon,
      }
    })
    res.json(signals)
  } catch (err) {
    console.error('[API /reddit-signals]', err.message)
    res.status(500).json({ error: 'Failed to fetch Reddit signals' })
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
  if (!rapidApi.requireKey(res)) return
  const { station, start, end, tz } = req.query
  try {
    const { body, error } = await rapidApi.fetchMeteostatHourly({
      station: station || '10637',
      start: start || new Date().toISOString().slice(0, 10),
      end: end || new Date().toISOString().slice(0, 10),
      tz: tz || 'America/New_York',
    })
    if (error) return res.status(502).json({ error, body: null })
    res.json(body || {})
  } catch (err) {
    console.error('[API /weather/hourly]', err.message)
    res.status(500).json({ error: err.message })
  }
})

/** Meteostat nearby station (for weather by lat/lon). GET /api/weather/nearby?lat=40&lon=-74 */
router.get('/weather/nearby', async (req, res) => {
  if (!rapidApi.requireKey(res)) return
  const lat = req.query.lat != null ? parseFloat(req.query.lat) : null
  const lon = req.query.lon != null ? parseFloat(req.query.lon) : null
  try {
    const { body, error } = await rapidApi.fetchMeteostatNearest(lat, lon)
    if (error) return res.status(502).json({ error, body: null })
    res.json(body || {})
  } catch (err) {
    console.error('[API /weather/nearby]', err.message)
    res.status(500).json({ error: err.message })
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

/** SearXNG search (set SEARXNG_URL in .env to your instance, or uses default public). */
const SEARXNG_URL = (process.env.SEARXNG_URL || 'https://search.bus-hit.me').replace(/\/$/, '')
router.get('/search/searxng', async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'q required' })
  try {
    const { data } = await axios.get(`${SEARXNG_URL}/search`, {
      params: { q, format: 'json' },
      headers: { 'Accept': 'application/json' },
      timeout: 15000,
    })
    const results = data.results || []
    res.json({ results, query: data.query || q })
  } catch (err) {
    console.warn('[API /search/searxng]', err.message)
    res.status(502).json({ error: 'Search failed. Set SEARXNG_URL to your SearXNG instance if needed.' })
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

module.exports = router
