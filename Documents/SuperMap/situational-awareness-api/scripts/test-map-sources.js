#!/usr/bin/env node
/**
 * HTTP smoke-test for SuperMap MAPS tab Express routes + client upstreams.
 * Usage: node scripts/test-map-sources.js [apiBase]
 */
const API = (process.argv[2] || 'http://127.0.0.1:3001').replace(/\/$/, '')
const UA = 'SuperMap-map-sources-test/1.0'
const results = []

function record(name, ok, detail) {
  results.push({ name, ok, detail: String(detail || '').slice(0, 180) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function req(url, opts = {}) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), opts.timeoutMs || 45000)
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { 'User-Agent': UA, ...(opts.headers || {}) },
      redirect: 'follow',
    })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch (_) {}
    return { status: res.status, ok: res.ok, text, json, headers: res.headers }
  } finally {
    clearTimeout(t)
  }
}

function featureCount(json) {
  if (!json) return 0
  if (Array.isArray(json.features)) return json.features.length
  if (Array.isArray(json.ac)) return json.ac.length
  if (Array.isArray(json.aircraft)) return json.aircraft.length
  if (Array.isArray(json.data)) return json.data.length
  if (Array.isArray(json.items)) return json.items.length
  if (Array.isArray(json.events)) return json.events.length
  if (Array.isArray(json)) return json.length
  if (json.type === 'FeatureCollection') return 0
  return -1
}

async function testApi(path, { minFeatures = 0, allowEmpty = false, expectOk = true } = {}) {
  const url = `${API}${path}`
  try {
    const r = await req(url)
    const n = featureCount(r.json)
    const bodyHint = r.json
      ? (n >= 0 ? `features=${n}` : `keys=${Object.keys(r.json).slice(0, 6).join(',')}`)
      : `body=${(r.text || '').slice(0, 60)}`
    if (!r.ok && expectOk) {
      record(`API ${path}`, false, `HTTP ${r.status} ${bodyHint}`)
      return
    }
    if (!allowEmpty && minFeatures > 0 && n >= 0 && n < minFeatures) {
      record(`API ${path}`, false, `HTTP ${r.status} too few: ${bodyHint}`)
      return
    }
    // Empty FeatureCollection with allowEmpty still PASS (key-gated etc. marked separately)
    record(`API ${path}`, true, `HTTP ${r.status} ${bodyHint}`)
  } catch (e) {
    record(`API ${path}`, false, e.message || e)
  }
}

async function testHeadOrGet(name, url, { method = 'GET' } = {}) {
  try {
    const r = await req(url, { method, timeoutMs: 25000 })
    // Some CDNs reject HEAD; treat 2xx/3xx or non-empty body as pass
    const ok = r.status >= 200 && r.status < 400
    record(name, ok, `HTTP ${r.status} len=${(r.text || '').length}`)
  } catch (e) {
    record(name, false, e.message || e)
  }
}

