/**
 * CDC NWSS wastewater viral activity (Socrata 2ew6-ywp6).
 *
 * One row per treatment plant and sampling period. Keep the latest period per
 * reporting jurisdiction and emit only where activity is at or above the 90th
 * percentile, or rising hard over fifteen days.
 */
const { fetchWithEtag } = require('../snapshotHttp')
const { num, ordinal } = require('./util')

const DATASET = '2ew6-ywp6'
const ENDPOINT = `https://data.cdc.gov/resource/${DATASET}.json`

async function fetchNwss({ etag = null, lastModified = null } = {}) {
  const token = String(process.env.SOCRATA_APP_TOKEN || '').trim()
  const headers = { Accept: 'application/json' }
  if (token) headers['X-App-Token'] = token

  const res = await fetchWithEtag(`${ENDPOINT}?$order=date_end%20DESC&$limit=2000`, {
    timeoutMs: 45000,
    etag,
    lastModified,
    headers,
  })
  if (res.notModified) return res

  const rows = Array.isArray(res.data) ? res.data : []
  const latest = new Map()
  for (const row of rows) {
    const state = String(row.reporting_jurisdiction || row.wwtp_jurisdiction || '').trim()
    if (!state) continue
    const dateEnd = String(row.date_end || '')
    const seen = latest.get(state)
    if (!seen || dateEnd > seen.dateEnd) {
      latest.set(state, {
        state,
        jurisdiction: state,
        percentile: num(row.percentile),
        ptc15d: num(row.ptc_15d),
        detectProp: num(row.detect_prop_15d),
        population: num(row.population_served),
        county: row.county_names || null,
        dateEnd,
        dateStart: row.date_start || null,
      })
    }
  }

  const items = [...latest.values()]
    .filter((row) => (row.percentile != null && row.percentile >= 90) || (row.ptc15d != null && row.ptc15d >= 80))
    .sort((a, b) => (b.percentile || 0) - (a.percentile || 0))
    .slice(0, 60)

  return {
    etag: res.etag,
    lastModified: res.lastModified,
    notModified: false,
    data: {
      items,
      jurisdictions: latest.size,
      dataset: DATASET,
      pathogen: 'SARS-CoV-2',
      measured: 'wastewater viral activity',
      fetchedAt: new Date().toISOString(),
      source: 'data.cdc.gov',
    },
  }
}

module.exports = { fetchNwss }
