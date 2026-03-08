const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')

const CAMERAS_DB = path.join(__dirname, 'cameras.json')

async function readDb() {
  try {
    const raw = await fs.readFile(CAMERAS_DB, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeDb(rows) {
  await fs.mkdir(path.dirname(CAMERAS_DB), { recursive: true })
  await fs.writeFile(CAMERAS_DB, JSON.stringify(rows, null, 2))
}

function streamId(stream) {
  return crypto.createHash('sha1').update(String(stream || '')).digest('hex')
}

async function saveCamera(camera) {
  const stream = String(camera?.stream || '').trim()
  if (!stream) return null
  const id = streamId(stream)
  const now = Date.now()
  const rows = await readDb()
  const idx = rows.findIndex((r) => r.id === id || r.stream === stream)
  const normalized = {
    id,
    name: camera.name || 'Camera',
    lat: Number(camera.lat),
    lon: Number(camera.lon),
    stream,
    type: camera.type || 'unknown',
    source: camera.source || 'discovery_engine',
    link: camera.link || null,
    image: camera.image || null,
    lastSeen: now,
  }
  if (!Number.isFinite(normalized.lat) || !Number.isFinite(normalized.lon)) return null
  if (idx >= 0) rows[idx] = { ...rows[idx], ...normalized }
  else rows.push(normalized)
  await writeDb(rows)
  return normalized
}

async function getAllCameras() {
  return readDb()
}

async function pruneStaleCameras(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const now = Date.now()
  const rows = await readDb()
  const next = rows.filter((r) => now - Number(r.lastSeen || 0) <= maxAgeMs)
  if (next.length !== rows.length) await writeDb(next)
  return next
}

module.exports = {
  saveCamera,
  getAllCameras,
  pruneStaleCameras,
  streamId,
}

