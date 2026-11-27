/**
 * Safecast: citizen radiation measurements (keyless).
 * https://api.safecast.org/measurements.json
 */
const { fetchWithEtag } = require('../snapshotHttp')

const ENDPOINT = 'https://api.safecast.org/measurements.json?limit=1000&order=captured_at+desc'
const MAX_FEATURES = 800
const MIN_VALUE = 0
const MAX_VALUE = 1000000

async function fetchSafecast({ etag = null, lastModified = null } = {}) {
  const res = await fetchWithEtag(ENDPOINT, {
    timeoutMs: 30000,
    etag,
    lastModified,
    headers: { Accept: 'application/json' },
  })
  if (res.notModified) return res

  const rows = Array.isArray(res.data) ? res.data : []
  const features = []
  const byUnit = new Map()
  let highest = null
  for (const row of rows) {
    const lat = Number(row.latitude)
    const lon = Number(row.longitude)
    const value = Number(row.value)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (!Number.isFinite(value) || value < MIN_VALUE || value > MAX_VALUE) continue
    const unit = String(row.unit || 'cpm').toLowerCase()
    // Safecast also streams device telemetry (temperature, status). Only a dose
    // rate belongs in this summary.
    if (!/(cpm|counts? per minute|(µ|u)sv|microsievert|msv|gy\/h|ngy)/.test(unit)) continue
    byUnit.set(unit, (byUnit.get(unit) || 0) + 1)
    if (!highest || value > highest.value) {
      highest = { value, unit, lat, lon, at: row.captured_at || null }
    }
    if (features.length >= MAX_FEATURES) continue
    features.push({
      type: 'Feature',
      id: String(row.id ?? `${lat},${lon}`),
      properties: {
        value,
        unit,
        at: row.captured_at || null,
        device: row.device_id ?? null,
        height: row.height ?? null,
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })
  }

  return {
    ...res,
    data: {
      type: 'FeatureCollection',
      features,
      units: [...byUnit.entries()].map(([unit, count]) => ({ unit, count })),
      highest,
      fetchedAt: new Date().toISOString(),
      source: 'api.safecast.org',
    },
  }
}

module.exports = { fetchSafecast }
