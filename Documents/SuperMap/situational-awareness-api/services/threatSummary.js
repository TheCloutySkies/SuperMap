/**
 * AI Threat Summary: fetch threat-tagged events from the last 24h,
 * prioritize high risk_score (4–5) items, cluster duplicates, call Groq/Ollama,
 * return summary + threat level.
 * Failsafe: fallback to title-based summary weighted by item scores.
 */

const { getEventsWithAnyTagInTimeRange, getEvents, getEventTagNames } = require('../database')
const { callThreatModel } = require('./llmClient')
const { readRiskScore, riskLabel, clampScore } = require('./riskScoring')
const { sheetSummary } = require('./scoreLedger')

const THREAT_TAGS = ['geopolitics', 'war', 'conflict', 'military', 'osint', 'intelligence', 'security']
const MAX_ARTICLES_FOR_PROMPT = 40
const TITLE_CLUSTER_MIN_WORDS = 3
/** Prefer these scores when building the summary prompt (high-signal first). */
const HIGH_RISK_MIN = 4

/**
 * Normalize and tokenize title for similarity (simple word set).
 */
function titleWords(title) {
  if (!title || typeof title !== 'string') return new Set()
  const normalized = title.toLowerCase().replace(/[^\w\s]/g, ' ').trim()
  return new Set(normalized.split(/\s+/).filter((w) => w.length > 1))
}

/**
 * Jaccard similarity between two title word sets.
 */
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const w of a) {
    if (b.has(w)) inter++
  }
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * Attach risk_score from raw_data / tags onto article objects.
 */
function withRiskScore(row) {
  const tags = getEventTagNames(row.id)
  let risk = readRiskScore(row, tags)
  if (risk == null) {
    // Lightweight heuristic fallback for unscored legacy rows
    const text = `${row.title || ''} ${row.description || ''}`
    if (/\b(nuclear|mass\s+casualt|invasion|missile\s+strike)\b/i.test(text)) risk = 4
    else if (/\b(attack|strike|explosion|war|casualt|evacuat)\b/i.test(text)) risk = 3
    else if (/\b(military|sanction|protest|cyber|geopolitic)\b/i.test(text)) risk = 2
    else risk = 1
  }
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    source: row.source || 'Unknown',
    raw_data: row.raw_data,
    tags,
    risk_score: clampScore(risk),
    risk_label: riskLabel(risk),
    timestamp: row.timestamp,
  }
}

/**
 * Cluster articles by title similarity; keep densest representative; preserve max risk in cluster.
 */
function clusterArticles(events) {
  const items = events.map((e) => ({
    id: e.id,
    title: e.title || '',
    description: e.description || '',
    source: e.source || 'Unknown',
    raw_data: e.raw_data,
    risk_score: e.risk_score != null ? clampScore(e.risk_score) : 1,
    risk_label: e.risk_label || riskLabel(e.risk_score || 1),
    tags: e.tags || [],
  }))
  if (items.length <= 1) return items

  const clusters = []
  const used = new Set()

  for (let i = 0; i < items.length; i++) {
    if (used.has(items[i].id)) continue
    const cluster = [items[i]]
    used.add(items[i].id)
    const wordsI = titleWords(items[i].title)
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(items[j].id)) continue
      const wordsJ = titleWords(items[j].title)
      if (wordsI.size < TITLE_CLUSTER_MIN_WORDS && wordsJ.size < TITLE_CLUSTER_MIN_WORDS) continue
      if (jaccard(wordsI, wordsJ) >= 0.35) {
        cluster.push(items[j])
        used.add(items[j].id)
      }
    }
    const best = cluster.reduce((a, b) => {
      const scoreA = (a.risk_score || 1) * 1000 + (a.description || '').length
      const scoreB = (b.risk_score || 1) * 1000 + (b.description || '').length
      return scoreA >= scoreB ? a : b
    })
    const maxRisk = Math.max(...cluster.map((c) => c.risk_score || 1))
    clusters.push({
      ...best,
      risk_score: maxRisk,
      risk_label: riskLabel(maxRisk),
    })
  }
  return clusters
}

/**
 * Rank articles: high risk first, then recency. Cap prompt size but always include 4–5s.
 */
