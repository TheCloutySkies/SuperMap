/**
 * Data fetching for intelligence layers.
 * Refreshes on map moveend; callers pass bbox from map.getBounds().
 * When VITE_API_URL is set, earthquakes (and optionally towers) use the backend API.
 */

const API_BASE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : ''

const FIRMS_MAP_KEY = '09415b5df0304c3802335984b511c111'
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'
const OVERPASS_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'SuperMap/1.0 (https://github.com/TheCloutySkies/SuperMap)',
}

const OVERPASS_CACHE_TTL_MS = 20_000
const overpassCache = new Map()
function bboxCacheKey(prefix, bbox) {
  const [w, s, e, n] = bbox || []
  const round = (x) => (Number.isFinite(x) ? Number(x).toFixed(2) : 'na')
  return `${prefix}:${round(w)},${round(s)},${round(e)},${round(n)}`
}
function getCachedOverpass(key) {
  const hit = overpassCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.t > OVERPASS_CACHE_TTL_MS) return null
  return hit.v
}
function setCachedOverpass(key, value) {
  overpassCache.set(key, { t: Date.now(), v: value })
}

export async function fetchOverpassPower(bbox) {
  const cacheKey = bboxCacheKey('power', bbox)
  const cached = getCachedOverpass(cacheKey)
  if (cached) return cached
  const [w, s, e, n] = bbox
  const query = `
    [out:json][timeout:30];
    (
      way["power"~"line|cable"](${s},${w},${n},${e});
      node["power"~"substation|plant"](${s},${w},${n},${e});
    );
    out body geom;
  `
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: OVERPASS_HEADERS,
  })
  if (!res.ok) {
    const fallback = getCachedOverpass(cacheKey)
    if (fallback) return fallback
    throw new Error('Overpass request failed')
  }
  const json = await res.json()
  const features = []
  const nodeCoords = {}
  json.elements?.forEach((el) => {
    if (el.type === 'node') {
      nodeCoords[el.id] = [el.lon, el.lat]
    }
  })
  json.elements?.forEach((el) => {
    if (el.type === 'way' && el.geometry) {
      const coords = el.geometry.map((p) => [p.lon, p.lat])
      const rawPower = (el.tags?.power || 'line').toLowerCase()
      const power = /cable|line|minor|tower|pole/.test(rawPower) ? 'line' : 'line'
      features.push({
        type: 'Feature',
        properties: { power },
        geometry: { type: 'LineString', coordinates: coords },
      })
    } else if (el.type === 'node' && nodeCoords[el.id]) {
      const rawPower = (el.tags?.power || 'substation').toLowerCase()
      const power = /plant|station|generator/.test(rawPower) ? 'plant' : /substation|station|transformer|switch|tower/.test(rawPower) ? 'substation' : 'substation'
      features.push({
        type: 'Feature',
        properties: { power },
        geometry: { type: 'Point', coordinates: nodeCoords[el.id] },
      })
    }
  })
  const fc = { type: 'FeatureCollection', features }
  setCachedOverpass(cacheKey, fc)
  return fc
}

export async function runOverpassQuery(query) {
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: OVERPASS_HEADERS,
  })
  if (!res.ok) throw new Error('Overpass request failed')
  const json = await res.json()
  const features = []
  const nodeCoords = {}
  json.elements?.forEach((el) => {
    if (el.type === 'node') {
      nodeCoords[el.id] = [el.lon, el.lat]
    }
  })
  json.elements?.forEach((el) => {
    if (el.type === 'way' && el.geometry) {
      const coords = el.geometry.map((p) => [p.lon, p.lat])
      const closed = coords.length > 2 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
      features.push({
        type: 'Feature',
        properties: el.tags || {},
        geometry: closed
          ? { type: 'Polygon', coordinates: [coords] }
          : { type: 'LineString', coordinates: coords },
      })
    } else if (el.type === 'node' && nodeCoords[el.id]) {
      features.push({
        type: 'Feature',
        properties: el.tags || {},
        geometry: { type: 'Point', coordinates: nodeCoords[el.id] },
      })
    }
  })
  return { type: 'FeatureCollection', features }
}

