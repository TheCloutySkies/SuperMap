/**
 * Real-scale US Letter print math for orienteering / land nav.
 *
 * Paper is always US Letter (215.9 × 279.4 mm). The map *frame* inside the
 * collar is 200 × 240 mm in portrait so that:
 *   1:25 000  →  5 × 6 km
 *   1:50 000  → 10 × 12 km
 *   100 mm on paper at 1:25k  →  2.5 km  (collar scale bar)
 *
 * Ground coverage is computed in UTM metres from the paper millimetres and
 * the representative fraction — not from MapLibre zoom labels.
 */

import { latLngToUtm, utmToLatLng, utmZoneFromLng } from './utmMgrs'

export const LETTER_MM = Object.freeze({ width: 215.9, height: 279.4 })
export const LETTER_IN = Object.freeze({ width: 8.5, height: 11 })

/** Inner map frame (collar leftover ~8 mm sides, ~20 mm top/bottom). */
export const MAP_FRAME_MM = Object.freeze({ width: 200, height: 240 })

export const PRINT_SCALES = Object.freeze([
  {
    id: '15k',
    ratio: 15000,
    label: '1:15k orienteering',
    short: '1:15 000',
    note: '3 × 3.6 km',
  },
  {
    id: '24k',
    ratio: 24000,
    label: '1:24k USGS',
    short: '1:24 000',
    note: '4.8 × 5.76 km',
  },
  {
    id: '25k',
    ratio: 25000,
    label: '1:25k (5×6 km)',
    short: '1:25 000',
    note: '5 × 6 km',
  },
  {
    id: '48k',
    ratio: 48000,
    label: '1:48k USGS',
    short: '1:48 000',
    note: '9.6 × 11.52 km',
  },
  {
    id: '50k',
    ratio: 50000,
    label: '1:50k (10×12 km)',
    short: '1:50 000',
    note: '10 × 12 km',
  },
])

export const DEFAULT_SCALE_ID = '25k'

export function getScale(id) {
  return PRINT_SCALES.find((s) => s.id === id) || PRINT_SCALES.find((s) => s.id === DEFAULT_SCALE_ID)
}

/** Map-frame size in mm for an orientation. Landscape swaps the frame. */
export function frameMm(orientation) {
  if (orientation === 'landscape') {
    return { width: MAP_FRAME_MM.height, height: MAP_FRAME_MM.width }
  }
  return { width: MAP_FRAME_MM.width, height: MAP_FRAME_MM.height }
}

/** Ground coverage of the map frame at a representative fraction. */
export function groundSizeM(ratio, orientation) {
  const frame = frameMm(orientation)
  return {
    widthM: (frame.width / 1000) * ratio,
    heightM: (frame.height / 1000) * ratio,
  }
}

/** Collar scale-bar length: 100 mm on paper → ground metres at this scale. */
export function scaleBarGroundM(ratio) {
  return (100 / 1000) * ratio
}

export function formatGroundKm(metres, units = 'metric') {
  if (units === 'imperial') {
    const miles = metres / 1609.344
    if (miles >= 10) return `${miles.toFixed(1)} mi`
    return `${(metres / 0.3048).toFixed(0)} ft`
  }
  if (metres >= 1000) {
    const km = metres / 1000
    return Number.isInteger(km) ? `${km} km` : `${km.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} km`
  }
  return `${Math.round(metres)} m`
}

let pageSeq = 1
export function nextPageId() {
  pageSeq += 1
  return `p${Date.now().toString(36)}${pageSeq}`
}

/**
 * UTM-aligned rectangle around a WGS84 center.
 * Returns geographic corners (SW, SE, NE, NW, SW) and the UTM footprint.
 */
