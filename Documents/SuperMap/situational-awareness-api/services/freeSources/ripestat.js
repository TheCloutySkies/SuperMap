/**
 * RIPEstat country routing health.
 *
 * country-resource-stats carries a weekly series per country; the last two
 * usable points give a week-over-week change in announced IPv4 prefixes. That
 * is a slow, registry-grade signal, so the collector gates it at twelve hours
 * rather than hammering a 277 KB response every two.
 */
const { fetchWithEtag } = require('../snapshotHttp')
const { sleep } = require('./util')

const COUNTRIES = ['RU', 'UA', 'IR', 'IL', 'LB', 'SY', 'CN', 'KP', 'MM', 'BY', 'SD', 'YE']
const ENDPOINT = 'https://stat.ripe.net/data/country-resource-stats/data.json'

function latestPoints(stats) {
  const rows = Array.isArray(stats) ? stats : []
  const usable = rows.filter((row) => Number.isFinite(Number(row?.v4_prefixes_ris)))
  return usable.slice(-2)
}

async function fetchRipestat({ etag = null, lastModified = null } = {}) {
  const items = []
  const failures = []
  let response = { etag, lastModified }

  for (const [index, cc] of COUNTRIES.entries()) {
    try {
      const res = await fetchWithEtag(`${ENDPOINT}?resource=${cc}`, {
        timeoutMs: 30000,
        etag: index === 0 ? etag : null,
        lastModified: index === 0 ? lastModified : null,
        headers: { Accept: 'application/json' },
      })
      if (index === 0 && res.notModified) return res
      if (index === 0) response = res
      const points = latestPoints(res.data?.data?.stats)
      let registered = null
      let routed = null
      try {
        const asns = await fetchWithEtag(`https://stat.ripe.net/data/country-asns/data.json?resource=${cc}`, {
          timeoutMs: 20000,
          headers: { Accept: 'application/json' },
        })
        const stats = asns.data?.data?.stats || {}
        registered = Number.isFinite(Number(stats.registered)) ? Number(stats.registered) : null
        routed = Number.isFinite(Number(stats.routed)) ? Number(stats.routed) : null
      } catch { /* the routed-ratio signal is optional */ }
      if (points.length) {
        const prev = points[0]
        const last = points[points.length - 1]
        const prevV4 = Number(prev.v4_prefixes_ris)
        const lastV4 = Number(last.v4_prefixes_ris)
        const deltaPct = prevV4 > 0 ? Math.round(((lastV4 - prevV4) / prevV4) * 1000) / 10 : null
        items.push({
          cc,
          v4: Number.isFinite(lastV4) ? lastV4 : null,
          v6: Number.isFinite(Number(last.v6_prefixes_ris)) ? Number(last.v6_prefixes_ris) : null,
          asns: Number.isFinite(Number(last.asns_ris)) ? Number(last.asns_ris) : null,
          registered,
          routed,
          deltaPct,
          observedAt: last.stats_date || res.data?.data?.latest_time || null,
        })
      }
    } catch (err) {
      failures.push(`${cc}: ${err.message}`)
    }
    if (index < COUNTRIES.length - 1) await sleep(250)
  }

  if (!items.length) throw new Error(`RIPEstat unavailable (${failures.join('; ') || 'no rows'})`)

  return {
    etag: response.etag,
    lastModified: response.lastModified,
    notModified: false,
    data: {
      items,
      failures,
      fetchedAt: new Date().toISOString(),
      source: 'stat.ripe.net',
    },
  }
}

module.exports = { fetchRipestat, COUNTRIES }
