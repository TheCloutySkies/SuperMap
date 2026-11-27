#!/usr/bin/env node
/**
 * Snapshot collector — the site's single data scheduler.
 *
 * Runs on GitHub Actions every hour on the hour: boots the API with every
 * scheduler switched off, restores the previous snapshot so gates and last-good
 * are real, refreshes each source in dependency order, and writes versioned files
 * plus a manifest into ./snapshot-out/staging. The workflow then force-pushes that
 * tree to the orphan `data` branch, so a data update never needs an app deploy and
 * the upstream request volume stays a fixed per-day budget.
 *
 *   node scripts/refresh-snapshots.js            # a full run
 *   node scripts/refresh-snapshots.js --dry-run  # write ./snapshot-out/dry-run, no publish
 *   node scripts/refresh-snapshots.js --only=home,news
 *   node scripts/refresh-snapshots.js --if-stale-minutes=90
 *                                               # exit 0 without touching a
 *                                               # source when the published
 *                                               # snapshot is younger than that
 */
const fs = require('fs')
const path = require('path')
const axios = require('axios')

const API_ROOT = path.join(__dirname, '..')
process.chdir(API_ROOT)
require('dotenv').config({ path: path.join(API_ROOT, '.env') })

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const onlyArg = args.find((a) => a.startsWith('--only='))
const ONLY = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean) : null
const staleArg = args.find((a) => a.startsWith('--if-stale-minutes='))
const IF_STALE_MINUTES = staleArg ? Number(staleArg.slice('--if-stale-minutes='.length)) : 0

const OUT_ROOT = path.resolve(API_ROOT, process.env.SNAPSHOT_OUT_DIR || 'snapshot-out')
const OUT_DIR = path.join(OUT_ROOT, DRY_RUN ? 'dry-run' : 'staging')
const STATE_PATH = path.join(OUT_DIR, '_state.json')
/** Run id, e.g. 20261126T1845Z — every published file is named after it. */
function runIdFor(date = new Date()) {
  const iso = date.toISOString()
  return `${iso.slice(0, 10).replace(/-/g, '')}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`
}

const RUN_ID = runIdFor()

/** Gate = skip the source when its last success is younger than this. */
/** A single source larger than this does not belong in a boot tarball. */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024

const GATE_HOURS = {
  news: 2,
  osint: 4,
  'osint-x': 2,
  videos: 2,
  'threat-summary': 4,
  'keyword-tags': 6,
  stocks: 2,
  'gas-prices': 24,
  space: 4,
  defcon: 4,
  netblocks: 4,
  earthquakes: 4,
  'hazards-nws': 4,
  'hazards-emsc': 4,
  volcanoes: 24,
  nhc: 4,
  'space-weather': 4,
  'outages-internet': 4,
  frontline: 4,
  liveuamap: 4,
  datacenters: 168,
  firms: 4,
  'utility-outages': 4,
  'fcc-towers': 168,
  'conflict-gdelt': 4,
  'conflict-acled': 24,
  'major-hazards': 4,
  events: 4,
  home: 4,
}

