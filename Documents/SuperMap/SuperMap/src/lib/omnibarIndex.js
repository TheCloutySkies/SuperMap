/**
 * Whole-app omnibar jump index.
 * Components/constants feed entries here so the registry stays maintainable.
 * Search is client-side fuzzy match — no API required for jump targets.
 */
import { CRIME_VIEW_ID, WEATHER_VIEW_ID, AI_ASSISTANT_NAME } from '../constants'
import { TOOLS_LIST } from '../components/toolsList'
import { RESOURCE_SECTIONS } from '../components/ResourcesView'
import { WIDGET_SEARCH_INDEX } from '../components/widgetSearchIndex'

/** @typedef {'Mode'|'Maps'|'Crime'|'Feeds'|'Tools'|'Resources'|'Home'|'Reports'|'Settings'} OmnibarCategory */

/**
 * @typedef {Object} OmnibarEntry
 * @property {string} id
 * @property {string} label
 * @property {OmnibarCategory} category
 * @property {string[]} [keywords]
 * @property {string[]} [synonyms]
 * @property {'navigate'} action
 * @property {string} viewId
 * @property {string} [crimeSegment]
 * @property {string} [toolId]
 * @property {string} [resourceSectionId]
 * @property {string} [widgetId]
 * @property {number} [weight]  // higher = prefer when scores tie
 */

