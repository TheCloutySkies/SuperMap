/**
 * Site-wide ThielBot. Uses the omnibar content index (news, OSINT, X, crime)
 * plus a page catalog. Optional from the omnibar switch — crime Ask stays on /api/crime/ask.
 */
const omnibarContent = require('./omnibarContent')
const { callCrimeModel } = require('./llmClient')

const PAGES = [
  { id: 'osint-map', label: 'OSINT map', about: 'Live map with layers, cameras, aircraft, and events.' },
  { id: 'weather', label: 'Weather', about: 'Open-Meteo forecast, hourly chart, RainViewer radar, NWS alerts, marine, flood, and air quality.' },
  { id: 'print-map', label: 'Print', about: 'True-scale US Letter map sheets with a custom title and print quality.' },
  { id: 'live-webcams', label: 'Live webcams', about: 'Caltrans, NYC DOT, and Windy cameras.' },
  { id: 'crime', label: 'Crime intelligence', about: 'FBI UCR and PlainCrime state and city rates.' },
  { id: 'osint-feeds', label: 'OSINT feeds', about: 'Open-source intelligence feed items.' },
  { id: 'news-feeds', label: 'News', about: 'Glowie Report news desk.' },
  { id: 'osint-x', label: 'X', about: 'OSINT posts from X.' },
  { id: 'recent-videos', label: 'Recent videos', about: 'Recent video desk.' },
  { id: 'tools', label: 'Tools', about: 'Map and research tools.' },
  { id: 'bulletin', label: 'The Bulletin Board', about: 'Forum for groups, threads, and replies.' },
]

const PAGE_STOP = new Set(['desk', 'page', 'where', 'what', 'show', 'open', 'find', 'with', 'from', 'that', 'this', 'about'])

function matchingPages(question) {
  const words = question.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !PAGE_STOP.has(word))
  return PAGES.map((page) => {
    const label = page.label.toLowerCase()
    const hay = `${page.label} ${page.about} ${page.id}`.toLowerCase()
    let score = 0
    for (const word of words) {
      if (label.includes(word)) score += 3
      else if (hay.includes(word)) score += 1
    }
    return { page, score }
  })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((row) => row.page)
}

function heuristicAnswer(pages, hits) {
  const lines = []
  if (pages.length) {
    lines.push(pages.map((page) => `${page.label}: ${page.about}`).join('\n'))
  }
  if (hits.length) {
    lines.push(hits.slice(0, 6).map((hit) => `${hit.category || 'Item'}: ${hit.label}`).join('\n'))
  }
  return lines.join('\n\n') || 'Nothing in the site index matched that. Try a place, a feed topic, or a crime question.'
}

async function askSite(question) {
  const q = String(question || '').trim()
  if (!q) {
    const err = new Error('question required')
    err.code = 'BAD_REQUEST'
    throw err
  }
  const searched = omnibarContent.searchOmnibarContent(q, { limit: 8 })
  const hits = Array.isArray(searched?.results) ? searched.results : []
  const pages = matchingPages(q)
  const context = [
    'Pages:',
    ...(pages.length ? pages : PAGES.slice(0, 6)).map((page) => `- ${page.label} (${page.id}): ${page.about}`),
    'Indexed items:',
    ...hits.slice(0, 8).map((hit) => `- [${hit.category || 'item'}] ${hit.label}${hit.subtitle ? ` — ${hit.subtitle}` : ''}`),
  ].join('\n')
  const prompt = [
    'You are ThielBot, the optional site-wide assistant for Good Palantir (SuperMap).',
    'Answer using only the context. Be concise. If the context does not contain the fact, say so and name the page to open.',
    'Do not invent statistics.',
    '',
    'Context:',
    context,
    '',
    `Question: ${q}`,
  ].join('\n')

  const llm = await callCrimeModel(prompt, { maxTokens: 480 })
  const top = hits[0]
  const page = pages[0]
  return {
    answer: llm?.text || heuristicAnswer(pages, hits),
    provider: llm?.provider || 'index',
    hits: hits.slice(0, 5),
    pages,
    matched: {
      viewId: page?.id || top?.viewId || null,
      crimeCitySlug: top?.crimeCitySlug || null,
      crimeAbbr: top?.crimeAbbr || null,
    },
  }
}

module.exports = { askSite }
