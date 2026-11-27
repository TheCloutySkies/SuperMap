/**
 * abuse.ch malicious infrastructure — Feodo C2 list plus the two feeds that are
 * still keyless in 2026: OpenPhish URLs and the Spamhaus DROP netblocks.
 *
 * URLhaus and ThreatFox now answer 410/401 without an Auth-Key, so they are not
 * used. Everything here is summarised; no raw blocklist is stored in a snapshot.
 */
const { fetchWithEtag } = require('../snapshotHttp')

const FEODO = 'https://feodotracker.abuse.ch/downloads/ipblocklist.json'
const OPENPHISH = 'https://openphish.com/feed.txt'
const DROP = 'https://www.spamhaus.org/drop/drop.txt'

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function summariseFeodo(rows) {
  const online = rows.filter((row) => String(row.status || '').toLowerCase() === 'online').length
  const byMalware = new Map()
  const byCountry = new Map()
  for (const row of rows) {
    const malware = String(row.malware || 'Unknown').trim()
    byMalware.set(malware, (byMalware.get(malware) || 0) + 1)
    const country = String(row.country || '').trim().toUpperCase()
    if (country) byCountry.set(country, (byCountry.get(country) || 0) + 1)
  }
  const items = [...byMalware.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([malware, count]) => ({ feed: 'Feodo Tracker', label: malware, count, online }))
  const topCountry = [...byCountry.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    total: rows.length,
    online,
    items,
    meta: { online, topCountry: topCountry ? { country: topCountry[0], count: topCountry[1] } : null },
  }
}

function summariseOpenPhish(text) {
  const hosts = new Map()
  for (const line of String(text).split('\n')) {
    const url = line.trim()
    if (!/^https?:\/\//i.test(url)) continue
    const host = hostOf(url)
    if (!host) continue
    hosts.set(host, (hosts.get(host) || 0) + 1)
  }
  const items = [...hosts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([host, count]) => ({ feed: 'OpenPhish', label: host, count }))
  return { total: hosts.size, items }
}

function summariseDrop(text) {
  let prefixes = 0
  const byOctet = new Map()
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(';')) continue
    const [prefix] = trimmed.split(/\s+/)
    const first = prefix.split('/')[0]?.split('.')[0]
    if (!first) continue
    prefixes += 1
    const key = `${first}.0.0.0/8`
    byOctet.set(key, (byOctet.get(key) || 0) + 1)
  }
  const items = [...byOctet.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({ feed: 'Spamhaus DROP', label: `within ${label}`, count }))
  return { total: prefixes, items }
}

async function fetchAbuseCh({ etag = null, lastModified = null } = {}) {
  const failures = []
  let feodo = { total: 0, online: 0, items: [], meta: {} }
  let openphish = { total: 0, items: [] }
  let drop = { total: 0, items: [] }
  let response = { etag, lastModified }

  try {
    const res = await fetchWithEtag(FEODO, { timeoutMs: 25000, etag, lastModified, headers: { Accept: 'application/json' } })
    if (res.notModified) return res
    response = res
    const rows = Array.isArray(res.data) ? res.data : []
    feodo = summariseFeodo(rows)
  } catch (err) {
    failures.push(`feodo: ${err.message}`)
  }

  try {
    const res = await fetchWithEtag(OPENPHISH, { timeoutMs: 25000, responseType: 'text', headers: { Accept: 'text/plain' } })
    openphish = summariseOpenPhish(res.data)
  } catch (err) {
    failures.push(`openphish: ${err.message}`)
  }

  try {
    const res = await fetchWithEtag(DROP, { timeoutMs: 25000, responseType: 'text', headers: { Accept: 'text/plain' } })
    drop = summariseDrop(res.data)
  } catch (err) {
    failures.push(`spamhaus: ${err.message}`)
  }

  if (!feodo.total && !openphish.total && !drop.total) {
    throw new Error(`abuse.ch feeds unavailable (${failures.join('; ') || 'no data'})`)
  }

  const items = [...feodo.items, ...openphish.items, ...drop.items]
  return {
    etag: response.etag,
    lastModified: response.lastModified,
    notModified: false,
    data: {
      items,
      totals: { feodo: feodo.total, feodoOnline: feodo.online, openphishHosts: openphish.total, dropPrefixes: drop.total },
      feodo: feodo.meta,
      failures,
      fetchedAt: new Date().toISOString(),
      source: 'feodotracker.abuse.ch · openphish.com · spamhaus.org',
    },
  }
}

module.exports = { fetchAbuseCh }
