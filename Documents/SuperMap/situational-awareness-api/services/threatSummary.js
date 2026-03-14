/**
 * AI Threat Summary: fetch threat-tagged events from the last 24h,
 * cluster duplicates, call TinyLlama via Ollama, return summary + threat level.
 * Failsafe: fallback to title-based summary if Ollama fails or times out.
 */

const { getEventsWithAnyTagInTimeRange, getEvents } = require('../database')

const THREAT_TAGS = ['geopolitics', 'war', 'conflict', 'military', 'osint', 'intelligence', 'security']
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_THREAT_MODEL || 'tinyllama:1.1b'
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_THREAT_TIMEOUT_MS) || 90 * 1000
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim()
const GROQ_MODEL = process.env.GROQ_THREAT_MODEL || 'llama-3.1-8b-instant'
const GROQ_BACKUP_MODEL = process.env.GROQ_THREAT_BACKUP_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct'
const GROQ_TIMEOUT_MS = Number(process.env.GROQ_THREAT_TIMEOUT_MS) || 60 * 1000
const GROQ_MAX_CALLS_PER_24H = Math.max(1, parseInt(process.env.GROQ_THREAT_MAX_CALLS_PER_24H, 10) || 28)
const GROQ_MIN_INTERVAL_MS = Math.max(60 * 1000, parseInt(process.env.GROQ_THREAT_MIN_INTERVAL_MS, 10) || 55 * 60 * 1000)
const MAX_ARTICLES_FOR_PROMPT = 40
const TITLE_CLUSTER_MIN_WORDS = 3

const groqCallTimestamps = []
let lastGroqCallTime = 0

function pruneAndCheckGroqLimits() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  while (groqCallTimestamps.length > 0 && groqCallTimestamps[0] < cutoff) groqCallTimestamps.shift()
  if (groqCallTimestamps.length >= GROQ_MAX_CALLS_PER_24H) return false
  if (lastGroqCallTime > 0 && Date.now() - lastGroqCallTime < GROQ_MIN_INTERVAL_MS) return false
  return true
}

function recordGroqCall() {
  lastGroqCallTime = Date.now()
  groqCallTimestamps.push(lastGroqCallTime)
}

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
 * Cluster articles by title similarity; keep one representative per cluster (most information-dense: longest description).
 */
function clusterArticles(events) {
  const items = events.map((e) => ({
    id: e.id,
    title: e.title || '',
    description: e.description || '',
    source: e.source || 'Unknown',
    raw_data: e.raw_data,
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
    const best = cluster.reduce((a, b) =>
      (a.description || '').length >= (b.description || '').length ? a : b
    )
    clusters.push(best)
  }
  return clusters
}

/**
 * Build text block of articles for the prompt (titles + short summaries + sources).
 */
function buildInputFromArticles(articles) {
  return articles.slice(0, MAX_ARTICLES_FOR_PROMPT).map((a, i) => {
    const desc = (a.description || '').slice(0, 300)
    return `[${i + 1}] Title: ${a.title}\nSummary: ${desc || '(no summary)'}\nSource: ${a.source}`
  }).join('\n\n')
}

/**
 * Parse AI output: narrative (1-3 paragraphs), optional bullets, and Threat Level.
 */
const THREAT_LEVELS = ['LOW', 'GUARDED', 'ELEVATED', 'HIGH', 'CRITICAL']
function parseThreatResponse(text) {
  const out = { summary: '', narrative: '', bullets: [], threat_level: 'GUARDED', threat_score: 2 }
  if (!text || typeof text !== 'string') return out

  const levelMatch = text.match(/\b(?:Threat Level|threat level):\s*(\w+)/i)
  if (levelMatch) {
    const level = levelMatch[1].toUpperCase()
    if (THREAT_LEVELS.includes(level)) {
      out.threat_level = level
      out.threat_score = Math.min(5, Math.max(1, THREAT_LEVELS.indexOf(level) + 1))
    }
  }
  const scoreMatch = text.match(/\b(?:numeric|score|value)\s*(?:from\s*)?1-5[:\s]*(\d)/i) || text.match(/\b(\d)\s*\/\s*5\b/)
  if (scoreMatch) {
    const s = parseInt(scoreMatch[1], 10)
    if (s >= 1 && s <= 5) out.threat_score = s
  }

  // Extract narrative: under a section label, or as first 1-3 paragraphs before "Threat Summary" / "Bullet" / "Threat Level"
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
 * Call Ollama /api/generate. Returns full response text or null on failure.
 */
async function callOllama(prompt) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS)
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.3, num_predict: 1024 },
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = await res.json()
    return data.response || null
  } catch (_) {
    clearTimeout(timeout)
    return null
  }
}

/**
 * Call Groq OpenAI-compatible chat completions. Use when deploying to Render (no Ollama).
 * Returns full response text or null on failure.
 * @param {string} prompt
 * @param {string} [model] - Override model (default GROQ_MODEL).
 */
