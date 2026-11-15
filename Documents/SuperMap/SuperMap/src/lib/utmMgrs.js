/**
 * WGS84 ↔ UTM and MGRS helpers for land-nav print pages.
 * Formulas: USGS Bulletin 1532 / Snyder.
 */

const A = 6378137
const E2 = 0.0066943799901413165
const EP2 = E2 / (1 - E2)
const K0 = 0.9996
const E0 = 500000
const N0_S = 10000000

const MGRS_COL = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const MGRS_ROW = 'ABCDEFGHJKLMNPQRSTUV'

export function utmZoneFromLng(lng) {
  let zone = Math.floor((lng + 180) / 6) + 1
  if (zone < 1) zone = 1
  if (zone > 60) zone = 60
  return zone
}

export function latLngToUtm(lat, lng, zone = utmZoneFromLng(lng)) {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  const lon0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180
  const sinLat = Math.sin(latRad)
  const cosLat = Math.cos(latRad)
  const tanLat = Math.tan(latRad)
  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat)
  const T = tanLat * tanLat
  const C = EP2 * cosLat * cosLat
  const AA = cosLat * (lngRad - lon0)
  const M =
    A *
    ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256) * latRad -
      ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 * E2 * E2) / 1024) * Math.sin(2 * latRad) +
      ((15 * E2 * E2) / 256 + (45 * E2 * E2 * E2) / 1024) * Math.sin(4 * latRad) -
      ((35 * E2 * E2 * E2) / 3072) * Math.sin(6 * latRad))
  const easting =
    K0 *
      N *
      (AA +
        ((1 - T + C) * AA ** 3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * AA ** 5) / 120) +
    E0
  let northing =
    K0 *
    (M +
      N *
        tanLat *
        (AA ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C * C) * AA ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * AA ** 6) / 720))
  const north = lat >= 0
  if (!north) northing += N0_S
  return { zone, north, easting, northing }
}

export function utmToLatLng(easting, northing, zone, north = true) {
  let y = northing
  if (!north) y -= N0_S
  const x = easting - E0
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180)
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
  const M = y / K0
  const mu =
    M /
    (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256))
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
  const sinP = Math.sin(phi1)
  const cosP = Math.cos(phi1)
  const tanP = Math.tan(phi1)
  const N1 = A / Math.sqrt(1 - E2 * sinP * sinP)
  const T1 = tanP * tanP
  const C1 = EP2 * cosP * cosP
  const R1 = (A * (1 - E2)) / (1 - E2 * sinP * sinP) ** 1.5
  const D = x / (N1 * K0)
  const lat =
    phi1 -
    ((N1 * tanP) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720)
  const lng =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) /
      cosP
  return { lat: (lat * 180) / Math.PI, lng: (lng * 180) / Math.PI }
}

function mgrsLatitudeBand(lat) {
  if (lat < -80 || lat > 84) return 'Z'
  const letters = 'CDEFGHJKLMNPQRSTUVWX'
  const i = Math.min(letters.length - 1, Math.floor((lat + 80) / 8))
  return letters[i]
}

function mgrs100k(easting, northing, zone) {
  const set = (zone - 1) % 3
  const colIdx = set * 8 + (Math.floor(easting / 100000) - 1)
  const col = MGRS_COL[Math.max(0, Math.min(MGRS_COL.length - 1, colIdx))]
  const rowSet = zone % 2 === 0 ? 5 : 0
  const rowIdx = (Math.floor(northing / 100000) + rowSet) % 20
  const row = MGRS_ROW[(rowIdx + 20) % 20]
  return `${col}${row}`
}

/** MGRS with 1 m precision, e.g. 18TWL8073006078 */
export function latLngToMgrs(lat, lng, digits = 5) {
  const utm = latLngToUtm(lat, lng)
  const band = mgrsLatitudeBand(lat)
  const sq = mgrs100k(utm.easting, utm.northing, utm.zone)
  const e = Math.floor(utm.easting % 100000)
  const n = Math.floor(utm.northing % 100000)
  const pad = (v) => String(v).padStart(5, '0').slice(0, digits)
  return `${utm.zone}${band}${sq}${pad(e)}${pad(n)}`
}

export function formatMgrsPretty(mgrs) {
  const m = String(mgrs || '')
  const zone = m.match(/^(\d{1,2})([C-X])([A-Z]{2})(\d+)$/)
  if (!zone) return m
  const digits = zone[4]
  const half = digits.length / 2
  return `${zone[1]}${zone[2]} ${zone[3]} ${digits.slice(0, half)} ${digits.slice(half)}`
}

/**
 * Grid spacing from viewport span so country zoom is not a 1 km mesh.
 * 50 km / 10 km / 5 km / 1 km.
 */
export function utmGridStepM(west, south, east, north) {
  const midLat = (south + north) / 2
  const midLng = (west + east) / 2
  const { zone } = latLngToUtm(midLat, midLng)
  const sw = latLngToUtm(south, west, zone)
  const ne = latLngToUtm(north, east, zone)
  const spanM = Math.max(Math.abs(ne.easting - sw.easting), Math.abs(ne.northing - sw.northing))
  if (spanM > 500000) return 50000
  if (spanM > 150000) return 10000
  if (spanM > 50000) return 5000
  return 1000
}

