/**
 * One store for the strategic console.
 *
 * Every source is read from the collector's published snapshot first; only when
 * the snapshot cannot serve a source does it fall back to the API's cache-first
 * route. The store computes signals once per published version, so every tab
 * sees exactly the same picture and a new snapshot reaches open tabs on its own.
 */
import {
  loadSnapshot,
  subscribeSnapshot,
  startSnapshotPolling,
  getSnapshotState,
  SNAPSHOT_STATE,
} from './snapshotClient'
import { apiGetJson } from './homeBootstrap'
import {
  buildSignals,
  computeCharts,
  computeDomainDeltas,
  computeDomainSeries,
} from './consoleSignals'

const API_TIMEOUT_MS = 15000
const RELOAD_FLOOR_MS = 60 * 1000

/**
 * name = the snapshot file, key = the short key used by the desk.
 * `api` is the collector's own route, used only in the degraded path.
 */
export const CONSOLE_SOURCES = [
  { key: 'events', name: 'events', api: null },
  { key: 'gdelt', name: 'conflict-gdelt', api: '/api/conflicts/gdelt' },
  { key: 'acled', name: 'conflict-acled', api: '/api/conflicts/acled' },
  { key: 'ucdp', name: 'strategic-ucdp', api: '/api/strategic/ucdp', optional: true },
  { key: 'warspotting', name: 'strategic-warspotting', api: '/api/strategic/warspotting' },
  { key: 'majorHazards', name: 'major-hazards', api: '/api/hazards/major' },
  { key: 'nws', name: 'hazards-nws', api: '/api/hazards/nws' },
  { key: 'emsc', name: 'hazards-emsc', api: '/api/hazards/emsc' },
  { key: 'volcanoes', name: 'volcanoes', api: '/api/hazards/volcanoes' },
  { key: 'utility', name: 'utility-outages', api: '/api/utility-outages' },
  { key: 'kev', name: 'strategic-kev', api: '/api/strategic/kev' },
  { key: 'ransomware', name: 'strategic-ransomware', api: '/api/strategic/ransomware' },
  { key: 'censorship', name: 'strategic-censorship', api: '/api/strategic/censorship' },
  { key: 'radiation', name: 'strategic-radiation', api: '/api/strategic/radiation' },
  { key: 'balloons', name: 'strategic-balloons', api: '/api/strategic/balloons' },
  { key: 'satellites', name: 'strategic-satellites', api: '/api/strategic/satellites' },
  { key: 'launches', name: 'strategic-launches', api: '/api/strategic/launches' },
  { key: 'briefs', name: 'strategic-briefs', api: '/api/strategic/briefs', optional: true },
  { key: 'spaceWeather', name: 'space-weather', api: '/api/space-weather' },
  { key: 'news', name: 'news', api: '/api/news' },
  { key: 'osintX', name: 'osint-x', api: '/api/osint-x?limit=120' },
  { key: 'threat', name: 'threat-summary', api: '/api/threat-summary' },
  { key: 'defcon', name: 'defcon', api: '/api/defcon' },
]

const initialState = {
  status: 'idle', // idle | loading | ready | degraded
  payloads: {},
  signals: [],
  charts: [],
  series: {},
  deltas: {},
  threat: null,
  defcon: null,
  sources: {},
  computedAt: null,
  version: null,
  generatedAt: null,
  error: null,
  progress: { done: 0, total: CONSOLE_SOURCES.length },
}

let state = initialState
const listeners = new Set()
let started = false
let running = null
let lastRunAt = 0
let debounceTimer = null
let manifestVersion = null

function emit() {
  for (const fn of listeners) {
    try {
      fn(state)
    } catch (err) {
      console.warn('[consoleStore] listener:', err.message)
    }
  }
}

function setState(patch) {
  state = { ...state, ...patch }
  emit()
}

export function getConsoleState() {
  return state
}

export function subscribeConsole(fn) {
  listeners.add(fn)
  try {
    fn(state)
  } catch { /* first paint */ }
  return () => listeners.delete(fn)
}

