/**
 * Batman: read a case's own nodes and answer a question about them.
 *
 * The desk is given ids and short fields only, must cite the ids it used, and
 * falls back to an arithmetic summary when no model is configured, so the tab
 * always answers something truthful and never invents a claim.
 */
const express = require('express')
const { callTagModel } = require('../services/llmClient')

const router = express.Router()
const MAX_NODES = 40
const MAX_EDGES = 80

function cleanText(value, max = 300) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanNodes(nodes) {
  if (!Array.isArray(nodes)) return []
  return nodes.slice(0, MAX_NODES).map((node) => ({
    id: cleanText(node?.id, 60),
    kind: cleanText(node?.kind, 20),
    title: cleanText(node?.title, 200),
    note: cleanText(node?.note, 300),
    source: cleanText(node?.source, 60),
    at: Number.isFinite(Number(node?.at)) ? Number(node.at) : null,
  })).filter((node) => node.id && node.title)
}

function cleanEdges(edges) {
  if (!Array.isArray(edges)) return []
  return edges.slice(0, MAX_EDGES).map((edge) => ({
    from: cleanText(edge?.from, 60),
    to: cleanText(edge?.to, 60),
    type: cleanText(edge?.type, 20),
    confidence: Number.isFinite(Number(edge?.confidence)) ? Number(edge.confidence) : null,
  })).filter((edge) => edge.from && edge.to)
}

/** The answer without a model: counts, the busiest items and the densest links. */
function fallbackAnswer({ question, nodes, edges }) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const degree = new Map()
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1)
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1)
  }
  const busiest = [...degree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const kinds = [...new Set(nodes.map((node) => node.kind))].filter(Boolean)
  const contradictions = edges.filter((edge) => edge.type === 'contradicts')
  const narrative = [
    `${nodes.length} item${nodes.length === 1 ? '' : 's'} across ${kinds.length} kind${kinds.length === 1 ? '' : 's'} of evidence, joined by ${edges.length} link${edges.length === 1 ? '' : 's'}.`,
    busiest.length
      ? `The most connected are ${busiest.map(([id, count]) => `${byId.get(id)?.title || id} (${count})`).join(', ')}.`
      : 'Nothing is linked yet, so there is no structure to read.',
    contradictions.length
      ? `${contradictions.length} link${contradictions.length === 1 ? '' : 's'} mark a contradiction: ${contradictions.map((edge) => `${byId.get(edge.from)?.title || edge.from} ↔ ${byId.get(edge.to)?.title || edge.to}`).join('; ')}.`
      : 'No link is marked as a contradiction.',
    `Question: ${question}. No model is configured on the API, so this is the arithmetic reading of the case.`,
  ].join(' ')
  return {
    narrative,
    connections: busiest.map(([id, count]) => ({
      claim: `${byId.get(id)?.title || id} is the busiest item, with ${count} link${count === 1 ? '' : 's'}.`,
      nodeIds: [id],
    })),
    contradictions: contradictions.map((edge) => ({
      claim: `${byId.get(edge.from)?.title || edge.from} contradicts ${byId.get(edge.to)?.title || edge.to}.`,
      nodeIds: [edge.from, edge.to],
    })),
    gaps: nodes.length < 3 ? ['A case needs more than two items before a pattern means anything.'] : [],
    confidence: 0.3,
    source: 'arithmetic',
  }
}

function buildPrompt({ question, nodes, edges }) {
  const lines = nodes.map((node) => {
    const when = node.at ? new Date(node.at).toISOString().slice(0, 10) : 'no date'
    return `- [${node.id}] ${node.kind}: ${node.title}${node.source ? ` (${node.source})` : ''}, ${when}${node.note ? ` — ${node.note}` : ''}`
  })
  const links = edges.map((edge) => `- ${edge.from} -> ${edge.to} (${edge.type}${edge.confidence != null ? `, ${Math.round(edge.confidence * 100)}%` : ''})`)
  return [
    'You are an intelligence analyst writing for a careful investigator.',
    'Use ONLY the items and links below. Never invent a fact, a name or a date.',
    'Every connection and contradiction must cite the ids in square brackets.',
    'Answer with JSON only, no prose outside it:',
    '{"narrative":"3-5 sentences","connections":[{"claim":"…","nodeIds":["…"]}],',
    '"contradictions":[{"claim":"…","nodeIds":["…"]}],"gaps":["…"],"confidence":0.0}',
    '',
    `Question: ${question}`,
    '',
    'Items:',
    ...lines,
    '',
    'Links:',
    ...(links.length ? links : ['- none yet']),
  ].join('\n')
}

function parseAnswer(text) {
  if (!text) return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const body = JSON.parse(text.slice(start, end + 1))
    return {
      narrative: cleanText(body.narrative, 2000),
      connections: Array.isArray(body.connections)
        ? body.connections.slice(0, 12).map((row) => ({
          claim: cleanText(row?.claim, 400),
          nodeIds: Array.isArray(row?.nodeIds) ? row.nodeIds.map((id) => cleanText(id, 60)).filter(Boolean).slice(0, 8) : [],
        })).filter((row) => row.claim)
        : [],
      contradictions: Array.isArray(body.contradictions)
        ? body.contradictions.slice(0, 12).map((row) => ({
          claim: cleanText(row?.claim, 400),
          nodeIds: Array.isArray(row?.nodeIds) ? row.nodeIds.map((id) => cleanText(id, 60)).filter(Boolean).slice(0, 8) : [],
        })).filter((row) => row.claim)
        : [],
      gaps: Array.isArray(body.gaps) ? body.gaps.slice(0, 8).map((gap) => cleanText(gap, 300)).filter(Boolean) : [],
      confidence: Number.isFinite(Number(body.confidence)) ? Math.min(1, Math.max(0, Number(body.confidence))) : 0.5,
    }
  } catch {
    return null
  }
}

router.post('/analyze', async (req, res) => {
  const question = cleanText(req.body?.question, 300) || 'What connects these items, and what contradicts?'
  const nodes = cleanNodes(req.body?.nodes)
  const edges = cleanEdges(req.body?.edges)
  if (nodes.length < 2) {
    return res.status(400).json({ error: 'Pick at least two items to analyse.' })
  }
  const local = fallbackAnswer({ question, nodes, edges })
  let answer = null
  try {
    const text = await callTagModel(buildPrompt({ question, nodes, edges }), { maxTokens: 900 })
    answer = parseAnswer(text)
  } catch (err) {
    console.warn('[batman] analyze:', err.message)
  }
  res.set('Cache-Control', 'no-store')
  if (!answer) return res.json(local)
  return res.json({ ...answer, source: 'model' })
})

module.exports = router