function prioritizeForPrompt(articles) {
  const sorted = [...articles].sort((a, b) => {
    const rs = (b.risk_score || 1) - (a.risk_score || 1)
    if (rs !== 0) return rs
    return (b.timestamp || 0) - (a.timestamp || 0)
  })
  const high = sorted.filter((a) => (a.risk_score || 1) >= HIGH_RISK_MIN)
  const rest = sorted.filter((a) => (a.risk_score || 1) < HIGH_RISK_MIN)
  const combined = [...high, ...rest]
  return combined.slice(0, MAX_ARTICLES_FOR_PROMPT)
}

/**
 * Build text block of articles for the prompt (includes risk scores).
 */
function buildInputFromArticles(articles) {
  return articles.map((a, i) => {
    const desc = (a.description || '').slice(0, 300)
    const score = a.risk_score != null ? a.risk_score : 1
    return `[${i + 1}] Risk:${score}/5 (${a.risk_label || riskLabel(score)}) | Title: ${a.title}\nSummary: ${desc || '(no summary)'}\nSource: ${a.source}`
  }).join('\n\n')
}

/**
 * Aggregate item scores → suggested dashboard threat level (used in fallback / bias).
 */
function aggregateThreatFromScores(articles) {
  if (!articles.length) {
    return { threat_level: 'LOW', threat_score: 1, average_score: 1, high_risk_count: 0, scored_items: 0 }
  }
  const scores = articles.map((a) => a.risk_score || 1)
  const highCount = scores.filter((s) => s >= 4).length
  const elevCount = scores.filter((s) => s >= 3).length
  const max = Math.max(...scores)
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length

  let threat_score = clampScore(Math.round(avg))
  if (highCount >= 3 || max >= 5) threat_score = Math.max(threat_score, 5)
  else if (highCount >= 1) threat_score = Math.max(threat_score, 4)
  else if (elevCount >= 3) threat_score = Math.max(threat_score, 3)
  else if (elevCount >= 1) threat_score = Math.max(threat_score, 2)

  return {
    threat_level: publicThreatLevel(threat_score),
    threat_score,
    average_score: Math.round(avg * 10) / 10,
    high_risk_count: highCount,
    scored_items: scores.length,
  }
}

const LEVEL_WORDS = { 1: 'LOW', 3: 'ELEVATED', 4: 'HIGH', 5: 'CRITICAL' }

function publicThreatLevel(score) {
  return LEVEL_WORDS[clampScore(score)] || ''
}

/**
 * Parse AI output: narrative (1-3 paragraphs), optional bullets, and Threat Level.
 */
const THREAT_LEVELS = ['LOW', 'ELEVATED', 'HIGH', 'CRITICAL']
function parseThreatResponse(text) {
  const out = { summary: '', narrative: '', bullets: [], threat_level: '', threat_score: 2 }
  if (!text || typeof text !== 'string') return out

  const levelMatch = text.match(/\b(?:Threat Level|threat level):\s*(\w+)/i)
  if (levelMatch) {
    const level = levelMatch[1].toUpperCase()
    if (level === 'GUARDED') {
      out.threat_level = ''
      out.threat_score = 2
    } else if (THREAT_LEVELS.includes(level)) {
      out.threat_level = level
      out.threat_score = { LOW: 1, ELEVATED: 3, HIGH: 4, CRITICAL: 5 }[level]
    }
  }
  const scoreMatch = text.match(/\b(?:numeric|score|value)\s*(?:from\s*)?1-5[:\s]*(\d)/i) || text.match(/\b(\d)\s*\/\s*5\b/)
  if (scoreMatch) {
    const s = parseInt(scoreMatch[1], 10)
    if (s >= 1 && s <= 5) out.threat_score = s
  }

  const withLabel = text.match(
    /(?:Daily Summary|News of the Day|Summary|Narrative)[:\s]*([\s\S]*?)(?=Threat Summary|Bullet|Threat Level|Potential impacts|$)/i
  )
  const beforeBullets = text.match(
    /^([\s\S]*?)(?=\n\s*(?:Threat Summary|Bullet points?|[-*•]\s))/im
  )
  const candidate = (withLabel && withLabel[1]) || (beforeBullets && beforeBullets[1]) || ''
  const paras = candidate
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter((p) => p.length > 40 && p.length < 1200)
  if (paras.length > 0) {
    out.narrative = paras.slice(0, 3).join('\n\n')
    out.summary = out.narrative
  }

  const bulletSection = text.match(/(?:Threat Summary|bullet points?)[:\s]*([\s\S]*?)(?=Threat Level|Potential impacts|$)/i)
  const rawBullets = bulletSection ? bulletSection[1] : text
  const bullets = rawBullets
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-•*]+/, '').trim())
    .filter((line) => line.length > 20 && line.length < 400)
  if (bullets.length > 0) {
    out.bullets = bullets.slice(0, 7)
    if (!out.summary) out.summary = out.bullets.join('\n')
  }
  if (!out.summary) out.summary = text.slice(0, 1500).trim()
  return out
}

