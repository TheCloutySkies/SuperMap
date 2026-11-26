/**
 * CelesTrak orbital elements → subpoints and ground tracks.
 *
 * Propagation happens here, on the server, with the mean elements CelesTrak
 * publishes, so the browser needs no SGP4 dependency. It is a near-circular
 * approximation (mean motion, inclination, RAAN, argument of perigee), good
 * enough for a tactical overview, not for pointing an antenna.
 */
const { fetchWithEtag } = require('../snapshotHttp')

const GROUPS = ['stations', 'military', 'gps-ops', 'weather', 'resource']
const PER_GROUP_LIMIT = 40
const TRACK_MINUTES = 90
const TRACK_STEP_MINUTES = 10

const EARTH_RADIUS_KM = 6371
const RAD = Math.PI / 180

function epochMs(omm) {
  const at = Date.parse(omm.EPOCH || '')
  return Number.isFinite(at) ? at : Date.now()
}

/** Greenwich mean sidereal time in degrees (good to a fraction of a degree). */
function gmstDegrees(date) {
  const jd = date.getTime() / 86400000 + 2440587.5
  const d = jd - 2451545.0
  const theta = 280.46061837 + 360.98564736629 * d
  return ((theta % 360) + 360) % 360
}

function propagate(omm, atMs) {
  const meanMotion = Number(omm.MEAN_MOTION)
  if (!Number.isFinite(meanMotion) || meanMotion <= 0) return null
  const periodMinutes = 1440 / meanMotion
  const elapsed = (atMs - epochMs(omm)) / 60000
  const inclination = Number(omm.INCLINATION) * RAD
  const raan = Number(omm.RA_OF_ASC_NODE) * RAD
  const argPerigee = Number(omm.ARG_OF_PERICENTER || 0) * RAD
  const meanAnomaly = Number(omm.MEAN_ANOMALY || 0) * RAD
  const u = meanAnomaly + argPerigee + 2 * Math.PI * (elapsed / periodMinutes)

  const sinU = Math.sin(u)
  const cosU = Math.cos(u)
  const lat = Math.asin(Math.sin(inclination) * sinU)
  const lonOrbital = Math.atan2(Math.cos(inclination) * sinU, cosU)
  const theta = gmstDegrees(new Date(atMs)) * RAD
  let lon = raan + lonOrbital - theta
  lon = ((lon + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI

  return { lat: lat / RAD, lon: lon / RAD }
}

function altitudeKm(omm) {
  const meanMotion = Number(omm.MEAN_MOTION)
  if (!Number.isFinite(meanMotion) || meanMotion <= 0) return null
  const periodSeconds = (1440 / meanMotion) * 60
  const semiMajor = Math.cbrt((398600.4418 * periodSeconds * periodSeconds) / (4 * Math.PI * Math.PI))
  return Math.round(semiMajor - EARTH_RADIUS_KM)
}

function toFeature(omm, group, atMs) {
  const here = propagate(omm, atMs)
  if (!here) return null
  const norad = String(omm.NORAD_CAT_ID || '')
  const track = []
  for (let minute = -TRACK_MINUTES; minute <= TRACK_MINUTES; minute += TRACK_STEP_MINUTES) {
    const point = propagate(omm, atMs + minute * 60000)
    if (point) track.push([Number(point.lon.toFixed(3)), Number(point.lat.toFixed(3))])
  }
  return {
    type: 'Feature',
    id: norad || String(omm.OBJECT_NAME || ''),
    properties: {
      name: String(omm.OBJECT_NAME || '').trim(),
      norad,
      group,
      inclination: Number(omm.INCLINATION),
      periodMinutes: Number((1440 / Number(omm.MEAN_MOTION)).toFixed(1)),
      altitudeKm: altitudeKm(omm),
      epoch: omm.EPOCH || null,
      track: track.length > 1 ? track : null,
    },
    geometry: { type: 'Point', coordinates: [Number(here.lon.toFixed(3)), Number(here.lat.toFixed(3))] },
  }
}

async function fetchCelestrak({ etag = null, lastModified = null } = {}) {
  const results = await Promise.allSettled(GROUPS.map(async (group) => {
    const res = await fetchWithEtag(
      `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`,
      { timeoutMs: 30000, etag, lastModified, headers: { Accept: 'application/json' } },
    )
    if (res.notModified) return { group, notModified: true, rows: [] }
    const rows = Array.isArray(res.data) ? res.data : []
    return { group, notModified: false, rows: rows.slice(0, PER_GROUP_LIMIT), etag: res.etag, lastModified: res.lastModified }
  }))

  const at = Date.now()
  const features = []
  const groups = {}
  for (const settled of results) {
    if (settled.status !== 'fulfilled') continue
    const { group, rows } = settled.value
    groups[group] = rows.length
    for (const omm of rows) {
      const feature = toFeature(omm, group, at)
      if (feature) features.push(feature)
    }
  }
  if (!features.length) {
    const first = results.find((settled) => settled.status === 'fulfilled')
    if (first && first.value.notModified) return { notModified: true, etag, lastModified }
  }

  return {
    data: {
      type: 'FeatureCollection',
      features,
      groups,
      propagatedAt: new Date(at).toISOString(),
      approximation: 'mean elements, circular orbit (no J2, no drag)',
      source: 'celestrak.org',
    },
    etag,
    lastModified,
    notModified: false,
  }
}

module.exports = { fetchCelestrak }
