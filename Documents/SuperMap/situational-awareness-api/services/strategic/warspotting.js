/**
 * WarSpotting: documented Russian equipment losses in Ukraine.
 *
 * https://ukr.warspotting.net/api/losses/russia/ → { losses: [{ id, type, model,
 * status, lost_by, date, nearest_location, geo: "lat,lon", unit }] }
 */
const { fetchWithEtag } = require('../snapshotHttp')

const ENDPOINT = 'https://ukr.warspotting.net/api/losses/russia/'
const STATUSES = ['destroyed', 'damaged', 'abandoned', 'captured']

function pointOf(loss) {
  const raw = String(loss?.geo || '').trim()
  const [latText, lonText] = raw.split(',')
  const lat = Number(latText)
  const lon = Number(lonText)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return [lon, lat]
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase()
  return STATUSES.includes(status) ? status : 'destroyed'
}

async function fetchWarspotting({ etag = null, lastModified = null } = {}) {
  const res = await fetchWithEtag(ENDPOINT, {
    timeoutMs: 25000,
    etag,
    lastModified,
    headers: { Accept: 'application/json' },
  })
  if (res.notModified) return res

  const rows = Array.isArray(res.data?.losses) ? res.data.losses : []
  const features = []
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]))
  const byType = new Map()
  const byUnit = new Map()

  for (const row of rows) {
    const status = normalizeStatus(row.status)
    byStatus[status] += 1
    const type = String(row.type || 'Unknown').trim()
    byType.set(type, (byType.get(type) || 0) + 1)
    const unit = String(row.unit || '').trim()
    if (unit) byUnit.set(unit, (byUnit.get(unit) || 0) + 1)
    const coordinates = pointOf(row)
    if (!coordinates) continue
    features.push({
      type: 'Feature',
      id: String(row.id || `${coordinates.join(',')}-${type}`),
      properties: {
        id: row.id ?? null,
        type,
        model: row.model || '',
        status,
        lost_by: row.lost_by || '',
        date: row.date || '',
        place: row.nearest_location || '',
        unit,
      },
      geometry: { type: 'Point', coordinates },
    })
  }

  const topType = [...byType.entries()].sort((a, b) => b[1] - a[1])[0] || null
  return {
    ...res,
    data: {
      type: 'FeatureCollection',
      features,
      totals: {
        rows: rows.length,
        mapped: features.length,
        byStatus,
        topType: topType ? { type: topType[0], count: topType[1] } : null,
        topUnit: [...byUnit.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      },
      recent: rows.slice(0, 40).map((row) => ({
        id: row.id ?? null,
        type: row.type || '',
        model: row.model || '',
        status: normalizeStatus(row.status),
        date: row.date || '',
        place: row.nearest_location || '',
        unit: row.unit || '',
      })),
      fetchedAt: new Date().toISOString(),
      source: 'ukr.warspotting.net',
    },
  }
}

module.exports = { fetchWarspotting }
