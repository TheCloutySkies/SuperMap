/**
 * Ask Crime — RAG-lite Q&A over the static crime pack.
 * LLM: Groq (if GROQ_API_KEY) → Ollama → heuristic answers from data.
 */
const NodeCache = require('node-cache')
const crimeData = require('./crimeData')
const { callCrimeModel, hasLlmConfigured } = require('./llmClient')

const cache = new NodeCache({ stdTTL: 10 * 60, checkperiod: 120, useClones: false })

const STATE_ALIASES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN',
  texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC', 'washington dc': 'DC', 'washington d.c.': 'DC', dc: 'DC',
}

function fmt(n, digits = 1) {
  if (n == null || Number.isNaN(Number(n))) return 'n/a'
  return Number(n).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits === 0 ? 0 : undefined,
  })
}

function findStatesInText(q) {
  const lower = q.toLowerCase()
  const found = new Map()
  // Two-letter USPS codes that are also common English words — only match when UPPERCASE in the query.
  const ambiguousAbbr = new Set(['IN', 'OR', 'ME', 'OK', 'HI', 'DE', 'LA', 'OH', 'PA', 'ID', 'MA', 'MD', 'MT', 'NE', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'SC', 'SD', 'VA', 'WA', 'WI', 'WV', 'WY', 'CO', 'CA', 'AL', 'AR', 'AK', 'AZ', 'CT', 'FL', 'GA', 'IA', 'IL', 'KS', 'KY', 'MI', 'MN', 'MO', 'MS', 'NV', 'RI', 'TN', 'TX', 'UT', 'VT'])

  try {
    const summary = crimeData.loadJson('state-summary.json')
    for (const row of summary) {
      const name = String(row.name || '').toLowerCase()
      const abbr = String(row.abbr || '').toUpperCase()
      if (!abbr) continue
      if (name && name.length > 3 && lower.includes(name)) {
        found.set(abbr, row)
      }
    }
    // Uppercase USPS codes only (avoids matching "in" → Indiana)
    for (const row of summary) {
      const abbr = String(row.abbr || '').toUpperCase()
      if (!abbr || abbr.length !== 2) continue
      if (ambiguousAbbr.has(abbr)) {
        if (new RegExp(`\\b${abbr}\\b`).test(q)) found.set(abbr, row)
      }
    }
  } catch (_) { /* ignore */ }

  for (const [alias, abbr] of Object.entries(STATE_ALIASES)) {
    if (alias.length < 3) continue // skip 2-letter aliases here
    if (lower.includes(alias) && !found.has(abbr)) {
      try {
        const summary = crimeData.loadJson('state-summary.json')
        const row = summary.find((s) => s.abbr === abbr)
        if (row) found.set(abbr, row)
      } catch (_) { /* ignore */ }
    }
  }
  return [...found.values()]
}

function findCitiesInText(q) {
  const lower = q.toLowerCase().replace(/[?,.!;:]/g, ' ')
  if (!/\w{3,}/.test(lower)) return []
  try {
    const cities = crimeData.loadJson('city-index.json')
    let topSlugs = new Set()
    try {
      const stats = crimeData.loadJson('stats.json')
      for (const c of [...(stats.topCitiesByViolentRate || []), ...(stats.safestCities || [])]) {
        if (c.slug) topSlugs.add(c.slug)
      }
    } catch (_) { /* ignore */ }

    const scored = []
    for (const c of cities) {
      const city = String(c.city || '').toLowerCase()
      if (!city || city.length < 3) continue
      // Word-boundary-ish match so "York" does not hit every "...york..."
      const re = new RegExp(`(?:^|[^a-z])${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z]|$)`)
      if (!re.test(lower)) continue
      let score = city.length
      const st = String(c.state || '').toLowerCase()
      if (st && lower.includes(st)) score += 50
      if (topSlugs.has(c.slug)) score += 30
      score += Math.min(20, Math.log10(Math.max(Number(c.population) || 1, 1)) * 4)
      scored.push({ score, city: c })
    }
    scored.sort((a, b) => b.score - a.score)
    const seen = new Set()
    const out = []
    for (const { city } of scored) {
      if (seen.has(city.slug)) continue
      seen.add(city.slug)
      out.push(city)
      if (out.length >= 3) break
    }
    return out
  } catch (_) {
    return []
  }
}

function compactState(s) {
  if (!s) return null
  return {
    abbr: s.abbr,
    name: s.name,
    year: s.year,
    population: s.population,
    violentRate: s.violentRate,
    propertyRate: s.propertyRate,
    homicideRate: s.homicideRate,
    violentCrime: s.violentCrime,
    propertyCrime: s.propertyCrime,
    homicide: s.homicide,
    violentChange: s.violentChange,
    propertyChange: s.propertyChange,
  }
}

