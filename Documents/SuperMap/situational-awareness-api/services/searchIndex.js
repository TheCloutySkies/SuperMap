const FlexSearch = require('flexsearch')
const { parseBooleanQuery, applyBooleanFilter } = require('./booleanQuery')

const DOC_OPTIONS = {
  id: 'id',
  index: ['title', 'description', 'tagsStr', 'entitiesStr'],
  store: ['title', 'type', 'timestamp', 'lat', 'lon', 'source', 'tagsStr', 'entitiesStr'],
}

const news_index = new FlexSearch.Document(DOC_OPTIONS)
const conflict_index = new FlexSearch.Document(DOC_OPTIONS)
const infrastructure_index = new FlexSearch.Document(DOC_OPTIONS)
const disaster_index = new FlexSearch.Document(DOC_OPTIONS)
const signal_index = new FlexSearch.Document(DOC_OPTIONS)

const indexByType = {
  news: news_index,
  conflict: conflict_index,
  infrastructure: infrastructure_index,
  disaster: disaster_index,
  signal: signal_index,
}

function addToIndex(type, doc) {
  const index = indexByType[type]
  if (!index || !doc.id) return
  const tags = Array.isArray(doc.tags) ? doc.tags : []
  const entities = Array.isArray(doc.entities) ? doc.entities : []
  index.add(doc.id, {
    title: doc.title || '',
    description: doc.description || '',
    tagsStr: tags.join(' '),
    entitiesStr: entities.join(' '),
    type: doc.type || type,
    timestamp: doc.timestamp != null ? doc.timestamp : null,
    lat: doc.lat != null ? doc.lat : null,
    lon: doc.lon != null ? doc.lon : null,
    source: doc.source || '',
  })
}

function scoreHit(hit, query, options = {}) {
  const q = (query || '').toLowerCase()
  let score = 0
  const title = (hit.title || '').toLowerCase()
  const desc = (hit.description || '').toLowerCase()
  const tagsStr = (hit.tagsStr || '').toLowerCase()
  const entitiesStr = (hit.entitiesStr || '').toLowerCase()
  if (title.includes(q)) score += 5
  if (desc.includes(q)) score += 2
  if (tagsStr.includes(q)) score += 3
  if (entitiesStr.includes(q)) score += 3
  const age = hit.timestamp != null ? Date.now() - hit.timestamp : 0
  score += 1000 / (age + 86400000)
  return score
}

function searchAll(query, limit = 50, options = {}) {
  const q = (query || '').trim()
  const { tag, startTime, endTime, entity } = options
  const parsed = parseBooleanQuery(q)
  const searchTerms = parsed.must.length ? parsed.must : parsed.should
  const indexes = [news_index, conflict_index, infrastructure_index, disaster_index, signal_index]
  let results = []
  if (searchTerms.length) {
    if (parsed.should.length > 0) {
      const byId = new Map()
      for (const term of parsed.should) {
        for (const index of indexes) {
          try {
            const out = index.search(term, { limit: Math.ceil(limit / 2), enrich: true })
            if (Array.isArray(out)) {
              for (const group of out) {
                if (group.result) {
                  for (const r of group.result) {
                    const doc = r.doc || r
                    const flat = typeof doc === 'object' && doc !== null
                      ? { id: r.id ?? doc.id, ...doc }
                      : { id: r.id }
                    if (!byId.has(flat.id)) byId.set(flat.id, flat)
                  }
                }
              }
            }
          } catch (err) { /* skip */ }
        }
      }
      results = Array.from(byId.values())
    } else {
      const primary = parsed.must[0] || searchTerms[0]
      for (const index of indexes) {
        try {
          const out = index.search(primary, { limit: Math.ceil(limit / 2), enrich: true })
          if (Array.isArray(out)) {
            for (const group of out) {
              if (group.result) {
                for (const r of group.result) {
                  const doc = r.doc || r
                  const flat = typeof doc === 'object' && doc !== null
                    ? { id: r.id ?? doc.id, ...doc }
                    : { id: r.id }
                  results.push(flat)
                }
              }
            }
          }
        } catch (err) { /* skip */ }
      }
      const seen = new Set()
      results = results.filter((r) => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
    }
    results = applyBooleanFilter(results, parsed)
  } else if (!q) {
    return []
  }
  if (tag) {
    const t = tag.toLowerCase()
    results = results.filter((r) => (r.tagsStr || '').toLowerCase().includes(t))
  }
  if (startTime != null) {
    const t = Number(startTime)
    if (!Number.isNaN(t)) results = results.filter((r) => r.timestamp != null && r.timestamp >= t)
  }
  if (endTime != null) {
    const t = Number(endTime)
    if (!Number.isNaN(t)) results = results.filter((r) => r.timestamp != null && r.timestamp <= t)
  }
  if (entity) {
    const e = entity.toLowerCase()
    results = results.filter((r) => (r.entitiesStr || '').toLowerCase().includes(e))
  }
  results.forEach((r) => { r._score = scoreHit(r, q, options) })
  results.sort((a, b) => (b._score || 0) - (a._score || 0))
  return results.slice(0, limit)
}

module.exports = {
  news_index,
  conflict_index,
  infrastructure_index,
  disaster_index,
  signal_index,
  addToIndex,
  searchAll,
}
