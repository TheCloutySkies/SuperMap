/**
 * Government travel advisories — the official risk floor.
 *
 * US State publishes a national 0–4 level in each RSS title (218 countries).
 * FCDO's content API only says "avoid all travel to parts", so it is not a
 * national level: it raises the floor where it applies and counts toward
 * agreement, and every item records which government said what.
 */
const { fetchWithEtag } = require('../snapshotHttp')
const { sleep, iso2Of } = require('./util')

const STATE_RSS = 'https://travel.state.gov/_res/rss/TAsTWs.xml'
const FCDO_INDEX = 'https://www.gov.uk/api/content/foreign-travel-advice'
const FCDO_ITEM = 'https://www.gov.uk/api/content/foreign-travel-advice'
const LEVEL_FLOOR = 3

function strip(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseState(xml) {
  const items = []
  for (const match of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1]
    const rawTitle = strip(/<title>([\s\S]*?)<\/title>/i.exec(block)?.[1] || '')
    const link = strip(/<link>([\s\S]*?)<\/link>/i.exec(block)?.[1] || '')
    const pubDate = strip(/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block)?.[1] || '')
    const description = strip(/<description>([\s\S]*?)<\/description>/i.exec(block)?.[1] || '').slice(0, 300)
    const levelMatch = /Level\s+(\d)/i.exec(rawTitle)
    if (!levelMatch) continue
    const level = Number(levelMatch[1])
    const country = rawTitle.replace(/\s*-\s*Level\s+\d.*$/i, '').trim()
    const label = (rawTitle.split(':')[1] || '').trim()
    const iso3 = /destination\.([a-z]{3})\.html/i.exec(link)?.[1] || ''
    items.push({
      country,
      level,
      label,
      iso3: iso3.toUpperCase(),
      iso2: iso2Of(iso3),
      url: link,
      updated: pubDate ? Date.parse(pubDate) || null : null,
      summary: description,
    })
  }
  return items
}

function normaliseName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '')
}

function fcdoFloor(statuses) {
  const list = Array.isArray(statuses) ? statuses : []
  if (list.includes('avoid_all_travel_to_parts')) return 3
  if (list.includes('avoid_all_but_essential_travel_to_parts')) return 2
  return null
}

async function fetchAdvisories({ etag = null, lastModified = null } = {}) {
  const failures = []
  let response = { etag, lastModified }

  const res = await fetchWithEtag(STATE_RSS, {
    timeoutMs: 30000,
    responseType: 'text',
    etag,
    lastModified,
    headers: { Accept: 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8' },
  })
  if (res.notModified) return res
  response = res

  const items = parseState(res.data)
  if (!items.length) throw new Error('State Department feed returned no advisories')

  let fcdoBySlug = new Map()
  try {
    const index = await fetchWithEtag(FCDO_INDEX, { timeoutMs: 30000, headers: { Accept: 'application/json' } })
    const children = Array.isArray(index.data?.links?.children) ? index.data.links.children : []
    fcdoBySlug = new Map(children.map((child) => [normaliseName(child?.details?.country?.name), child?.details?.country?.slug]))
  } catch (err) {
    failures.push(`fcdo index: ${err.message}`)
  }

  const elevated = items.filter((item) => item.level >= LEVEL_FLOOR).slice(0, 60)
  for (const [index, item] of elevated.entries()) {
    const slug = fcdoBySlug.get(normaliseName(item.country))
    if (!slug) continue
    try {
      const detail = await fetchWithEtag(`${FCDO_ITEM}/${slug}`, { timeoutMs: 20000, headers: { Accept: 'application/json' } })
      item.fcdoFloor = fcdoFloor(detail.data?.details?.alert_status)
      item.fcdoUrl = `https://www.gov.uk/foreign-travel-advice/${slug}`
      item.fcdoUpdated = detail.data?.public_updated_at || null
    } catch (err) {
      failures.push(`fcdo ${slug}: ${err.message}`)
    }
    if (index < elevated.length - 1) await sleep(250)
  }

  for (const item of items) {
    const fcdo = item.fcdoFloor ?? null
    item.agreement = (item.level >= LEVEL_FLOOR ? 1 : 0) + (fcdo != null && fcdo >= LEVEL_FLOOR ? 1 : 0)
    item.floor = Math.max(item.level, fcdo ?? 0)
  }

  const counts = items.reduce((acc, item) => {
    acc[item.level] = (acc[item.level] || 0) + 1
    return acc
  }, {})

  return {
    etag: response.etag,
    lastModified: response.lastModified,
    notModified: false,
    data: {
      items: items.map((item) => ({
        country: item.country,
        iso2: item.iso2,
        iso3: item.iso3,
        level: item.level,
        label: item.label,
        fcdoFloor: item.fcdoFloor ?? null,
        fcdoUrl: item.fcdoUrl || null,
        agreement: item.agreement,
        floor: item.floor,
        url: item.url,
        updated: item.updated ? new Date(item.updated).toISOString() : null,
        summary: item.summary,
      })),
      counts,
      countries: items.length,
      fcdoMatched: items.filter((item) => item.fcdoFloor != null).length,
      failures,
      fetchedAt: new Date().toISOString(),
      source: 'travel.state.gov · gov.uk',
    },
  }
}

module.exports = { fetchAdvisories }