export async function fetchOverpassCellTowers(bbox) {
  const cacheKey = bboxCacheKey('cell', bbox)
  const cached = getCachedOverpass(cacheKey)
  if (cached) return cached
  const [w, s, e, n] = bbox
  const query = `
    [out:json][timeout:30];
    node["communication:mobile_phone"="yes"](${s},${w},${n},${e});
    out;
  `
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: OVERPASS_HEADERS,
  })
  if (!res.ok) {
    const fallback = getCachedOverpass(cacheKey)
    if (fallback) return fallback
    throw new Error('Overpass request failed')
  }
  const json = await res.json()
  const features = (json.elements || [])
    .filter((el) => el.type === 'node' && el.lat != null && el.lon != null)
    .map((el) => ({
      type: 'Feature',
      properties: { ...el.tags, towerId: el.id },
      geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
    }))
  const fc = { type: 'FeatureCollection', features }
  setCachedOverpass(cacheKey, fc)
  return fc
}

export async function fetchNasaFirmsArea(bbox) {
  // Free FIRMS map keys often only allow the `world` area slug (custom bboxes return header-only).
  // Fetch world NRT then filter to the visible bbox client-side.
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_MAP_KEY}/VIIRS_NOAA20_NRT/world/1`
  const res = await fetch(url)
  if (!res.ok) return { type: 'FeatureCollection', features: [] }
  const text = await res.text()
  const lines = text.trim().split('\n')
  if (lines.length < 2) return { type: 'FeatureCollection', features: [] }
  const headers = lines[0].split(',')
  const latIdx = headers.indexOf('latitude')
  const lonIdx = headers.indexOf('longitude')
  if (latIdx === -1 || lonIdx === -1) return { type: 'FeatureCollection', features: [] }
  const [w, s, e, n] = bbox || [-180, -90, 180, 90]
  const features = lines.slice(1).map((line) => {
    const vals = line.split(',')
    const lat = parseFloat(vals[latIdx])
    const lon = parseFloat(vals[lonIdx])
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null
    if (lon < w || lon > e || lat < s || lat > n) return null
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [lon, lat] },
    }
  }).filter(Boolean)
  return { type: 'FeatureCollection', features }
}

export async function fetchGdacsEvents(bbox) {
  try {
    const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH'
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return { type: 'FeatureCollection', features: [] }
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (!contentType.includes('application/json')) {
      console.warn('[SuperMap GDACS] Non-JSON response')
      return { type: 'FeatureCollection', features: [] }
    }
    let data
    try {
      data = await res.json()
    } catch (_) {
      return { type: 'FeatureCollection', features: [] }
    }
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      return { type: 'FeatureCollection', features: [] }
    }
    if (!bbox) return data
    const [w, s, e, n] = bbox
    const filtered = data.features.filter((f) => {
      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 2) return false
      const lon = coords[0]
      const lat = coords[1]
      return lon >= w && lon <= e && lat >= s && lat <= n
    })
    return { type: 'FeatureCollection', features: filtered }
  } catch (err) {
    console.warn('[SuperMap GDACS]', err?.message || err)
    return { type: 'FeatureCollection', features: [] }
  }
}

export async function fetchUsgsEarthquakes(bbox) {
  if (API_BASE) {
    try {
      const bboxStr = bbox ? bbox.join(',') : ''
      const url = `${API_BASE}/api/earthquakes${bboxStr ? `?bbox=${bboxStr}` : ''}`
      const res = await fetch(url)
      if (!res.ok) return { type: 'FeatureCollection', features: [] }
      return res.json()
    } catch (err) {
      console.warn('[SuperMap] API earthquakes failed, skipping', err.message)
      return { type: 'FeatureCollection', features: [] }
    }
  }
  let url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson'
  if (bbox) {
    const [w, s, e, n] = bbox
    url += `&minlatitude=${s}&maxlatitude=${n}&minlongitude=${w}&maxlongitude=${e}`
  }
  url += '&orderby=time-asc'
  const res = await fetch(url)
  if (!res.ok) return { type: 'FeatureCollection', features: [] }
  return res.json()
}

/** ATLAS data centers from ringmast4r/Data-Center-Map---Global (6,266+ locations). See https://github.com/ringmast4r/Data-Center-Map---Global */
const DATACENTERS_API_URL = 'https://data-center-map.com/api/all'
const DATACENTERS_JSON_URL = 'https://raw.githubusercontent.com/ringmast4r/Data-Center-Map---Global/main/datacenters_cleaned.json'

let datacentersCache = null
/** Minimal fallback when API and GitHub both fail (e.g. CORS, 404) so the layer still shows something */
const DATACENTERS_FALLBACK = [
  { name: 'Equinix SV5', company: 'Equinix', city: 'San Jose', state: 'CA', country: 'United States', lon: -121.9, lat: 37.34 },
  { name: 'Digital Realty SJC', company: 'Digital Realty', city: 'San Jose', state: 'CA', country: 'United States', lon: -121.89, lat: 37.33 },
  { name: 'AWS us-east-1', company: 'Amazon', city: 'Ashburn', state: 'VA', country: 'United States', lon: -77.45, lat: 39.0 },
  { name: 'Microsoft North Virginia', company: 'Microsoft', city: 'Boydton', state: 'VA', country: 'United States', lon: -78.39, lat: 36.67 },
  { name: 'Google Council Bluffs', company: 'Google', city: 'Council Bluffs', state: 'IA', country: 'United States', lon: -95.86, lat: 41.26 },
  { name: 'Equinix LD5', company: 'Equinix', city: 'London', state: '', country: 'United Kingdom', lon: -0.11, lat: 51.51 },
  { name: 'AMS1', company: 'DigitalOcean', city: 'Amsterdam', state: '', country: 'Netherlands', lon: 4.9, lat: 52.37 },
  { name: 'Equinix TY2', company: 'Equinix', city: 'Tokyo', state: '', country: 'Japan', lon: 139.69, lat: 35.69 },
  { name: 'AWS ap-southeast-1', company: 'Amazon', city: 'Singapore', state: '', country: 'Singapore', lon: 103.85, lat: 1.29 },
  { name: 'SYD1', company: 'AWS', city: 'Sydney', state: 'NSW', country: 'Australia', lon: 151.21, lat: -33.87 },
]
function datacentersFallbackInBbox(w, s, e, n) {
  return {
    type: 'FeatureCollection',
    features: DATACENTERS_FALLBACK.filter((dc) => dc.lon >= w && dc.lon <= e && dc.lat >= s && dc.lat <= n).map((dc) => ({
      type: 'Feature',
      properties: { name: dc.name, company: dc.company, city: dc.city, state: dc.state, country: dc.country },
      geometry: { type: 'Point', coordinates: [dc.lon, dc.lat] },
    })),
  }
}

export async function fetchDatacenters(bbox) {
  if (!bbox || bbox.length < 4) return { type: 'FeatureCollection', features: [] }
  const [w, s, e, n] = bbox
  try {
    if (!datacentersCache) {
      let raw = null
      try {
        const apiRes = await fetch(DATACENTERS_API_URL, { mode: 'cors' })
        if (apiRes.ok) {
          const contentType = (apiRes.headers.get('content-type') || '').toLowerCase()
          if (contentType.includes('application/json')) {
            try {
              const json = await apiRes.json()
              raw = Array.isArray(json)
                ? json
                : (json?.results ?? json?.data ?? json?.features ?? null)
            } catch (_) {}
          }
        }
      } catch (_) {}
      if (!raw) {
        try {
          const ghRes = await fetch(DATACENTERS_JSON_URL)
          if (ghRes.ok) {
            try {
              const json = await ghRes.json()
              raw = Array.isArray(json) ? json : json?.data ?? json?.features ?? null
            } catch (_) {}
          }
        } catch (_) {}
      }
      if (!raw || !Array.isArray(raw)) {
        datacentersCache = []
      } else {
        datacentersCache = raw
      }
    }
    if (datacentersCache.length === 0) return datacentersFallbackInBbox(w, s, e, n)
    const features = []
    for (const dc of datacentersCache) {
      const lon = dc.lon ?? dc.longitude ?? dc.city_coords?.[0]
      const lat = dc.lat ?? dc.latitude ?? dc.city_coords?.[1]
      if (lat == null || lon == null) continue
      const latN = Number(lat)
      const lonN = Number(lon)
      if (lonN < w || lonN > e || latN < s || latN > n) continue
      features.push({
        type: 'Feature',
        properties: {
          name: dc.name,
          company: dc.company,
          city: dc.city,
          state: dc.state ?? dc.administrative_area,
          country: dc.country,
        },
        geometry: { type: 'Point', coordinates: [lonN, latN] },
      })
    }
    return { type: 'FeatureCollection', features }
  } catch (err) {
    console.warn('[SuperMap Datacenters]', err.message)
    return { type: 'FeatureCollection', features: [] }
  }
}

export async function fetchUtilityOutages() {
  const url =
    'https://services.arcgis.com/BLN4oKB0N1YSgvY8/arcgis/rest/services/Power_Outages_(View)/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson'
  try {
    const res = await fetch(url)
    if (!res.ok) return { type: 'FeatureCollection', features: [] }
    const data = await res.json()
    return data.type === 'FeatureCollection' ? data : { type: 'FeatureCollection', features: [] }
  } catch (err) {
    console.error('[SuperMap Outages]', err)
    return { type: 'FeatureCollection', features: [] }
  }
}

export async function fetchLiveuamapRss() {
  try {
    const res = await fetch('https://liveuamap.com/rss', { mode: 'cors' })
    if (!res.ok) return []
    const text = await res.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const items = doc.querySelectorAll('item')
    return Array.from(items).slice(0, 20).map((item) => ({
      title: item.querySelector('title')?.textContent || '',
      link: item.querySelector('link')?.textContent || '',
      description: item.querySelector('description')?.textContent || '',
      pubDate: item.querySelector('pubDate')?.textContent || '',
    }))
  } catch (err) {
    console.error('[SuperMap Liveuamap]', err)
    return []
  }
}

/** ODINT — Observatory for Digital Infrastructure & Network Transparency. 14 recon regions (ringmast4r/ODINT). */
const ODINT_REGIONS_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'North America', region: 'North America' }, geometry: { type: 'Point', coordinates: [-98, 39] } },
    { type: 'Feature', properties: { name: 'Caribbean', region: 'Caribbean' }, geometry: { type: 'Point', coordinates: [-72, 18] } },
    { type: 'Feature', properties: { name: 'Central America', region: 'Central America' }, geometry: { type: 'Point', coordinates: [-90, 15] } },
    { type: 'Feature', properties: { name: 'South America', region: 'South America' }, geometry: { type: 'Point', coordinates: [-60, -15] } },
    { type: 'Feature', properties: { name: 'Europe', region: 'Europe' }, geometry: { type: 'Point', coordinates: [10, 50] } },
    { type: 'Feature', properties: { name: 'Caucasus', region: 'Caucasus' }, geometry: { type: 'Point', coordinates: [45, 42] } },
    { type: 'Feature', properties: { name: 'Middle East', region: 'Middle East' }, geometry: { type: 'Point', coordinates: [44, 31] } },
    { type: 'Feature', properties: { name: 'Central Asia', region: 'Central Asia' }, geometry: { type: 'Point', coordinates: [65, 45] } },
    { type: 'Feature', properties: { name: 'South Asia', region: 'South Asia' }, geometry: { type: 'Point', coordinates: [78, 22] } },
    { type: 'Feature', properties: { name: 'East Asia', region: 'East Asia' }, geometry: { type: 'Point', coordinates: [105, 35] } },
    { type: 'Feature', properties: { name: 'Southeast Asia', region: 'Southeast Asia' }, geometry: { type: 'Point', coordinates: [105, 10] } },
    { type: 'Feature', properties: { name: 'Africa', region: 'Africa' }, geometry: { type: 'Point', coordinates: [20, 0] } },
    { type: 'Feature', properties: { name: 'Oceania', region: 'Oceania' }, geometry: { type: 'Point', coordinates: [135, -25] } },
    { type: 'Feature', properties: { name: 'Antarctica', region: 'Antarctica' }, geometry: { type: 'Point', coordinates: [0, -80] } },
  ],
}
export async function fetchOdintRegions() {
  return Promise.resolve(ODINT_REGIONS_GEOJSON)
}

const SURVEILLANCE_CSV_URL = 'https://raw.githubusercontent.com/ringmast4r/surveillance-capabilities-map/main/atlas-of-surveillance.csv'
const CITY_COORDS_URL = 'https://raw.githubusercontent.com/ringmast4r/surveillance-capabilities-map/main/city_coords.json'
let surveillanceCache = null
/** EFF Atlas of Surveillance (ringmast4r/surveillance-capabilities-map). US only. */
export async function fetchSurveillanceCapabilities(bbox) {
  if (!bbox || bbox.length < 4) return { type: 'FeatureCollection', features: [] }
  const [w, s, e, n] = bbox
  try {
    if (!surveillanceCache) {
      const csvRes = await fetch(SURVEILLANCE_CSV_URL)
      if (!csvRes.ok) return { type: 'FeatureCollection', features: [] }
      const csvText = await csvRes.text()
      const lines = csvText.split('\n').filter((l) => l.trim())
      const rows = lines.slice(1)
      let coordsLookup = new Map()
      try {
        const coordsRes = await fetch(CITY_COORDS_URL)
        if (coordsRes.ok) {
          let coordsData = null
          try {
            coordsData = await coordsRes.json()
          } catch (_) {}
          if (Array.isArray(coordsData)) {
            coordsData.forEach((c) => {
              const key = `${(c.city || c.City || '').trim()}|${(c.state || c.State || '').trim().toUpperCase().slice(0, 2)}`
              if (key === '|') return
              const lon = c.lon ?? c.longitude
              const lat = c.lat ?? c.latitude
              if (lat != null && lon != null) coordsLookup.set(key, [Number(lon), Number(lat)])
            })
          } else if (coordsData && typeof coordsData === 'object') {
            Object.entries(coordsData).forEach(([k, v]) => {
              const key = k.replace(/, /g, '|').toUpperCase()
              if (Array.isArray(v) && v.length >= 2) {
                coordsLookup.set(key, [Number(v[0]), Number(v[1])])
              } else if (v && typeof v === 'object' && (v.lat != null || v.latitude != null) && (v.lon != null || v.longitude != null)) {
                const lon = v.lon ?? v.longitude
                const lat = v.lat ?? v.latitude
                coordsLookup.set(key, [Number(lon), Number(lat)])
              }
            })
          }
        }
      } catch (_) {}
      const features = []
      const seen = new Set()
      for (const line of rows.slice(0, 3000)) {
        const parts = []
        let rest = line
        for (let i = 0; i < 5 && rest; i++) {
          const m = rest.match(/^"([^"]*(?:""[^"]*)*)"\s*,?\s*(.*)$/s) || rest.match(/^([^,]*),?\s*(.*)$/s)
          if (m) {
            parts.push((m[1] || '').replace(/""/g, '"').trim())
            rest = (m[2] || '').trim()
          }
        }
        const city = (parts[1] || '').trim()
        const state = (parts[3] || '').trim().toUpperCase().slice(0, 2)
        if (!city || !state) continue
        const key = `${city}|${state}`
        const coord = coordsLookup.get(key)
        if (!coord || seen.has(key)) continue
        seen.add(key)
        const agency = (parts[4] || '').trim()
        features.push({
          type: 'Feature',
          properties: { city, state, agency },
          geometry: { type: 'Point', coordinates: coord },
        })
      }
      surveillanceCache = { type: 'FeatureCollection', features }
    }
    const inBbox = surveillanceCache.features.filter((f) => {
      const [lon, lat] = f.geometry.coordinates
      return lon >= w && lon <= e && lat >= s && lat <= n
    })
    return { type: 'FeatureCollection', features: inBbox }
  } catch (err) {
    console.warn('[SuperMap Surveillance]', err.message)
    return { type: 'FeatureCollection', features: [] }
  }
}

/**
 * FCC Antenna Structure Registration / tower data.
 * Uses backend proxy at /api/fcc/towers when API_BASE is set; backend can use
 * FCC Open Data (https://opendata.fcc.gov) or ASR bulk files.
 */
export async function fetchFccTowers(bbox) {
  if (!bbox || bbox.length < 4) return { type: 'FeatureCollection', features: [] }
  const [w, s, e, n] = bbox
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/api/fcc/towers?bbox=${[w, s, e, n].join(',')}`)
      if (!res.ok) return { type: 'FeatureCollection', features: [] }
      const data = await res.json()
      if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) return data
      if (Array.isArray(data)) {
        const features = data
          .filter((r) => r.latitude != null && r.longitude != null)
          .map((r) => ({
            type: 'Feature',
            properties: r,
            geometry: {
              type: 'Point',
              coordinates: [parseFloat(r.longitude), parseFloat(r.latitude)],
            },
          }))
        return { type: 'FeatureCollection', features }
      }
    } catch (err) {
      console.warn('[SuperMap FCC towers]', err.message)
    }
  }
  return { type: 'FeatureCollection', features: [] }
}

