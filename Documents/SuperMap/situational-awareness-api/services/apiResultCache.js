/**
 * Durable API result cache — memory + on-disk, with TTL presets.
 * Use for slow-changing upstreams (stocks, gas, space, etc.) so restarts
 * and home-bootstrap polls do not re-hit external APIs every minute.
 *
 * Fresh hits: age < ttlSec
 * Stale hits: age < staleTtlSec (served on fetch failure or optional SWR)
 */

const fs = require('fs')
const path = require('path')

const CACHE_DIR = path.join(__dirname, '..', 'data', 'api-cache')

/** Named TTL presets (seconds). */
const TTL = Object.freeze({
  /** Intraday market quotes — long enough to stop spam, short enough for widgets. */
  MARKET: 30 * 60,
  HOURLY: 60 * 60,
  SIX_HOURS: 6 * 60 * 60,
  /** Daily-updated sources (EIA weekly gas, APOD-style). */
  DAILY: 24 * 60 * 60,
  WEEKLY: 7 * 24 * 60 * 60,
})

/** @type {Map<string, { entries: Record<string, CacheEntry>, dirty: boolean }>} */
const memory = new Map()
/** @type {Map<string, NodeJS.Timeout>} */
const flushTimers = new Map()
const FLUSH_DEBOUNCE_MS = 250

/**
 * @typedef {{ value: any, fetchedAt: number, ttlSec: number }} CacheEntry
 */

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
}

function nsPath(namespace) {
  const safe = String(namespace || 'default').replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(CACHE_DIR, `${safe}.json`)
}

function loadNamespace(namespace) {
  if (memory.has(namespace)) return memory.get(namespace)
  let entries = {}
  try {
    const p = nsPath(namespace)
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (raw && typeof raw === 'object' && raw.entries && typeof raw.entries === 'object') {
        entries = raw.entries
      }
    }
  } catch (err) {
    console.warn(`[apiResultCache] load ${namespace}:`, err.message)
  }
  const bag = { entries, dirty: false }
  memory.set(namespace, bag)
  return bag
}

function scheduleFlush(namespace) {
  if (flushTimers.has(namespace)) return
  const t = setTimeout(() => {
    flushTimers.delete(namespace)
    flushNamespace(namespace)
  }, FLUSH_DEBOUNCE_MS)
  if (typeof t.unref === 'function') t.unref()
  flushTimers.set(namespace, t)
}

function flushNamespace(namespace) {
  const bag = memory.get(namespace)
  if (!bag || !bag.dirty) return
  try {
    ensureDir()
    const p = nsPath(namespace)
    const tmp = `${p}.${process.pid}.tmp`
    const payload = {
      namespace,
      updatedAt: new Date().toISOString(),
      entries: bag.entries,
    }
    fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8')
    fs.renameSync(tmp, p)
    bag.dirty = false
  } catch (err) {
    console.warn(`[apiResultCache] flush ${namespace}:`, err.message)
  }
}

function ageMs(entry, now = Date.now()) {
  if (!entry || typeof entry.fetchedAt !== 'number') return Infinity
  return Math.max(0, now - entry.fetchedAt)
}

/**
 * @returns {{ value: any, fetchedAt: number, ttlSec: number, ageMs: number, fresh: boolean } | null}
 */
function peek(namespace, key, now = Date.now()) {
  const bag = loadNamespace(namespace)
  const entry = bag.entries[key]
  if (!entry || entry.value === undefined) return null
  const age = ageMs(entry, now)
  const ttlSec = typeof entry.ttlSec === 'number' ? entry.ttlSec : TTL.HOURLY
  return {
    value: entry.value,
    fetchedAt: entry.fetchedAt,
    ttlSec,
    ageMs: age,
    fresh: age < ttlSec * 1000,
  }
}

/** Return value only if still within its TTL. */
function getFresh(namespace, key) {
  const hit = peek(namespace, key)
  if (!hit || !hit.fresh) return null
  return hit
}