/** Ordered: dependencies first, `home` assembled last from what is already cached. */
const REGISTRY = [
  { name: 'news', path: '/api/news?refresh=1', timeoutMs: 120000 },
  { name: 'osint', path: '/api/osint?limit=200', timeoutMs: 90000 },
  { name: 'osint-x', path: '/api/osint-x?limit=200', timeoutMs: 120000 },
  { name: 'videos', path: '/api/feeds/videos?refresh=1', timeoutMs: 90000 },
  { name: 'threat-summary', path: '/api/threat-summary?refresh=1&wait=1', timeoutMs: 180000 },
  { name: 'stocks', path: '/api/stocks?refresh=1', timeoutMs: 60000 },
  { name: 'gas-prices', path: '/api/gas-prices?refresh=1', timeoutMs: 60000 },
  { name: 'space', path: '/api/space', timeoutMs: 60000 },
  { name: 'defcon', path: '/api/defcon', timeoutMs: 45000 },
  { name: 'netblocks', path: '/api/netblocks', timeoutMs: 45000 },
  { name: 'earthquakes', path: '/api/earthquakes/widget', timeoutMs: 45000 },
  { name: 'earthquakes-feed', path: '/api/earthquakes?limit=2000', timeoutMs: 60000 },
  { name: 'hazards-nws', path: '/api/hazards/nws', timeoutMs: 60000 },
  { name: 'hazards-emsc', path: '/api/hazards/emsc', timeoutMs: 60000 },
  { name: 'volcanoes', path: '/api/hazards/volcanoes', timeoutMs: 60000 },
  // A season with no active storm is a valid, publishable empty.
  { name: 'nhc', path: '/api/hazards/nhc', timeoutMs: 60000, allowEmpty: true },
  { name: 'space-weather', path: '/api/space-weather', timeoutMs: 45000 },
  { name: 'outages-internet', path: '/api/outages/internet', timeoutMs: 60000, optional: true },
  { name: 'frontline', path: '/api/frontline', timeoutMs: 60000 },
  { name: 'liveuamap', path: '/api/liveuamap', timeoutMs: 60000, optional: true },
  { name: 'datacenters', path: '/api/map/datacenters', timeoutMs: 90000, optional: true },
  { name: 'firms', path: '/api/map/fires', timeoutMs: 90000 },
  { name: 'utility-outages', path: '/api/utility-outages', timeoutMs: 60000 },
  { name: 'fcc-towers', path: '/api/fcc/towers?bbox=-180,-90,180,90', timeoutMs: 90000, optional: true },
  { name: 'conflict-gdelt', path: '/api/conflicts/gdelt', timeoutMs: 90000 },
  { name: 'conflict-acled', path: '/api/conflicts/acled', timeoutMs: 90000 },
  { name: 'major-hazards', path: '/api/hazards/major', timeoutMs: 90000 },
  // Strategic sources: the collector owns their freshness, same as everything else.
  { name: 'strategic-warspotting', path: '/api/strategic/warspotting', timeoutMs: 60000, optional: true },
  { name: 'strategic-satellites', path: '/api/strategic/satellites', timeoutMs: 90000, optional: true },
  { name: 'strategic-launches', path: '/api/strategic/launches', timeoutMs: 60000, optional: true },
  { name: 'strategic-briefs', path: '/api/strategic/briefs', timeoutMs: 60000, optional: true },
  { name: 'strategic-ucdp', path: '/api/strategic/ucdp', timeoutMs: 90000, optional: true },
  { name: 'strategic-censorship', path: '/api/strategic/censorship', timeoutMs: 60000, optional: true },
  { name: 'strategic-kev', path: '/api/strategic/kev', timeoutMs: 60000, optional: true },
  { name: 'strategic-ransomware', path: '/api/strategic/ransomware', timeoutMs: 60000, optional: true },
  { name: 'strategic-radiation', path: '/api/strategic/radiation', timeoutMs: 90000, optional: true },
  { name: 'strategic-balloons', path: '/api/strategic/balloons', timeoutMs: 60000, optional: true },
  { name: 'home', path: '/api/home?refresh=1', timeoutMs: 120000 },
]

/**
 * The ten keyless console sources register themselves, so the collector and the
 * /api/console route can never disagree about a name, a path or a gate.
 */
{
  const { SOURCES } = require('../services/freeSources')
  const homeIndex = REGISTRY.findIndex((entry) => entry.name === 'home')
  const entries = SOURCES.map((source) => ({
    name: source.name,
    path: `/api/console/${source.key}`,
    timeoutMs: source.timeoutMs || 120000,
    ...(source.allowEmpty ? { allowEmpty: true } : {}),
    ...(source.optional ? { optional: true } : {}),
  }))
  REGISTRY.splice(homeIndex < 0 ? REGISTRY.length : homeIndex, 0, ...entries)
  for (const source of SOURCES) GATE_HOURS[source.name] = source.gateHours
}

const SECRET_ENV = [
  'MEDIASTACK_API_KEY',
  'GROQ_API_KEY',
  'NASA_API_KEY',
  'FIRMS_MAP_KEY',
  'EIA_API_KEY',
  'ALPHAVANTAGE_API_KEY',
  'RAPIDAPI_KEY',
  'OPENWEATHERMAP_API_KEY',
  'WINDY_API',
  'MAPBOX_TOKEN',
  'GEOAPIFY_KEY',
  'BRAVE_SEARCH_API_KEY',
  'CONFIG_WRITE_TOKEN',
  'COMMUNITYGUARD_API_KEY',
  'GEMINI_API_KEY',
]

function secretValues() {
  return SECRET_ENV
    .map((key) => String(process.env[key] || '').trim())
    .filter((value) => value.length >= 8)
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function ageHours(iso) {
  const at = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(at)) return Infinity
  return (Date.now() - at) / 3600000
}

