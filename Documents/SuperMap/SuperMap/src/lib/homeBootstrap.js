/**
 * HomeScreen bootstrap: localStorage snapshot + single /api/home fetch.
 * Instant paint from last good payload; network revalidates in background.
 */

const SNAPSHOT_KEY = 'supermap_home_snapshot'
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h — still show, then refresh

export function getApiBase() {
  const raw = import.meta.env?.VITE_API_URL
  if (raw !== undefined && raw !== '') return String(raw).replace(/\/$/, '')
  return 'http://localhost:3001'
}

/** Fire-and-forget wake so Render cold start overlaps JS/React boot. */
export function wakeApiEarly() {
  const base = getApiBase()
  if (!base || typeof fetch !== 'function') return
  try {
    fetch(`${base}/health`, { method: 'GET', mode: 'cors', cache: 'no-store', keepalive: true }).catch(() => {})
  } catch (_) { /* ignore */ }
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
  } catch (_) {
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
  } catch (_) { /* quota / private mode */ }
}

/** Map OSINT-X posts → image gallery items (same shape as HomeScreen used). */
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

/**
 * Fetch /api/home. Prefer network; on failure return snapshot if present.
 * @returns {Promise<{ data: object|null, fromSnapshot: boolean, error?: string }>}
 */
export async function fetchHomeBootstrap({ signal, timeoutMs = 60000 } = {}) {
  const base = getApiBase()
  if (!base) {
    const snap = readHomeSnapshot()
    return { data: snap, fromSnapshot: !!snap, error: 'No API base' }
  }

  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  if (signal) {
    if (signal.aborted) ctrl.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  try {
    const res = await fetch(`${base}/api/home`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Home bootstrap HTTP ${res.status}`)
    const data = await res.json()
    writeHomeSnapshot(data)
    return { data, fromSnapshot: false }
  } catch (err) {
    const snap = readHomeSnapshot()
    if (snap) return { data: snap, fromSnapshot: true, error: err?.message }
    return { data: null, fromSnapshot: false, error: err?.message || 'Failed to load home' }
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}