function compactCity(c) {
  if (!c) return null
  const csv = crimeData.getCityCsvExtras?.(c.slug) || null
  return {
    slug: c.slug,
    city: c.city,
    state: c.state,
    year: c.year,
    population: c.population,
    violentRate: c.violentRate,
    propertyRate: c.propertyRate,
    murderRate: c.murderRate,
    violentCrime: c.violentCrime,
    propertyCrime: c.propertyCrime,
    murder: c.murder,
    violentChange: c.violentChange,
    trajectory: c.trajectory,
    composition: c.composition,
    safetyPercentile: c.safetyPercentile,
    yearsAvailable: c.yearsAvailable,
    csv2024: csv || undefined,
  }
}

function buildContext(question) {
  const q = String(question || '').trim()
  const states = findStatesInText(q).map(compactState).filter(Boolean)
  let cities = findCitiesInText(q).map(compactCity).filter(Boolean)

  // If several cities share a name and no state was named, keep the best match only
  if (cities.length > 1 && states.length === 0) {
    const primary = String(cities[0].city || '').toLowerCase()
    const sameName = cities.every((c) => String(c.city || '').toLowerCase() === primary)
    if (sameName) cities = cities.slice(0, 1)
  }

  let stats = null
  let nationalLatest = null
  let types = null
  let arrests = null
  let homicide = null
  let hate = null

  try {
    stats = crimeData.loadJson('stats.json')
  } catch (_) { /* ignore */ }

  try {
    const trends = crimeData.loadJson('national-trends.json')
    nationalLatest = Array.isArray(trends) ? trends[trends.length - 1] : null
  } catch (_) { /* ignore */ }

  const lower = q.toLowerCase()
  if (/\b(type|types|robbery|assault|burglary|larceny|rape|theft|murder|homicide)\b/.test(lower)) {
    try {
      types = crimeData.loadJson('crime-types.json').map((t) => ({
        id: t.id || t.key,
        name: t.name || t.label,
        nationalRate: t.nationalRate ?? t.rate,
        change: t.change ?? t.yoy,
      })).slice(0, 12)
    } catch (_) { /* ignore */ }
  }
  if (/\barrest/.test(lower)) {
    try {
      const a = crimeData.loadJson('arrest-data.json')
      arrests = {
        nationalEstimates: a.nationalEstimates,
        byAge: a.byAge ? Object.fromEntries(Object.entries(a.byAge).slice(0, 8)) : undefined,
        bySex: a.bySex,
      }
    } catch (_) { /* ignore */ }
  }
  if (/\bhomicide|murder|weapon/.test(lower)) {
    try {
      const h = crimeData.loadJson('homicide-data.json')
      homicide = {
        weapons: h.weapons || h.byWeapon,
        circumstances: h.circumstances,
        relationship: h.relationship,
      }
    } catch (_) { /* ignore */ }
  }
  if (/\bhate\b/.test(lower)) {
    try {
      hate = crimeData.loadJson('hate-crime-by-state.json').slice(0, 15)
    } catch (_) { /* ignore */ }
  }

  // Always include a thin national snapshot
  const national = stats
    ? {
        lastUpdated: stats.lastUpdated,
        totalCities: stats.totalCities,
        totalStates: stats.totalStates,
        national2024: stats.national2024,
        national2023: stats.national2023,
        trends: stats.trends,
        topCitiesByViolentRate: (stats.topCitiesByViolentRate || []).slice(0, 5),
        safestCities: (stats.safestCities || []).slice(0, 5),
        topStatesByViolentRate: (stats.topStatesByViolentRate || []).slice(0, 5),
        safestStates: (stats.safestStates || []).slice(0, 5),
      }
    : null

  return {
    question: q,
    states,
    cities,
    national,
    nationalLatest,
    types,
    arrests,
    homicide,
    hate,
    attribution: crimeData.ATTRIBUTION,
  }
}

