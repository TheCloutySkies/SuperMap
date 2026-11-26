/**
 * Read the shared snapshot the collector publishes.
 *
 * Every visitor reads the same files from raw.githubusercontent (a shared CDN,
 * ~5 min TTL), never their own upstream call. One request per file per version
 * per tab: the manifest poll is tiny and every payload is immutable per version.
 */
import { getApiBase, isLoopbackHost } from './homeBootstrap'

/** Direct CDN base. Never routed through /api rewrites: those are pass-through. */
const DEFAULT_BASE = 'https://raw.githubusercontent.com/TheCloutySkies/SuperMap/data'
/** The manifest is tiny; a minute-scale poll keeps open tabs in step. */
const MANIFEST_POLL_MS = 10 * 60 * 1000
const FILE_TIMEOUT_MS = 15000
const MANIFEST_TIMEOUT_MS = 8000

/** @type {Map<string, Promise<any>>} */
const inflight = new Map()
/** @type {Map<string, any>} */
const loaded = new Map()

export const SNAPSHOT_STATE = Object.freeze({
  UNKNOWN: 'unknown', // never reached the base
  READY: 'ready', // manifest + files reachable
  DEGRADED: 'degraded', // base unreachable, fall back to the API
})

let manifest = null
let state = SNAPSHOT_STATE.UNKNOWN
let lastError = null
const listeners = new Set()
let pollTimer = null
let started = false

export function snapshotBase() {
  const configured = import.meta.env?.VITE_SNAPSHOT_BASE
  if (configured !== undefined && configured !== '') return String(configured).replace(/\/$/, '')
  return DEFAULT_BASE
}

/** Local dev talks to the API, so there is nothing to read from the CDN there. */
export function snapshotEnabled() {
  if (typeof window === 'undefined') return false
  return !isLoopbackHost(window.location.hostname)
}

export function getManifest() {
  return manifest
}

export function getSnapshotState() {
  return { state, manifest, error: lastError }
}

function emit() {
  for (const fn of listeners) {
    try {
      fn({ state, manifest, error: lastError })
    } catch { /* listener only */ }
  }
}

async function getJson(url, timeoutMs) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** Load (or reuse) the published manifest. */
export async function loadManifest({ force = false } = {}) {
  if (!snapshotEnabled()) return null
  if (manifest && !force) return manifest
  try {
    const next = await getJson(`${snapshotBase()}/manifest.json`, MANIFEST_TIMEOUT_MS)
    const changed = !manifest || manifest.version !== next?.version
    manifest = next
    state = SNAPSHOT_STATE.READY
    lastError = null
    if (changed) emit()
    return manifest
  } catch (err) {
    state = SNAPSHOT_STATE.DEGRADED
    lastError = err?.message || 'snapshot unreachable'
    if (!manifest) emit()
    return manifest
  }
}

/**
 * Load one published payload by name (`home`, `news`, `major-hazards`, …).
 * Returns null when the snapshot cannot serve it.
 */
export async function loadSnapshot(name, { force = false } = {}) {
  if (!snapshotEnabled()) return null
  const current = manifest || await loadManifest()
  const entry = current?.sources?.[name]
  if (!entry?.file) return null
  const key = `${name}:${entry.file}`
  if (!force && loaded.has(key)) return loaded.get(key)
  if (inflight.has(key)) return inflight.get(key)
  const task = (async () => {
    try {
      const data = await getJson(`${snapshotBase()}/${entry.file}`, FILE_TIMEOUT_MS)
      loaded.set(key, data)
      return data
    } catch (err) {
      lastError = err?.message || `snapshot ${name} unavailable`
      return null
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, task)
  return task
}

export function subscribeSnapshot(fn) {
  listeners.add(fn)
  try {
    fn({ state, manifest, error: lastError })
  } catch { /* first paint */ }
  return () => listeners.delete(fn)
}

/** Poll the manifest; a version change tells every subscriber to reload. */
export function startSnapshotPolling() {
  if (started || !snapshotEnabled()) return
  started = true
  loadManifest().catch(() => {})
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    loadManifest({ force: true }).catch(() => {})
  }, MANIFEST_POLL_MS)
  if (typeof window !== 'undefined') {
    const poke = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      loadManifest({ force: true }).catch(() => {})
    }
    window.addEventListener('online', poke)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) poke()
    })
  }
}

export function stopSnapshotPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  started = false
}

/** Keep a FeatureCollection inside a bbox, so one world snapshot serves every view. */
export function clipCollection(collection, bbox) {
  if (!collection || collection.type !== 'FeatureCollection') return null
  const features = Array.isArray(collection.features) ? collection.features : []
  if (!bbox || bbox.length < 4) return { ...collection, features }
  const [w, s, e, n] = bbox
  return {
    ...collection,
    features: features.filter((feature) => {
      const coords = feature?.geometry?.coordinates
      if (!Array.isArray(coords) || coords.length < 2) return false
      const [lon, lat] = coords
      return lon >= w && lon <= e && lat >= s && lat <= n
    }),
  }
}

/** A published collection for a map layer, clipped to the viewport. */
export async function collectionSnapshot(name, bbox) {
  const data = await loadSnapshot(name)
  if (!data) return null
  return clipCollection(data, bbox)
}
