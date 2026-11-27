/**
 * Batman cases — the shape of a case, and the conversions every surface needs.
 *
 * A case is one Firestore document (private by default), with a local copy so a
 * slow or failed write never blanks a board. The document has a hard 1 MiB cap,
 * so nodes and edges are capped here and a heavy field (an article body, a photo)
 * is stored as a reference, never as content.
 */

export const SCHEMA_VERSION = 1

export const NODE_KINDS = [
  { id: 'person', label: 'Person', icon: '👤' },
  { id: 'org', label: 'Organisation', icon: '🏛' },
  { id: 'article', label: 'Article', icon: '📰' },
  { id: 'event', label: 'Event', icon: '📍' },
  { id: 'xpost', label: 'X post', icon: '𝕏' },
  { id: 'text', label: 'Note', icon: '📝' },
  { id: 'link', label: 'Link', icon: '🔗' },
  { id: 'location', label: 'Location', icon: '🗺' },
  { id: 'image', label: 'Image', icon: '🖼' },
  { id: 'aircraft', label: 'Aircraft', icon: '✈' },
  { id: 'vessel', label: 'Vessel', icon: '🚢' },
  { id: 'signal', label: 'Signal', icon: '📡' },
]

export const NODE_KIND_IDS = NODE_KINDS.map((kind) => kind.id)

export function kindMeta(id) {
  return NODE_KINDS.find((kind) => kind.id === id) || NODE_KINDS.find((kind) => kind.id === 'text')
}

export const EDGE_TYPES = [
  { id: 'supports', label: 'Supports', color: '#57e389' },
  { id: 'contradicts', label: 'Contradicts', color: '#ff3b5c' },
  { id: 'mentions', label: 'Mentions', color: '#93c5fd' },
  { id: 'located-at', label: 'Located at', color: '#facc15' },
  { id: 'part-of', label: 'Part of', color: '#a78bfa' },
  { id: 'leads-to', label: 'Leads to', color: '#22d3ee' },
  { id: 'same-as', label: 'Same as', color: '#e879f9' },
  { id: 'related', label: 'Related', color: '#8b9bb4' },
]

export function edgeMeta(id) {
  return EDGE_TYPES.find((type) => type.id === id) || EDGE_TYPES[EDGE_TYPES.length - 1]
}

export const CASE_LIMITS = {
  nodes: 400,
  edges: 800,
  dataBytes: 2048,
  warnBytes: 900 * 1024,
}

let counter = 0

export function newId(prefix = 'n') {
  counter += 1
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

/** Keep a node's own data small: JSON-safe, strings trimmed, 2 KB at most. */
export function trimData(data) {
  if (!data || typeof data !== 'object') return {}
  const out = {}
  let budget = CASE_LIMITS.dataBytes
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue
    const text = typeof value === 'string' ? value.trim() : JSON.stringify(value)
    if (!text) continue
    const room = budget - key.length - 4
    if (room <= 8) break
    out[key] = text.length > room ? text.slice(0, room) : (typeof value === 'string' ? text : value)
    budget -= key.length + String(out[key]).length + 4
  }
  return out
}

export function nodeOf({
  kind = 'text',
  title = '',
  ref = null,
  data = {},
  lat = null,
  lon = null,
  t = null,
  tags = [],
  confidence = 0.6,
  note = '',
  x = null,
  y = null,
} = {}) {
  return {
    id: newId('n'),
    kind: NODE_KIND_IDS.includes(kind) ? kind : 'text',
    title: String(title || '').trim().slice(0, 180) || 'Untitled',
    ref: ref && (ref.url || ref.source) ? {
      source: String(ref.source || '').slice(0, 60),
      sourceId: ref.sourceId ? String(ref.sourceId).slice(0, 120) : null,
      url: ref.url ? String(ref.url).slice(0, 500) : null,
    } : null,
    data: trimData(data),
    lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
    lon: Number.isFinite(Number(lon)) ? Number(lon) : null,
    t: Number.isFinite(Number(t)) ? Number(t) : null,
    tags: Array.isArray(tags) ? tags.slice(0, 8).map((tag) => String(tag).slice(0, 24)) : [],
    confidence: Math.min(1, Math.max(0, Number(confidence) || 0.6)),
    note: String(note || '').slice(0, 500),
    x: Number.isFinite(Number(x)) ? Number(x) : null,
    y: Number.isFinite(Number(y)) ? Number(y) : null,
  }
}

