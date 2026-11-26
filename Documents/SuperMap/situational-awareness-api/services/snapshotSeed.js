/**
 * Seed this instance from the published snapshot on boot.
 *
 * Render Free wipes its disk on every deploy and wakes with an empty cache, which
 * is what used to make the first visitor wait. The collector already published
 * everything to the orphan `data` branch, so one tarball request restores it:
 * api-cache namespaces, the threat summary, MediaStack, keyword tags, and the
 * events table (re-ingested so SQLite + the search index are rebuilt).
 *
 * Fails soft: if the tarball is unreachable the caller keeps today's path
 * (quiet-window boot + warm home caches).
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const dataPaths = require('./dataPaths')
const apiResultCache = require('./apiResultCache')

const DEFAULT_URL = 'https://codeload.github.com/TheCloutySkies/SuperMap/tar.gz/refs/heads/data'
const TIMEOUT_MS = Number(process.env.SNAPSHOT_TIMEOUT_MS || 20000)
const MAX_BYTES = Number(process.env.SNAPSHOT_MAX_BYTES || 40 * 1024 * 1024)

let status = { seeded: false, at: null, version: null, source: null, counts: {}, error: null }

function snapshotUrl() {
  return String(process.env.SNAPSHOT_TARBALL_URL || DEFAULT_URL).trim()
}

function getSeedStatus() {
  return { ...status }
}

async function downloadTarball(destDir) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(snapshotUrl(), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'SuperMap/1.0 (+https://github.com/TheCloutySkies/SuperMap)', Accept: 'application/gzip' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('empty tarball')
    if (buf.length > MAX_BYTES) throw new Error(`tarball too large (${buf.length} bytes)`)
    const file = path.join(destDir, 'snapshot.tar.gz')
    fs.writeFileSync(file, buf)
    return file
  } finally {
    clearTimeout(timer)
  }
}

function extractTarball(file, destDir) {
  // `tar` ships on Render's Node image and on GitHub's runners.
  execFileSync('tar', ['-xzf', file, '-C', destDir, '--strip-components=1'], { stdio: 'pipe' })
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function copyIfPresent(fromDir, name, toPath) {
  const from = path.join(fromDir, name)
  if (!fs.existsSync(from)) return false
  try {
    fs.mkdirSync(path.dirname(toPath), { recursive: true })
    fs.copyFileSync(from, toPath)
    return true
  } catch (err) {
    console.warn(`[snapshotSeed] copy ${name}:`, err.message)
    return false
  }
}

/** Copy a published snapshot directory into this instance's data root. */
function restoreFromDir(dir) {
  const counts = { cacheFiles: 0, events: 0, threat: false, mediastack: false, keywordTags: false }

  // The collector publishes the api-cache namespaces under cache/api-cache/.
  const cacheIn = path.join(dir, 'cache')
  const apiCacheIn = path.join(cacheIn, 'api-cache')
  const cacheDir = dataPaths.apiCacheDir()
  if (fs.existsSync(apiCacheIn)) {
    for (const entry of fs.readdirSync(apiCacheIn)) {
      if (!entry.endsWith('.json')) continue
      const target = path.join(cacheDir, entry)
      const incoming = path.join(apiCacheIn, entry)
      try {
        const prev = readJson(target)
        const next = readJson(incoming)
        // Never trade a richer namespace file for a thinner one.
        const prevCount = prev?.entries ? Object.keys(prev.entries).length : 0
        const nextCount = next?.entries ? Object.keys(next.entries).length : 0
        if (prev && prevCount > nextCount) continue
        fs.copyFileSync(incoming, target)
        counts.cacheFiles += 1
      } catch (err) {
        console.warn('[snapshotSeed] cache restore:', err.message)
      }
    }
  }
  counts.threat = copyIfPresent(cacheIn, 'last-threat-summary.json', dataPaths.threatSummaryPath())
  counts.mediastack = copyIfPresent(cacheIn, 'mediastack-cache.json', dataPaths.mediastackCachePath())
  counts.keywordTags = copyIfPresent(cacheIn, 'keyword-tags.json', dataPaths.keywordTagsPath())

  const eventsFile = path.join(dir, 'events.json')
  if (fs.existsSync(eventsFile)) {
    const payload = readJson(eventsFile)
    const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.events) ? payload.events : [])
    if (rows.length) {
      const { ingestEvent } = require('./ingest')
      for (const row of rows) {
        if (!row?.id || !row?.title) continue
        try {
          ingestEvent({
            id: row.id,
            type: row.type || 'news',
            title: row.title,
            description: row.description || '',
            lat: row.lat != null ? Number(row.lat) : null,
            lon: row.lon != null ? Number(row.lon) : null,
            timestamp: row.timestamp != null ? Number(row.timestamp) : null,
            source: row.source || 'seed',
            raw_data: row.raw_data || '{}',
          }, {
            skipHeuristicAssess: true,
            extraTags: Array.isArray(row.tags) ? row.tags : [],
          })
          counts.events += 1
        } catch (err) {
          if (counts.events === 0) console.warn('[snapshotSeed] event:', err.message)
        }
      }
    }
  }

  const manifest = readJson(path.join(dir, 'manifest.json'))
  status = {
    seeded: counts.cacheFiles > 0 || counts.events > 0,
    at: new Date().toISOString(),
    version: manifest?.version || null,
    source: snapshotUrl(),
    counts,
    error: null,
  }
  return status
}

/** Download the published snapshot and restore it. Never throws. */
async function seedOnBoot() {
  if (String(process.env.SNAPSHOT_SEED || '1') === '0') {
    status = { ...status, seeded: false, error: 'disabled (SNAPSHOT_SEED=0)' }
    return status
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'supermap-seed-'))
  try {
    const file = await downloadTarball(tmp)
    extractTarball(file, tmp)
    const restored = restoreFromDir(tmp)
    console.log(
      '[snapshotSeed] restored',
      restored.version || '(no version)',
      'cache files=', restored.counts.cacheFiles,
      'events=', restored.counts.events,
      'threat=', restored.counts.threat,
    )
    return restored
  } catch (err) {
    status = { ...status, seeded: false, at: new Date().toISOString(), error: err.message }
    console.warn('[snapshotSeed] unavailable:', err.message)
    return status
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
}

module.exports = {
  getSeedStatus,
  restoreFromDir,
  seedOnBoot,
  snapshotUrl,
}
