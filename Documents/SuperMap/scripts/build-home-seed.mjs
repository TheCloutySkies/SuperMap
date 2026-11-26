#!/usr/bin/env node
/**
 * Build the static home seed that ships with the frontend.
 *
 * A brand-new visitor (no localStorage) otherwise stares at empty desks while
 * Render Free wakes (~22s) and cold caches fill (~24-42s). This snapshot is
 * served by the CDN, so the first paint is instant and /api/home revalidates it.
 *
 * Usage:
 *   node documents/.../scripts/build-home-seed.mjs           # from the repo root
 *   API_HOME_URL=https://supermap-api.onrender.com/api/home node scripts/build-home-seed.mjs
 *
 * Writes SuperMap/public/home-seed.json (trimmed). Exits 1 without writing when
 * the API returns nothing useful, so a scheduled run can never blank the seed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const outFile = path.join(repoRoot, 'SuperMap', 'public', 'home-seed.json')

const HOME_URL = process.env.API_HOME_URL || 'https://supermap-api.onrender.com/api/home'
const TIMEOUT_MS = Number(process.env.SEED_TIMEOUT_MS || 60000)
/** The collector's published snapshot: the seed's primary source at build time. */
const SNAPSHOT_BASE = (process.env.VITE_SNAPSHOT_BASE
  || 'https://raw.githubusercontent.com/TheCloutySkies/SuperMap/data').replace(/\/$/, '')

function trimPayload(payload) {
  const news = payload.news && Array.isArray(payload.news.features)
    ? { ...payload.news, features: payload.news.features.slice(0, 40) }
    : { type: 'FeatureCollection', features: [] }
  const events = Array.isArray(payload.earthquakes?.events)
    ? payload.earthquakes.events.slice(0, 12)
    : []
  return {
    threatSummary: payload.threatSummary?.summary ? payload.threatSummary : null,
    defcon: payload.defcon || null,
    osintX: Array.isArray(payload.osintX) ? payload.osintX.slice(0, 40) : [],
    gasStates: Array.isArray(payload.gasStates) ? payload.gasStates : [],
    gasPrices: payload.gasPrices || null,
    news,
    stocks: payload.stocks || null,
    earthquakes: events.length ? { events, updatedAt: payload.earthquakes.updatedAt || null } : null,
    space: payload.space || null,
    homeImages: Array.isArray(payload.homeImages) ? payload.homeImages.slice(0, 12) : [],
    updatedAt: payload.updatedAt || new Date().toISOString(),
    _fromSeed: true,
    _seededAt: new Date().toISOString(),
  }
}

function hasContent(seed) {
  return Boolean(
    seed.threatSummary?.summary
    || seed.news?.features?.length
    || seed.osintX?.length
    || seed.gasPrices?.national != null
    || seed.stocks?.current
    || seed.earthquakes?.events?.length
  )
}

function countOf(payload, key) {
  if (key === 'news') return payload?.news?.features?.length || 0
  if (key === 'earthquakes') return payload?.earthquakes?.events?.length || 0
  if (key === 'osintX') return Array.isArray(payload?.osintX) ? payload.osintX.length : 0
  if (key === 'homeImages') return Array.isArray(payload?.homeImages) ? payload.homeImages.length : 0
  return 0
}

/**
 * Never trade a richer seed for a thinner one: a cold instance mid-catch-up can
 * answer with empty news, and that must not wipe the last good snapshot.
 */
function mergeWithExisting(next, existing) {
  if (!existing || typeof existing !== 'object') return next
  const out = { ...next }
  for (const key of ['news', 'earthquakes', 'osintX', 'homeImages']) {
    if (countOf(existing, key) > countOf(next, key)) out[key] = existing[key]
  }
  if (!next.threatSummary?.summary && existing.threatSummary?.summary) out.threatSummary = existing.threatSummary
  if (!next.gasPrices?.national && existing.gasPrices?.national) out.gasPrices = existing.gasPrices
  if (!next.stocks?.current && existing.stocks?.current) out.stocks = existing.stocks
  if (!next.space && existing.space) out.space = existing.space
  if (!next.defcon && existing.defcon) out.defcon = existing.defcon
  return out
}

function withTimeout(ms) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return { ctrl, done: () => clearTimeout(timer) }
}

async function getJson(url, timeoutMs = TIMEOUT_MS) {
  const { ctrl, done } = withTimeout(timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    done()
  }
}

/** The collector's latest home snapshot, named by its manifest. */
async function fromSnapshot() {
  const manifest = await getJson(`${SNAPSHOT_BASE}/manifest.json`, 15000)
  const file = manifest?.sources?.home?.file
  if (!file) throw new Error('manifest names no home file')
  const home = await getJson(`${SNAPSHOT_BASE}/${file}`, 30000)
  console.log(`[home-seed] from snapshot ${manifest.version} (${file})`)
  return home
}

async function main() {
  // Build-time floor: the published snapshot first, then a live API, then the
  // seed already in the tree. Both write to ./snapshot-out/ dry runs are fine here.
  let payload = null
  const sources = [
    ['snapshot', fromSnapshot],
    ['api', () => getJson(HOME_URL)],
  ]
  for (const [name, load] of sources) {
    try {
      payload = await load()
      console.log(`[home-seed] loaded from ${name}`)
      break
    } catch (err) {
      console.warn(`[home-seed] ${name} unavailable: ${err.message}`)
    }
  }
  if (!payload) {
    console.error('[home-seed] no source produced a payload; keeping the existing seed')
    process.exitCode = 1
    return
  }

  const trimmed = trimPayload(payload || {})
  if (!hasContent(trimmed)) {
    console.error('[home-seed] payload had no usable content; keeping the existing seed')
    process.exitCode = 1
    return
  }

  let existing = null
  try {
    if (fs.existsSync(outFile)) existing = JSON.parse(fs.readFileSync(outFile, 'utf8'))
  } catch { /* rebuild from scratch */ }
  const seed = mergeWithExisting(trimmed, existing)

  const json = `${JSON.stringify(seed)}\n`
  const previous = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : ''
  if (previous === json) {
    console.log('[home-seed] unchanged')
    return
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, json, 'utf8')
  const counts = {
    news: seed.news.features.length,
    osintX: seed.osintX.length,
    threat: Boolean(seed.threatSummary?.summary),
    gas: seed.gasPrices?.national != null,
    stocks: Boolean(seed.stocks?.current),
    quakes: seed.earthquakes?.events?.length || 0,
    images: seed.homeImages.length,
  }
  console.log(`[home-seed] wrote ${path.relative(repoRoot, outFile)}`, counts)
  console.log(`[home-seed] ${(json.length / 1024).toFixed(1)} KB`)
}

main()
