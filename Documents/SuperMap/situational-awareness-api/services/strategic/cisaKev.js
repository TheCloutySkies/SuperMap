/**
 * CISA KEV: vulnerabilities known to be exploited in the wild (keyless).
 */
const { fetchWithEtag } = require('../snapshotHttp')

const ENDPOINT = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'

async function fetchCisaKev({ etag = null, lastModified = null } = {}) {
  const res = await fetchWithEtag(ENDPOINT, {
    timeoutMs: 30000,
    etag,
    lastModified,
    headers: { Accept: 'application/json' },
  })
  if (res.notModified) return res

  const rows = Array.isArray(res.data?.vulnerabilities) ? res.data.vulnerabilities : []
  const byYear = new Map()
  let ransomwareLinked = 0
  for (const row of rows) {
    const year = String(row.dateAdded || '').slice(0, 4)
    if (year) byYear.set(year, (byYear.get(year) || 0) + 1)
    if (String(row.knownRansomwareCampaignUse || '').toLowerCase() === 'known') ransomwareLinked += 1
  }
  const recent = rows
    .slice()
    .sort((a, b) => String(b.dateAdded || '').localeCompare(String(a.dateAdded || '')))
    .slice(0, 15)
    .map((row) => ({
      cve: row.cveID || '',
      vendor: row.vendorProject || '',
      product: row.product || '',
      name: row.vulnerabilityName || '',
      added: row.dateAdded || '',
      ransomware: String(row.knownRansomwareCampaignUse || '').toLowerCase() === 'known',
    }))

  return {
    ...res,
    data: {
      catalogVersion: res.data?.catalogVersion || null,
      dateReleased: res.data?.dateReleased || null,
      count: rows.length,
      ransomwareLinked,
      byYear: [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8)
        .map(([year, count]) => ({ year, count })),
      recent,
      fetchedAt: new Date().toISOString(),
      source: 'cisa.gov',
    },
  }
}

module.exports = { fetchCisaKev }