/** Core modes / pages / map & feed destinations. */
export const OMNIBAR_CORE_ENTRIES = Object.freeze([
  {
    id: 'mode-home',
    label: 'Home',
    category: 'Mode',
    keywords: ['home', 'dashboard', 'start'],
    synonyms: ['main', 'landing'],
    action: 'navigate',
    viewId: 'home',
    weight: 10,
  },
  {
    id: 'mode-maps',
    label: 'Maps',
    category: 'Mode',
    keywords: ['maps', 'map', 'cartography'],
    synonyms: ['geo'],
    action: 'navigate',
    viewId: 'osint-map',
    weight: 8,
  },
  {
    id: 'mode-crime',
    label: 'Crime Intelligence',
    category: 'Mode',
    keywords: ['crime', 'fbi', 'ucr', 'intelligence', 'plaincrime'],
    synonyms: ['criminal', 'violence', 'homicide'],
    action: 'navigate',
    viewId: CRIME_VIEW_ID,
    weight: 10,
  },
  {
    id: 'mode-feeds',
    label: 'News',
    category: 'Mode',
    keywords: ['feeds', 'news', 'rss', 'glowie', 'glowie report'],
    synonyms: ['timeline', 'news desk'],
    action: 'navigate',
    viewId: 'news-feeds',
    weight: 8,
  },
  {
    id: 'mode-weather',
    label: 'Weather',
    category: 'Mode',
    keywords: ['weather', 'forecast', 'radar', 'precip', 'storm', 'nws', 'open-meteo'],
    synonyms: ['meteorology', 'rain', 'radar map'],
    action: 'navigate',
    viewId: WEATHER_VIEW_ID,
    weight: 10,
  },
  {
    id: 'mode-tools',
    label: 'Tools',
    category: 'Mode',
    keywords: ['tools', 'toolkit'],
    synonyms: ['utilities'],
    action: 'navigate',
    viewId: 'tools',
    weight: 8,
  },
  {
    id: 'mode-resources',
    label: 'Resources',
    category: 'Mode',
    keywords: ['resources', 'links', 'directory'],
    synonyms: ['bookmarks', 'osint list'],
    action: 'navigate',
    viewId: 'resources',
    weight: 8,
  },
  {
    id: 'mode-reports',
    label: 'Report Maker',
    category: 'Reports',
    keywords: ['report', 'reports', 'maker', 'brief'],
    synonyms: ['writeup', 'summary report'],
    action: 'navigate',
    viewId: 'report-maker',
    weight: 7,
  },
  {
    id: 'mode-settings',
    label: 'Settings',
    category: 'Settings',
    keywords: ['settings', 'prefs', 'preferences', 'config'],
    synonyms: ['options', 'account'],
    action: 'navigate',
    viewId: 'settings',
    weight: 7,
  },

  // Maps
  {
    id: 'map-osint',
    label: 'OSINT Map',
    category: 'Maps',
    keywords: ['osint', 'map', 'layers', 'intel'],
    synonyms: ['situational awareness', 'open source'],
    action: 'navigate',
    viewId: 'osint-map',
    weight: 9,
  },
  {
    id: 'map-conflict',
    label: 'Conflict Map',
    category: 'Maps',
    keywords: ['conflict', 'war', 'map', 'ukraine', 'liveuamap'],
    synonyms: ['battles', 'frontline'],
    action: 'navigate',
    viewId: 'conflict-map',
    weight: 9,
  },
  {
    id: 'map-explore',
    label: 'Explore Map',
    category: 'Maps',
    keywords: ['explore', 'draw', 'aoi', 'pins'],
    synonyms: ['sketch', 'annotate'],
    action: 'navigate',
    viewId: 'explore-map',
    weight: 8,
  },
  {
    id: 'map-geolocate',
    label: 'Geolocate',
    category: 'Maps',
    keywords: ['geolocate', 'overpass', 'osm', 'find'],
    synonyms: ['locate', 'overpass turbo'],
    action: 'navigate',
    viewId: 'geolocate-map',
    weight: 8,
  },
  {
    id: 'map-flock',
    label: 'Flock Cameras',
    category: 'Maps',
    keywords: ['flock', 'cameras', 'alpr', 'deflock', 'surveillance'],
    synonyms: ['flock safety', 'license plate', 'anpr', 'camera network', 'flockhopper'],
    action: 'navigate',
    viewId: 'flock-map',
    weight: 10,
  },

  // Crime sections
  {
    id: 'crime-national',
    label: 'Crime · National',
    category: 'Crime',
    keywords: ['national', 'crime', 'snapshot', 'ucr', 'averages'],
    synonyms: ['usa', 'country', 'nationwide'],
    action: 'navigate',
    viewId: CRIME_VIEW_ID,
    crimeSegment: 'national',
    weight: 9,
  },
  {
    id: 'crime-states',
    label: 'Crime · States',
    category: 'Crime',
    keywords: ['states', 'state', 'crime', 'compare'],
    synonyms: ['province', 'statewide'],
    action: 'navigate',
    viewId: CRIME_VIEW_ID,
    crimeSegment: 'states',
    weight: 9,
  },
  {
    id: 'crime-cities',
    label: 'Crime · Cities',
    category: 'Crime',
    keywords: ['cities', 'city', 'crime', 'metro'],
    synonyms: ['municipal', 'urban'],
    action: 'navigate',
    viewId: CRIME_VIEW_ID,
    crimeSegment: 'cities',
    weight: 9,
  },
  {
    id: 'crime-map',
    label: 'Crime · Map',
    category: 'Crime',
    keywords: ['crime map', 'choropleth', 'heatmap', 'states map'],
    synonyms: ['visual', 'geography'],
    action: 'navigate',
    viewId: CRIME_VIEW_ID,
    crimeSegment: 'map',
    weight: 8,
  },
  {
    id: 'crime-offenders',
    label: 'Crime · Sex Offenders',
    category: 'Crime',
    keywords: ['offenders', 'sex offender', 'nsopw', 'registry'],
    synonyms: ['predator', 'sex offenders', 'registry search'],
    action: 'navigate',
    viewId: CRIME_VIEW_ID,
    crimeSegment: 'offenders',
    weight: 9,
  },
  {
    id: 'crime-thielbot',
    label: `${AI_ASSISTANT_NAME}`,
    category: 'Crime',
    keywords: ['ask', 'chat', 'assistant', 'ai', 'bot', 'thielbot', 'thiellbot'],
    synonyms: ['thiel bot', 'thiellbot', 'thiell bot', 'crime ask', 'ask crime'],
    action: 'navigate',
    viewId: CRIME_VIEW_ID,
    crimeSegment: 'ask',
    weight: 11,
  },

  // Feeds
  {
    id: 'feed-news',
    label: 'Glowie Report',
    category: 'Feeds',
    keywords: ['news', 'headlines', 'feeds', 'glowie', 'glowie report', 'news desk'],
    synonyms: ['breaking', 'glowie', 'news desk'],
    action: 'navigate',
    viewId: 'news-feeds',
    weight: 8,
  },
  {
    id: 'feed-osint',
    label: 'OSINT Feeds',
    category: 'Feeds',
    keywords: ['osint', 'feeds', 'intel feed'],
    synonyms: ['signals'],
    action: 'navigate',
    viewId: 'osint-feeds',
    weight: 8,
  },
  {
    id: 'feed-osint-x',
    label: 'OSINT (X)',
    category: 'Feeds',
    keywords: ['twitter', 'x', 'osint x', 'tweets'],
    synonyms: ['x.com', 'tweet'],
    action: 'navigate',
    viewId: 'osint-x',
    weight: 8,
  },
  {
    id: 'feed-videos',
    label: 'Recent Videos',
    category: 'Feeds',
    keywords: ['videos', 'video', 'youtube', 'clips'],
    synonyms: ['footage'],
    action: 'navigate',
    viewId: 'recent-videos',
    weight: 7,
  },
  {
    id: 'feed-broadcasts',
    label: 'Broadcasts',
    category: 'Feeds',
    keywords: ['broadcasts', 'streams', 'live', 'tv'],
    synonyms: ['livestream', 'channels'],
    action: 'navigate',
    viewId: 'broadcasts',
    weight: 7,
  },
])

function toolsAsEntries() {
  return TOOLS_LIST.map((t) => ({
    id: `tool-${t.id}`,
    label: t.title,
    category: 'Tools',
    keywords: [t.title, t.desc, t.id].filter(Boolean).join(' ').toLowerCase().split(/\s+/),
    synonyms: [],
    action: 'navigate',
    viewId: 'tools',
    toolId: t.id,
    weight: 6,
  }))
}

