/**
 * Parse boolean search query: AND, OR, NOT.
 * Examples: "wildfire AND california", "earthquake OR volcano", "storm NOT hurricane"
 * Returns { must: string[], should: string[], not: string[] } for post-filter or multi-search.
 */
function parseBooleanQuery(q) {
  const s = (q || '').trim()
  if (!s) return { must: [], should: [], not: [] }

  const must = []
  const not = []
  let should = []

  function pullNot(part) {
    const trimmed = part.trim()
    const idx = trimmed.toLowerCase().indexOf(' not ')
    if (idx === -1) {
      if (trimmed.toLowerCase().startsWith('not ')) {
        not.push(trimmed.slice(4).trim())
        return null
      }
      return trimmed || null
    }
    const before = trimmed.slice(0, idx).trim()
    const after = trimmed.slice(idx + 5).trim()
    if (after) not.push(after)
    return before || null
  }

  const andParts = s.split(/\s+and\s+/i)
  if (andParts.length > 1) {
    andParts.forEach((part) => {
      const t = pullNot(part)
      if (t) must.push(t)
    })
    return { must, should: [], not }
  }

  const orParts = s.split(/\s+or\s+/i)
  if (orParts.length > 1) {
    orParts.forEach((part) => {
      const t = pullNot(part)
      if (t) should.push(t)
    })
    return { must: [], should, not }
  }

  const single = pullNot(s)
  if (single) return { must: [single], should: [], not }
  return { must: [], should: [], not }
}

function hitMatchesTerm(hit, term) {
  const t = term.toLowerCase()
  const title = (hit.title || '').toLowerCase()
  const desc = (hit.description || '').toLowerCase()
  const tags = (hit.tagsStr || '').toLowerCase()
  const entities = (hit.entitiesStr || '').toLowerCase()
  return title.includes(t) || desc.includes(t) || tags.includes(t) || entities.includes(t)
}

function applyBooleanFilter(hits, parsed) {
  let results = hits
  if (parsed.not.length) {
    results = results.filter((h) => !parsed.not.some((term) => hitMatchesTerm(h, term)))
  }
  if (parsed.must.length) {
    results = results.filter((h) => parsed.must.every((term) => hitMatchesTerm(h, term)))
  }
  if (parsed.should.length) {
    results = results.filter((h) => parsed.should.some((term) => hitMatchesTerm(h, term)))
  }
  return results
}

module.exports = { parseBooleanQuery, hitMatchesTerm, applyBooleanFilter }