/**
 * UTM grid lines covering a WGS84 bbox, in the zone of the bbox center.
 */
export function utmGridFeatures(west, south, east, north, stepM) {
  const step = stepM || utmGridStepM(west, south, east, north)
  const midLat = (south + north) / 2
  const midLng = (west + east) / 2
  const { zone, north: hem } = latLngToUtm(midLat, midLng)
  const sw = latLngToUtm(south, west, zone)
  const ne = latLngToUtm(north, east, zone)
  const minE = Math.min(sw.easting, ne.easting) - step
  const maxE = Math.max(sw.easting, ne.easting) + step
  const minN = Math.min(sw.northing, ne.northing) - step
  const maxN = Math.max(sw.northing, ne.northing) + step
  const features = []
  const startE = Math.floor(minE / step) * step
  const startN = Math.floor(minN / step) * step
  const nAlongN = Math.max(1, Math.round((maxN - minN) / step))
  const nAlongE = Math.max(1, Math.round((maxE - minE) / step))
  const sampleN = Math.max(1, Math.ceil(nAlongN / 24))
  const sampleE = Math.max(1, Math.ceil(nAlongE / 24))
  for (let e = startE; e <= maxE; e += step) {
    const coords = []
    for (let n = startN; n <= maxN; n += step * sampleN) {
      const p = utmToLatLng(e, n, zone, hem)
      coords.push([p.lng, p.lat])
    }
    if (coords.length < 2) {
      const p2 = utmToLatLng(e, maxN, zone, hem)
      coords.push([p2.lng, p2.lat])
    }
    features.push({
      type: 'Feature',
      properties: { kind: 'utm-east', km: Math.round(e / 1000) },
      geometry: { type: 'LineString', coordinates: coords },
    })
  }
  for (let n = startN; n <= maxN; n += step) {
    const coords = []
    for (let e = startE; e <= maxE; e += step * sampleE) {
      const p = utmToLatLng(e, n, zone, hem)
      coords.push([p.lng, p.lat])
    }
    if (coords.length < 2) {
      const p2 = utmToLatLng(maxE, n, zone, hem)
      coords.push([p2.lng, p2.lat])
    }
    features.push({
      type: 'Feature',
      properties: { kind: 'utm-north', km: Math.round(n / 1000) },
      geometry: { type: 'LineString', coordinates: coords },
    })
  }
  return {
    type: 'FeatureCollection',
    features,
    zone,
    hem,
  }
}

/**
 * Lat/long graticule at a step in degrees chosen for the span.
 */
export function latLongGridFeatures(west, south, east, north, stepDeg) {
  const features = []
  const minLon = Math.floor(west / stepDeg) * stepDeg
  const minLat = Math.floor(south / stepDeg) * stepDeg
  for (let lon = minLon; lon <= east + stepDeg; lon += stepDeg) {
    features.push({
      type: 'Feature',
      properties: { kind: 'meridian', label: lon.toFixed(stepDeg < 0.1 ? 2 : 1) },
      geometry: {
        type: 'LineString',
        coordinates: [
          [lon, south - stepDeg],
          [lon, north + stepDeg],
        ],
      },
    })
  }
  for (let lat = minLat; lat <= north + stepDeg; lat += stepDeg) {
    features.push({
      type: 'Feature',
      properties: { kind: 'parallel', label: lat.toFixed(stepDeg < 0.1 ? 2 : 1) },
      geometry: {
        type: 'LineString',
        coordinates: [
          [west - stepDeg, lat],
          [east + stepDeg, lat],
        ],
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function mgrsLabelFeatures(west, south, east, north, stepM) {
  const step = stepM || utmGridStepM(west, south, east, north)
  const midLat = (south + north) / 2
  const midLng = (west + east) / 2
  const { zone, north: hem } = latLngToUtm(midLat, midLng)
  const sw = latLngToUtm(south, west, zone)
  const ne = latLngToUtm(north, east, zone)
  const minE = Math.floor(Math.min(sw.easting, ne.easting) / step) * step
  const maxE = Math.ceil(Math.max(sw.easting, ne.easting) / step) * step
  const minN = Math.floor(Math.min(sw.northing, ne.northing) / step) * step
  const maxN = Math.ceil(Math.max(sw.northing, ne.northing) / step) * step
  const features = []
  const labelStep = Math.max(step, 10000)
  for (let e = minE; e <= maxE; e += labelStep) {
    for (let n = minN; n <= maxN; n += labelStep) {
      const p = utmToLatLng(e + labelStep / 2, n + labelStep / 2, zone, hem)
      const mgrs = latLngToMgrs(p.lat, p.lng, 2)
      features.push({
        type: 'Feature',
        properties: { label: formatMgrsPretty(mgrs) },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}
