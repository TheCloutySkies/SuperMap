/**
 * Global tropical cyclones — JTWC warnings plus NHC's current storms.
 *
 * Both are keyless. An empty list is a valid answer outside the season, so the
 * collector registers this source with allowEmpty.
 */
const { fetchWithEtag } = require('../snapshotHttp')

const JTWC = 'https://www.metoc.navy.mil/jtwc/rss/jtwc.rss'
const NHC = 'https://www.nhc.noaa.gov/CurrentStorms.json'

function strip(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseJtwc(xml) {
  const items = []
  for (const match of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1]
    const title = strip(/<title>([\s\S]*?)<\/title>/i.exec(block)?.[1] || '')
    if (!title || /no active tropical warning/i.test(title)) continue
    const description = strip(/<description>([\s\S]*?)<\/description>/i.exec(block)?.[1] || '').slice(0, 300)
    const link = strip(/<link>([\s\S]*?)<\/link>/i.exec(block)?.[1] || '')
    const pubDate = strip(/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block)?.[1] || '')
    const storm = /(SUPER TYPHOON|TYPHOON|TROPICAL STORM|TROPICAL DEPRESSION|HURRICANE|TROPICAL CYCLONE)\s+([A-Z0-9-]+)/i.exec(title)
    // JTWC's feed also carries advisory summaries ("Current Significant Tropical
    // Weather Advisories"); only a named storm is a cyclone.
    if (!storm) continue
    items.push({
      id: `jtwc:${title.slice(0, 60)}`,
      source: 'JTWC',
      name: storm ? `${storm[1]} ${storm[2]}` : title.slice(0, 80),
      basin: /north indian/i.test(description) ? 'North Indian' : 'Northwest Pacific / Southern Hemisphere',
      category: storm ? storm[1].toUpperCase() : 'CYCLONE',
      lat: null,
      lon: null,
      updated: pubDate ? Date.parse(pubDate) || null : null,
      link: /^https?:/i.test(link) ? link : null,
      detail: description,
    })
  }
  return items
}

function parseCoord(value, positive, negative) {
  const text = String(value || '').trim().toUpperCase()
  const n = Number.parseFloat(text)
  if (!Number.isFinite(n)) return null
  if (text.endsWith(negative)) return -Math.abs(n)
  if (text.endsWith(positive)) return Math.abs(n)
  return n
}

function parseNhc(payload) {
  const rows = Array.isArray(payload?.activeStorms) ? payload.activeStorms : []
  return rows.map((storm) => ({
    id: `nhc:${storm.id || storm.name}`,
    source: 'NHC',
    name: `${storm.name || 'Storm'}${storm.classification ? ` (${storm.classification})` : ''}`,
    basin: storm.basin || 'Atlantic / East Pacific',
    category: storm.classification || 'CYCLONE',
    lat: parseCoord(storm.latitude, 'N', 'S'),
    lon: parseCoord(storm.longitude, 'E', 'W'),
    intensity: Number.isFinite(Number(storm.intensity)) ? Number(storm.intensity) : null,
    pressure: Number.isFinite(Number(storm.pressure)) ? Number(storm.pressure) : null,
    updated: storm.publicAdvisory?.issued ? Date.parse(storm.publicAdvisory.issued) || null : null,
    link: storm.publicAdvisory?.url || null,
    detail: [storm.movementDir, storm.movementSpeed].filter(Boolean).join(' ') || '',
  }))
}

async function fetchCyclones({ etag = null, lastModified = null } = {}) {
  const failures = []
  let items = []
  let response = { etag, lastModified }

  try {
    const res = await fetchWithEtag(JTWC, {
      timeoutMs: 25000,
      responseType: 'text',
      etag,
      lastModified,
      headers: { Accept: 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8' },
    })
    if (res.notModified) return res
    response = res
    items.push(...parseJtwc(res.data))
  } catch (err) {
    failures.push(`jtwc: ${err.message}`)
  }

  try {
    const res = await fetchWithEtag(NHC, { timeoutMs: 25000, headers: { Accept: 'application/json' } })
    items.push(...parseNhc(res.data))
  } catch (err) {
    failures.push(`nhc: ${err.message}`)
  }

  if (failures.length === 2) throw new Error(`cyclone feeds unavailable (${failures.join('; ')})`)

  return {
    etag: response.etag,
    lastModified: response.lastModified,
    notModified: false,
    data: {
      items: items.slice(0, 40),
      basins: [...new Set(items.map((item) => item.basin))],
      failures,
      fetchedAt: new Date().toISOString(),
      source: 'metoc.navy.mil · nhc.noaa.gov',
    },
  }
}

module.exports = { fetchCyclones }
