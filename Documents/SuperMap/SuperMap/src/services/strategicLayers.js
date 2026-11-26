/**
 * Strategic layers and desk data.
 *
 * Every call reads the collector's published snapshot first, then the API's
 * cache-first route, and never an external host. A missing source returns null so
 * the layer stays empty instead of blocking the map.
 */
import { loadSnapshot } from '../lib/snapshotClient'
import { apiGetJson } from '../lib/homeBootstrap'

const TIMEOUT_MS = 12000

/** Names as the collector publishes them. */
export const STRATEGIC_SOURCES = Object.freeze({
  warspotting: 'strategic-warspotting',
  satellites: 'strategic-satellites',
  launches: 'strategic-launches',
  briefs: 'strategic-briefs',
  ucdp: 'strategic-ucdp',
  censorship: 'strategic-censorship',
  kev: 'strategic-kev',
  ransomware: 'strategic-ransomware',
  radiation: 'strategic-radiation',
  balloons: 'strategic-balloons',
})

/** Raw payload for one source: snapshot, then the API route. */
export async function loadStrategic(key) {
  const name = STRATEGIC_SOURCES[key] || key
  const snapshot = await loadSnapshot(name)
  if (snapshot) return snapshot
  try {
    const res = await apiGetJson(`/api/strategic/${name.replace(/^strategic-/, '')}`, { timeoutMs: TIMEOUT_MS })
    const data = res?.data
    if (data && !data.empty && !data.warming) return data
  } catch { /* the desk shows what it has */ }
  return null
}

function asCollection(payload) {
  if (!payload) return null
  if (payload.type === 'FeatureCollection') return payload
  return null
}

/** A published collection for a map layer, or null when it is not available yet. */
export async function fetchStrategicLayer(key) {
  return asCollection(await loadStrategic(key))
}

export const fetchStrategicWarspotting = () => fetchStrategicLayer('warspotting')
export const fetchStrategicSatellites = () => fetchStrategicLayer('satellites')
export const fetchStrategicUcdp = () => fetchStrategicLayer('ucdp')
export const fetchStrategicRadiation = () => fetchStrategicLayer('radiation')
export const fetchStrategicBalloons = () => fetchStrategicLayer('balloons')

/** Everything the desk shows, in parallel; a failing source is simply absent. */
export async function loadStrategicDesk() {
  const keys = Object.keys(STRATEGIC_SOURCES)
  const settled = await Promise.allSettled(keys.map((key) => loadStrategic(key)))
  const out = {}
  keys.forEach((key, index) => {
    const result = settled[index]
    if (result.status === 'fulfilled' && result.value) out[key] = result.value
  })
  return out
}
