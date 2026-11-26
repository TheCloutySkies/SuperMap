/**
 * UCDP GED (georeferenced conflict events) — needs a free access token.
 *
 * The API now requires `x-ucdp-access-token`; request one from the maintainer
 * (3–5 working days, 5,000 requests/day). Without it this source is gated and
 * the desk keeps its last-good instead of failing.
 */
const { fetchWithEtag } = require('../snapshotHttp')

const VERSION = process.env.UCDP_VERSION || '26.1'
const DAYS = 30
const PAGESIZE = 1000

function token() {
  return String(process.env.UCDP_ACCESS_TOKEN || '').trim()
}

function eventToFeature(event) {
  const lat = Number(event.latitude)
  const lon = Number(event.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const deaths = Number(event.best)
  return {
    type: 'Feature',
    id: String(event.id ?? event.relid ?? `${lat},${lon}`),
    properties: {
      country: event.country || '',
      region: event.region || '',
      sideA: event.side_a || '',
      sideB: event.side_b || '',
      dyad: event.dyad_name || '',
      deaths: Number.isFinite(deaths) ? deaths : 0,
      violence: Number(event.type_of_violence) || null,
      dateStart: event.date_start || '',
      dateEnd: event.date_end || '',
      place: event.where_description || event.where_coordinates || '',
      source: 'UCDP GED',
    },
    geometry: { type: 'Point', coordinates: [lon, lat] },
  }
}

async function fetchUcdp({ etag = null, lastModified = null } = {}) {
  const accessToken = token()
  if (!accessToken) {
    const err = new Error('UCDP_ACCESS_TOKEN is not set')
    err.gated = true
    throw err
  }
  const end = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10)
  const url = `https://ucdpapi.pcr.uu.se/api/gedevents/${VERSION}`
    + `?pagesize=${PAGESIZE}&page=1&StartDate=${start}&EndDate=${end}`

  const res = await fetchWithEtag(url, {
    timeoutMs: 45000,
    etag,
    lastModified,
    headers: { 'x-ucdp-access-token': accessToken, Accept: 'application/json' },
  })
  if (res.notModified) return res

  const rows = Array.isArray(res.data?.Result) ? res.data.Result : []
  const features = rows.map(eventToFeature).filter(Boolean)
  const byCountry = new Map()
  const byViolence = new Map()
  let deaths = 0
  for (const row of rows) {
    const country = String(row.country || 'Unknown').trim()
    byCountry.set(country, (byCountry.get(country) || 0) + 1)
    const kind = Number(row.type_of_violence) || 0
    byViolence.set(kind, (byViolence.get(kind) || 0) + 1)
    deaths += Number(row.best) || 0
  }

  return {
    ...res,
    data: {
      type: 'FeatureCollection',
      features,
      totals: {
        events: rows.length,
        mapped: features.length,
        deaths,
        byCountry: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
          .map(([country, count]) => ({ country, count })),
        byViolence: [...byViolence.entries()].map(([kind, count]) => ({ kind, count })),
      },
      window: { start, end, version: VERSION },
      recent: rows.slice(0, 30).map((row) => ({
        country: row.country || '',
        sideA: row.side_a || '',
        sideB: row.side_b || '',
        deaths: Number(row.best) || 0,
        date: row.date_end || row.date_start || '',
        place: row.where_description || '',
      })),
      fetchedAt: new Date().toISOString(),
      source: 'ucdpapi.pcr.uu.se',
    },
  }
}

module.exports = { fetchUcdp, ucdpConfigured: () => Boolean(token()) }