function computeFromPayloads(payloads) {
  const now = Date.now()
  const signals = buildSignals(payloads, now)
  return {
    signals,
    charts: computeCharts(payloads, signals),
    series: computeDomainSeries(signals, now),
    deltas: computeDomainDeltas(signals, now),
    threat: payloads.threat || null,
    defcon: payloads.defcon || null,
    computedAt: now,
  }
}

function publishPayloads(payloads, sourceStatus, done) {
  const manifest = getSnapshotState().manifest
  const derived = computeFromPayloads(payloads)
  const published = Object.keys(payloads).length
  setState({
    ...derived,
    payloads,
    sources: sourceStatus,
    status: published === 0 && done ? 'degraded' : 'ready',
    version: manifest?.version || state.version,
    generatedAt: manifest?.generatedAt || state.generatedAt,
    progress: { done: state.progress.done, total: CONSOLE_SOURCES.length },
  })
}

async function loadAll({ force = false } = {}) {
  // Payloads already in hand are kept: one flaky fetch must never blank a panel
  // that was painted a minute ago.
  const payloads = { ...state.payloads }
  const sourceStatus = {}
  const entries = CONSOLE_SOURCES.length
  let settled = 0

  const queuePublish = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      publishPayloads({ ...payloads }, { ...sourceStatus }, settled >= entries)
    }, 120)
  }

  setState({
    status: state.signals.length ? state.status : 'loading',
    error: null,
    progress: { done: 0, total: entries },
  })

  await Promise.all(CONSOLE_SOURCES.map(async (source) => {
    let data = null
    let from = 'missing'
    try {
      let snapshot = await loadSnapshot(source.name, { force })
      // One retry: the CDN occasionally drops a file, and the snapshot is
      // immutable per version, so a second read is cheap and safe.
      if (!snapshot) snapshot = await loadSnapshot(source.name, { force: true })
      if (snapshot) {
        data = snapshot
        from = 'snapshot'
      }
    } catch { /* fall through to the API */ }

    if (!data && source.api) {
      try {
        const res = await apiGetJson(source.api, { timeoutMs: API_TIMEOUT_MS })
        if (res?.data && !res.data.empty && !res.data.warming) {
          data = res.data
          from = 'api'
        } else if (res?.data) {
          from = 'warming'
        }
      } catch {
        from = 'error'
      }
    }

    if (data) payloads[source.key] = data
    sourceStatus[source.key] = {
      from: data ? from : (payloads[source.key] ? 'kept' : from),
      ok: Boolean(data || payloads[source.key]),
      optional: Boolean(source.optional),
    }
    settled += 1
    setState({ progress: { done: settled, total: entries } })
    queuePublish()
  }))

  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  publishPayloads(payloads, sourceStatus, true)
  lastRunAt = Date.now()
  const manifest = getSnapshotState().manifest
  manifestVersion = manifest?.version || null
  if (Object.keys(payloads).length === 0) {
    setState({ status: 'degraded', error: 'The published snapshot and the API both came back empty.' })
  }
}


/** Load everything once per page; a running load is shared. */
export function startConsole() {
  if (started) return running
  started = true
  startSnapshotPolling()

  subscribeSnapshot(({ state: snapshotState, manifest }) => {
    if (snapshotState !== SNAPSHOT_STATE.READY) return
    const version = manifest?.version || null
    if (!version) return
    if (manifestVersion === null) {
      manifestVersion = version
      return
    }
    if (version === manifestVersion) return
    if (Date.now() - lastRunAt < RELOAD_FLOOR_MS) return
    manifestVersion = version
    refreshConsole({ force: true }).catch(() => {})
  })

  if (typeof window !== 'undefined') {
    const maybeReload = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (Date.now() - lastRunAt < 5 * 60 * 1000) return
      refreshConsole().catch(() => {})
    }
    window.addEventListener('online', maybeReload)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) maybeReload()
    })
  }

  running = loadAll().catch((err) => {
    setState({ status: 'degraded', error: err.message })
  })
  return running
}

export function refreshConsole({ force = false } = {}) {
  if (running) return running
  running = loadAll({ force }).finally(() => {
    running = null
  })
  return running
}
