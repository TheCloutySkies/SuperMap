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
const ACLED_API_KEY = import.meta.env.VITE_ACLED_API_KEY || ''

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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
  return { type: 'FeatureCollection', features }
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
  const [w, s, e, n] = bbox
  const query = `
    [out:json][timeout:30];
    node["communication:mobile_phone"="yes"](${s},${w},${n},${e});
    out;
  `
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!res.ok) throw new Error('Overpass request failed')
  const json = await res.json()
  const features = (json.elements || [])
    .filter((el) => el.type === 'node' && el.lat != null && el.lon != null)
    .map((el) => ({
      type: 'Feature',
      properties: { ...el.tags, towerId: el.id },
      geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
    }))
  return { type: 'FeatureCollection', features }
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
  const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH'
  const res = await fetch(url)
  if (!res.ok) return { type: 'FeatureCollection', features: [] }
  const data = await res.json()
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
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
