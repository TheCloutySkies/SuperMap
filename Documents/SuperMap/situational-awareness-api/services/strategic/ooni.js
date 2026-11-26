/**
 * OONI: internet censorship measurements (keyless).
 * https://api.ooni.io/api/v1/measurements
 */
const { fetchWithEtag } = require('../snapshotHttp')

const DAYS = 7
const LIMIT = 200

async function fetchOoni({ etag = null, lastModified = null } = {}) {
  const until = new Date().toISOString().slice(0, 10)
  const since = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10)
  const url = 'https://api.ooni.io/api/v1/measurements'
    + `?test_name=web_connectivity&limit=${LIMIT}&since=${since}&until=${until}`

  const res = await fetchWithEtag(url, {
    timeoutMs: 30000,
    etag,
    lastModified,
    headers: { Accept: 'application/json' },
  })
  if (res.notModified) return res

  const rows = Array.isArray(res.data?.results) ? res.data.results : []
  const byCountry = new Map()
  const byProbe = new Map()
  const anomalies = []
  for (const row of rows) {
    const country = String(row.probe_cc || '').toUpperCase()
    if (!country) continue
    byCountry.set(country, (byCountry.get(country) || 0) + 1)
    if (row.anomaly === true || row.confirmed === true) {
      byProbe.set(country, (byProbe.get(country) || 0) + 1)
      if (anomalies.length < 40) {
        anomalies.push({
          country,
          input: row.input || '',
          anomaly: row.anomaly === true,
          confirmed: row.confirmed === true,
          measurementUrl: row.measurement_url || '',
          date: row.measurement_start_time || '',
        })
      }
    }
  }

  const countries = [...byCountry.entries()]
    .map(([country, total]) => ({ country, total, suspect: byProbe.get(country) || 0 }))
    .sort((a, b) => b.suspect - a.suspect || b.total - a.total)
    .slice(0, 20)

  return {
    ...res,
    data: {
      countries,
      anomalies,
      totals: { measurements: rows.length, countries: byCountry.size, suspect: anomalies.length },
      window: { since, until },
      fetchedAt: new Date().toISOString(),
      source: 'api.ooni.io',
    },
  }
}

module.exports = { fetchOoni }
