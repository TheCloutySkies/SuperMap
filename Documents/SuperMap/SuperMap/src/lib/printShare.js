import { STORAGE_KEYS } from '../constants'

const HASH_PREFIX = 'gpprint='
const PRINT_KEY = STORAGE_KEYS.PRINT_STATE

export function encodePrintState(state) {
  const payload = {
    v: 1,
    b: state.basemapId,
    s: state.scaleId,
    o: state.orientation,
    u: state.units,
    labels: state.labels,
    ink: state.ink,
    hill: state.hillshade,
    cont: state.contours,
    sec: state.secondary,
    layers: state.layerToggles,
    more: state.moreLayers,
    c: state.center || null,
    z: state.zoom || null,
    pages: (state.pages || []).map((p) => [
      p.lng,
      p.lat,
      p.scaleId,
      p.orientation,
      p.id,
    ]),
  }
  try {
    const json = JSON.stringify(payload)
    const bytes = new TextEncoder().encode(json)
    let bin = ''
    bytes.forEach((b) => {
      bin += String.fromCharCode(b)
    })
    return HASH_PREFIX + encodeURIComponent(btoa(bin))
  } catch {
    return ''
  }
}

export function decodePrintState(hash) {
  if (!hash) return null
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const idx = raw.indexOf(HASH_PREFIX)
  if (idx < 0) return null
  try {
    const bin = atob(decodeURIComponent(raw.slice(idx + HASH_PREFIX.length)))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const json = new TextDecoder().decode(bytes)
    const p = JSON.parse(json)
    if (!p || p.v !== 1) return null
    return {
      basemapId: p.b,
      scaleId: p.s,
      orientation: p.o,
      units: p.u,
      labels: p.labels,
      ink: p.ink,
      hillshade: p.hill,
      contours: p.cont,
      secondary: p.sec,
      layerToggles: p.layers || {},
      moreLayers: p.more || {},
      center: Array.isArray(p.c) ? p.c : null,
      zoom: Number.isFinite(p.z) ? p.z : null,
      pages: Array.isArray(p.pages)
        ? p.pages.map((row) => ({
            lng: row[0],
            lat: row[1],
            scaleId: row[2],
            orientation: row[3],
            id: row[4],
          }))
        : [],
    }
  } catch {
    return null
  }
}

export function writePrintHash(state) {
  const encoded = encodePrintState(state)
  if (!encoded) return
  const url = `${window.location.pathname}${window.location.search}#${encoded}`
  window.history.replaceState(null, '', url)
  try {
    localStorage.setItem(PRINT_KEY, JSON.stringify({
      ...state,
      center: state.center || null,
      zoom: state.zoom || null,
    }))
  } catch {
    /* ignore quota */
  }
}

export function loadSavedPrintState() {
  const fromHash = decodePrintState(typeof window !== 'undefined' ? window.location.hash : '')
  if (fromHash && (fromHash.pages?.length || fromHash.basemapId)) return fromHash
  try {
    const raw = localStorage.getItem(PRINT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export async function copyShareUrl(state) {
  const encoded = encodePrintState(state)
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${encoded}`
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url)
    return url
  }
  return url
}