function bboxQuery(bbox) {
  return bbox && bbox.length >= 4 ? `bbox=${bbox.join(',')}` : ''
}

function filterFcByBbox(fc, bbox) {
  if (!bbox || bbox.length < 4 || !fc?.features) return fc || { type: 'FeatureCollection', features: [] }
  const [w, s, e, n] = bbox
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((f) => {
      const c = f.geometry?.coordinates
      if (!c) return true
      if (f.geometry.type === 'Point') {
        const [lon, lat] = c
        return lon >= w && lon <= e && lat >= s && lat <= n
      }
      // Keep polygons/multipolygons; bbox clipping is approximate via first ring point
      const ring = f.geometry.type === 'Polygon' ? c[0] : (f.geometry.type === 'MultiPolygon' ? c[0]?.[0] : null)
      if (!ring?.[0]) return true
      const [lon, lat] = ring[0]
      return lon >= w && lon <= e && lat >= s && lat <= n
    }),
  }
}

/** EMSC / Seismic Portal global quakes (free, CORS-enabled). Falls back via API proxy. */
export async function fetchEmscEarthquakes(bbox) {
  const q = bboxQuery(bbox)
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/api/hazards/emsc${q ? `?${q}` : ''}`)
      if (res.ok) {
        const data = await res.json()
        if (data?.type === 'FeatureCollection') return data
      }
    } catch (err) {
      console.warn('[SuperMap EMSC] API proxy failed', err.message)
    }
  }
  try {
    let url = 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=100&minmag=4&orderby=time'
    if (bbox) {
      const [w, s, e, n] = bbox
      url += `&minlon=${w}&minlat=${s}&maxlon=${e}&maxlat=${n}`
    }
    const res = await fetch(url)
    if (!res.ok) return { type: 'FeatureCollection', features: [] }
    const data = await res.json()
    const features = (data.features || []).map((f) => {
      const p = f.properties || {}
      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 2) return null
      const mag = p.mag
      return {
        type: 'Feature',
        properties: {
          source: 'emsc',
          mag,
          place: p.flynn_region || 'Earthquake',
          time: p.time || '',
          title: mag != null ? `M${mag} ${p.flynn_region || 'Earthquake'}` : (p.flynn_region || 'Earthquake'),
        },
        geometry: { type: 'Point', coordinates: [coords[0], coords[1]] },
      }
    }).filter(Boolean)
    return { type: 'FeatureCollection', features }
  } catch (err) {
    console.warn('[SuperMap EMSC]', err?.message || err)
    return { type: 'FeatureCollection', features: [] }
  }
}

/** NWS active alerts / WWA polygons (free, no key). Prefer API proxy when available. */
export async function fetchNwsAlerts(bbox) {
  const q = bboxQuery(bbox)
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/api/hazards/nws${q ? `?${q}` : ''}`)
      if (res.ok) {
        const data = await res.json()
        if (data?.type === 'FeatureCollection') return data
      }
    } catch (err) {
      console.warn('[SuperMap NWS] API proxy failed', err.message)
    }
  }
  try {
    const res = await fetch('https://api.weather.gov/alerts/active?status=actual&message_type=alert', {
      headers: { Accept: 'application/geo+json', 'User-Agent': 'SuperMap/1.0' },
    })
    if (!res.ok) return { type: 'FeatureCollection', features: [] }
    const data = await res.json()
    const withGeom = {
      type: 'FeatureCollection',
      features: (data.features || [])
        .filter((f) => f.geometry)
        .map((f) => ({
          type: 'Feature',
          properties: {
            source: 'nws',
            event: f.properties?.event || 'Alert',
            headline: f.properties?.headline || f.properties?.event || 'NWS Alert',
            title: f.properties?.headline || f.properties?.event || 'NWS Alert',
            severity: f.properties?.severity || '',
            link: f.properties?.id || 'https://www.weather.gov/',
          },
          geometry: f.geometry,
        })),
    }
    return filterFcByBbox(withGeom, bbox)
  } catch (err) {
    console.warn('[SuperMap NWS]', err?.message || err)
    return { type: 'FeatureCollection', features: [] }
  }
}