/**
 * Fallback: generate a simple summary from high-risk titles first.
 */
function fallbackSummaryFromTitles(articles) {
  const ranked = prioritizeForPrompt(articles)
  const agg = aggregateThreatFromScores(ranked)
  if (ranked.length === 0) {
    return {
      summary: 'No threat-tagged articles in the last 24 hours.',
      narrative: '',
      bullets: [],
      threat_level: 'LOW',
      threat_score: 1,
      average_score: 1,
    }
  }
  const top = ranked[0]
  const sources = [...new Set(ranked.map((item) => item.source).filter(Boolean))].slice(0, 4)
  const narrative = [
    `Across ${agg.scored_items} scored items the average is ${agg.average_score}/5.`,
    agg.high_risk_count
      ? `${agg.high_risk_count} of them score 4 or 5, which is what pulls the day up.`
      : 'Nothing in the pile is a 4 or a 5.',
    top?.title
      ? `The strongest thread is “${top.title}”${sources.length ? `, carried by ${sources.join(', ')}` : ''}.`
      : '',
  ].filter(Boolean).join(' ')
  return {
    summary: narrative,
    narrative,
    bullets: [],
    threat_level: agg.threat_level,
    threat_score: agg.threat_score,
    average_score: agg.average_score,
  }
}

const PROMPT_PREFIX = `You are writing the "news of the day" summary for a situational-awareness dashboard. Use the following articles from the last 24 hours.

Each article includes a Risk score (1–5). Weight HIGH and CRITICAL items (4–5) heavily — they must dominate the narrative. Mention specific places, actors, and numbers when present. Do NOT write a generic overview that could fit any day.

Your main job: Write a short dissertation-style brief. Do NOT just list or regurgitate headlines. Combine and synthesize headline information into an actual analytical summary: connect events across sources, explain causes and consequences, and state why it matters. Write in clear, direct prose (like an intelligence or policy brief), not as a list of headlines.

Structure your Daily Summary into these sections (include only sections that have relevant content):

Middle East: Developments in the Middle East (Israel, Iran, Gulf, Levant, Yemen, etc.).

USA: Domestic and foreign-policy developments in the United States.

Asia: Developments in East Asia, Southeast Asia, South Asia, and the Pacific.

Economics: Markets, energy, supply chains, sanctions, and economic implications of geopolitical events.

Russia/Ukraine: Russia, Ukraine, and related European security developments.

General Developments: Other major geopolitical, military, or intelligence developments that do not fit the above.

For each section write 1–3 sentences that synthesize the news (do not simply repeat headlines). If a section has no relevant content, omit it.

Output format (use these exact section labels):

Daily Summary:

Middle East:
[1–3 sentences synthesizing relevant headlines.]

USA:
[1–3 sentences synthesizing relevant headlines.]

Asia:
[1–3 sentences synthesizing relevant headlines.]

Economics:
[1–3 sentences synthesizing relevant headlines.]

Russia/Ukraine:
[1–3 sentences synthesizing relevant headlines.]

General Developments:
[1–3 sentences synthesizing relevant headlines.]

Threat Summary:
- 3 to 5 short bullet points (optional; only the most critical follow-ups). Prefer items scored 4–5.

Threat Level:
Return one of: LOW, ELEVATED, HIGH, CRITICAL, and a numeric value from 1-5.
Do not use the word Guarded. A routine day is a number near the item average, not a new label.
Bias the level toward the highest-weighted article scores (many 4–5s ⇒ HIGH/CRITICAL).
Say what is new compared with the recent score baseline. Do not paste headlines.

Articles:

`

/**
 * Main: get tagged events from last 24h, score-rank, cluster, call LLM, parse.
 */
