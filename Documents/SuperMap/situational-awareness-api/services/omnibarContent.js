/**
 * Lightweight omnibar content index — news / OSINT / crime from already-cached data.
 * Never calls MediaStack; news uses getNewsCached() only.
 */
const newsService = require('./news')
const osintService = require('./osint')
const crimeData = require('./crimeData')

const INDEX_TTL_MS = 60 * 1000
let cachedIndex = null
let cachedAt = 0

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(s) {
  return normalize(s).split(' ').filter(Boolean)
}

function editDistance(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  if (Math.abs(a.length - b.length) > 2) return 99
  const m = a.length
  const n = b.length
  const row = new Array(n + 1)
  for (let j = 0; j <= n; j++) row[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost)
      prev = tmp
    }
  }
  return row[n]
}

function scoreEntry(entry, query) {
  const q = normalize(query)
  if (!q) return entry.weight || 0

  const label = normalize(entry.label)
  const hay = normalize([entry.label, entry.subtitle, entry.category, ...(entry.keywords || [])].filter(Boolean).join(' '))
  const qTokens = tokenize(q)
  const labelTokens = tokenize(label)
  let score = 0

  if (label === q) score += 200
  else if (label.startsWith(q)) score += 140
  else if (label.includes(q)) score += 90
  else if (hay.includes(q)) score += 55

  for (const qt of qTokens) {
    let best = 0
    for (const lt of labelTokens) {
      if (lt === qt) best = Math.max(best, 40)
      else if (lt.startsWith(qt)) best = Math.max(best, 28)
      else if (qt.length >= 3 && lt.includes(qt)) best = Math.max(best, 16)
      else if (qt.length >= 3 && lt.length >= 3) {
        const d = editDistance(qt, lt)
        if (d === 1) best = Math.max(best, 18)
        else if (d === 2 && qt.length >= 5) best = Math.max(best, 8)
      }
    }
    for (const syn of (entry.keywords || []).map(normalize)) {
      if (!syn) continue
      if (syn === qt || syn.startsWith(qt) || syn.includes(qt)) best = Math.max(best, 32)
    }
    if (best === 0 && hay.includes(qt)) best = 10
    if (best === 0) return 0
    score += best
  }

  score += entry.weight || 0
  return score
}

function featureToEntry(feature, category, viewId) {
  const p = feature?.properties || {}
  const id = p.id || feature?.id
  const title = String(p.title || '').trim()
  if (!title || !id) return null
  const source = String(p.source || '').trim()
  const link = String(p.link || p.url || '').trim() || null
  return {
    id: `${category.toLowerCase()}-${id}`,
    label: title,
    category,
    subtitle: source || undefined,
    keywords: [source, p.category, p.type].filter(Boolean),
    action: link ? 'open' : 'navigate',
    url: link || undefined,
    viewId,
    focusQuery: title,
    focusId: String(id),
    weight: category === 'News' ? 6 : 5,
  }
}

function buildCrimeEntries() {
  const out = []

  try {
    const statesPayload = crimeData.getStateSummary()
    const states = Array.isArray(statesPayload?.data) ? statesPayload.data : []
    for (const s of states) {
      if (!s?.abbr || !s?.name) continue
      out.push({
        id: `crime-state-${s.abbr}`,
        label: s.name,
        category: 'Crime',
        subtitle: `State · ${s.abbr}`,
        keywords: [s.abbr, s.name, 'state', 'crime', 'ucr'],
        action: 'navigate',
        viewId: 'crime',
        crimeSegment: 'states',
        crimeAbbr: String(s.abbr).toUpperCase(),
        weight: 8,
      })
    }
  } catch (_) { /* crime pack optional at boot */ }

  try {
    const typesPayload = crimeData.getCrimeTypes()
    const types = Array.isArray(typesPayload?.data) ? typesPayload.data : []
    for (const t of types) {
      const name = t.name || t.label || t.slug
      if (!name) continue
      const metricId = t.slug === 'violent-crime' ? 'violentRate'
        : t.slug === 'property-crime' ? 'propertyRate'
          : t.slug === 'murder' ? 'homicideRate'
            : (t.key || t.slug)
      out.push({
        id: `crime-series-${t.slug || t.key || name}`,
        label: `${name} (national)`,
        category: 'Crime',
        subtitle: 'National series',
        keywords: [name, t.slug, t.key, 'national', 'trend', 'series', 'crime'],
        action: 'navigate',
        viewId: 'crime',
        crimeSegment: 'national',
        nationalMetric: metricId,
        weight: 7,
      })
    }
  } catch (_) { /* optional */ }

  try {
    const statsPayload = crimeData.getStats()
    const stats = statsPayload?.data || {}
    const featured = [
      ...(stats.topCitiesByViolentRate || []).slice(0, 40),
      ...(stats.safestCities || []).slice(0, 20),
    ]
    const seen = new Set()
    for (const c of featured) {
      if (!c?.slug || seen.has(c.slug)) continue
      seen.add(c.slug)
      const label = c.state ? `${c.city}, ${c.state}` : c.city
      out.push({
        id: `crime-city-${c.slug}`,
        label,
        category: 'Crime',
        subtitle: 'City',
        keywords: [c.city, c.state, c.slug, 'city', 'crime'],
        action: 'navigate',
        viewId: 'crime',
        crimeSegment: 'cities',
        crimeCitySlug: c.slug,
        weight: 9,
      })
    }
  } catch (_) { /* optional */ }

  return out
}

