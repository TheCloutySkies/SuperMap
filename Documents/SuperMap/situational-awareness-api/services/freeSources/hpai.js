/**
 * USDA APHIS H5N1 detections — commercial/backyard flocks and wild birds.
 *
 * Two public ArcGIS feature services, no key. Output is per state: detections in
 * the last thirty days, cumulative total, birds affected, and whether dairy
 * cattle are involved (the zoonotic-relevant case).
 */
const { fetchWithEtag } = require('../snapshotHttp')
const { num } = require('./util')

const SERVICES = {
  livestock: 'https://services1.arcgis.com/jWQlP64OuwDh6GGX/arcgis/rest/services/hpai_commercial_backyard_usa/FeatureServer/0/query',
  wildbirds: 'https://services1.arcgis.com/jWQlP64OuwDh6GGX/arcgis/rest/services/hpai_wildbirds_usa/FeatureServer/0/query',
}
const QUERY = '?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=2000'
const DAY = 24 * 60 * 60 * 1000

function dateOf(value) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function collect(features, kind, into, now) {
  for (const feature of features) {
    const props = feature?.properties || {}
    const state = String(props.State || props.state || '').trim()
    if (!state) continue
    const at = dateOf(props.Confirmed) ?? dateOf(props.Date_Collected) ?? dateOf(props.Confirmed_Date) ?? null
    const entry = into.get(state) || { state, recent: 0, total: 0, wild: 0, livestock: 0, birds: 0, dairy: false, lastConfirmed: null }
    entry.total += 1
    if (kind === 'wildbirds') entry.wild += 1
    else {
      entry.livestock += 1
      const production = String(props.Production || '')
      if (/dairy|cattle|bovine/i.test(production)) entry.dairy = true
      entry.birds += num(props.Birds_Affected) || 0
    }
    if (at != null) {
      if (now - at <= 30 * DAY) entry.recent += 1
      if (!entry.lastConfirmed || at > entry.lastConfirmed) entry.lastConfirmed = at
    }
    into.set(state, entry)
  }
}

async function fetchHpai({ etag = null, lastModified = null } = {}) {
  const now = Date.now()
  const byState = new Map()
  const failures = []
  let response = { etag, lastModified }

  for (const [kind, service] of Object.entries(SERVICES)) {
    try {
      const res = await fetchWithEtag(`${service}${QUERY}`, {
        timeoutMs: 45000,
        etag: kind === 'livestock' ? etag : null,
        lastModified: kind === 'livestock' ? lastModified : null,
        headers: { Accept: 'application/geo+json,application/json' },
      })
      if (kind === 'livestock' && res.notModified) return res
      if (kind === 'livestock') response = res
      const features = Array.isArray(res.data?.features) ? res.data.features : []
      collect(features, kind, byState, now)
    } catch (err) {
      failures.push(`${kind}: ${err.message}`)
    }
  }

  const all = [...byState.values()]
  if (!all.length) throw new Error(`APHIS services unavailable (${failures.join('; ') || 'no rows'})`)

  const items = all
    .filter((row) => row.recent > 0 || row.livestock > 0)
    .sort((a, b) => b.recent - a.recent || b.total - a.total)
    .slice(0, 60)
    .map((row) => ({
      state: row.state,
      recent: row.recent,
      total: row.total,
      livestock: row.livestock,
      wild: row.wild,
      birds: row.birds,
      dairy: row.dairy,
      lastConfirmed: row.lastConfirmed ? new Date(row.lastConfirmed).toISOString() : null,
    }))

  const newLast30d = all.reduce((sum, row) => sum + row.recent, 0)
  return {
    etag: response.etag,
    lastModified: response.lastModified,
    notModified: false,
    data: {
      items,
      states: all.length,
      newLast30d,
      dairyStates: all.filter((row) => row.dairy).length,
      failures,
      fetchedAt: new Date().toISOString(),
      source: 'aphis.usda.gov (ArcGIS)',
    },
  }
}

module.exports = { fetchHpai }
