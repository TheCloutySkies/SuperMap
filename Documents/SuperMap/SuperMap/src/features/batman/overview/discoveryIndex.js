/**
 * Batman Mode's unified index.
 *
 * Every searchable object comes from data the app already publishes: the home
 * payload (news, X posts, events), the strategic console's signal engine and
 * the account vault/community pins. Nothing here calls an upstream on its own;
 * the index is rebuilt when a store emits a new version.
 *
 * A record is deliberately small and flat: one shape for every source, so one
 * query and one set of facets work across all of them.
 */
import Fuse from 'fuse.js'
import { getConsoleState } from '../../../lib/consoleStore'
import { getHomeState } from '../../../lib/homeStore'
import { DOMAINS, REGIONS, REGION_OPTIONS, regionForPoint } from '../../../lib/consoleSignals'
import { dedupeStories } from '../../../lib/storyDedupe'
import { localCases } from '../caseStore'

export const OBJECT_KINDS = Object.freeze([
  { id: 'article', label: 'Articles', icon: '📰' },
  { id: 'xpost', label: 'X posts', icon: '𝕏' },
  { id: 'event', label: 'Events', icon: '📍' },
  { id: 'signal', label: 'Signals', icon: '📡' },
  { id: 'person', label: 'People', icon: '👤' },
  { id: 'org', label: 'Organizations', icon: '🏛' },
  { id: 'location', label: 'Locations', icon: '🗺' },
  { id: 'document', label: 'Documents', icon: '📄' },
  { id: 'pin', label: 'Community pins', icon: '📌' },
  { id: 'case', label: 'Cases', icon: '🦇' },
])

const KIND_IDS = new Set(OBJECT_KINDS.map((kind) => kind.id))
const VAULT_KEY = 'supermap_vault_items_v1'
const PIN_KEY = 'supermap_community_pins_v1'

