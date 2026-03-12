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
const ACLED_API_KEY = import.meta.env.VITE_ACLED_API_KEY || ''

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

function getRapidApiKey() {
  try {
    const raw = localStorage.getItem('supermap_rapidapiKeys')
    const keys = raw ? JSON.parse(raw) : {}
    return keys.default || keys.rapidapi || ''
  } catch {
    return ''
  }
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

export async function fetchAdsbRapidApi(lat, lon) {
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/api/adsb?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`)
      if (res.ok) {
        const data = await res.json()
        if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
          return data
        }
      }
    } catch (err) {
      console.warn('[SuperMap ADS-B API]', err.message)
    }
  }

  const key = getRapidApiKey()
  if (!key) {
    console.log('[SuperMap ADS-B] RapidAPI key required. Add in Settings > Advanced.')
    return { type: 'FeatureCollection', features: [] }
  }
  const url = `https://aircraftscatter.p.rapidapi.com/lat/${lat}/lon/${lon}/`
  try {
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'aircraftscatter.p.rapidapi.com',
        'x-rapidapi-key': key,
      },
    })
    if (!res.ok) return { type: 'FeatureCollection', features: [] }
    const data = await res.json()
    if (!Array.isArray(data)) return { type: 'FeatureCollection', features: [] }
    const features = data
      .filter((a) => a.lat != null && a.lon != null)
      .map((a) => ({
        type: 'Feature',
        properties: a,
        geometry: { type: 'Point', coordinates: [parseFloat(a.lon), parseFloat(a.lat)] },
      }))
    return { type: 'FeatureCollection', features }
  } catch (err) {
    console.error('[SuperMap ADS-B]', err)
    return { type: 'FeatureCollection', features: [] }
  }
}

export function fetchAdsbPlaceholder() {
  console.log('[SuperMap ADS-B] Add RapidAPI key in Settings for aircraftscatter.')
  return { type: 'FeatureCollection', features: [] }
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
  const [w, s, e, n] = bbox
  const area = `${w},${s},${e},${n}`
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_MAP_KEY}/VIIRS_NOAA20_NRT/${area}/1`
  const res = await fetch(url)
  if (!res.ok) return { type: 'FeatureCollection', features: [] }
  const text = await res.text()
  const lines = text.trim().split('\n')
  if (lines.length < 2) return { type: 'FeatureCollection', features: [] }
  const headers = lines[0].split(',')
  const latIdx = headers.indexOf('latitude')
  const lonIdx = headers.indexOf('longitude')
  if (latIdx === -1 || lonIdx === -1) return { type: 'FeatureCollection', features: [] }
  const features = lines.slice(1).map((line) => {
    const vals = line.split(',')
    const lat = parseFloat(vals[latIdx])
    const lon = parseFloat(vals[lonIdx])
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [lon, lat] },
    }
  }).filter(Boolean)
  return { type: 'FeatureCollection', features }
}

/** Geoconfirmed.org: volunteer OSINT geolocated content. Uses backend proxy to avoid CORS. */
export async function fetchGeoconfirmed(bbox) {
  const url = API_BASE
    ? `${API_BASE}/api/geoconfirmed${bbox && bbox.length >= 4 ? `?bbox=${bbox.join(',')}` : ''}`
    : 'https://geoconfirmed.org/api/map/ExportAsKml/World'
  try {
    if (API_BASE) {
      const res = await fetch(url)
      if (!res.ok) return { type: 'FeatureCollection', features: [] }
      return res.json()
    }
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return { type: 'FeatureCollection', features: [] }
    const text = await res.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const features = []
    const placemarks = doc.getElementsByTagName('Placemark')
    for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i]
      const nameEl = pm.getElementsByTagName('name')[0]
      const name = nameEl?.textContent?.trim() || ''
      const point = pm.getElementsByTagName('Point')[0]
      if (!point) continue
      const coordsEl = point.getElementsByTagName('coordinates')[0]
      if (!coordsEl) continue
      const coordStr = coordsEl.textContent?.trim() || ''
      const parts = coordStr.split(',')
      const lon = parseFloat(parts[0])
      const lat = parseFloat(parts[1])
      if (Number.isNaN(lon) || Number.isNaN(lat)) continue
      if (bbox && bbox.length >= 4) {
        const [w, s, e, n] = bbox
        if (lon < w || lon > e || lat < s || lat > n) continue
      }
      const descEl = pm.getElementsByTagName('description')[0]
      const description = descEl?.textContent?.trim() || ''
      features.push({
        type: 'Feature',
        id: `geoconfirmed-${i}`,
        properties: {
          name,
          title: name,
          source: 'GeoConfirmed',
          description: description.slice(0, 300),
          link: 'https://geoconfirmed.org',
        },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      })
    }
    return { type: 'FeatureCollection', features }
  } catch (err) {
    console.warn('[SuperMap Geoconfirmed]', err.message)
    return { type: 'FeatureCollection', features: [] }
  }
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

export async function fetchFlockCameras(city = 'SanDiego') {
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/api/flock/cameras?city=${encodeURIComponent(city)}`)
      if (res.ok) {
        const data = await res.json()
        if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) return data
      }
    } catch (err) {
      console.warn('[SuperMap Flock] API:', err.message)
    }
  }
  const key = getRapidApiKey()
  const url = `https://flock-camera-location.p.rapidapi.com/city/${encodeURIComponent(city)}`
  if (key) {
    try {
      const res = await fetch(url, {
        headers: {
          'x-rapidapi-host': 'flock-camera-location.p.rapidapi.com',
          'x-rapidapi-key': key,
        },
      })
      if (!res.ok) return { type: 'FeatureCollection', features: [] }
      const data = await res.json()
      const arr = Array.isArray(data) ? data : data?.data || data?.features || []
      const features = arr
        .filter((c) => c.latitude != null && c.longitude != null)
        .map((c) => ({
          type: 'Feature',
          properties: c,
          geometry: {
            type: 'Point',
            coordinates: [parseFloat(c.longitude), parseFloat(c.latitude)],
          },
        }))
      if (features.length > 0) return { type: 'FeatureCollection', features }
    } catch (err) {
      console.warn('[SuperMap Flock]', err.message)
    }
  }
  return { type: 'FeatureCollection', features: [] }
}