export function pageGeometry(lng, lat, ratio, orientation) {
  const zone = utmZoneFromLng(lng)
  const utm = latLngToUtm(lat, lng, zone)
  const { widthM, heightM } = groundSizeM(ratio, orientation)
  const hw = widthM / 2
  const hh = heightM / 2
  const cornersUtm = [
    [utm.easting - hw, utm.northing - hh],
    [utm.easting + hw, utm.northing - hh],
    [utm.easting + hw, utm.northing + hh],
    [utm.easting - hw, utm.northing + hh],
  ]
  const corners = cornersUtm.map(([e, n]) => {
    const p = utmToLatLng(e, n, zone, utm.north)
    return [p.lng, p.lat]
  })
  const ring = [...corners, corners[0]]
  const lngs = corners.map((c) => c[0])
  const lats = corners.map((c) => c[1])
  return {
    zone,
    north: utm.north,
    easting: utm.easting,
    northing: utm.northing,
    widthM,
    heightM,
    corners,
    ring,
    bbox: {
      west: Math.min(...lngs),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      north: Math.max(...lats),
    },
  }
}

export function pageToFeature(page) {
  const scale = getScale(page.scaleId)
  const geo = pageGeometry(page.lng, page.lat, scale.ratio, page.orientation)
  return {
    type: 'Feature',
    properties: {
      id: page.id,
      scaleId: page.scaleId,
      scaleLabel: scale.short,
      orientation: page.orientation,
      widthKm: +(geo.widthM / 1000).toFixed(2),
      heightKm: +(geo.heightM / 1000).toFixed(2),
    },
    geometry: { type: 'Polygon', coordinates: [geo.ring] },
  }
}

export function pagesToFeatureCollection(pages) {
  return { type: 'FeatureCollection', features: pages.map(pageToFeature) }
}

export function pagesToLabelCollection(pages) {
  return {
    type: 'FeatureCollection',
    features: pages.map((page) => {
      const props = pageToFeature(page).properties
      return {
        type: 'Feature',
        properties: {
          ...props,
          caption: `${props.scaleLabel}  ${props.widthKm}×${props.heightKm} km`,
        },
        geometry: { type: 'Point', coordinates: [page.lng, page.lat] },
      }
    }),
  }
}

export function makePage({ lng, lat, scaleId, orientation, id }) {
  return {
    id: id || nextPageId(),
    lng: Number(lng),
    lat: Number(lat),
    scaleId,
    orientation,
  }
}

/**
 * Snap a UTM easting/northing: if within `edgeTolM` of another page's edge,
 * snap to that edge; otherwise round to `stepM` (1 km).
 */
export function snapUtm(easting, northing, others, widthM, heightM, stepM = 1000, edgeTolM = 200) {
  let e = easting
  let n = northing
  let snapped = false
  for (const o of others) {
    const dx = o.easting - e
    const dy = o.northing - n
    const pairW = (widthM + o.widthM) / 2
    const pairH = (heightM + o.heightM) / 2
    if (Math.abs(Math.abs(dx) - pairW) < edgeTolM && Math.abs(dy) < edgeTolM) {
      e = o.easting - Math.sign(dx || 1) * pairW
      n = o.northing
      snapped = true
    }
    if (Math.abs(Math.abs(dy) - pairH) < edgeTolM && Math.abs(dx) < edgeTolM) {
      n = o.northing - Math.sign(dy || 1) * pairH
      e = o.easting
      snapped = true
    }
  }
  if (!snapped) {
    e = Math.round(e / stepM) * stepM
    n = Math.round(n / stepM) * stepM
  }
  return { easting: e, northing: n }
}

export function movePageToLngLat(page, lng, lat, allPages) {
  const scale = getScale(page.scaleId)
  const geo = pageGeometry(lng, lat, scale.ratio, page.orientation)
  const others = allPages
    .filter((p) => p.id !== page.id)
    .map((p) => {
      const s = getScale(p.scaleId)
      return pageGeometry(p.lng, p.lat, s.ratio, p.orientation)
    })
  const snapped = snapUtm(geo.easting, geo.northing, others, geo.widthM, geo.heightM)
  const ll = utmToLatLng(snapped.easting, snapped.northing, geo.zone, geo.north)
  return { ...page, lng: ll.lng, lat: ll.lat }
}

