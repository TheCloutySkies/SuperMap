/**
 * Sources the API never served before: they were fetched straight from the
 * browser by MapView / CommunityMapView / LiveuamapRssWidget on every visitor.
 *
 * Each getter returns a display-ready payload; the collector records its ETag and
 * Last-Modified so an unchanged feed costs a 304 next run.
 */
const { fetchWithEtag } = require('./snapshotHttp')
const safety = require('./safety')
const hazards = require('./hazards')

const EMPTY = { type: 'FeatureCollection', features: [] }

function userAgentHeaders() {
  return { 'User-Agent': 'SuperMap/1.0 (+https://github.com/TheCloutySkies/SuperMap)' }
}

/** Planetary K index from SWPC (space weather). */
async function getSpaceWeather({ etag = null, lastModified = null } = {}) {
  const res = await fetchWithEtag('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', {
    timeoutMs: 15000,
    etag,
    lastModified,
  })
  if (res.notModified) return res
  const rows = Array.isArray(res.data) ? res.data : []
  if (rows.length < 2) throw new Error('SWPC returned no rows')
  const latest = rows[rows.length - 1]
  const kp = parseFloat(latest[1]) || 0
  let label = 'Quiet'
  if (kp >= 5) label = `Storm G${Math.min(5, Math.floor(kp) - 4)}`
  else if (kp >= 4) label = 'Active'
  else if (kp >= 3) label = 'Unsettled'
  return {
    ...res,
    data: { kp, label, time: latest[0] || null, fetchedAt: new Date().toISOString() },
  }
}

/** IODA internet outages. The browser keeps its country-centroid transform. */
async function getInternetOutages({ etag = null, lastModified = null } = {}) {
  const now = Math.floor(Date.now() / 1000)
  const from = now - 60 * 60
  const url = 'https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts'
    + `?entityType=country&datasource=bgp&from=${from}&until=${now}&limit=500`
  const res = await fetchWithEtag(url, { timeoutMs: 20000, etag, lastModified })
  if (res.notModified) return res
  const entries = Array.isArray(res.data?.data) ? res.data.data : []
  return {
    ...res,
    data: { data: entries, fetchedAt: new Date().toISOString() },
  }
}

/** DeepState frontline as published (the browser keeps its describeFrontline transform). */
async function getUkraineFrontline({ etag = null, lastModified = null } = {}) {
  const res = await fetchWithEtag('https://deepstatemap.live/api/history/last', {
    timeoutMs: 20000,
    etag,
    lastModified,
  })
  if (res.notModified) return res
  return {
    ...res,
    data: { ...(res.data || {}), fetchedAt: new Date().toISOString() },
  }
}

/** Liveuamap RSS, parsed server-side into the item shape the widget renders. */
async function getLiveuamap({ etag = null, lastModified = null } = {}) {
  const Parser = require('rss-parser')
  const parser = new Parser({ headers: userAgentHeaders() })
  const res = await fetchWithEtag('https://liveuamap.com/rss', {
    timeoutMs: 20000,
    responseType: 'text',
    etag,
    lastModified,
    headers: userAgentHeaders(),
  })
  if (res.notModified) return res
  const feed = await parser.parseString(String(res.data || ''))
  const items = (feed.items || []).slice(0, 40).map((item) => ({
    title: item.title || '',
    link: item.link || '',
    description: item.contentSnippet || item.content || item.summary || '',
    pubDate: item.isoDate || item.pubDate || null,
  }))
  return { ...res, data: { items, fetchedAt: new Date().toISOString() } }
}

/** ATLAS data centers (data-center-map.com, GitHub pack as the fallback). */
async function getDatacenters({ etag = null, lastModified = null } = {}) {
  try {
    const res = await fetchWithEtag('https://data-center-map.com/api/all', {
      timeoutMs: 25000,
      etag,
      lastModified,
    })
    if (res.notModified) return res
    const raw = Array.isArray(res.data) ? res.data : (res.data?.results ?? res.data?.data ?? null)
    if (Array.isArray(raw) && raw.length) return { ...res, data: { records: raw } }
  } catch (err) {
    console.warn('[snapshotSources] datacenters api:', err.message)
  }
  const res = await fetchWithEtag('https://raw.githubusercontent.com/ringmast4r/Data-Center-Map---Global/main/datacenters_cleaned.json', {
    timeoutMs: 25000,
    etag,
    lastModified,
  })
  if (res.notModified) return res
  const raw = Array.isArray(res.data) ? res.data : (res.data?.results ?? [])
  return { ...res, data: { records: raw } }
}