function num(value, fallback = null) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function atOf(...values) {
  for (const value of values) {
    if (value == null || value === '') continue
    const n = Number(value)
    if (Number.isFinite(n) && n > 1e8 && n < 1e14) return n
    const parsed = Date.parse(String(value))
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function record(entry) {
  if (!entry || !entry.id || !entry.title) return null
  return {
    id: String(entry.id),
    kind: KIND_IDS.has(entry.kind) ? entry.kind : 'document',
    title: String(entry.title).slice(0, 180),
    summary: String(entry.summary || '').slice(0, 320),
    source: String(entry.source || '').slice(0, 80),
    sourceId: entry.sourceId ? String(entry.sourceId).slice(0, 120) : null,
    url: entry.url ? String(entry.url).slice(0, 600) : null,
    lat: num(entry.lat),
    lon: num(entry.lon),
    t: num(entry.t),
    tags: (Array.isArray(entry.tags) ? entry.tags : []).slice(0, 8).map((tag) => String(tag).slice(0, 24)),
    confidence: Math.min(1, Math.max(0, num(entry.confidence, 0.6))),
    theater: String(entry.theater || (entry.lat != null ? regionForPoint(entry.lon, entry.lat) : 'global')),
    ref: entry.ref || null,
  }
}

function fromHome(payload) {
  const out = []
  const features = Array.isArray(payload?.news?.features) ? payload.news.features : []
  const news = dedupeStories(features.map((feature) => feature?.properties || {}).filter(Boolean))
  for (const props of news) {
    const item = record({
      id: `article:${props.id || props.link || props.title}`,
      kind: 'article',
      title: props.title || props.headline,
      summary: props.description || props.summary || '',
      source: props.source || 'press',
      sourceId: props.id,
      url: props.link || props.url,
      t: atOf(props.timestamp, props.pubDate, props.date),
      tags: props.tags,
      confidence: num(props.risk_score) != null ? Math.min(1, num(props.risk_score) / 5) : 0.6,
    })
    if (item) out.push(item)
  }
  const posts = Array.isArray(payload?.osintX) ? payload.osintX : []
  for (const post of posts) {
    const item = record({
      id: `xpost:${post.id || post.tweetId || post.url}`,
      kind: 'xpost',
      title: post.title || String(post.content || '').slice(0, 110),
      summary: post.content || '',
      source: post.account ? `@${post.account}` : 'X',
      sourceId: post.id || post.tweetId,
      url: post.url,
      t: atOf(post.timestamp, post.createdAtMs, post.date),
      tags: post.tags,
      confidence: num(post.risk_score) != null ? Math.min(1, num(post.risk_score) / 5) : 0.6,
    })
    if (item) out.push(item)
  }
  const events = Array.isArray(payload?.events?.events) ? payload.events.events : []
  for (const row of events) {
    const item = record({
      id: `event:${row.id || `${row.lat},${row.lon},${row.title}`}`,
      kind: 'event',
      title: row.title,
      summary: row.description || '',
      source: row.source || 'event feed',
      sourceId: row.id,
      url: row.link,
      lat: row.lat,
      lon: row.lon,
      t: atOf(row.timestamp),
      tags: row.tags,
      confidence: 0.6,
    })
    if (item) out.push(item)
  }
  return out
}

function fromSignals(signals) {
  const out = []
  for (const signal of Array.isArray(signals) ? signals : []) {
    if (!signal?.title) continue
    const domain = DOMAINS[signal.domain]
    const item = record({
      id: `signal:${signal.id}`,
      kind: 'signal',
      title: signal.title,
      summary: signal.detail || signal.raw || '',
      source: signal.source || domain?.label || 'published feed',
      sourceId: signal.id,
      url: signal.link,
      lat: signal.lat,
      lon: signal.lon,
      t: signal.at,
      tags: [domain?.plain || signal.domain, ...(signal.tags || [])].filter(Boolean),
      confidence: signal.confidence,
      theater: signal.region,
      ref: { source: signal.source || 'signal', sourceId: signal.id, url: signal.link || null, signal },
    })
    if (item) out.push(item)
  }
  return out
}

function readJson(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function fromLocalSources(userUid) {
  const out = []
  const vault = readJson(VAULT_KEY)
  for (const row of vault) {
    const item = record({
      id: `document:${row.id || row.url || row.title}`,
      kind: 'document',
      title: row.title || row.name,
      summary: row.summary || row.description || '',
      source: row.source || 'vault',
      url: row.url || row.link,
      t: atOf(row.savedAtMs, row.createdAtMs, row.timestamp),
      tags: row.tags,
      confidence: 0.6,
    })
    if (item) out.push(item)
  }
  const pins = readJson(PIN_KEY)
  for (const row of pins) {
    const geometry = typeof row.geometryJson === 'string' ? JSON.parse(row.geometryJson || '{}') : (row.geometryJson || {})
    const coords = geometry?.coordinates
    const lon = Array.isArray(coords) ? num(coords[0]) : num(row.lon)
    const lat = Array.isArray(coords) ? num(coords[1]) : num(row.lat)
    const item = record({
      id: `pin:${row.id}`,
      kind: 'pin',
      title: row.title,
      summary: row.description || row.note || '',
      source: row.ownerUid === userUid ? 'my pin' : 'community pin',
      sourceId: row.id,
      url: row.url,
      lat,
      lon,
      t: atOf(row.createdAtMs, row.updatedAtMs),
      tags: row.tags,
      confidence: 0.6,
    })
    if (item) out.push(item)
  }
  for (const row of localCases(userUid)) {
    const item = record({
      id: `case:${row.id}`,
      kind: 'case',
      title: row.title,
      summary: row.description || `${(row.nodes || []).length} items in this case`,
      source: 'my cases',
      sourceId: row.id,
      t: atOf(row.updatedAtMs, row.createdAtMs),
      tags: ['case'],
      confidence: 0.6,
      ref: { source: 'case', sourceId: row.id, url: `/batman/cases`, caseId: row.id },
    })
    if (item) out.push(item)
  }
  return out
}

let cached = { key: '', records: [], fuse: null }

/** Build (or reuse) the index from the current store state. Pure and read-only. */
export function getDiscoveryIndex({ userUid = null, force = false } = {}) {
  const home = getHomeState().payload
  const consoleState = getConsoleState()
  const key = JSON.stringify([
    home?.savedAt || null,
    consoleState.version || null,
    consoleState.computedAt || null,
    userUid || '',
    Object.keys(localStorage || {}).length ? (localStorage.getItem(VAULT_KEY) || '').length : 0,
    (typeof localStorage !== 'undefined' ? localStorage.getItem(PIN_KEY) : '')?.length || 0,
  ])
  if (!force && cached.key === key) return cached
  const deduped = new Map()
  for (const item of [
    ...fromLocalSources(userUid),
    ...fromSignals(consoleState.signals),
    ...fromHome(home),
  ]) {
    if (item && !deduped.has(item.id)) deduped.set(item.id, item)
  }
  const records = [...deduped.values()].sort((a, b) => (b.t || 0) - (a.t || 0))
  cached = {
    key,
    records,
    builtAt: Date.now(),
    fuse: new Fuse(records, {
      keys: [
        { name: 'title', weight: 3 },
        { name: 'summary', weight: 1 },
        { name: 'source', weight: 1 },
        { name: 'tags', weight: 1.5 },
      ],
      threshold: 0.36,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 2,
    }),
  }
  return cached
}

/** Plain query, no syntax: fuzzy on text, exact tokens on small facets. */
export function searchIndex(index, query, limit = 400) {
  const q = String(query || '').trim()
  if (!q) return []
  if (q.length < 2) {
    const needle = q.toLowerCase()
    return index.records
      .filter((row) => `${row.title} ${row.summary} ${row.tags.join(' ')}`.toLowerCase().includes(needle))
      .slice(0, limit)
  }
  return index.fuse.search(q, { limit }).map((entry) => entry.item)
}

/** Facet counts are always computed from the scope the user has already chosen. */
export function facetCounts(records, field, filter = () => true) {
  const counts = new Map()
  for (const row of records) {
    if (!filter(row)) continue
    const values = Array.isArray(row[field]) ? row[field] : [row[field]]
    for (const value of values) {
      if (value == null || value === '') continue
      const key = String(value)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

export function theaterLabel(id) {
  return REGIONS[id]?.label || REGION_OPTIONS.find((entry) => entry.id === id)?.label || id || 'Everywhere'
}

/** Shared entities/tags/theater/time: the "related objects" in a Browser drawer. */
export function relatedObjects(index, object, limit = 6) {
  if (!object) return []
  const tags = new Set(object.tags || [])
  return index.records
    .filter((row) => row.id !== object.id)
    .map((row) => {
      let score = 0
      if (object.theater && row.theater === object.theater) score += 3
      if (object.source && row.source === object.source) score += 2
      for (const tag of row.tags || []) if (tags.has(tag)) score += 2
      if (object.t && row.t && Math.abs(object.t - row.t) <= 24 * 60 * 60 * 1000) score += 1
      return { row, score }
    })
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.row)
}