async function callGroq(prompt, model = GROQ_MODEL) {
  if (!GROQ_API_KEY) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
        temperature: 0.3,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    return typeof content === 'string' ? content.trim() : null
  } catch (_) {
    clearTimeout(timeout)
    return null
  }
}

/** Call AI backend: Groq if API key set (primary then backup model), else Ollama. Respects rate limits. */
async function callThreatModel(prompt) {
  if (!GROQ_API_KEY) return callOllama(prompt)
  if (!pruneAndCheckGroqLimits()) return null
  const primary = await callGroq(prompt, GROQ_MODEL)
  if (primary) {
    recordGroqCall()
    return primary
  }
  if (!pruneAndCheckGroqLimits()) return null
  const backup = await callGroq(prompt, GROQ_BACKUP_MODEL)
  if (backup) {
    recordGroqCall()
    return backup
  }
  return null
}

/**
 * Fallback: generate a simple summary from article titles only.
 */
function fallbackSummaryFromTitles(articles) {
  const titles = articles.slice(0, 15).map((a) => a.title).filter(Boolean)
  if (titles.length === 0) {
    return {
      summary: 'No threat-tagged articles in the last 24 hours.',
      bullets: ['No recent geopolitical or conflict-related events to summarize.'],
      threat_level: 'LOW',
      threat_score: 1,
    }
  }
  const bullets = titles.map((t) => (t.length > 120 ? t.slice(0, 117) + '...' : t))
  return {
    summary: bullets.join('\n'),
    bullets,
    threat_level: 'GUARDED',
    threat_score: 2,
  }
}

const PROMPT_PREFIX = `You are writing the "news of the day" summary for a situational-awareness dashboard. Use the following articles from the last 24 hours.

Your main job: Write a 1-3 paragraph narrative summary. Do NOT just list or regurgitate headlines. Synthesize what is actually happening: connect events, explain causes and consequences, and say why it matters to the reader. Write in clear, direct prose (like a brief editorial or intelligence brief), not bullet-point headlines.

Focus on: wars, military escalation, geopolitical tensions, intelligence developments, and major instability. Include implications (e.g. energy prices, supply chains, civil unrest) where relevant.

Output format (use these exact section labels):

Daily Summary:
[Write 1 to 3 paragraphs here. Each paragraph should be 2-5 sentences. Synthesize and explain; do not simply repeat headline phrases.]

Threat Summary:
- 3 to 5 short bullet points (optional; only the most critical follow-ups).

Threat Level:
Return one of: LOW, GUARDED, ELEVATED, HIGH, CRITICAL. Also output a numeric value from 1-5 (1=LOW, 5=CRITICAL).

Articles:

`

/**
 * Main: get tagged events from last 24h, cluster, call Ollama, parse. On failure use title fallback.
 */
async function getThreatSummary() {
  const since = Date.now() - 24 * 60 * 60 * 1000
  let rows = getEventsWithAnyTagInTimeRange(THREAT_TAGS, since, 150)
  if (rows.length === 0) {
    rows = getEvents(150, since, null)
  }
  const articles = rows.map((r) => ({
    id: r.id,
    title: r.title || '',
    description: r.description || '',
    source: r.source || 'Unknown',
    raw_data: r.raw_data,
  }))
  const clustered = clusterArticles(articles)
  const sources = [...new Set(clustered.map((a) => a.source))].slice(0, 20)

  if (clustered.length === 0) {
    return {
      summary: 'No recent articles or events in the last 24 hours. The threat summary uses the same event pool as the search bar; run a map or feed load so the API has ingested news and OSINT first.',
      narrative: '',
      bullets: ['No recent geopolitical or conflict-related events to summarize.'],
      threat_level: 'LOW',
      threat_score: 1,
      sources: [],
      timestamp: new Date().toISOString(),
      fallback: true,
    }
  }

  const inputText = buildInputFromArticles(clustered)
  const fullPrompt = PROMPT_PREFIX + inputText
  const rawResponse = await callThreatModel(fullPrompt)
  const parsed = rawResponse ? parseThreatResponse(rawResponse) : null

  if (parsed && parsed.summary) {
    return {
      summary: parsed.summary,
      narrative: parsed.narrative || '',
      bullets: parsed.bullets.length ? parsed.bullets : [],
      threat_level: parsed.threat_level,
      threat_score: parsed.threat_score,
      sources,
      timestamp: new Date().toISOString(),
      fallback: false,
    }
  }

  const fallback = fallbackSummaryFromTitles(clustered)
  return {
    summary: fallback.summary,
    narrative: '',
    bullets: fallback.bullets,
    threat_level: fallback.threat_level,
    threat_score: fallback.threat_score,
    sources,
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
}