function heuristicAnswer(ctx) {
  const parts = []
  const { states, cities, national, nationalLatest } = ctx

  if (cities.length) {
    for (const c of cities) {
      parts.push(
        `${c.city}, ${c.state} (${c.year || 2024}): violent rate ${fmt(c.violentRate)} per 100k` +
        (c.violentChange != null ? ` (${c.violentChange > 0 ? '+' : ''}${fmt(c.violentChange)}% YoY)` : '') +
        `, property ${fmt(c.propertyRate)}/100k` +
        (c.murderRate != null ? `, murder ${fmt(c.murderRate)}/100k` : '') +
        (c.trajectory ? `, trajectory ${c.trajectory}` : '') +
        (c.safetyPercentile != null ? `, safety percentile ${fmt(c.safetyPercentile, 0)}` : '') +
        '.'
      )
    }
  }

  if (states.length) {
    for (const s of states) {
      parts.push(
        `${s.name} (${s.abbr}, ${s.year || 2024}): violent ${fmt(s.violentRate)}/100k` +
        (s.violentChange != null ? ` (${s.violentChange > 0 ? '+' : ''}${fmt(s.violentChange)}% YoY)` : '') +
        `, property ${fmt(s.propertyRate)}/100k` +
        (s.homicideRate != null ? `, homicide ${fmt(s.homicideRate)}/100k` : '') +
        `, population ${fmt(s.population, 0)}.`
      )
    }
  }

  if (!parts.length && national?.national2024) {
    const n = national.national2024
    parts.push(
      `National ${n.year || 2024} snapshot: violent rate ${fmt(n.violentRate)}/100k` +
      (n.violentChange != null ? ` (${n.violentChange > 0 ? '+' : ''}${fmt(n.violentChange)}% YoY)` : '') +
      `, property ${fmt(n.propertyRate)}/100k` +
      (n.homicideRate != null ? `, homicide ${fmt(n.homicideRate)}/100k` : '') +
      `. Covering ${fmt(national.totalStates, 0)} states/DC and ${fmt(national.totalCities, 0)} cities in the pack.`
    )
    if (national.topCitiesByViolentRate?.[0]) {
      const t = national.topCitiesByViolentRate[0]
      parts.push(`Highest violent rate among ranked cities: ${t.city}, ${t.state} at ${fmt(t.violentRate)}/100k.`)
    }
  } else if (!parts.length && nationalLatest) {
    parts.push(
      `Latest national trend year ${nationalLatest.year}: violent ${fmt(nationalLatest.violentRate)}/100k, ` +
      `property ${fmt(nationalLatest.propertyRate)}/100k, homicide ${fmt(nationalLatest.homicideRate)}/100k.`
    )
  }

  if (!parts.length) {
    parts.push(
      'I could not match a specific state or city in that question. Try asking about a U.S. state (e.g. “Texas violent crime”) or city (e.g. “Memphis crime rates”), or national trends / rankings.'
    )
  }

  parts.push('Source: PlainCrime + FBI UCR. Rates are per 100,000 population.')
  return parts.join(' ')
}

function buildPrompt(ctx) {
  const payload = {
    states: ctx.states,
    cities: ctx.cities,
    national: ctx.national,
    nationalLatest: ctx.nationalLatest,
    types: ctx.types,
    arrests: ctx.arrests,
    homicide: ctx.homicide,
    hate: ctx.hate,
  }
  return `You are Crime Intelligence for SuperMap. Answer ONLY from the JSON context below (FBI UCR / PlainCrime). Be concise (2–5 sentences). Cite specific rates per 100k and YoY % when present. If the question is outside the data, say what is missing. Do not invent numbers.

Question: ${ctx.question}

Context JSON:
${JSON.stringify(payload)}`
}

/**
 * @param {string} question
 * @returns {Promise<{ answer: string, provider: string, context: object, meta: object }>}
 */
async function askCrime(question) {
  const q = String(question || '').trim()
  if (!q) {
    const err = new Error('Question is required')
    err.code = 'BAD_REQUEST'
    throw err
  }
  if (q.length > 800) {
    const err = new Error('Question too long (max 800 chars)')
    err.code = 'BAD_REQUEST'
    throw err
  }

  const cacheKey = `ask:${q.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached) return { ...cached, cached: true }

  const ctx = buildContext(q)
  let answer = null
  let provider = 'heuristic'

  if (hasLlmConfigured()) {
    try {
      const llm = await callCrimeModel(buildPrompt(ctx))
      if (llm?.text && String(llm.text).trim()) {
        answer = String(llm.text).trim()
        provider = llm.provider || 'llm'
      }
    } catch (_) { /* fall through */ }
  }

  if (!answer) {
    answer = heuristicAnswer(ctx)
    provider = 'heuristic'
  }

  const result = {
    answer,
    provider,
    llmConfigured: hasLlmConfigured(),
    matched: {
      states: ctx.states.map((s) => s.abbr),
      cities: ctx.cities.map((c) => c.slug),
    },
    contextPreview: {
      states: ctx.states,
      cities: ctx.cities.map(({ slug, city, state, violentRate, propertyRate, murderRate, trajectory }) => ({
        slug, city, state, violentRate, propertyRate, murderRate, trajectory,
      })),
    },
    meta: {
      attribution: crimeData.ATTRIBUTION,
      generatedAt: new Date().toISOString(),
    },
  }

  cache.set(cacheKey, result)
  return result
}

module.exports = { askCrime, buildContext, heuristicAnswer }
