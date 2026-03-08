const NodeCache = require('node-cache')
const { cameraCrawler } = require('./crawlers/cameraCrawler')
const { validateStream } = require('./parsers/validateStream')
const { geolocateCamera } = require('./parsers/geolocateCamera')
const { saveCamera, getAllCameras, pruneStaleCameras } = require('./storage/saveCamera')
const { loadSeedCameras } = require('./storage/cameraSeeds')

const DISCOVERY_INTERVAL_MS = 30 * 60 * 1000
const queueCache = new NodeCache({ stdTTL: 60 * 60, checkperiod: 60 })
let started = false

async function processCandidate(c) {
  if (!c?.url) return null
  if (queueCache.get(c.url)) return null
  queueCache.set(c.url, true)
  const validated = await validateStream(c.url)
  if (!validated.ok) return null
  const geo = await geolocateCamera(c)
  if (!geo) return null
  return saveCamera({
    name: c.name || 'Live Camera',
    lat: geo.lat,
    lon: geo.lon,
    stream: c.url,
    type: validated.type,
    source: 'discovery_engine',
  })
}

async function discoverNow() {
  const seedCameras = await loadSeedCameras()
  await Promise.all(seedCameras.map((c) => saveCamera({ ...c, source: 'seed_cameras' })))
  const candidates = await cameraCrawler()
  const concurrency = 5
  const queue = [...candidates]
  const workers = Array.from({ length: concurrency }).map(async () => {
    while (queue.length) {
      const c = queue.shift()
      try { await processCandidate(c) } catch {}
    }
  })
  await Promise.all(workers)
  await pruneStaleCameras()
  return getAllCameras()
}

function startCameraEngine() {
  if (started) return
  started = true
  discoverNow().catch((e) => console.warn('[cameraEngine] warmup failed:', e.message))
  setInterval(() => {
    discoverNow().catch((e) => console.warn('[cameraEngine] loop failed:', e.message))
  }, DISCOVERY_INTERVAL_MS)
}

module.exports = {
  startCameraEngine,
  discoverNow,
}

