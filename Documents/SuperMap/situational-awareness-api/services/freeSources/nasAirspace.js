/**
 * FAA NAS airport events — the airspace feed.
 *
 * The TFR list has no public JSON any more (tfr.faa.gov is a Nuxt app and its
 * only JSON is a PWA manifest), but the NAS status API is keyless and carries
 * airport coordinates, closures, ground stops and long-running NOTAM notices.
 */
const { fetchWithEtag } = require('../snapshotHttp')

const ENDPOINT = 'https://nasstatus.faa.gov/api/airport-events'
const MAX_ITEMS = 80

function eventOf(item) {
  const candidates = [
    ['closure', item.airportClosure],
    ['ground stop', item.groundStop],
    ['ground delay', item.groundDelay],
    ['arrival delay', item.arrivalDelay],
    ['departure delay', item.departureDelay],
    ['notice', item.freeForm],
  ]
  for (const [type, event] of candidates) {
    if (event && typeof event === 'object') return { type, event }
  }
  return null
}

async function fetchNasAirspace({ etag = null, lastModified = null } = {}) {
  const res = await fetchWithEtag(ENDPOINT, {
    timeoutMs: 30000,
    etag,
    lastModified,
    headers: { Accept: 'application/json' },
  })
  if (res.notModified) return res

  const rows = Array.isArray(res.data) ? res.data : []
  const items = []
  for (const row of rows) {
    const found = eventOf(row)
    if (!found) continue
    const { type, event } = found
    const text = String(event.simpleText || event.text || '').trim()
    const airport = String(row.airportId || event.airportId || '').trim()
    if (!airport) continue
    items.push({
      airport,
      airportName: row.airportLongName || null,
      type,
      reason: text || type,
      start: event.startTime || null,
      end: event.endTime || null,
      issued: event.issuedDate || event.updatedAt || null,
      notam: event.notamNumber ?? null,
      lat: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
      lon: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
    })
    if (items.length >= MAX_ITEMS) break
  }

  const byType = {}
  for (const item of items) byType[item.type] = (byType[item.type] || 0) + 1

  return {
    etag: res.etag,
    lastModified: res.lastModified,
    notModified: false,
    data: {
      items,
      airports: rows.length,
      byType,
      fetchedAt: new Date().toISOString(),
      source: 'nasstatus.faa.gov',
      note: 'TFR list JSON is no longer published; NAS airport events are used instead.',
    },
  }
}

module.exports = { fetchNasAirspace }