function resourceSectionsAsEntries() {
  return RESOURCE_SECTIONS.map((s) => {
    const cleanTitle = String(s.title || '')
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .trim() || s.title
    return {
      id: `resource-section-${s.id}`,
      label: cleanTitle,
      category: 'Resources',
      keywords: [s.id, cleanTitle, ...(s.items || []).slice(0, 8).map((i) => i.name)].join(' ').toLowerCase().split(/\s+/),
      synonyms: [s.id],
      action: 'navigate',
      viewId: 'resources',
      resourceSectionId: s.id,
      weight: 5,
    }
  })
}

function resourceItemsAsEntries() {
  const out = []
  for (const section of RESOURCE_SECTIONS) {
    for (const item of section.items || []) {
      const slug = String(item.name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48)
      out.push({
        id: `resource-item-${section.id}-${slug}`,
        label: item.name,
        category: 'Resources',
        keywords: [item.name, item.desc, section.title].filter(Boolean).join(' ').toLowerCase().split(/\s+/),
        synonyms: [],
        action: 'navigate',
        viewId: 'resources',
        resourceSectionId: section.id,
        weight: 4,
      })
    }
  }
  return out
}

function widgetsAsEntries() {
  return WIDGET_SEARCH_INDEX.map((w) => ({
    id: `widget-${w.id}`,
    label: w.title,
    category: 'Home',
    keywords: [w.title, w.description, ...(w.keywords || [])].join(' ').toLowerCase().split(/\s+/),
    synonyms: w.keywords || [],
    action: 'navigate',
    viewId: 'home',
    widgetId: w.id,
    weight: 7,
  }))
}

/** Full static index — rebuilt once at module load. */
export const OMNIBAR_INDEX = Object.freeze([
  ...OMNIBAR_CORE_ENTRIES,
  ...toolsAsEntries(),
  ...resourceSectionsAsEntries(),
  ...resourceItemsAsEntries(),
  ...widgetsAsEntries(),
])

/** Backward-compatible command list shape used by older Omnibar callers. */
export const DEFAULT_COMMANDS = OMNIBAR_CORE_ENTRIES.map((e) => ({
  id: e.id,
  label: e.label,
  keywords: [...(e.keywords || []), ...(e.synonyms || [])].join(' '),
  action: e.action,
  viewId: e.viewId,
  crimeSegment: e.crimeSegment,
  toolId: e.toolId,
  resourceSectionId: e.resourceSectionId,
  widgetId: e.widgetId,
  category: e.category,
}))

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

/** Cheap Levenshtein for short tokens (typo tolerance). */
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

function haystackFor(entry) {
  return normalize(
    [
      entry.label,
      entry.category,
      ...(entry.keywords || []),
      ...(entry.synonyms || []),
      entry.viewId,
      entry.crimeSegment,
      entry.toolId,
      entry.resourceSectionId,
      entry.widgetId,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function scoreEntry(entry, query) {
  const q = normalize(query)
  if (!q) return entry.weight || 0

  const label = normalize(entry.label)
  const hay = haystackFor(entry)
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
    for (const syn of [...(entry.synonyms || []), ...(entry.keywords || [])].map(normalize)) {
      if (!syn) continue
      if (syn === qt || syn.startsWith(qt) || syn.includes(qt)) best = Math.max(best, 32)
      else if (qt.length >= 3) {
        for (const st of syn.split(' ')) {
          if (st === qt) best = Math.max(best, 30)
          else if (st.startsWith(qt)) best = Math.max(best, 22)
          else if (editDistance(qt, st) === 1) best = Math.max(best, 14)
        }
      }
    }
    if (best === 0 && hay.includes(qt)) best = 10
    // Require every query token to contribute something, else hard-fail
    if (best === 0) return 0
    score += best
  }

  score += entry.weight || 0
  return score
}

/**
 * Fuzzy-rank jump targets for the omnibar.
 * @param {string} query
 * @param {{ limit?: number, index?: OmnibarEntry[] }} [opts]
 * @returns {Array<OmnibarEntry & { score: number }>}
 */
export function searchOmnibarIndex(query, opts = {}) {
  const limit = opts.limit ?? 12
  const index = opts.index || OMNIBAR_INDEX
  const q = String(query || '').trim()

  if (!q) {
    // Empty query (command palette): show high-weight destinations
    return [...index]
      .sort((a, b) => (b.weight || 0) - (a.weight || 0) || a.label.localeCompare(b.label))
      .slice(0, limit)
      .map((e) => ({ ...e, score: e.weight || 0 }))
  }

  const scored = []
  for (const entry of index) {
    const score = scoreEntry(entry, q)
    if (score > 0) scored.push({ ...entry, score })
  }
  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
  return scored.slice(0, limit)
}

export function getOmnibarIndexStats() {
  const byCategory = {}
  for (const e of OMNIBAR_INDEX) {
    byCategory[e.category] = (byCategory[e.category] || 0) + 1
  }
  return { total: OMNIBAR_INDEX.length, byCategory }
}