function gateFor(name) {
  return Number.isFinite(GATE_HOURS[name]) ? GATE_HOURS[name] : 4
}

const DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/TheCloutySkies/SuperMap/data/manifest.json'

/**
 * Age in minutes of the snapshot visitors are actually being served, or null when
 * it cannot be read. The CDN in front of raw.githubusercontent caches for a few
 * minutes, so the query string is there to make sure the answer is the newest one.
 */
async function publishedAgeMinutes() {
  const base = String(process.env.SNAPSHOT_MANIFEST_URL || DEFAULT_MANIFEST_URL).trim()
  const url = `${base}${base.includes('?') ? '&' : '?'}t=${Date.now()}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'SuperMap/1.0 (+https://github.com/TheCloutySkies/SuperMap)',
        'Cache-Control': 'no-cache',
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      console.log('[collector] published manifest: HTTP', res.status)
      return null
    }
    const body = await res.json()
    const at = Date.parse(body && body.generatedAt)
    if (!Number.isFinite(at)) return null
    return (Date.now() - at) / 60000
  } catch (err) {
    console.log('[collector] published manifest unreadable:', err.message)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Restore the published snapshot first, so gates and last-good are real. */
async function restorePrevious() {
  const snapshotSeed = require('../services/snapshotSeed')
  const seedFrom = args.find((a) => a.startsWith('--seed-from='))
  if (String(process.env.SNAPSHOT_SEED_PREVIOUS || '1') === '0') {
    console.log('[collector] previous snapshot disabled')
    return null
  }
  if (seedFrom) {
    const dir = path.resolve(seedFrom.slice('--seed-from='.length))
    const status = snapshotSeed.restoreFromDir(dir)
    console.log('[collector] restored from', dir, status.counts)
    return status
  }
  const status = await snapshotSeed.seedOnBoot()
  console.log('[collector] previous snapshot:', status.seeded ? 'restored' : 'none', status.error || '')
  return status
}

async function bootApi() {
  process.env.SNAPSHOT_COLLECTOR = '1'
  process.env.DISABLE_SCHEDULERS = '1'
  const { server } = require('../server')
  await new Promise((resolve) => {
    if (server.listening) return resolve()
    server.once('listening', resolve)
    return undefined
  })
  const port = server.address()?.port
  if (!port) throw new Error('collector API did not bind a port')
  console.log('[collector] local API on port', port)
  return { server, port }
}

function countOf(data) {
  if (Array.isArray(data)) return data.length
  if (Array.isArray(data?.features)) return data.features.length
  if (Array.isArray(data?.events)) return data.events.length
  if (Array.isArray(data?.items)) return data.items.length
  if (Array.isArray(data?.posts)) return data.posts.length
  if (Array.isArray(data?.data)) return data.data.length
  if (data && typeof data === 'object') return Object.keys(data).length
  return 0
}

function hasContent(name, data) {
  if (data == null) return false
  if (name === 'threat-summary') return !!(data.summary && !data._warming)
  if (name === 'home') {
    return Boolean(
      data.threatSummary?.summary
      || data.news?.features?.length
      || data.osintX?.length
      || data.gasPrices?.national != null
      || data.stocks?.current,
    )
  }
  return countOf(data) > 0
}

function scrub(text) {
  return text.replace(
    /([?&](?:api_?key|apikey|access_token|token)=)[^&"\\\s]+/gi,
    '$1[redacted]',
  )
}

function fileFor(name, runId) {
  return `${name}.${runId}.json`
}

function prune(files, keepPerSource = 2) {
  const groups = new Map()
  for (const file of files) {
    const match = /^([a-z0-9-]+)\.([0-9TZ]+)\.json$/i.exec(file)
    if (!match) continue
    const list = groups.get(match[1]) || []
    list.push({ file, runId: match[2] })
    groups.set(match[1], list)
  }
  const drop = []
  for (const list of groups.values()) {
    list.sort((a, b) => (a.runId < b.runId ? 1 : -1))
    for (const entry of list.slice(keepPerSource)) drop.push(entry.file)
  }
  return drop
}

async function main() {
  const startedAt = Date.now()

  // 0) A scheduled tick can be redundant. The published manifest is the truth
  // about what visitors already have, so leave every source alone while it is
  // fresh; GitHub's own schedule can fire twice in a row after a delayed run.
  if (IF_STALE_MINUTES > 0 && !ONLY && !DRY_RUN) {
    const age = await publishedAgeMinutes()
    if (age != null && age < IF_STALE_MINUTES) {
      console.log(
        `[collector] published snapshot is ${Math.round(age)} min old (< ${IF_STALE_MINUTES} min) — nothing to collect`,
      )
      process.exit(0)
    }
    console.log(
      age == null
        ? '[collector] published snapshot unreadable — collecting'
        : `[collector] published snapshot is ${Math.round(age)} min old — collecting`,
    )
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  // 1) Previous snapshot first: gates and never-shrink need real last-good.
  await restorePrevious()

  const api = await bootApi()

  // Publisher feeds only build through a background service, so a fresh runner
  // has nothing for /api/osint until they are fetched here at least once.
  if (!ONLY || ONLY.includes('osint')) {
    try {
      const osint = require('../services/osint')
      if (typeof osint.fetchAllOsint === 'function') {
        const counts = await osint.fetchAllOsint()
        const total = Object.values(counts || {}).reduce((sum, n) => sum + (Number(n) || 0), 0)
        console.log('[collector] publisher fan-out events=', total)
      }
    } catch (err) {
      console.warn('[collector] publisher fan-out:', err.message)
    }
  }

  const base = `http://127.0.0.1:${api.port}`
  const state = readJson(STATE_PATH, { sources: {} }) || { sources: {} }
  state.sources = state.sources || {}
  state.lastRunId = RUN_ID

  // Carry the previous run's files forward when a source is gated or 304.
  const previousFiles = new Map()
  try {
    for (const entry of fs.readdirSync(OUT_DIR)) {
      const match = /^([a-z0-9-]+)\.[0-9TZ]+\.json$/i.exec(entry)
      if (match) previousFiles.set(match[1], entry)
    }
  } catch { /* first run */ }

  const token = String(process.env.CONFIG_WRITE_TOKEN || '').trim()
  const headers = { Accept: 'application/json' }
  if (token) headers['X-Config-Token'] = token

  const manifestSources = {}
  const results = []
  let okCount = 0
  let failCount = 0
  let gatedCount = 0

  for (const entry of REGISTRY) {
    if (ONLY && !ONLY.includes(entry.name)) continue
    const prior = state.sources[entry.name] || {}
    const nowIso = new Date().toISOString()
    const prevFile = previousFiles.get(entry.name) || null

    // Circuit breaker: three consecutive failures park the source for a day.
    if (prior.breakerUntil && Date.parse(prior.breakerUntil) > Date.now()) {
      gatedCount += 1
      manifestSources[entry.name] = {
        file: prevFile,
        fetchedAt: prior.lastSuccessAt || null,
        ok: false,
        stale: true,
        gated: 'breaker',
        count: prior.lastCount || 0,
      }
      results.push({ name: entry.name, status: 'breaker', ms: 0 })
      console.log(`[collector] ${entry.name}: breaker until ${prior.breakerUntil}`)
      continue
    }

    // Gate: a success younger than the source's window is carried forward.
    const since = ageHours(prior.lastSuccessAt)
    if (since < gateFor(entry.name)) {
      gatedCount += 1
      manifestSources[entry.name] = {
        file: prevFile,
        fetchedAt: prior.lastSuccessAt,
        ok: true,
        stale: false,
        gated: true,
        count: prior.lastCount || 0,
      }
      results.push({ name: entry.name, status: 'gated', ms: 0, ageHours: Number(since.toFixed(1)) })
      console.log(`[collector] ${entry.name}: gated (${since.toFixed(1)}h < ${gateFor(entry.name)}h)`)
      continue
    }

    const t0 = Date.now()
    try {
      const conditions = []
      if (prior.etag) conditions.push(`_etag=${encodeURIComponent(prior.etag)}`)
      if (prior.lastModified) conditions.push(`_lastModified=${encodeURIComponent(prior.lastModified)}`)
      const url = `${base}${entry.path}${conditions.length ? (entry.path.includes('?') ? '&' : '?') + conditions.join('&') : ''}`
      const res = await axios.get(url, { timeout: entry.timeoutMs, headers, validateStatus: () => true })
      const ms = Date.now() - t0
      if (res.status === 304) {
        okCount += 1
        state.sources[entry.name] = {
          ...prior,
          lastSuccessAt: new Date().toISOString(),
          consecutiveFailures: 0,
          breakerUntil: null,
        }
        manifestSources[entry.name] = {
          file: prevFile,
          fetchedAt: state.sources[entry.name].lastSuccessAt,
          ok: true,
          stale: false,
          notModified: true,
          count: prior.lastCount || 0,
        }
        results.push({ name: entry.name, status: '304', ms })
        console.log(`[collector] ${entry.name}: 304 (${ms}ms)`)
        continue
      }
      if (res.status >= 400) throw new Error(`HTTP ${res.status} ${res.data?.error || ''}`.trim())
      const data = res.data
      if (!hasContent(entry.name, data) && !entry.allowEmpty) {
        throw new Error('empty payload kept out of the snapshot')
      }

      const file = fileFor(entry.name, RUN_ID)
      const text = scrub(JSON.stringify(data))
      if (text.length > MAX_SOURCE_BYTES) {
        throw new Error(`payload too large (${(text.length / 1048576).toFixed(1)} MB) for the boot tarball`)
      }
      fs.writeFileSync(path.join(OUT_DIR, file), `${text}\n`, 'utf8')
      okCount += 1
      state.sources[entry.name] = {
        lastSuccessAt: new Date().toISOString(),
        lastOkAt: new Date().toISOString(),
        consecutiveFailures: 0,
        breakerUntil: null,
        lastCount: countOf(data),
        etag: res.headers?.['x-source-etag'] || null,
        lastModified: res.headers?.['x-source-last-modified'] || null,
      }
      manifestSources[entry.name] = {
        file,
        fetchedAt: state.sources[entry.name].lastSuccessAt,
        ok: true,
        stale: false,
        count: countOf(data),
      }
      results.push({ name: entry.name, status: 'ok', ms, count: countOf(data) })
      console.log(`[collector] ${entry.name}: ok ${countOf(data)} in ${ms}ms`)
    } catch (err) {
      failCount += 1
      const ms = Date.now() - t0
      const failures = (prior.consecutiveFailures || 0) + 1
      state.sources[entry.name] = {
        ...prior,
        consecutiveFailures: failures,
        breakerUntil: failures >= 3 ? new Date(Date.now() + 24 * 3600000).toISOString() : null,
        lastError: err.message,
        lastErrorAt: new Date().toISOString(),
      }
      manifestSources[entry.name] = {
        file: prevFile,
        fetchedAt: prior.lastSuccessAt || null,
        ok: false,
        stale: !entry.optional,
        optional: !!entry.optional,
        error: err.message,
        count: prior.lastCount || 0,
      }
      results.push({ name: entry.name, status: 'fail', ms, error: err.message })
      const quiet = entry.optional || err?.response?.status === 503 || /not set|gated/i.test(err.message)
      const log = quiet ? console.log : console.warn
      log(`[collector] ${entry.name}: failed (${err.message}) — keeping last-good`)
    }
  }

  // 2) Sources that are services rather than routes.
  if (!ONLY || ONLY.includes('keyword-tags') || ONLY.includes('events')) {
    try {
      if (!ONLY || ONLY.includes('keyword-tags')) {
        const keywordTags = require('../services/keywordTags')
        const tags = await keywordTags.refreshKeywordTags()
        const data = readJson(require('../services/dataPaths').keywordTagsPath())
        if (data) {
          const text = scrub(JSON.stringify(data))
          fs.writeFileSync(path.join(OUT_DIR, `keyword-tags.${RUN_ID}.json`), `${text}\n`, 'utf8')
          manifestSources['keyword-tags'] = {
            file: `keyword-tags.${RUN_ID}.json`,
            fetchedAt: new Date().toISOString(),
            ok: true,
            stale: false,
            count: Array.isArray(tags) ? tags.length : countOf(data),
          }
          okCount += 1
          console.log('[collector] keyword-tags: ok', Array.isArray(tags) ? tags.length : countOf(data))
        }
      }
      if (!ONLY || ONLY.includes('events')) {
        const { getEvents, getEventTagNames } = require('../database')
        const since = Date.now() - 14 * 24 * 3600000
        const rows = getEvents(5000, since).map((row) => ({
          ...row,
          tags: typeof getEventTagNames === 'function' ? getEventTagNames(row.id) : [],
        }))
        const capped = []
        let bytes = 2
        for (const row of rows) {
          bytes += JSON.stringify(row).length + 1
          if (bytes > 5 * 1024 * 1024) break
          capped.push(row)
        }
        fs.writeFileSync(
          path.join(OUT_DIR, `events.${RUN_ID}.json`),
          `${scrub(JSON.stringify({ events: capped, exportedAt: new Date().toISOString() }))}\n`,
          'utf8',
        )
        manifestSources.events = {
          file: `events.${RUN_ID}.json`,
          fetchedAt: new Date().toISOString(),
          ok: true,
          stale: false,
          count: capped.length,
        }
        okCount += 1
        console.log('[collector] events: ok', capped.length)
      }
    } catch (err) {
      failCount += 1
      console.warn('[collector] service source failed:', err.message)
    }
  }

  // 3) The api-cache namespaces this run wrote: Render restores them verbatim.
  try {
    const dataPaths = require('../services/dataPaths')
    const cacheOut = path.join(OUT_DIR, 'cache', 'api-cache')
    fs.mkdirSync(cacheOut, { recursive: true })
    const apiCacheDir = dataPaths.apiCacheDir()
    for (const entry of fs.readdirSync(apiCacheDir)) {
      if (!entry.endsWith('.json')) continue
      fs.copyFileSync(path.join(apiCacheDir, entry), path.join(cacheOut, entry))
    }
    const cacheRoot = path.join(OUT_DIR, 'cache')
    for (const [from, to] of [
      [dataPaths.threatSummaryPath(), 'last-threat-summary.json'],
      [dataPaths.mediastackCachePath(), 'mediastack-cache.json'],
      [dataPaths.keywordTagsPath(), 'keyword-tags.json'],
    ]) {
      if (!fs.existsSync(from)) continue
      fs.copyFileSync(from, path.join(cacheRoot, to))
    }
    console.log('[collector] cache namespaces published:', fs.readdirSync(cacheOut).length)
  } catch (err) {
    console.warn('[collector] cache publish:', err.message)
  }

  // 4) Manifest last, so a reader never sees files the manifest does not name.
  fs.writeFileSync(path.join(OUT_DIR, '_state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  const manifest = {
    version: RUN_ID,
    generatedAt: new Date().toISOString(),
    runMs: Date.now() - startedAt,
    dryRun: DRY_RUN,
    sources: manifestSources,
  }
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const status = {
    version: RUN_ID,
    generatedAt: manifest.generatedAt,
    runMs: manifest.runMs,
    ok: okCount,
    failed: failCount,
    gated: gatedCount,
    results,
  }
  fs.writeFileSync(path.join(OUT_DIR, 'status.json'), `${JSON.stringify(status, null, 2)}\n`, 'utf8')

  for (const file of prune(fs.readdirSync(OUT_DIR))) {
    fs.rmSync(path.join(OUT_DIR, file), { force: true })
    console.log('[collector] pruned', file)
  }

  // 5) No secret may leave the runner, in any file.
  const secrets = secretValues()
  const leaks = []
  const walk = (dir, prefix = '') => {
    const files = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) files.push(...walk(path.join(dir, entry.name), `${prefix}${entry.name}/`))
      else files.push(`${prefix}${entry.name}`)
    }
    return files
  }
  const allFiles = walk(OUT_DIR)
  for (const file of allFiles) {
    const text = fs.readFileSync(path.join(OUT_DIR, file), 'utf8')
    for (const value of secrets) {
      if (text.includes(value)) leaks.push(`${file} contains a secret value`)
    }
  }

  api.server.close()
  console.log(
    `[collector] ${RUN_ID} done in ${Math.round((Date.now() - startedAt) / 1000)}s`,
    `ok=${okCount} failed=${failCount} gated=${gatedCount}`,
  )

  if (leaks.length) {
    for (const leak of leaks) console.error('[collector] SECRET:', leak)
    for (const file of allFiles) {
      if (!leaks.some((leak) => leak.startsWith(`${file} `))) continue
      fs.rmSync(path.join(OUT_DIR, file), { force: true })
    }
    process.exit(1)
  }
  if (!DRY_RUN && !ONLY && okCount === 0) {
    console.error('[collector] every source failed — refusing to publish')
    process.exit(1)
  }
  if (!DRY_RUN && !ONLY && failCount > 0) {
    console.log(`::warning::collector finished with ${failCount} failed source(s); status.json records them`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('[collector] fatal:', err && err.stack ? err.stack : err)
  process.exit(1)
})