/** USGS elevated volcano notices (free JSON). */
export async function fetchUsgsVolcanoes(bbox) {
  const q = bboxQuery(bbox)
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/api/hazards/volcanoes${q ? `?${q}` : ''}`)
      if (res.ok) {
        const data = await res.json()
        if (data?.type === 'FeatureCollection') return data
      }
    } catch (err) {
      console.warn('[SuperMap volcanoes] API proxy failed', err.message)
    }
  }
  try {
    const res = await fetch('https://volcanoes.usgs.gov/vsc/api/volcanoApi/elevated', {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return { type: 'FeatureCollection', features: [] }
    const rows = await res.json()
    if (!Array.isArray(rows)) return { type: 'FeatureCollection', features: [] }
    const [w, s, e, n] = bbox || [-180, -90, 180, 90]
    const features = rows
      .map((v) => {
        const lat = Number(v.lat)
        const lon = Number(v.long ?? v.lon)
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
        if (lon < w || lon > e || lat < s || lat > n) return null
        return {
          type: 'Feature',
          properties: {
            source: 'usgs-volcano',
            name: v.vName || 'Volcano',
            title: `${v.vName || 'Volcano'} · ${v.alertLevel || ''}/${v.colorCode || ''}`.trim(),
            alertLevel: v.alertLevel || '',
            colorCode: v.colorCode || '',
            synopsis: (v.noticeSynopsis || '').slice(0, 500),
            link: v.noticeUrl || 'https://volcanoes.usgs.gov/',
          },
          geometry: { type: 'Point', coordinates: [lon, lat] },
        }
      })
      .filter(Boolean)
    return { type: 'FeatureCollection', features }
  } catch (err) {
    console.warn('[SuperMap volcanoes]', err?.message || err)
    return { type: 'FeatureCollection', features: [] }
  }
}

/** NHC tropical cyclone centers — CORS blocked client-side; requires API proxy. */
export async function fetchNhcTropical(bbox) {
  const q = bboxQuery(bbox)
  if (!API_BASE) return { type: 'FeatureCollection', features: [] }
  try {
    const res = await fetch(`${API_BASE}/api/hazards/nhc${q ? `?${q}` : ''}`)
    if (!res.ok) return { type: 'FeatureCollection', features: [] }
    const data = await res.json()
    return data?.type === 'FeatureCollection' ? data : { type: 'FeatureCollection', features: [] }
  } catch (err) {
    console.warn('[SuperMap NHC]', err?.message || err)
    return { type: 'FeatureCollection', features: [] }
  }
}