export function edgeOf({
  from,
  to,
  type = 'related',
  direction = 'directed',
  confidence = 0.6,
  note = '',
} = {}) {
  return {
    id: newId('e'),
    from,
    to,
    type: EDGE_TYPES.some((entry) => entry.id === type) ? type : 'related',
    direction: direction === 'undirected' ? 'undirected' : 'directed',
    confidence: Math.min(1, Math.max(0, Number(confidence) || 0.6)),
    note: String(note || '').slice(0, 300),
  }
}

/** The node kind a source item becomes when it is sent to a case. */
export function kindForItem(item) {
  const type = String(item?.type || item?.kind || '').toLowerCase()
  if (type.includes('x') || type.includes('tweet') || type.includes('post')) return 'xpost'
  if (type.includes('aircraft')) return 'aircraft'
  if (type.includes('ship') || type.includes('vessel')) return 'vessel'
  if (type.includes('pin') || type === 'location' || type === 'place') return 'location'
  if (type.includes('event') || type.includes('conflict')) return 'event'
  if (type.includes('signal')) return 'signal'
  if (type.includes('video')) return 'link'
  if (type.includes('news') || type.includes('article') || item?.url) return 'article'
  return 'text'
}

/** What a source item becomes: used to label the picker before a node exists. */
export function cleanItemForNode(item) {
  return {
    kind: kindForItem(item),
    title: String(item?.title || item?.name || '').slice(0, 180),
    url: item?.url || item?.link || null,
  }
}

/** Any item from any surface → a node with its reference and trimmed fields. */
export function nodeFromItem(item, kind) {
  const resolved = NODE_KIND_IDS.includes(kind) ? kind : kindForItem(item)
  const lat = Number(item?.lat ?? item?.latitude ?? item?.coordinates?.[1])
  const lon = Number(item?.lon ?? item?.lng ?? item?.longitude ?? item?.coordinates?.[0])
  const t = Number(item?.t ?? item?.timestampMs ?? item?.createdAtMs)
    || Date.parse(item?.timestamp || item?.pubDate || item?.date || '')
  return nodeOf({
    kind: resolved,
    title: item?.title || item?.name || item?.summary || 'Untitled',
    ref: {
      source: item?.source || item?.feed || item?.type || 'site',
      sourceId: item?.id || item?.guid || null,
      url: item?.url || item?.link || null,
    },
    data: {
      summary: item?.summary || item?.description || item?.contentSnippet || '',
      source: item?.source || '',
      category: item?.category || '',
      score: item?.score ?? item?.threatScore ?? null,
    },
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    t: Number.isFinite(t) && t > 0 ? t : null,
    tags: item?.tags || [],
    confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : 0.6,
  })
}

export function emptyCase({ ownerUid, title = 'Untitled case', description = '' } = {}) {
  const now = Date.now()
  return {
    id: newId('case'),
    ownerUid: ownerUid || 'local',
    title: String(title || 'Untitled case').slice(0, 120),
    description: String(description || '').slice(0, 600),
    visibility: 'private',
    shareToken: null,
    memberUids: [ownerUid || 'local'],
    nodes: [],
    edges: [],
    map: { center: [10, 20], zoom: 1.6, basemapId: 'dark' },
    report: { title: '', body: '', sections: [], evidenceNodeIds: [] },
    aiNotes: [],
    createdAtMs: now,
    updatedAtMs: now,
    schemaVersion: SCHEMA_VERSION,
  }
}

export function caseBytes(caseDoc) {
  try {
    return new Blob([JSON.stringify(caseDoc)]).size
  } catch {
    return JSON.stringify(caseDoc).length
  }
}