export function nudgePage(page, dEasting, dNorthing) {
  const scale = getScale(page.scaleId)
  const geo = pageGeometry(page.lng, page.lat, scale.ratio, page.orientation)
  const ll = utmToLatLng(geo.easting + dEasting, geo.northing + dNorthing, geo.zone, geo.north)
  return { ...page, lng: ll.lng, lat: ll.lat }
}

/**
 * Fill a geographic rectangle with pages at the current scale, edge-to-edge in UTM.
 */
export function fillAreaWithPages(west, south, east, north, scaleId, orientation) {
  const scale = getScale(scaleId)
  const { widthM, heightM } = groundSizeM(scale.ratio, orientation)
  const midLng = (west + east) / 2
  const zone = utmZoneFromLng(midLng)
  const sw = latLngToUtm(south, west, zone)
  const ne = latLngToUtm(north, east, zone)
  const minE = Math.min(sw.easting, ne.easting)
  const maxE = Math.max(sw.easting, ne.easting)
  const minN = Math.min(sw.northing, ne.northing)
  const maxN = Math.max(sw.northing, ne.northing)
  const cols = Math.max(1, Math.round((maxE - minE) / widthM))
  const rows = Math.max(1, Math.round((maxN - minN) / heightM))
  const cap = 40
  const pages = []
  const useCols = Math.min(cols, cap)
  const useRows = Math.min(rows, Math.floor(cap / useCols) || 1)
  for (let r = 0; r < useRows; r += 1) {
    for (let c = 0; c < useCols; c += 1) {
      const e = minE + (c + 0.5) * widthM
      const n = minN + (r + 0.5) * heightM
      const ll = utmToLatLng(e, n, zone, sw.north)
      pages.push(makePage({ lng: ll.lng, lat: ll.lat, scaleId, orientation }))
    }
  }
  return pages
}

export function hitTestPage(lng, lat, pages) {
  for (let i = pages.length - 1; i >= 0; i -= 1) {
    const page = pages[i]
    const scale = getScale(page.scaleId)
    const geo = pageGeometry(page.lng, page.lat, scale.ratio, page.orientation)
    const { zone } = geo
    const p = latLngToUtm(lat, lng, zone)
    const hw = geo.widthM / 2
    const hh = geo.heightM / 2
    if (
      p.easting >= geo.easting - hw &&
      p.easting <= geo.easting + hw &&
      p.northing >= geo.northing - hh &&
      p.northing <= geo.northing + hh
    ) {
      return page
    }
  }
  return null
}

/**
 * MapLibre GL zoom so that `canvasWidthPx` pixels span `widthM` metres at `lat`.
 * MapLibre transform tile size is 512 CSS pixels.
 */
export function zoomForScale(lat, widthM, canvasWidthPx) {
  const earthCirc = 2 * Math.PI * 6378137
  const mpp = widthM / canvasWidthPx
  const cos = Math.cos((lat * Math.PI) / 180)
  const safeCos = Math.max(0.01, Math.abs(cos))
  return Math.log2((earthCirc * safeCos) / (mpp * 512))
}

export function letterCssPx(orientation, dpiCss = 96) {
  const wIn = orientation === 'landscape' ? LETTER_IN.height : LETTER_IN.width
  const hIn = orientation === 'landscape' ? LETTER_IN.width : LETTER_IN.height
  return { width: wIn * dpiCss, height: hIn * dpiCss }
}

export function frameCssPx(orientation, dpiCss = 96) {
  const frame = frameMm(orientation)
  return {
    width: (frame.width / 25.4) * dpiCss,
    height: (frame.height / 25.4) * dpiCss,
  }
}
