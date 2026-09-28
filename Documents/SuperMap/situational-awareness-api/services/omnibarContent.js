/**
 * Lightweight omnibar content index — news / OSINT / X / crime from already-cached data.
 * Never calls MediaStack; news uses getNewsCached() only.
 * X posts come from SQLite (same source as /api/osint-x).
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

/** Relative age label for omnibar/search UI (e.g. "12m", "3h", "2d"). */
function formatAgeLabel(ts) {
  if (ts == null || !Number.isFinite(Number(ts))) return null
  const ms = Number(ts)
  const age = Date.now() - ms
  if (age < 0) return 'now'
  const sec = Math.floor(age / 1000)
  if (sec < 60) return 'now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function publishedAtFromFeature(feature) {
  const p = feature?.properties || {}
  if (p.timestamp != null && Number.isFinite(Number(p.timestamp))) return Number(p.timestamp)
  if (p.pubDate) {
    const t = new Date(p.pubDate).getTime()
    if (Number.isFinite(t)) return t
  }
  if (p.publishedAt) {
    const t = new Date(p.publishedAt).getTime()
    if (Number.isFinite(t)) return t
  }
  return null
}

function recencyBoost(publishedAt) {
  if (publishedAt == null) return 0
  const age = Date.now() - Number(publishedAt)
  if (!Number.isFinite(age) || age < 0) return 0
  if (age < 60 * 60 * 1000) return 45 // <1h
  if (age < 6 * 60 * 60 * 1000) return 32
  if (age < 24 * 60 * 60 * 1000) return 22
  if (age < 3 * 24 * 60 * 60 * 1000) return 12
  if (age < 7 * 24 * 60 * 60 * 1000) return 5
  return 0
}

function scoreEntry(entry, query) {
  const q = normalize(query)
  if (!q) return (entry.weight || 0) + recencyBoost(entry.publishedAt)

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
  score += recencyBoost(entry.publishedAt)
  return score
}

function attachRecency(entry, publishedAt) {
  if (publishedAt == null) return entry
  const ageLabel = formatAgeLabel(publishedAt)
  return {
    ...entry,
    publishedAt,
    ageLabel: ageLabel || undefined,
    ageMs: Number.isFinite(publishedAt) ? Math.max(0, Date.now() - publishedAt) : undefined,
  }
}

function featureToEntry(feature, category, viewId) {
  const p = feature?.properties || {}
  const id = p.id || feature?.id
  const title = String(p.title || '').trim()
  if (!title || !id) return null
  const source = String(p.source || '').trim()
  const link = String(p.link || p.url || '').trim() || null
  const publishedAt = publishedAtFromFeature(feature)
  const ageLabel = formatAgeLabel(publishedAt)
  const baseSubtitle = source || undefined
  const subtitle = ageLabel
    ? (baseSubtitle ? `${baseSubtitle} · ${ageLabel}` : ageLabel)
    : baseSubtitle
  return attachRecency({
    id: `${category.toLowerCase()}-${id}`,
    label: title,
    category,
    subtitle,
    keywords: [source, p.category, p.type].filter(Boolean),
    action: link ? 'open' : 'navigate',
    url: link || undefined,
    viewId,
    focusQuery: title,
    focusId: String(id),
    weight: category === 'News' ? 6 : category === 'X' ? 7 : 5,
  }, publishedAt)
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

function buildXEntries() {
  const out = []
  try {
    const { getEvents, getEventTagNames } = require('../database')
    const { filterOsintXPosts } = require('./osintXContentFilter')
    const cutoff = Date.now() - 48 * 60 * 60 * 1000
    const rows = getEvents(150, null, null, null, null, ['x'])
    const mapped = []
    for (const r of rows) {
      if ((r.timestamp != null ? Number(r.timestamp) : 0) < cutoff) continue
      let raw = {}
      try {
        raw = r.raw_data ? JSON.parse(r.raw_data) : {}
      } catch (_) {}
      mapped.push({
        id: r.id,
        title: r.title,
        content: r.description,
        account: raw.account || 'x',
        priority: raw.priority || 'medium',
        risk_score: raw.risk_score != null ? Number(raw.risk_score) : null,
        tags: getEventTagNames(r.id),
        url: raw.link || raw.url,
        timestamp: r.timestamp,
      })
    }
    const { posts } = filterOsintXPosts(mapped, {})
    for (const p of posts.slice(0, 100)) {
      const label = String(p.title || p.content || '').trim().slice(0, 160)
      if (!label) continue
      const publishedAt = p.timestamp != null ? Number(p.timestamp) : null
      const ageLabel = formatAgeLabel(publishedAt)
      const handle = p.account ? `@${String(p.account).replace(/^@/, '')}` : 'X'
      out.push(attachRecency({
        id: `x-${p.id}`,
        label,
        category: 'X',
        subtitle: ageLabel ? `${handle} · ${ageLabel}` : handle,
        keywords: [p.account, 'x', 'twitter', 'osint', ...(p.tags || [])].filter(Boolean),
        action: p.url ? 'open' : 'navigate',
        url: p.url || undefined,
        viewId: 'osint-x',
        focusQuery: label,
        focusId: String(p.id),
        weight: 7,
      }, publishedAt))
    }
  } catch (_) { /* db optional */ }
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

  out.push(...buildXEntries())
  return out
}

function getContentIndex({ force = false } = {}) {
  const now = Date.now()
  if (!force && cachedIndex && (now - cachedAt) < INDEX_TTL_MS) {
    return cachedIndex
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
 * Prefers current + relevant News / X / OSINT (recency boost in score).
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

  scored.sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0)
    // Tie-break: newer News/X first
    const ta = a.publishedAt != null ? Number(a.publishedAt) : 0
    const tb = b.publishedAt != null ? Number(b.publishedAt) : 0
    if (tb !== ta) return tb - ta
    return a.label.localeCompare(b.label)
  })
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
  const byCategory = { News: 0, OSINT: 0, X: 0, Crime: 0 }
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
  formatAgeLabel,
}
