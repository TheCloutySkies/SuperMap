/**
 * SondeHub: live radiosonde (weather balloon) positions (keyless).
 * https://api.v2.sondehub.org/sondes
 */
const { fetchWithEtag } = require('../snapshotHttp')

const ENDPOINT = 'https://api.v2.sondehub.org/sondes'

function entryOf(serial, value) {
  // The endpoint has returned both a single object and a list per serial.
  const latest = Array.isArray(value) ? value[value.length - 1] : value
  if (!latest || typeof latest !== 'object') return null
  const lat = Number(latest.lat ?? latest.latitude)
  const lon = Number(latest.lon ?? latest.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  const altitude = Number(latest.alt ?? latest.altitude)
  return {
    type: 'Feature',
    id: String(serial || latest.serial || `${lat},${lon}`),
    properties: {
      serial: String(serial || latest.serial || ''),
      type: latest.type || latest.sonde_type || '',
      frequency: latest.frequency ?? null,
      altitude: Number.isFinite(altitude) ? Math.round(altitude) : null,
      at: latest.datetime || latest.time_received || latest.uploaded_at || null,
    },
    geometry: { type: 'Point', coordinates: [lon, lat] },
  }
}

async function fetchSondehub({ etag = null, lastModified = null } = {}) {
  const res = await fetchWithEtag(ENDPOINT, {
    timeoutMs: 25000,
    etag,
    lastModified,
    headers: { Accept: 'application/json' },
  })
  if (res.notModified) return res

  const payload = res.data && typeof res.data === 'object' ? res.data : {}
  const features = []
  const byType = new Map()
  for (const [serial, value] of Object.entries(payload)) {
    if (features.length >= 500) break
    const feature = entryOf(serial, value)
    if (!feature) continue
    features.push(feature)
    const kind = String(feature.properties.type || 'unknown').toLowerCase()
    byType.set(kind, (byType.get(kind) || 0) + 1)
  }

  return {
    ...res,
    data: {
      type: 'FeatureCollection',
      features,
      totals: {
        balloons: features.length,
        byType: [...byType.entries()].map(([type, count]) => ({ type, count })),
      },
      fetchedAt: new Date().toISOString(),
      source: 'api.v2.sondehub.org',
    },
  }
}

module.exports = { fetchSondehub }
