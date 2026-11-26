/**
 * Home bootstrap transport: seed snapshot + /api/home, with retries.
 *
 * Why this is careful about the base URL: a production build fell back to
 * `http://localhost:3001`, so every request from the deployed site hit the
 * visitor's own machine and nothing could load. A deployed page now talks to its
 * own origin (`/api/...`, proxied by the host's rewrites) and keeps the Render
 * host as a second candidate, so a missing env var can no longer blank the site.
 */

const SNAPSHOT_KEY = 'supermap_home_snapshot'
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h — still show, then refresh

/** Static, CDN-served last-good payload for a browser with no local snapshot. */
const SEED_URL = '/home-seed.json'
const SEED_TIMEOUT_MS = 8000

/** Second candidate when same-origin /api is not proxied (the API sends CORS for it). */
const DIRECT_API_BASE = 'https://supermap-api.onrender.com'
const DEV_API_BASE = 'http://localhost:3001'

/** Cold-open network budget per attempt — never block first paint longer than this. */
const HOME_FETCH_TIMEOUT_MS = 12000
/** A sleeping Render instance takes ~20s to answer, so one 12s attempt is not enough. */
const HOME_RETRY_TIMEOUTS = [12000, 16000, 20000]
const HOME_RETRY_DELAYS = [1500, 4000]

/** Coarse state the UI can render honestly instead of "Loading…" forever. */
export const HOME_STATE = Object.freeze({
  SEED: 'seed', // painted from snapshot / seed file, live still pending
  WAKING: 'waking', // API unreachable, retries running
  LIVE: 'live', // payload came from the API
  FAILED: 'failed', // every attempt failed; a retry can still be asked for
})

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/i

export function isLoopbackHost(hostname) {
  return LOOPBACK.test(String(hostname || '')) || String(hostname || '').endsWith('.local')
}

/**
 * API base for every caller (`${getApiBase()}/api/...`).
 * - `VITE_API_URL` wins when configured.
 * - Loopback hosts (dev) talk to the API on port 3001.
 * - Anywhere else: this page's own origin, so `/api/*` is proxied by the host.
 */
export function getApiBase() {
  const raw = import.meta.env?.VITE_API_URL
  if (raw !== undefined && raw !== '') return String(raw).replace(/\/$/, '')
  if (typeof window === 'undefined') return DEV_API_BASE
  const { hostname, origin } = window.location
  if (isLoopbackHost(hostname)) return DEV_API_BASE
  return origin
}

/** Bases to try, in order, for a request that must not fail on one bad base. */
export function apiBases() {
  const bases = [getApiBase()]
  if (!import.meta.env?.VITE_API_URL) bases.push(DIRECT_API_BASE)
  return [...new Set(bases.filter(Boolean).map((b) => String(b).replace(/\/$/, '')))]
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener?.('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}

function linkSignal(signal, ctrl) {
  if (!signal) return () => {}
  const onAbort = () => ctrl.abort()
  if (signal.aborted) ctrl.abort()
  else signal.addEventListener('abort', onAbort, { once: true })
  return () => signal.removeEventListener('abort', onAbort)
}

/**
 * GET JSON from the API, trying each candidate base.
 * @returns {Promise<{ data?: any, etag?: string|null, notModified?: boolean, base?: string }>}
 */
export async function apiGetJson(path, { timeoutMs = HOME_FETCH_TIMEOUT_MS, etag = null, signal } = {}) {
  const bases = apiBases()
  let lastError = null
  for (const base of bases) {
    const ctrl = new AbortController()
    const unlink = linkSignal(signal, ctrl)
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const headers = { Accept: 'application/json' }
      if (etag) headers['If-None-Match'] = etag
      const res = await fetch(`${base}${path}`, {
        headers,
        signal: ctrl.signal,
        cache: 'no-store',
        mode: 'cors',
      })
      if (res.status === 304) return { notModified: true, etag: res.headers.get('ETag') || etag, base }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return { data, etag: res.headers.get('ETag') || etag, base, notModified: false }
    } catch (err) {
      lastError = err
    } finally {
      clearTimeout(timer)
      unlink()
    }
  }
  throw lastError || new Error('Request failed')
}

/** Fire-and-forget wake so a Render cold start overlaps JS/React boot. */
export function wakeApiEarly() {
  if (typeof fetch !== 'function') return
  const base = apiBases()[0]
  if (!base) return
  try {
    fetch(`${base}/health`, { method: 'GET', mode: 'cors', cache: 'no-store', keepalive: true }).catch(() => {})
    fetch(`${base}/api/home`, { method: 'GET', mode: 'cors', cache: 'no-store', keepalive: true }).catch(() => {})
  } catch { /* ignore */ }
}

export function readHomeSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const savedAt = parsed._savedAt ? Date.parse(parsed._savedAt) : 0
    if (savedAt && Date.now() - savedAt > SNAPSHOT_MAX_AGE_MS) {
      // Still usable as stale UI; mark it
      return { ...parsed, _stale: true }
    }
    return parsed
  } catch {
    return null
  }
}

