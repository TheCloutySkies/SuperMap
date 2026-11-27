/**
 * UNHCR displacement.
 *
 * The population endpoint pages origin/asylum pairs; seven pages of 1,000 cover
 * a year. We aggregate by country of origin, compare with the year before, and
 * keep only origins above 250k people or moving more than 15%.
 */
const { fetchWithEtag } = require('../snapshotHttp')
const { sleep, num, iso2Of } = require('./util')

const ENDPOINT = 'https://api.unhcr.org/population/v1/population/'
const PAGE_LIMIT = 1000
const MAX_PAGES = 8
const ORIGIN_FLOOR = 250000
const CHANGE_FLOOR = 15

async function loadYear(year) {
  const totals = new Map()
  let any = false
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetchWithEtag(`${ENDPOINT}?year=${year}&coo_all=true&coa_all=true&limit=${PAGE_LIMIT}&page=${page}`, {
      timeoutMs: 30000,
      headers: { Accept: 'application/json' },
    })
    const rows = Array.isArray(res.data?.items) ? res.data.items : []
    if (!rows.length) break
    any = true
    for (const row of rows) {
      const iso3 = String(row.coo_iso || '').toUpperCase()
      if (!iso3 || iso3 === '-') continue
      const current = totals.get(iso3) || { refugees: 0, asylumSeekers: 0, idps: 0, stateless: 0, oip: 0, name: row.coo_name || '' }
      current.refugees += num(row.refugees) || 0
      current.asylumSeekers += num(row.asylum_seekers) || 0
      current.idps += num(row.idps) || 0
      current.stateless += num(row.stateless) || 0
      current.oip += num(row.oip) || 0
      totals.set(iso3, current)
    }
    if (rows.length < PAGE_LIMIT) break
    await sleep(250)
  }
  return any ? totals : null
}

async function fetchUnhcr({ etag = null, lastModified = null } = {}) {
  const currentYear = new Date().getUTCFullYear() - 1
  let year = null
  let current = null
  for (const candidate of [currentYear, currentYear - 1, currentYear - 2]) {
    current = await loadYear(candidate)
    if (current) {
      year = candidate
      break
    }
  }
  if (!current) throw new Error('UNHCR returned no population rows')

  let previous = null
  try {
    previous = await loadYear(year - 1)
  } catch { /* a missing baseline means no change percentage */ }

  const items = []
  for (const [iso3, row] of current.entries()) {
    const total = row.refugees + row.idps + row.asylumSeekers + row.stateless + row.oip
    if (total < ORIGIN_FLOOR) continue
    const prior = previous?.get(iso3)
    const priorTotal = prior ? prior.refugees + prior.idps + prior.asylumSeekers + prior.stateless + prior.oip : null
    const changePct = priorTotal && priorTotal > 0 ? Math.round(((total - priorTotal) / priorTotal) * 1000) / 10 : null
    if (changePct != null && Math.abs(changePct) < CHANGE_FLOOR && total < 1000000) continue
    items.push({
      iso2: iso2Of(iso3),
      iso3,
      name: row.name || iso3,
      total,
      refugees: row.refugees,
      idps: row.idps,
      stateless: row.stateless,
      changePct,
      year,
    })
  }
  items.sort((a, b) => b.total - a.total)

  return {
    etag,
    lastModified,
    notModified: false,
    data: {
      items: items.slice(0, 80),
      year,
      origins: current.size,
      fetchedAt: new Date().toISOString(),
      source: 'api.unhcr.org',
    },
  }
}

module.exports = { fetchUnhcr }