/** EFF Atlas of Surveillance: published as the raw CSV + city coordinates. */
async function getSurveillance({ etag = null, lastModified = null } = {}) {
  const [csv, coords] = await Promise.all([
    fetchWithEtag('https://raw.githubusercontent.com/ringmast4r/surveillance-capabilities-map/main/atlas-of-surveillance.csv', {
      timeoutMs: 25000,
      responseType: 'text',
      etag,
      lastModified,
    }),
    fetchWithEtag('https://raw.githubusercontent.com/ringmast4r/surveillance-capabilities-map/main/city_coords.json', {
      timeoutMs: 25000,
    }).catch(() => ({ data: {} })),
  ])
  if (csv.notModified) return csv
  return {
    ...csv,
    data: { csv: String(csv.data || ''), cityCoords: coords?.data || {}, fetchedAt: new Date().toISOString() },
  }
}

/** NASA FIRMS world VIIRS detections as points. The key never reaches the browser. */
async function getFirms({ etag = null, lastModified = null } = {}) {
  const key = String(process.env.FIRMS_MAP_KEY || '').trim()
  if (!key) {
    const err = new Error('FIRMS_MAP_KEY is not set')
    err.gated = true
    throw err
  }
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_NOAA20_NRT/world/1`
  const res = await fetchWithEtag(url, { timeoutMs: 30000, responseType: 'text', etag: lastModified, headers: userAgentHeaders() })
  if (res.notModified) return res
  const lines = String(res.data || '').trim().split('\n')
  if (lines.length < 2) return { ...res, data: { type: 'FeatureCollection', features: [] } }
  const header = lines[0].split(',').map((h) => h.trim())
  const latIdx = header.indexOf('latitude')
  const lonIdx = header.indexOf('longitude')
  const confIdx = header.indexOf('confidence')
  const dateIdx = header.indexOf('acq_date')
  if (latIdx === -1 || lonIdx === -1) throw new Error('FIRMS CSV has no latitude/longitude')
  const features = []
  for (const line of lines.slice(1)) {
    const cells = line.split(',')
    const lat = Number(cells[latIdx])
    const lon = Number(cells[lonIdx])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    features.push({
      type: 'Feature',
      properties: {
        confidence: confIdx >= 0 ? cells[confIdx] : null,
        date: dateIdx >= 0 ? cells[dateIdx] : null,
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })
  }
  return { ...res, data: { type: 'FeatureCollection', features } }
}

/** Utility power outages (ArcGIS feature service). */
async function getUtilityOutages({ etag = null, lastModified = null } = {}) {
  const url = 'https://services.arcgis.com/BLN4oKB0N1YSgvY8/arcgis/rest/services/'
    + 'Power_Outages_(View)/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson'
  const res = await fetchWithEtag(url, { timeoutMs: 25000, etag, lastModified })
  if (res.notModified) return res
  const data = res.data
  return { ...res, data: data?.type === 'FeatureCollection' ? data : EMPTY }
}

/** One collection for the community map's hazard layer, assembled server-side. */
function asCollection(value) {
  if (!value) return EMPTY
  if (value.type === 'FeatureCollection') return value
  if (Array.isArray(value?.features)) return { type: 'FeatureCollection', features: value.features }
  return EMPTY
}

async function getMajorHazards({ etag = null } = {}) {
  if (etag) return { notModified: true, etag }
  const [quakes, emsc, volcanoes, nhc] = await Promise.allSettled([
    safety.getEarthquakes({ minmagnitude: 4.5, limit: 200 }),
    hazards.getEmscEarthquakes({ minmag: 4 }),
    hazards.getUsgsVolcanoes({}),
    hazards.getNhcTropical({}),
  ])
  const pick = (settled) => (settled.status === 'fulfilled' ? asCollection(settled.value) : EMPTY)
  const features = [
    ...pick(quakes).features,
    ...pick(emsc).features,
    ...pick(volcanoes).features,
    ...pick(nhc).features,
  ]
  return {
    data: { type: 'FeatureCollection', features, fetchedAt: new Date().toISOString() },
    etag: null,
    notModified: false,
  }
}

module.exports = {
  getSpaceWeather,
  getInternetOutages,
  getUkraineFrontline,
  getLiveuamap,
  getDatacenters,
  getSurveillance,
  getFirms,
  getUtilityOutages,
  getMajorHazards,
}
