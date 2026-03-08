const fs = require('fs/promises')
const path = require('path')

const SEED_DB = path.join(__dirname, 'seedCameras.json')

async function loadSeedCameras() {
  try {
    const raw = await fs.readFile(SEED_DB, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((c) => ({
        id: String(c?.id || c?.stream || '').trim() || undefined,
        name: String(c?.name || 'Seed Camera'),
        lat: Number(c?.lat),
        lon: Number(c?.lon),
        stream: String(c?.stream || '').trim(),
        type: String(c?.type || 'unknown').toLowerCase(),
        link: String(c?.link || c?.watchUrl || '').trim() || undefined,
        image: String(c?.image || '').trim() || undefined,
        source: 'seed_cameras',
      }))
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon) && c.stream)
  } catch {
    return []
  }
}

module.exports = {
  loadSeedCameras,
}