const FLOCK_TILES_BASE = 'https://ringmast4r.github.io/FLOCK/data/tiles'
const FLOCK_ZOOM = 6

function lonToTileX(lon, zoom) {
  const n = 2 ** zoom
  return Math.floor(((lon + 180) / 360) * n)
}
function latToTileY(lat, zoom) {
  const latRad = (lat * Math.PI) / 180
  const n = 2 ** zoom
  return Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n)
}

/** FLOCK surveillance cameras from ringmast4r/FLOCK tile data (zoom 6). See https://github.com/ringmast4r/FLOCK */
export async function fetchFlockTiles(bbox) {
  if (!bbox || bbox.length < 4) return { type: 'FeatureCollection', features: [] }
  const [w, s, e, n] = bbox
  const xMin = Math.max(0, lonToTileX(w, FLOCK_ZOOM))
  const xMax = Math.min(2 ** FLOCK_ZOOM - 1, lonToTileX(e, FLOCK_ZOOM))
  const yMin = Math.max(0, latToTileY(n, FLOCK_ZOOM))
  const yMax = Math.min(2 ** FLOCK_ZOOM - 1, latToTileY(s, FLOCK_ZOOM))
  const allFeatures = []
  const seen = new Set()
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      try {
        const url = `${FLOCK_TILES_BASE}/${FLOCK_ZOOM}/${x}/${y}.json`
        const res = await fetch(url)
        if (!res.ok) continue
        const tile = await res.json()
        const features = tile?.features || []
        for (const f of features) {
          if (f.type !== 'Feature' || !f.geometry?.coordinates) continue
          const key = f.geometry.coordinates.join(',')
          if (seen.has(key)) continue
          seen.add(key)
          allFeatures.push(f)
        }
      } catch (_) {
        // skip failed tiles
      }
    }
  }
  return { type: 'FeatureCollection', features: allFeatures }
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
              raw = Array.isArray(json) ? json : json?.data ?? json?.features ?? null
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

/** Fallback: backend /api/cameras (e.g. Windy webcams) when Flock has no key or returns empty */
export async function fetchCamerasFromApi(lat, lon, bbox = null) {
  if (!API_BASE) return { type: 'FeatureCollection', features: [] }
  try {
    const params = new URLSearchParams()
    if (bbox && bbox.length >= 4) {
      const [minLon, minLat, maxLon, maxLat] = bbox
      params.set('minLat', String(minLat))
      params.set('maxLat', String(maxLat))
      params.set('minLon', String(minLon))
      params.set('maxLon', String(maxLon))
    } else if (lat != null && lon != null) {
      params.set('lat', lat)
      params.set('lon', lon)
      params.set('radius', '100')
    }
    const res = await fetch(`${API_BASE}/api/cameras?${params}`)
    if (!res.ok) return { type: 'FeatureCollection', features: [] }
    const data = await res.json()
    if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
      return data
    }
    if (Array.isArray(data)) {
      const features = data
        .filter((c) => (c.latitude != null && c.longitude != null) || (c.lat != null && c.lon != null))
        .map((c) => ({
          type: 'Feature',
          properties: c,
          geometry: {
            type: 'Point',
            coordinates: [parseFloat(c.longitude ?? c.lon), parseFloat(c.latitude ?? c.lat)],
          },
        }))
      return { type: 'FeatureCollection', features }
    }
  } catch (err) {
    console.warn('[SuperMap Cameras API]', err.message)
  }
  return { type: 'FeatureCollection', features: [] }
}

/** US power outages (ArcGIS). For worldwide power infrastructure use Power Grid layer (Overpass). */
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

export async function fetchAcled(bbox) {
  if (!ACLED_API_KEY) return { type: 'FeatureCollection', features: [] }
  const [w, s, e, n] = bbox
  const url = `https://api.acleddata.com/acled/read/?key=${ACLED_API_KEY}&limit=1000&bbox=${w},${s},${e},${n}`
  const res = await fetch(url)
  if (!res.ok) return { type: 'FeatureCollection', features: [] }
  const data = await res.json()
  if (!data.data?.length) return { type: 'FeatureCollection', features: [] }
  const features = data.data.map((d) => ({
    type: 'Feature',
    properties: d,
    geometry: {
      type: 'Point',
      coordinates: [parseFloat(d.longitude) || 0, parseFloat(d.latitude) || 0],
    },
  }))
  return { type: 'FeatureCollection', features }
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

