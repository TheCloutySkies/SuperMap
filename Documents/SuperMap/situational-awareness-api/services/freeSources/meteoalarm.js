/**
 * MeteoAlarm — European severe-weather warnings.
 *
 * The Europe aggregate feed is gone (404); the per-country Atom feeds answer and
 * carry CAP fields. All 31 countries that responded are polled, filtered to
 * Severe/Extreme, capped per country, and never stored raw: Germany alone is a
 * 2.2 MB feed full of Minor notices.
 */
const { fetchWithEtag } = require('../snapshotHttp')
const { sleep, centroidOfPolygon } = require('./util')

const COUNTRIES = {
  germany: 'DE', france: 'FR', italy: 'IT', spain: 'ES', poland: 'PL', 'united-kingdom': 'GB',
  netherlands: 'NL', austria: 'AT', switzerland: 'CH', sweden: 'SE', norway: 'NO', finland: 'FI',
  denmark: 'DK', ireland: 'IE', portugal: 'PT', greece: 'GR', czechia: 'CZ', hungary: 'HU',
  romania: 'RO', bulgaria: 'BG', croatia: 'HR', slovakia: 'SK', slovenia: 'SI', belgium: 'BE',
  luxembourg: 'LU', estonia: 'EE', latvia: 'LV', lithuania: 'LT', iceland: 'IS', malta: 'MT', cyprus: 'CY',
}
const SEVERITIES = new Set(['severe', 'extreme'])
const PER_COUNTRY = 25
const TOTAL = 250

function tag(block, name) {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block)
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''
}

function hrefOf(block) {
  const match = /<link[^>]*href="([^"]+)"[^>]*>/i.exec(block)
  return match ? match[1] : ''
}

function parseFeed(xml, country) {
  const out = []
  for (const match of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/gi)) {
    const block = match[1]
    const severity = tag(block, 'cap:severity')
    if (!SEVERITIES.has(severity.toLowerCase())) continue
    const polygon = tag(block, 'cap:polygon')
    const centroid = polygon ? centroidOfPolygon(polygon) : null
    out.push({
      country,
      severity: severity.toLowerCase(),
      event: tag(block, 'cap:event') || tag(block, 'title') || 'Weather warning',
      area: tag(block, 'cap:areaDesc'),
      onset: tag(block, 'cap:onset'),
      expires: tag(block, 'cap:expires'),
      certainty: tag(block, 'cap:certainty'),
      lat: centroid ? centroid[1] : null,
      lon: centroid ? centroid[0] : null,
      link: hrefOf(block) || null,
    })
    if (out.length >= PER_COUNTRY) break
  }
  return out
}

async function fetchMeteoalarm({ etag = null, lastModified = null } = {}) {
  const items = []
  const failures = []
  let response = { etag, lastModified }
  let first = true

  for (const [slug, country] of Object.entries(COUNTRIES)) {
    try {
      const res = await fetchWithEtag(`https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-${slug}`, {
        timeoutMs: 30000,
        responseType: 'text',
        etag: first ? etag : null,
        lastModified: first ? lastModified : null,
        headers: { Accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8' },
      })
      if (first && res.notModified) return res
      if (first) {
        response = res
        first = false
      }
      items.push(...parseFeed(res.data, country))
    } catch (err) {
      failures.push(`${slug}: ${err.message}`)
      first = false
    }
    await sleep(200)
  }

  if (!items.length && failures.length === Object.keys(COUNTRIES).length) {
    throw new Error('MeteoAlarm feeds unavailable')
  }

  const byCountry = {}
  for (const item of items) byCountry[item.country] = (byCountry[item.country] || 0) + 1

  return {
    etag: response.etag,
    lastModified: response.lastModified,
    notModified: false,
    data: {
      items: items.slice(0, TOTAL),
      byCountry,
      countries: Object.keys(COUNTRIES).length,
      failures,
      fetchedAt: new Date().toISOString(),
      source: 'feeds.meteoalarm.org',
    },
  }
}

module.exports = { fetchMeteoalarm }
