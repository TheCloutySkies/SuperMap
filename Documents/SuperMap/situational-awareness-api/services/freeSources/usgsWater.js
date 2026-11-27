/**
 * River gauges inside active NWS alert areas.
 *
 * USGS Water publishes provisional gage height and discharge with coordinates
 * (OGC API, keyless). There are no keyless flood-stage thresholds, so this does
 * not claim a flood category: it reports gauges that sit inside an active NWS
 * alert polygon, which is the honest cascade signal.
 */
const { fetchWithEtag } = require('../snapshotHttp')
const { num } = require('./util')

const ALERTS = 'https://api.weather.gov/alerts/active?status=actual&message_type=alert'
const LATEST = 'https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items'
const SEVERITY = { extreme: 1, severe: 0.85, moderate: 0.6, minor: 0.4, unknown: 0.3 }
const MAX_ALERTS = 600
const MAX_GAUGES = 80

function bboxOf(geometry) {
  if (!geometry) return null
  const points = []
  const walk = (node) => {
    if (!Array.isArray(node)) return
    if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
      points.push([node[0], node[1]])
      return
    }
    node.forEach(walk)
  }
  walk(geometry.coordinates)
  if (!points.length) return null
  let west = 180
  let south = 90
  let east = -180
  let north = -90
  for (const [lon, lat] of points) {
    west = Math.min(west, lon)
    east = Math.max(east, lon)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return [west, south, east, north]
}

function parseGauges(payload) {
  const rows = []
  for (const feature of Array.isArray(payload?.features) ? payload.features : []) {
    const props = feature?.properties || {}
    const coords = feature?.geometry?.coordinates
    const lon = num(coords?.[0])
    const lat = num(coords?.[1])
    const value = num(props.value)
    if (lon == null || lat == null || value == null) continue
    rows.push({
      site: String(props.monitoring_location_id || '').replace(/^USGS-/, ''),
      time: props.time || null,
      value,
      unit: props.unit_of_measure || '',
      lon,
      lat,
    })
  }
  return rows
}

async function fetchUsgsWater({ etag = null, lastModified = null } = {}) {
  const failures = []
  let response = { etag, lastModified }
  let gageRows = []
  let flowRows = []

  try {
    const res = await fetchWithEtag(`${LATEST}?f=json&parameter_code=00065&limit=3000`, {
      timeoutMs: 45000,
      etag,
      lastModified,
      headers: { Accept: 'application/geo+json,application/json' },
    })
    if (res.notModified) return res
    response = res
    gageRows = parseGauges(res.data)
  } catch (err) {
    failures.push(`gage: ${err.message}`)
  }

  try {
    const res = await fetchWithEtag(`${LATEST}?f=json&parameter_code=00060&limit=3000`, {
      timeoutMs: 45000,
      headers: { Accept: 'application/geo+json,application/json' },
    })
    flowRows = parseGauges(res.data)
  } catch (err) {
    failures.push(`flow: ${err.message}`)
  }

  let alerts = []
  try {
    const res = await fetchWithEtag(ALERTS, { timeoutMs: 30000, headers: { Accept: 'application/geo+json,application/json' } })
    alerts = (Array.isArray(res.data?.features) ? res.data.features : [])
      .map((feature) => {
        const bbox = bboxOf(feature?.geometry)
        if (!bbox) return null
        const props = feature?.properties || {}
        return {
          bbox,
          event: props.event || 'NWS alert',
          severity: String(props.severity || 'unknown').toLowerCase(),
          onset: props.onset || props.effective || null,
          ends: props.ends || props.expires || null,
        }
      })
      .filter(Boolean)
      .slice(0, MAX_ALERTS)
  } catch (err) {
    failures.push(`nws: ${err.message}`)
  }

  if (!gageRows.length) throw new Error(`USGS Water unavailable (${failures.join('; ') || 'no gauges'})`)

  const flowBySite = new Map(flowRows.map((row) => [row.site, row]))

  // A gauge that doubled since the previous published run is worth reporting even
  // outside an alert polygon; the baseline lives in the last snapshot payload.
  const priorBySite = new Map()
  try {
    const cached = require('../apiResultCache').getStale('free-usgs-water', 'free-usgs-water', 7 * 24 * 3600)
    for (const item of cached?.value?.items || []) {
      const value = Number(item?.gage)
      if (item?.site && Number.isFinite(value)) priorBySite.set(String(item.site), value)
    }
  } catch { /* first run, or no seeded cache */ }

  const items = []
  for (const gage of gageRows) {
    const alert = alerts.find((entry) => (
      gage.lon >= entry.bbox[0] && gage.lon <= entry.bbox[2] && gage.lat >= entry.bbox[1] && gage.lat <= entry.bbox[3]
    ))
    const prior = priorBySite.get(gage.site)
    const rise = prior != null && gage.value >= 2 && gage.value >= prior * 2
    if (!alert && !rise) continue
    const flow = flowBySite.get(gage.site)
    items.push({
      site: gage.site,
      lat: gage.lat,
      lon: gage.lon,
      gage: gage.value,
      unit: gage.unit,
      discharge: flow ? flow.value : null,
      dischargeUnit: flow ? flow.unit : null,
      at: gage.time,
      alert: alert ? alert.event : null,
      severity: alert ? alert.severity : 'rise',
      onset: alert ? alert.onset : null,
      expires: alert ? alert.ends : null,
      rise,
      priorGage: prior ?? null,
    })
    if (items.length >= MAX_GAUGES) break
  }

  items.sort((a, b) => (SEVERITY[b.severity] || 0) - (SEVERITY[a.severity] || 0) || b.gage - a.gage)

  return {
    etag: response.etag,
    lastModified: response.lastModified,
    notModified: false,
    data: {
      items,
      alerts: alerts.length,
      gauges: gageRows.length,
      failures,
      fetchedAt: new Date().toISOString(),
      source: 'api.waterdata.usgs.gov · api.weather.gov',
    },
  }
}

module.exports = { fetchUsgsWater }