async function getThreatSummary() {
  const since = Date.now() - 24 * 60 * 60 * 1000
  let rows = getEventsWithAnyTagInTimeRange(THREAT_TAGS, since, 200)
  if (rows.length === 0) {
    rows = getEvents(200, since, null)
  }
  const articles = rows.map(withRiskScore)
  const clustered = clusterArticles(articles)
  const prioritized = prioritizeForPrompt(clustered)
  const sources = [...new Set(prioritized.map((a) => a.source))].slice(0, 20)
  const scoreAgg = aggregateThreatFromScores(prioritized)

  if (prioritized.length === 0) {
    return {
      summary: 'No recent articles or events in the last 24 hours. The threat summary uses the same event pool as the search bar; run a map or feed load so the API has ingested news and OSINT first.',
      narrative: '',
      bullets: ['No recent geopolitical or conflict-related events to summarize.'],
      threat_level: 'LOW',
      threat_score: 1,
      average_score: 1,
      sources: [],
      high_risk_count: 0,
      timestamp: new Date().toISOString(),
      fallback: true,
    }
  }

  let keywordTagHint = ''
  let keywordTags = []
  try {
    const kt = require('./keywordTags')
    keywordTags = kt.getKeywordTags()?.tags || []
    keywordTagHint = kt.formatTagsForPrompt(25)
  } catch (_) { /* optional */ }

  const inputText = buildInputFromArticles(prioritized)
  const sheet = sheetSummary()
  const sheetHint = sheet.count
    ? `\nScore sheet from the last 3 days: ${sheet.count} records, average ${sheet.average}/5. Compare today with that norm. Do not restate headlines.\n`
    : '\nScore sheet: no records from the last 3 days yet.\n'
  const levelHint = scoreAgg.threat_level || 'number only'
  const scoreHint = `\n(Item score aggregate: average ${scoreAgg.average_score}/5, ${scoreAgg.high_risk_count} high-risk (4–5) of ${scoreAgg.scored_items}; suggested level ${levelHint}, floor ${scoreAgg.threat_score})\n`
  const tagBlock = keywordTagHint ? `\n${keywordTagHint}\nUse these recurring headline themes when weighing what dominates the day.\n` : '\n'
  const fullPrompt = PROMPT_PREFIX + scoreHint + sheetHint + tagBlock + '\n' + inputText
  const rawResponse = await callThreatModel(fullPrompt)
  const parsed = rawResponse ? parseThreatResponse(rawResponse) : null

  if (parsed && parsed.summary) {
    // Never under-report vs aggregate of item scores when model is soft
    let threat_score = parsed.threat_score
    let threat_level = parsed.threat_level
    if (scoreAgg.threat_score > threat_score && scoreAgg.high_risk_count > 0) {
      threat_score = Math.max(threat_score, Math.min(scoreAgg.threat_score, threat_score + 1))
      threat_level = publicThreatLevel(threat_score)
    }
    if (threat_level === 'GUARDED') threat_level = ''
    return {
      summary: parsed.summary,
      narrative: parsed.narrative || '',
      bullets: parsed.bullets.length ? parsed.bullets : [],
      threat_level,
      threat_score,
      average_score: scoreAgg.average_score,
      sources,
      high_risk_count: scoreAgg.high_risk_count,
      keyword_tags: keywordTags.slice(0, 20),
      top_risks: prioritized
        .filter((a) => (a.risk_score || 1) >= HIGH_RISK_MIN)
        .slice(0, 5)
        .map((a) => ({ title: a.title, risk_score: a.risk_score, source: a.source })),
      timestamp: new Date().toISOString(),
      fallback: false,
    }
  }

  const fallback = fallbackSummaryFromTitles(prioritized)
  return {
    summary: fallback.summary,
    narrative: fallback.narrative || fallback.summary,
    bullets: fallback.bullets,
    threat_level: fallback.threat_level,
    threat_score: fallback.threat_score,
    average_score: fallback.average_score ?? scoreAgg.average_score,
    sources,
    high_risk_count: scoreAgg.high_risk_count,
    keyword_tags: keywordTags.slice(0, 20),
    top_risks: prioritized
      .filter((a) => (a.risk_score || 1) >= HIGH_RISK_MIN)
      .slice(0, 5)
      .map((a) => ({ title: a.title, risk_score: a.risk_score, source: a.source })),
    timestamp: new Date().toISOString(),
    fallback: true,
  }
}

module.exports = {
  getThreatSummary,
  THREAT_TAGS,
  clusterArticles,
  parseThreatResponse,
  fallbackSummaryFromTitles,
  prioritizeForPrompt,
  aggregateThreatFromScores,
  withRiskScore,
}
