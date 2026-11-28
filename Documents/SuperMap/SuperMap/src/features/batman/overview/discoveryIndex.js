/**
 * Batman Mode's unified object index.
 *
 * Sources are the app's existing stores, never a visitor-triggered upstream:
 * published snapshot/API (news, X, events, console signals, entity graph),
 * community pins (Firestore or local), the account vault and local cases.
 * A record is deliberately flat: one shape for every kind, so one query and
 * one set of facets can span all of them.
 */
import Fuse from 'fuse.js'
import { getConsoleState } from '../../../lib/consoleStore'
import { getHomeState } from '../../../lib/homeStore'
import { DOMAINS, REGIONS, REGION_OPTIONS, regionForPoint } from '../../../lib/consoleSignals'
import { dedupeStories } from '../../../lib/storyDedupe'
import { apiGetJson } from '../../../lib/homeBootstrap'
import { loadSnapshot, subscribeSnapshot, startSnapshotPolling } from '../../../lib/snapshotClient'
import { subscribeCommunityPins } from '../../accounts/communityPins'
import { localCases } from '../caseStore'

export const OBJECT_KINDS = Object.freeze([
  { id: 'article', label: 'Articles', icon: 'FileText' },
  { id: 'xpost', label: 'X posts', icon: 'AtSign' },
  { id: 'event', label: 'Events', icon: 'MapPin' },
  { id: 'signal', label: 'Signals', icon: 'Radio' },
  { id: 'person', label: 'People', icon: 'User' },
  { id: 'org', label: 'Organizations', icon: 'Building2' },
  { id: 'location', label: 'Locations', icon: 'Globe' },
  { id: 'document', label: 'Documents', icon: 'FolderOpen' },
  { id: 'pin', label: 'Community pins', icon: 'Crosshair' },
  { id: 'case', label: 'Cases', icon: 'Briefcase' },
])

const KIND_IDS = new Set(OBJECT_KINDS.map((kind) => kind.id))
const ACCOUNTS_KEY = 'supermap.accounts.local.v1'

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

/** Map the database's entity types onto the navigator's object kinds. */
export function entityKind(type) {
  const value = String(type || '').toLowerCase()
  if (value === 'person') return 'person'
  if (value === 'organization' || value === 'company') return 'org'
  if (['city', 'country', 'region', 'airport', 'facility', 'infrastructure', 'place'].includes(value)) return 'location'
  return null
}

function fromEntities(payload) {
  const out = []
  const rows = Array.isArray(payload?.entities) ? payload.entities : (Array.isArray(payload) ? payload : [])
  for (const row of rows) {
    const kind = entityKind(row?.type)
    if (!kind || !row.name) continue
    const item = record({
      id: `entity:${row.id || `${row.type}:${row.name}`}`,
      kind,
      title: row.name,
      summary: `${row.type}${row.eventCount ? ` · ${row.eventCount} published event${row.eventCount === 1 ? '' : 's'}` : ''}${row.aliases?.length ? ` · also ${row.aliases.slice(0, 3).join(', ')}` : ''}`,
      source: 'extracted from published reports',
      sourceId: row.id,
      lat: row.lat,
      lon: row.lon,
      t: row.lastSeen,
      tags: [row.type, ...(row.aliases || []).slice(0, 3)],
      confidence: Math.min(0.95, 0.55 + Math.min(5, row.eventCount || 0) * 0.08),
      theater: row.theater,
      ref: { source: 'entity graph', sourceId: row.id, url: null, entity: row },
    })
    if (item) out.push(item)
  }
  return out
}

/** Outlets and accounts are organisations too — a second, always-present feed. */
function fromAttributedSources(payload) {
  const out = []
  const seen = new Set()
  const features = Array.isArray(payload?.news?.features) ? payload.news.features : []
  const posts = Array.isArray(payload?.osintX) ? payload.osintX : []
  const add = (name, source, tag) => {
    const clean = String(name || '').replace(/^@/, '').trim()
    if (clean.length < 2 || clean.length > 80 || seen.has(clean.toLowerCase())) return
    seen.add(clean.toLowerCase())
    const item = record({
      id: `org:ref:${clean.toLowerCase()}`,
      kind: 'org',
      title: clean,
      summary: `Mentioned as ${source} in the published feed.`,
      source,
      tags: [tag],
      confidence: 0.5,
    })
    if (item) out.push(item)
  }
  for (const feature of features) add(feature?.properties?.source, 'news outlet', 'outlet')
  for (const post of posts) add(post?.account, 'X account', 'account')
  return out
}

function readVault() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}')
    return Array.isArray(parsed?.vault) ? parsed.vault : []
  } catch { return [] }
}