/** Refuse what the document cap cannot hold; warn before it gets there. */
export function caseGuard(caseDoc) {
  const nodes = caseDoc?.nodes?.length || 0
  const edges = caseDoc?.edges?.length || 0
  if (nodes > CASE_LIMITS.nodes) return { ok: false, error: `A case holds ${CASE_LIMITS.nodes} items; this one has ${nodes}.` }
  if (edges > CASE_LIMITS.edges) return { ok: false, error: `A case holds ${CASE_LIMITS.edges} links; this one has ${edges}.` }
  const bytes = caseBytes(caseDoc)
  if (bytes > CASE_LIMITS.warnBytes) return { ok: false, error: `This case is ${Math.round(bytes / 1024)} KB, near the 1 MB document limit. Split it.` }
  return { ok: true, bytes }
}

function stamp(ms) {
  const at = Number(ms)
  if (!Number.isFinite(at) || at <= 0) return ''
  return new Date(at).toISOString().slice(0, 16).replace('T', ' ')
}

/** The case as a Markdown report: the grown-up export of the board. */
export function caseMarkdown(caseDoc) {
  const nodes = caseDoc?.nodes || []
  const edges = caseDoc?.edges || []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const lines = [`# ${caseDoc?.title || 'Untitled case'}`, '']
  if (caseDoc?.description) lines.push(caseDoc.description, '')
  lines.push(`_${nodes.length} items · ${edges.length} links · updated ${new Date(caseDoc?.updatedAtMs || Date.now()).toISOString().slice(0, 10)}_`, '')
  if (caseDoc?.report?.body) lines.push('## Summary', '', caseDoc.report.body, '')
  for (const kind of NODE_KINDS) {
    const group = nodes.filter((node) => node.kind === kind.id)
    if (!group.length) continue
    lines.push(`## ${kind.label}s`, '')
    for (const node of group) {
      const when = stamp(node.t)
      const confidence = Number.isFinite(node.confidence) ? ` · confidence ${Math.round(node.confidence * 100)}%` : ''
      lines.push(`- **${node.title}**${when ? ` — ${when}` : ''}${confidence}`)
      if (node.note) lines.push(`  - ${node.note}`)
      if (node.ref?.url) lines.push(`  - ${node.ref.url}`)
    }
    lines.push('')
  }
  if (edges.length) {
    lines.push('## Links', '')
    for (const edge of edges) {
      lines.push(`- ${byId.get(edge.from)?.title || edge.from} → ${edgeMeta(edge.type).label.toLowerCase()} → ${byId.get(edge.to)?.title || edge.to} (${Math.round((edge.confidence || 0) * 100)}%)`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** Pins and links as GeoJSON, so the board can be opened in any GIS. */
export function caseGeoJson(caseDoc) {
  const nodes = caseDoc?.nodes || []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const features = []
  for (const node of nodes) {
    if (!Number.isFinite(node.lat) || !Number.isFinite(node.lon)) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [node.lon, node.lat] },
      properties: { id: node.id, kind: node.kind, title: node.title, t: node.t, url: node.ref?.url || null },
    })
  }
  for (const edge of caseDoc?.edges || []) {
    const a = byId.get(edge.from)
    const b = byId.get(edge.to)
    if (!a || !b) continue
    if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] },
      properties: { id: edge.id, type: edge.type, confidence: edge.confidence },
    })
  }
  return { type: 'FeatureCollection', features }
}

/** The same pins and links as KML, for Google Earth and ATAK. */
export function caseKml(caseDoc) {
  const esc = (value) => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const nodes = caseDoc?.nodes || []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const placemarks = nodes
    .filter((node) => Number.isFinite(node.lat) && Number.isFinite(node.lon))
    .map((node) => `    <Placemark><name>${esc(node.title)}</name><description>${esc(node.note || node.ref?.url || '')}</description><Point><coordinates>${node.lon},${node.lat},0</coordinates></Point></Placemark>`)
  const lines = (caseDoc?.edges || [])
    .map((edge) => {
      const a = byId.get(edge.from)
      const b = byId.get(edge.to)
      if (!a || !b) return null
      if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return null
      return `    <Placemark><name>${esc(edgeMeta(edge.type).label)}</name><LineString><coordinates>${a.lon},${a.lat},0 ${b.lon},${b.lat},0</coordinates></LineString></Placemark>`
    })
    .filter(Boolean)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${esc(caseDoc?.title || 'Batman case')}</name>`,
    ...placemarks,
    ...lines,
    '  </Document>',
    '</kml>',
  ].join('\n')
}