/**
 * Return value if age < staleTtlSec (even if past fresh TTL).
 * @param {number} staleTtlSec max age to accept as stale
 */
function getStale(namespace, key, staleTtlSec = TTL.DAILY) {
  const hit = peek(namespace, key)
  if (!hit) return null
  if (hit.ageMs > staleTtlSec * 1000) return null
  return hit
}

function set(namespace, key, value, ttlSec = TTL.HOURLY) {
  const bag = loadNamespace(namespace)
  bag.entries[key] = {
    value,
    fetchedAt: Date.now(),
    ttlSec: Math.max(1, Number(ttlSec) || TTL.HOURLY),
  }
  bag.dirty = true
  scheduleFlush(namespace)
  return bag.entries[key]
}

function del(namespace, key) {
  const bag = loadNamespace(namespace)
  if (key == null) {
    bag.entries = {}
  } else {
    delete bag.entries[key]
  }
  bag.dirty = true
  scheduleFlush(namespace)
}

/**
 * Cache-aside helper.
 * @param {string} namespace
 * @param {string} key
 * @param {{ ttlSec?: number, staleTtlSec?: number, force?: boolean }} opts
 * @param {() => Promise<any>} fetcher — return null/undefined to skip caching
 */
async function getOrFetch(namespace, key, opts, fetcher) {
  const ttlSec = opts?.ttlSec ?? TTL.HOURLY
  const staleTtlSec = opts?.staleTtlSec ?? Math.max(ttlSec * 4, TTL.DAILY)
  const force = !!opts?.force

  if (!force) {
    const fresh = getFresh(namespace, key)
    if (fresh) {
      return {
        value: fresh.value,
        fromCache: true,
        stale: false,
        fetchedAt: fresh.fetchedAt,
        ageMs: fresh.ageMs,
      }
    }
  }

  try {
    const value = await fetcher()
    if (value != null) {
      const entry = set(namespace, key, value, ttlSec)
      return {
        value,
        fromCache: false,
        stale: false,
        fetchedAt: entry.fetchedAt,
        ageMs: 0,
      }
    }
  } catch (err) {
    const stale = getStale(namespace, key, staleTtlSec)
    if (stale) {
      return {
        value: stale.value,
        fromCache: true,
        stale: true,
        fetchedAt: stale.fetchedAt,
        ageMs: stale.ageMs,
        error: err?.message || String(err),
      }
    }
    throw err
  }

  const stale = getStale(namespace, key, staleTtlSec)
  if (stale) {
    return {
      value: stale.value,
      fromCache: true,
      stale: true,
      fetchedAt: stale.fetchedAt,
      ageMs: stale.ageMs,
    }
  }
  return { value: null, fromCache: false, stale: false, fetchedAt: null, ageMs: null }
}

function stats() {
  const out = {}
  // include loaded namespaces + files on disk
  ensureDir()
  let files = []
  try {
    files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'))
  } catch (_) { /* empty */ }
  for (const f of files) {
    const ns = f.replace(/\.json$/, '')
    loadNamespace(ns)
  }
  for (const [ns, bag] of memory.entries()) {
    const now = Date.now()
    let fresh = 0
    let stale = 0
    for (const entry of Object.values(bag.entries)) {
      const age = ageMs(entry, now)
      if (age < (entry.ttlSec || 0) * 1000) fresh += 1
      else stale += 1
    }
    out[ns] = { keys: Object.keys(bag.entries).length, fresh, stale }
  }
  return { dir: CACHE_DIR, namespaces: out }
}

/** Flush all dirty namespaces synchronously (tests / shutdown). */
function flushAll() {
  for (const ns of memory.keys()) flushNamespace(ns)
}

module.exports = {
  TTL,
  CACHE_DIR,
  peek,
  getFresh,
  getStale,
  set,
  del,
  getOrFetch,
  stats,
  flushAll,
}
