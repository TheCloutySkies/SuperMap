/**
 * One situational payload for the whole site.
 *
 * Order: local snapshot → static seed file → /api/home with backoff → 60s ETag poll.
 * Every consumer (home, banner, X/OSINT, feeds) subscribes to the same store, so a
 * single fetch fills the site and a finished server-side ingest reaches open tabs
 * without anyone reloading.
 */
import { loadSnapshot, startSnapshotPolling, subscribeSnapshot, getSnapshotState, SNAPSHOT_STATE } from './snapshotClient'
import {
  HOME_STATE,
  loadHomeSeed,
  readHomeSnapshot,
  writeHomeSnapshot,
  fetchHomeWithRetry,
  mergeHomePayload,
} from './homeBootstrap'

/** Re-exported so a consumer needs one import for both the state and the store. */
export { HOME_STATE } from './homeBootstrap'

/** Render Free stays awake only with traffic; a minute keeps every tab in step. */
const POLL_MS = 60 * 1000

const initialState = {
  payload: null,
  status: HOME_STATE.SEED,
  source: 'none',
  attempts: 0,
  error: null,
  etag: null,
  savedAt: null,
}

let state = initialState
const listeners = new Set()
let started = false
let booting = null
let pollTimer = null
let abortBoot = null

function emit() {
  for (const fn of listeners) {
    try {
      fn(state)
    } catch (err) {
      console.warn('[homeStore] listener:', err.message)
    }
  }
}

function setState(patch) {
  state = { ...state, ...patch }
  emit()
}

function applyPayload(payload, { status, source }) {
  if (!payload) return
  const merged = mergeHomePayload(state.payload, payload)
  const savedAt = new Date().toISOString()
  setState({
    payload: merged,
    status: status || state.status,
    source: source || state.source,
    error: null,
    savedAt,
  })
  // Only persist real API payloads: a static seed must not look like fresh last-good.
  if (source === 'api') writeHomeSnapshot(merged)
}

export function getHomeState() {
  return state
}

export function subscribeHome(fn) {
  listeners.add(fn)
  try {
    fn(state)
  } catch { /* first paint only */ }
  return () => listeners.delete(fn)
}

async function loadLive({ etag = null } = {}) {
  const res = await fetchHomeWithRetry({
    etag,
    signal: abortBoot?.signal,
    onAttempt: (attempt, total) => {
      setState({ status: HOME_STATE.WAKING, attempts: attempt, error: null })
      if (attempt > 1) console.log(`[homeStore] /api/home attempt ${attempt}/${total}`)
    },
  })
  if (res.ok && res.notModified) {
    setState({ status: HOME_STATE.LIVE, error: null, etag: res.etag || state.etag })
    return true
  }
  if (res.ok && res.data) {
    applyPayload(res.data, { status: HOME_STATE.LIVE, source: 'api' })
    setState({ etag: res.etag || state.etag, attempts: res.attempts })
    return true
  }
  setState({
    status: HOME_STATE.FAILED,
    error: res.error || 'Could not reach the situational API',
  })
  return false
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    pollOnce().catch(() => {})
  }, POLL_MS)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

async function pollOnce() {
  try {
    const res = await fetchHomeWithRetry({
      etag: state.etag,
      timeouts: [12000],
      delays: [],
      signal: abortBoot?.signal,
    })
    if (!res.ok) return false
    if (res.notModified) {
      setState({ status: HOME_STATE.LIVE, error: null })
      return true
    }
    if (res.data) {
      applyPayload(res.data, { status: HOME_STATE.LIVE, source: 'api' })
      setState({ etag: res.etag || state.etag })
    }
    return true
  } catch {
    return false
  }
}

let lastSnapshotVersion = null

/** A new published version reaches every open tab without a reload. */
function watchPublishedVersion() {
  subscribeSnapshot(({ manifest: next, state: snapState }) => {
    if (snapState !== SNAPSHOT_STATE.READY || !next?.version) return
    if (!lastSnapshotVersion) {
      lastSnapshotVersion = next.version
      return
    }
    if (next.version === lastSnapshotVersion) return
    lastSnapshotVersion = next.version
    loadSnapshot('home', { force: true }).then((payload) => {
      if (payload) applyPayload(payload, { status: HOME_STATE.SEED, source: 'cdn' })
    }).catch(() => {})
  })
}

async function boot() {
  // 1) Local last-good paints immediately.
  const snapshot = readHomeSnapshot()
  if (snapshot) {
    setState({ payload: snapshot, status: HOME_STATE.SEED, source: 'snapshot' })
  }

  // 2) The shared snapshot: every visitor reads the same CDN file, so no one
  //    waits on Render and the payload does not depend on who is looking.
  startSnapshotPolling()
  watchPublishedVersion()
  const cdn = await loadSnapshot('home')
  if (cdn) {
    const next = getSnapshotState().manifest
    lastSnapshotVersion = next?.version || null
    applyPayload(cdn, { status: HOME_STATE.SEED, source: 'cdn' })
    return
  }

  // 3) Degraded: the bundled seed, then the API with backoff and its ETag poll.
  if (!snapshot || !snapshot.news?.features?.length) {
    const seed = await loadHomeSeed({ signal: abortBoot?.signal })
    if (seed) applyPayload(seed, { status: HOME_STATE.SEED, source: 'seed' })
  }
  await loadLive({ etag: null })
  startPolling()
}

/** Start the shared pipeline once per page load. */
export function startHomePolling() {
  if (started) return booting
  started = true
  abortBoot = typeof AbortController === 'function' ? new AbortController() : null
  booting = boot().catch((err) => {
    console.warn('[homeStore] boot:', err.message)
    setState({ status: HOME_STATE.FAILED, error: err.message })
  })
  return booting
}

export function stopHomePolling() {
  stopPolling()
  started = false
  if (abortBoot) abortBoot.abort()
  abortBoot = null
  booting = null
}

/** Ask for fresh data now (the "retry" affordance and tab refocus). */
export async function refreshHomeNow({ force = false } = {}) {
  if (force) {
    // Bypass the server cache only when the caller means it.
    const res = await fetchHomeWithRetry({ timeouts: [16000], delays: [], signal: abortBoot?.signal })
    if (res.ok && res.data) {
      applyPayload(res.data, { status: HOME_STATE.LIVE, source: 'api' })
      return true
    }
    setState({ status: HOME_STATE.FAILED, error: res.error || 'Retry failed' })
    return false
  }
  return pollOnce()
}

/** Resume immediately when the tab is shown again, and after the network returns. */
if (typeof window !== 'undefined') {
  const wake = () => {
    if (!started) return
    if (state.status === HOME_STATE.LIVE) return
    pollOnce().catch(() => {})
  }
  window.addEventListener('online', wake)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wake()
  })
}