/** The account vault: Firestore rows when signed in, the real local shape otherwise. */
function fromVault(vault) {
  const out = []
  for (const row of Array.isArray(vault) ? vault : []) {
    const location = row.location || row.payload?.location
    const item = record({
      id: `document:${row.id || row.url || row.title}`,
      kind: 'document',
      title: row.title || row.name,
      summary: row.summary || '',
      source: 'saved in vault',
      url: row.sourceUrl || row.url || row.link,
      lat: location?.lat,
      lon: location?.lon ?? location?.lng,
      t: atOf(row.createdAtMs, row.updatedAtMs),
      tags: row.tags,
      confidence: 0.6,
    })
    if (item) out.push(item)
  }
  return out
}

function pinPoint(row) {
  const geometry = typeof row.geometryJson === 'string' ? JSON.parse(row.geometryJson || '{}') : (row.geometryJson || {})
  const point = geometry?.coordinates
  const fallback = typeof row.geometry === 'object' ? row.geometry?.coordinates : null
  const coords = Array.isArray(point) && typeof point[0] === 'number' ? point : (Array.isArray(fallback) && typeof fallback[0] === 'number' ? fallback : null)
  const at = row.createdAtMs || (row.createdAt?.toMillis ? row.createdAt.toMillis() : null)
  return { point: coords, at }
}

function fromPins(pins) {
  const out = []
  for (const row of Array.isArray(pins) ? pins : []) {
    const { point, at } = pinPoint(row)
    const item = record({
      id: `pin:${row.id}`,
      kind: 'pin',
      title: row.title || row.label,
      summary: row.summary || row.description || row.note || '',
      source: row.ownerName || 'community pin',
      sourceId: row.id,
      url: row.url,
      lat: point ? num(point[1]) : null,
      lon: point ? num(point[0]) : null,
      t: atOf(at, row.updatedAtMs),
      tags: row.tags || [row.kind].filter(Boolean),
      confidence: 0.6,
    })
    if (item) out.push(item)
  }
  return out
}

function fromCases(userUid) {
  const out = []
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
      ref: { source: 'case', sourceId: row.id, url: '/batman/cases', caseId: row.id },
    })
    if (item) out.push(item)
  }
  return out
}

/* --------------------------------------------------------- live source state */

let entitiesPayload = null
let pins = []
let vault = []
let pinnedUid = null
let entityListener = null

/** Entities: published snapshot first, API cache second. Never an upstream call. */
export function startDiscoverySources() {
  startSnapshotPolling()
  if (!entityListener) {
    entityListener = subscribeSnapshot(({ state, manifest }) => {
      if (state !== 'ready' || !manifest?.sources?.entities?.file) return
      loadSnapshot('entities').then((data) => {
        if (data) { entitiesPayload = data; window.dispatchEvent(new CustomEvent('supermap:discovery-changed')) }
      }).catch(() => {})
    })
  }
  if (!entitiesPayload) {
    loadSnapshot('entities').then((data) => {
      if (data) { entitiesPayload = data; window.dispatchEvent(new CustomEvent('supermap:discovery-changed')) }
    }).catch(() => {})
    apiGetJson('/api/entities', { timeoutMs: 10000 }).then((res) => {
      if (res?.data?.entities) {
        entitiesPayload = res.data
        window.dispatchEvent(new CustomEvent('supermap:discovery-changed'))
      }
    }).catch(() => {})
  }
  return () => {}
}

/** Community pins use the real Firestore/local subscription. */
export function subscribePins(cb) {
  return subscribeCommunityPins((rows) => {
    pins = Array.isArray(rows) ? rows : []
    cb(pins)
  })
}

export function setDiscoveryVault(rows, uid) {
  vault = Array.isArray(rows) ? rows : readVault()
  pinnedUid = uid || null
}

export function readLocalVault() {
  return readVault()
}

let cached = { key: '', records: [], fuse: null }

/** Build (or reuse) the index from the current store state. */
export function getDiscoveryIndex({ userUid = null, force = false } = {}) {
  const home = getHomeState().payload
  const consoleState = getConsoleState()
  const key = JSON.stringify([
    home?.savedAt || null,
    consoleState.version || null,
    consoleState.computedAt || null,
    entitiesPayload?.exportedAt || null,
    entitiesPayload?.entities?.length || 0,
    pins.length,
    vault.length,
    userUid || pinnedUid || '',
    localCases(userUid).length,
  ])
  if (!force && cached.key === key) return cached
  const deduped = new Map()
  for (const item of [
    ...fromCases(userUid),
    ...fromPins(pins),
    ...fromVault(vault),
    ...fromAttributedSources(home),
    ...fromEntities(entitiesPayload),
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

/** Shared entities/tags/theater/time: the "related objects" in a record panel. */
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
