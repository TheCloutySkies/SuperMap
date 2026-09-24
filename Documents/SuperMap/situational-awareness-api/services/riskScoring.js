/**
 * AI-smart tagging + risk scoring for SuperMap feed items (news, OSINT X, Reddit/articles).
 *
 * ---------------------------------------------------------------------------
 * RISK / IMPORTANCE RUBRIC (1–5) — used by heuristics, AI prompts, and UI
 * ---------------------------------------------------------------------------
 * 1 LOW       Routine reporting, soft news, analysis without acute danger.
 *             Opinion, markets chatter, historical retrospectives.
 * 2 GUARDED   Notable geopolitical, defense, or security developments worth
 *             monitoring. Protests, sanctions talk, troop movements without
 *             confirmed kinetic action, cyber advisories (non-critical).
 * 3 ELEVATED  Active conflict, disasters, or cyber incidents with clear
 *             impact: strikes, casualties possible, evacuations, major outages,
 *             significant infrastructure disruption.
 * 4 HIGH      Mass-casualty events, major kinetic strikes on cities/critical
 *             sites, catastrophic disasters, confirmed critical-infra attacks,
 *             nuclear/CBRN concerns, imminent great-power escalation.
 * 5 CRITICAL  Confirmed WMD use, open great-power kinetic escalation,
 *             existential-scale infrastructure failure, or events that demand
 *             immediate strategic attention across the board.
 *
 * Always produces a heuristic score. When Groq/Ollama is available, may refine
 * tags + score via LLM (batch). Never throws; degrades to heuristics.
 */

const { callTagModel, hasLlmConfigured } = require('./llmClient')
const { tagEvent } = require('./tagging')
const { tagOsintPost } = require('./osintTagger')
const { detectSignals } = require('./signalDetector')

const RISK_LABELS = {
  1: 'LOW',
  2: 'GUARDED',
  3: 'ELEVATED',
  4: 'HIGH',
  5: 'CRITICAL',
}

const RISK_TAG_PREFIX = 'risk-'

/** Weighted keyword buckets for heuristic scoring (score = max matching bucket). */
const SCORE_BUCKETS = [
  {
    score: 5,
    patterns: [
      /\bnuclear\s+(?:strike|attack|detonation|warhead)\b/i,
      /\bwmd\b/i,
      /\bchemical\s+(?:weapon|attack)\b/i,
      /\bbiological\s+(?:weapon|attack)\b/i,
      /\bnato\s+article\s*5\b/i,
      /\bdeclaration\s+of\s+war\b/i,
      /\bicbm\b/i,
      /\bmutually\s+assured\b/i,
    ],
  },
  {
    score: 4,
    patterns: [
      /\bmass\s+casualt/i,
      /\bhundreds?\s+(?:dead|killed)\b/i,
      /\bthousands?\s+(?:dead|killed|evacuat)/i,
      /\bairstrike\b/i,
      /\bmissile\s+(?:strike|attack|barrage)\b/i,
      /\bdrone\s+(?:strike|swarm|attack)\b/i,
      /\bcatastrophic\b/i,
      /\bcritical\s+infrastructure\s+(?:attack|hit|destroyed)\b/i,
      /\bnuclear\b/i,
      /\bradiation\b/i,
      /\binvasion\b/i,
      /\bterror(?:ist)?\s+(?:attack|bombing)\b/i,
      /\bhostage\b/i,
      /\bstate\s+of\s+emergency\b/i,
    ],
  },
  {
    score: 3,
    patterns: [
      /\bexplosion\b/i,
      /\bblast\b/i,
      /\bstrike\b/i,
      /\battack\b/i,
      /\bshelling\b/i,
      /\bcasualt/i,
      /\bkilled\b/i,
      /\bwounded\b/i,
      /\bevacuat/i,
      /\bwar\b/i,
      /\bcombat\b/i,
      /\bfrontline\b/i,
      /\bransomware\b/i,
      /\bcyber\s*(?:attack|breach)\b/i,
      /\bblackout\b/i,
      /\bpower\s+outage\b/i,
      /\bearthquake\b/i,
      /\btsunami\b/i,
      /\bwildfire\b/i,
      /\bflood(?:ing)?\b/i,
      /\bhurricane\b/i,
      /\btornado\b/i,
      /\bshooting\b/i,
      /\bclash(?:es)?\b/i,
    ],
  },
  {
    score: 2,
    patterns: [
      /\bsanction/i,
      /\btroop\s+(?:movement|buildup|deployment)\b/i,
      /\bmilitary\b/i,
      /\bdefense\b/i,
      /\bdefence\b/i,
      /\bgeopolitic/i,
      /\bprotest/i,
      /\briots?\b/i,
      /\bceasefire\b/i,
      /\bdiplomacy\b/i,
      /\bintel(?:ligence)?\b/i,
      /\bosint\b/i,
      /\bcisa\b/i,
      /\bvulnerabilit/i,
      /\badvisory\b/i,
      /\balert\b/i,
      /\bmissile\b/i,
      /\bdrone\b/i,
      /\butility\s+outage\b/i,
    ],
  },
]