function buildNewsOsintEntries() {
  const out = []
  const news = newsService.getNewsCached()
  const newsFeatures = Array.isArray(news?.features) ? news.features : []
  for (const f of newsFeatures.slice(0, 200)) {
    const entry = featureToEntry(f, 'News', 'news-feeds')
    if (entry) out.push(entry)
  }

  try {
    const osint = osintService.getOsintFromDb(150)
    const osintFeatures = Array.isArray(osint?.features) ? osint.features : []
    for (const f of osintFeatures) {
      const entry = featureToEntry(f, 'OSINT', 'osint-feeds')
      if (entry) out.push(entry)
    }
  } catch (_) { /* db may be empty */ }

  return out
}

function getContentIndex({ force = false } = {}) {
  const now = Date.now()
  if (!force && cachedIndex && (now - cachedAt) < INDEX_TTL_MS) {
    // If news was empty at first build, refresh once MediaStack/feeds cache warms
    const newsCount = cachedIndex.filter((e) => e.category === 'News').length
    if (newsCount > 0 || !newsService.getNewsCached()?.features?.length) {
      return cachedIndex
    }
  }
  const entries = [...buildNewsOsintEntries(), ...buildCrimeEntries()]
  cachedIndex = Object.freeze(entries)
  cachedAt = now
  return cachedIndex
}

function searchCitiesAsEntries(q, limit = 8) {
  if (!q || String(q).trim().length < 2) return []
  try {
    const payload = crimeData.searchCities({ q, limit })
    const cities = Array.isArray(payload?.data) ? payload.data : []
    return cities.map((c) => {
      const label = c.state ? `${c.city}, ${c.state}` : c.city
      const pop = Number(c.population) || 0
      // Prefer larger cities when fuzzy scores tie
      const popBoost = pop >= 500000 ? 3 : pop >= 100000 ? 2 : pop >= 50000 ? 1 : 0
      return {
        id: `crime-city-${c.slug}`,
        label,
        category: 'Crime',
        subtitle: 'City',
        keywords: [c.city, c.state, c.slug, 'city', 'crime'],
        action: 'navigate',
        viewId: 'crime',
        crimeSegment: 'cities',
        crimeCitySlug: c.slug,
        weight: 6 + popBoost,
      }
    })
  } catch {
    return []
  }
}

/**
 * Search cached content for the omnibar.
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 */
function searchOmnibarContent(query, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 16, 1), 40)
  const q = String(query || '').trim()
  const index = getContentIndex()

  if (!q) {
    return {
      results: [],
      meta: {
        query: '',
        totalIndexed: index.length,
        sources: indexSources(index),
        fromCache: true,
      },
    }
  }

  const scored = []
  const seen = new Set()
  for (const entry of index) {
    const score = scoreEntry(entry, q)
    if (score <= 0) continue
    seen.add(entry.id)
    scored.push({ ...entry, score })
  }

  // Live city search for queries that may not be in the featured city set
  for (const city of searchCitiesAsEntries(q, 12)) {
    if (seen.has(city.id)) continue
    const score = scoreEntry(city, q)
    if (score <= 0) continue
    seen.add(city.id)
    scored.push({ ...city, score })
  }

  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
  return {
    results: scored.slice(0, limit),
    meta: {
      query: q,
      totalIndexed: index.length,
      sources: indexSources(index),
      fromCache: true,
      returned: Math.min(limit, scored.length),
    },
  }
}

function indexSources(index) {
  const byCategory = { News: 0, OSINT: 0, Crime: 0 }
  for (const e of index) {
    if (byCategory[e.category] != null) byCategory[e.category] += 1
  }
  return byCategory
}

function invalidateOmnibarContentCache() {
  cachedIndex = null
  cachedAt = 0
}

module.exports = {
  searchOmnibarContent,
  getContentIndex,
  invalidateOmnibarContentCache,
}