export function writeHomeSnapshot(payload) {
  if (!payload || typeof payload !== 'object') return
  try {
    const toStore = {
      ...payload,
      _savedAt: new Date().toISOString(),
    }
    // Avoid storing huge news payloads forever — keep a slice
    if (toStore.news?.features?.length > 40) {
      toStore.news = {
        ...toStore.news,
        features: toStore.news.features.slice(0, 40),
      }
    }
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(toStore))
  } catch { /* quota / private mode */ }
}

function hasValue(value) {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    if (Array.isArray(value.features)) return value.features.length > 0
    if (Array.isArray(value.events)) return value.events.length > 0
    return Object.keys(value).length > 0
  }
  return true
}

/** Piece-level merge: a thin or warming payload can never blank a field already painted. */
export function mergeHomePayload(base, incoming) {
  if (!incoming || typeof incoming !== 'object') return base || null
  if (!base || typeof base !== 'object') return incoming
  const out = { ...base }
  for (const [key, value] of Object.entries(incoming)) {
    if (key.startsWith('_')) continue
    if (key === 'updatedAt') {
      out.updatedAt = value || out.updatedAt
      continue
    }
    if (!hasValue(value)) continue
    if (
      key === 'news'
      && Array.isArray(base.news?.features)
      && Array.isArray(value.features)
      && value.features.length < base.news.features.length
    ) {
      continue // keep the richer set
    }
    out[key] = value
  }
  return out
}

/** Static seed payload: instant last-good for a wiped browser, served by the CDN. */
export async function loadHomeSeed({ signal } = {}) {
  if (typeof fetch !== 'function') return null
  const ctrl = new AbortController()
  const unlink = linkSignal(signal, ctrl)
  const timer = setTimeout(() => ctrl.abort(), SEED_TIMEOUT_MS)
  try {
    const res = await fetch(SEED_URL, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || typeof data !== 'object') return null
    return { ...data, _fromSeed: true }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    unlink()
  }
}

/**
 * One /api/home attempt (both candidate bases, one timeout budget).
 * @returns {Promise<{ data: object|null, notModified?: boolean, etag?: string|null, fromSnapshot?: boolean, error?: string }>}
 */
export async function fetchHomeBootstrap({ signal, timeoutMs = HOME_FETCH_TIMEOUT_MS, etag = null } = {}) {
  try {
    const res = await apiGetJson('/api/home', { timeoutMs, etag, signal })
    if (res.notModified) return { data: null, notModified: true, etag: res.etag, fromSnapshot: false }
    return { data: res.data, etag: res.etag, fromSnapshot: false }
  } catch (err) {
    const snap = readHomeSnapshot()
    if (snap) return { data: snap, fromSnapshot: true, error: err?.message }
    return { data: null, fromSnapshot: false, error: err?.message || 'Failed to load home' }
  }
}

/**
 * /api/home with backoff — a sleeping Render instance answers in ~20s, so a single
 * 12s attempt used to leave the whole site blank until a manual reload.
 */
export async function fetchHomeWithRetry({
  signal,
  etag = null,
  timeouts = HOME_RETRY_TIMEOUTS,
  delays = HOME_RETRY_DELAYS,
  onAttempt,
} = {}) {
  let lastError = null
  for (let i = 0; i < timeouts.length; i += 1) {
    if (signal?.aborted) return { ok: false, aborted: true, error: 'aborted', attempts: i }
    try {
      const res = await apiGetJson('/api/home', { timeoutMs: timeouts[i], etag, signal })
      if (res.notModified) return { ok: true, notModified: true, etag: res.etag, attempts: i + 1 }
      return { ok: true, data: res.data, etag: res.etag, attempts: i + 1 }
    } catch (err) {
      lastError = err
      onAttempt?.(i + 1, timeouts.length, err)
      if (i < timeouts.length - 1) await sleep(delays[i] ?? 3000, signal)
    }
  }
  return { ok: false, error: lastError?.message || 'Failed to load home', attempts: timeouts.length }
}

/** Map OSINT-X posts → image gallery items (same shape HomeScreen used). */
export function osintXToImages(posts, max = 24) {
  const list = Array.isArray(posts) ? posts : []
  const caption = (p) => (p.content || p.title || '').trim().slice(0, 400)
  const items = list.flatMap((p) => {
    const postUrl = p.url && typeof p.url === 'string' && p.url.startsWith('http') ? p.url : null
    return (Array.isArray(p.images) ? p.images : [])
      .filter((src) => typeof src === 'string' && src.startsWith('http'))
      .map((src) => ({ src, postUrl: postUrl || src, caption: caption(p) }))
  })
  return items.slice(0, max)
}

/** Banner ticker text from osint-x posts. */
export function osintXToBannerItems(posts, max = 15) {
  const list = Array.isArray(posts) ? posts : []
  return list
    .map((p) => {
      const account = p.account ? `@${p.account} ` : ''
      const text = (p.title || p.content || '').trim().slice(0, 140)
      return text ? `${account}${text}` : null
    })
    .filter(Boolean)
    .slice(0, max)
}