function clampScore(n) {
  const s = Math.round(Number(n))
  if (!Number.isFinite(s)) return 1
  return Math.min(5, Math.max(1, s))
}

function riskLabel(score) {
  return RISK_LABELS[clampScore(score)] || 'LOW'
}

function riskTagName(score) {
  return `${RISK_TAG_PREFIX}${clampScore(score)}`
}

function parseRiskScoreFromTags(tags) {
  if (!Array.isArray(tags)) return null
  for (const t of tags) {
    const m = String(t).match(/^risk-([1-5])$/i)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

function itemText(item) {
  return [item.title, item.description, item.content, item.contentSnippet, item.body]
    .filter(Boolean)
    .join(' ')
    .trim()
}

/**
 * Heuristic risk score from text + optional keyword tags.
 */
function heuristicRiskScore(item, tags = []) {
  const text = itemText(item)
  if (!text) return 1

  let score = 1
  for (const bucket of SCORE_BUCKETS) {
    if (bucket.patterns.some((p) => p.test(text))) {
      score = Math.max(score, bucket.score)
    }
  }

  const tagBoost = new Set((tags || []).map((t) => String(t).toLowerCase()))
  if (['war', 'conflict', 'nuclear', 'disaster'].some((t) => tagBoost.has(t))) {
    score = Math.max(score, 3)
  }
  if (['military', 'cyber', 'security', 'geopolitics'].some((t) => tagBoost.has(t))) {
    score = Math.max(score, 2)
  }

  // Reddit upvote signal (soft bump only)
  const ups = Number(item.score || item.ups || 0)
  if (ups >= 5000 && score < 3) score = Math.max(score, 2)
  if (ups >= 20000 && score < 4) score = Math.max(score, 3)

  return clampScore(score)
}

/**
 * Collect heuristic tags from existing taggers + signal detector.
 */
function heuristicTags(item) {
  const tags = new Set()
  const asEvent = {
    title: item.title || '',
    description: item.description || item.content || item.contentSnippet || '',
  }
  for (const t of tagEvent(asEvent)) tags.add(t)
  for (const t of tagOsintPost({
    title: item.title || '',
    content: item.description || item.content || item.contentSnippet || '',
  })) {
    tags.add(t)
  }
  for (const s of detectSignals({
    text: itemText(item),
    body: itemText(item),
  })) {
    tags.add(s.replace(/_/g, '-'))
  }
  // Drop synthetic risk-* from heuristic set; added later from score
  return [...tags].filter((t) => !/^risk-[1-5]$/i.test(t))
}

const AI_BATCH_PROMPT = `You are a situational-awareness analyst. Score each item for risk/danger/importance using this rubric:

1 LOW — Routine/soft news, no acute danger.
2 GUARDED — Notable geopolitics/security worth monitoring.
3 ELEVATED — Active conflict, disaster, or cyber with clear impact.
4 HIGH — Mass casualties, major strikes, catastrophic disaster, critical-infra attack, nuclear/CBRN concern.
5 CRITICAL — WMD use, great-power kinetic escalation, existential-scale failure.

For each item return JSON ONLY (no markdown):
{"items":[{"i":0,"score":1,"tags":["war","military"],"why":"short reason"}]}

Rules:
- score is integer 1-5
- tags: 1-5 short lowercase topical tags (no "risk-N")
- why: ≤12 words
- Be conservative: do not inflate scores for opinion or speculative chatter.

Items:
`

function extractJsonObject(text) {
  if (!text || typeof text !== 'string') return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch (_) {
    return null
  }
}

/**
 * Sync assess: heuristic tags + score. No network.
 * @returns {{ tags: string[], risk_score: number, risk_label: string, assessment_source: 'heuristic', rationale: string }}
 */
function assessItemHeuristic(item) {
  const tags = heuristicTags(item)
  const risk_score = heuristicRiskScore(item, tags)
  const allTags = [...new Set([...tags, riskTagName(risk_score)])]
  return {
    tags: allTags,
    risk_score,
    risk_label: riskLabel(risk_score),
    assessment_source: 'heuristic',
    rationale: 'keyword/heuristic assessment',
  }
}

/**
 * Assess one item (heuristic). Optionally try AI when preferAi and LLM available.
 * For throughput, prefer assessItemsBatch for multiple items.
 */
async function assessItem(item, { preferAi = false } = {}) {
  const base = assessItemHeuristic(item)
  if (!preferAi || !hasLlmConfigured()) return base
  const batch = await assessItemsBatch([item], { preferAi: true })
  return batch[0] || base
}

/**
 * Batch-assess items. Always returns one result per input (heuristic fallback).
 * At most one LLM call for the whole batch when preferAi.
 */
async function assessItemsBatch(items, { preferAi = true, maxAiItems = 12 } = {}) {
  if (!Array.isArray(items) || items.length === 0) return []

  const heuristics = items.map((it) => assessItemHeuristic(it))
  if (!preferAi || !hasLlmConfigured()) return heuristics

  const slice = items.slice(0, maxAiItems)
  const promptBody = slice
    .map((it, i) => {
      const title = (it.title || '').slice(0, 160)
      const desc = (it.description || it.content || it.contentSnippet || '').slice(0, 280)
      return `[${i}] Title: ${title}\nText: ${desc || '(none)'}\nSource: ${it.source || 'unknown'}`
    })
    .join('\n\n')

  const raw = await callTagModel(AI_BATCH_PROMPT + promptBody, { maxTokens: 900 })
  const parsed = extractJsonObject(raw)
  const aiItems = Array.isArray(parsed?.items) ? parsed.items : []

  return heuristics.map((h, idx) => {
    if (idx >= slice.length) return h
    const ai = aiItems.find((a) => Number(a.i) === idx) || aiItems[idx]
    if (!ai) return h
    const score = clampScore(ai.score != null ? ai.score : h.risk_score)
    const aiTags = Array.isArray(ai.tags)
      ? ai.tags.map((t) => String(t).trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean)
      : []
    const merged = [...new Set([
      ...h.tags.filter((t) => !/^risk-[1-5]$/i.test(t)),
      ...aiTags.filter((t) => !/^risk-[1-5]$/i.test(t)),
      riskTagName(score),
    ])]
    return {
      tags: merged,
      risk_score: score,
      risk_label: riskLabel(score),
      assessment_source: 'ai',
      rationale: typeof ai.why === 'string' ? ai.why.slice(0, 120) : 'ai assessment',
    }
  })
}

/**
 * Read risk_score from event row / raw_data / tags.
 */
function readRiskScore(eventOrRaw, tags) {
  let raw = eventOrRaw
  if (eventOrRaw && typeof eventOrRaw.raw_data === 'string') {
    try {
      raw = JSON.parse(eventOrRaw.raw_data)
    } catch (_) {
      raw = {}
    }
  } else if (eventOrRaw && eventOrRaw.raw_data && typeof eventOrRaw.raw_data === 'object') {
    raw = eventOrRaw.raw_data
  }
  if (raw && raw.risk_score != null) return clampScore(raw.risk_score)
  const fromTags = parseRiskScoreFromTags(tags)
  if (fromTags != null) return fromTags
  return null
}

module.exports = {
  RISK_LABELS,
  RISK_TAG_PREFIX,
  clampScore,
  riskLabel,
  riskTagName,
  parseRiskScoreFromTags,
  heuristicRiskScore,
  heuristicTags,
  assessItemHeuristic,
  assessItem,
  assessItemsBatch,
  readRiskScore,
}