async function testFirms() {
  const key = '09415b5df0304c3802335984b511c111'
  // Free keys often only allow `world` area; app fetches world then filters by bbox.
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_NOAA20_NRT/world/1`
  try {
    const r = await req(url, { timeoutMs: 30000 })
    const lines = (r.text || '').trim().split('\n').filter(Boolean)
    const ok = r.ok && lines.length > 1
    record('Client NASA FIRMS world', ok, `HTTP ${r.status} lines=${lines.length}`)
  } catch (e) {
    record('Client NASA FIRMS world', false, e.message || e)
  }
}

async function testDeepState() {
  try {
    const r = await req('https://deepstatemap.live/api/history/last', { timeoutMs: 20000 })
    const fc = r.json?.map || r.json?.geojson || r.json
    const n = Array.isArray(fc?.features) ? fc.features.length : -1
    record('Client DeepState frontline', r.ok && n > 0, `HTTP ${r.status} features=${n}`)
  } catch (e) {
    record('Client DeepState frontline', false, e.message || e)
  }
}

async function testDatacenters() {
  try {
    const r = await req('https://data-center-map.com/api/all', { timeoutMs: 20000 })
    const n = Array.isArray(r.json?.results) ? r.json.results.length : (Array.isArray(r.json) ? r.json.length : -1)
    record('Client Datacenters primary', r.ok && n > 0, `HTTP ${r.status} n=${n}`)
  } catch (e) {
    record('Client Datacenters', false, e.message || e)
  }
}

async function testOverpass() {
  // Tiny bbox around Manhattan — power infrastructure
  const query = `[out:json][timeout:25];(way["power"~"line|cable"](40.70,-74.05,40.80,-73.90);node["power"~"substation|plant"](40.70,-74.05,40.80,-73.90););out body geom 20;`
  try {
    const r = await req('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      timeoutMs: 45000,
    })
    const n = r.json?.elements?.length ?? 0
    record('Client Overpass', r.ok && n > 0, `HTTP ${r.status} elements=${n}`)
  } catch (e) {
    record('Client Overpass', false, e.message || e)
  }
}

async function testGdacs() {
  try {
    const r = await req('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH', { timeoutMs: 25000 })
    const n = featureCount(r.json)
    record('Client GDACS', r.ok && n > 0, `HTTP ${r.status} features=${n}`)
  } catch (e) {
    record('Client GDACS', false, e.message || e)
  }
}

async function testRainviewer() {
  try {
    const r = await req('https://api.rainviewer.com/public/weather-maps.json')
    const host = r.json?.host
    const path = r.json?.radar?.past?.slice(-1)?.[0]?.path || r.json?.radar?.nowcast?.[0]?.path
    record('Client RainViewer meta', !!(r.ok && host), `HTTP ${r.status} host=${host || 'none'} path=${path || 'none'}`)
  } catch (e) {
    record('Client RainViewer meta', false, e.message || e)
  }
}

async function testIoda() {
  const now = Math.floor(Date.now() / 1000)
  const from = now - 3600
  const url = `https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts?entityType=country&datasource=bgp&from=${from}&until=${now}&limit=500`
  try {
    const r = await req(url)
    const n = Array.isArray(r.json?.data) ? r.json.data.length : -1
    record('Client IODA', r.ok, `HTTP ${r.status} data=${n}`)
  } catch (e) {
    record('Client IODA', false, e.message || e)
  }
}

async function testUtilityOutages() {
  const url =
    'https://services.arcgis.com/BLN4oKB0N1YSgvY8/arcgis/rest/services/Power_Outages_(View)/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=50'
  try {
    const r = await req(url, { timeoutMs: 25000 })
    const n = featureCount(r.json)
    record('Client ArcGIS utility outages', r.ok && n >= 0, `HTTP ${r.status} features=${n}`)
  } catch (e) {
    record('Client ArcGIS utility outages', false, e.message || e)
  }
}

async function testSurveillance() {
  try {
    const csv = await req('https://raw.githubusercontent.com/ringmast4r/surveillance-capabilities-map/main/atlas-of-surveillance.csv', { timeoutMs: 20000 })
    const coords = await req('https://raw.githubusercontent.com/ringmast4r/surveillance-capabilities-map/main/city_coords.json', { timeoutMs: 20000 })
    const ok = csv.ok && coords.ok && (csv.text || '').length > 100
    record('Client Surveillance CSV+coords', ok, `csv=${csv.status} coords=${coords.status}`)
  } catch (e) {
    record('Client Surveillance', false, e.message || e)
  }
}

async function testUsgsDirect() {
  try {
    const r = await req('https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=20', { timeoutMs: 20000 })
    const n = featureCount(r.json)
    record('Client USGS earthquakes', r.ok && n > 0, `HTTP ${r.status} features=${n}`)
  } catch (e) {
    record('Client USGS earthquakes', false, e.message || e)
  }
}

async function testAdsbLol() {
  try {
    const r = await req('https://api.adsb.lol/v2/mil', { timeoutMs: 20000 })
    const n = featureCount(r.json)
    record('Client adsb.lol /v2/mil', r.ok && n > 0, `HTTP ${r.status} aircraft=${n}`)
  } catch (e) {
    record('Client adsb.lol /v2/mil', false, e.message || e)
  }
}

async function testUsStates() {
  try {
    const r = await req('https://cdn.jsdelivr.net/gh/PublicaMundi/MappingAPI@master/data/geojson/us-states.json', { timeoutMs: 20000 })
    const n = featureCount(r.json)
    record('Client US states GeoJSON', r.ok && n > 40, `HTTP ${r.status} features=${n}`)
  } catch (e) {
    record('Client US states GeoJSON', false, e.message || e)
  }
}

async function main() {
  console.log(`API base: ${API}\n--- Express map routes ---`)
  await testApi('/api/news', { allowEmpty: true })
  await testApi('/api/osint', { allowEmpty: true })
  await testApi('/api/events?highConfidenceOnly=1&limit=50', { allowEmpty: true })
  await testApi('/api/earthquakes', { minFeatures: 1 })
  await testApi('/api/adsb/mil', { minFeatures: 1 })
  await testApi('/api/fcc/towers?bbox=-74.05,40.70,-73.90,40.80', { allowEmpty: true })
  await testApi('/api/geocode?q=London', { allowEmpty: false })
  await testApi('/api/cameras', { allowEmpty: true })
  await testApi('/api/crime/stats')
  await testApi('/api/crime/states')
  await testApi('/api/crime/cities?limit=5')
  await testApi('/api/crime/national-trends')
  await testApi('/api/crime/types')
  await testApi('/api/crime/arrests')
  await testApi('/api/crime/homicide')
  await testApi('/api/crime/hate-crime')
  await testApi('/api/weather/nearby?lat=40.7&lon=-74.0', { allowEmpty: true })

  console.log('\n--- Client upstreams ---')
  await testOverpass()
  await testFirms()
  await testGdacs()
  await testRainviewer()
  await testDeepState()
  await testIoda()
  await testDatacenters()
  await testUtilityOutages()
  await testSurveillance()
  await testUsgsDirect()
  await testAdsbLol()
  await testUsStates()

  console.log('\n--- Tiles / basemaps (sample) ---')
  await testHeadOrGet('Tile OpenRailwayMap', 'https://a.tiles.openrailwaymap.org/standard/6/18/24.png')
  await testHeadOrGet(
    'Tile GIBS MODIS',
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-06-01/GoogleMapsCompatible_Level9/4/5/8.jpg`
  )
  await testHeadOrGet('Tile Esri World Imagery', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/5/8')
  await testHeadOrGet('Tile OSM', 'https://tile.openstreetmap.org/4/8/5.png')
  await testHeadOrGet('Tile Carto dark', 'https://a.basemaps.cartocdn.com/dark_all/4/8/5.png')
  await testHeadOrGet('Tile OpenTopoMap', 'https://a.tile.opentopomap.org/4/8/5.png')

  const failed = results.filter((r) => !r.ok)
  const passed = results.filter((r) => r.ok)
  console.log(`\n=== Summary: ${passed.length} PASS / ${failed.length} FAIL / ${results.length} total ===`)
  if (failed.length) {
    console.log('FAIL list:')
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`))
  }
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
