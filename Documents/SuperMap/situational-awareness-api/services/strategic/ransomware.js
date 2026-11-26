/**
 * ransomware.live: recent ransomware victims (keyless).
 * https://api.ransomware.live/v2/recentvictims
 */
const { fetchWithEtag } = require('../snapshotHttp')

const ENDPOINT = 'https://api.ransomware.live/v2/recentvictims'

async function fetchRansomware({ etag = null, lastModified = null } = {}) {
  const res = await fetchWithEtag(ENDPOINT, {
    timeoutMs: 25000,
    etag,
    lastModified,
    headers: { Accept: 'application/json' },
  })
  if (res.notModified) return res

  const rows = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.victims) ? res.data.victims : [])
  const byGroup = new Map()
  const byCountry = new Map()
  const recent = []
  for (const row of rows) {
    const group = String(row.group || row.group_name || '').trim()
    const country = String(row.country || '').trim().toUpperCase()
    if (group) byGroup.set(group, (byGroup.get(group) || 0) + 1)
    if (country) byCountry.set(country, (byCountry.get(country) || 0) + 1)
    if (recent.length < 20) {
      recent.push({
        victim: row.victim || row.post_title || '',
        group,
        country,
        date: row.discovered || row.date || row.published || '',
        url: row.post_url || row.url || null,
      })
    }
  }

  return {
    ...res,
    data: {
      victims: rows.length,
      byGroup: [...byGroup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
        .map(([group, count]) => ({ group, count })),
      byCountry: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
        .map(([country, count]) => ({ country, count })),
      recent,
      fetchedAt: new Date().toISOString(),
      source: 'api.ransomware.live',
    },
  }
}

module.exports = { fetchRansomware }
