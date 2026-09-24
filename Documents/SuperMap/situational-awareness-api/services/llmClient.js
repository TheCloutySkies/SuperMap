/**
 * Shared LLM client for Groq (hosted) and Ollama (local).
 * Used by threat summary and AI item tagging / risk scoring.
 * Graceful: returns null when no key / unreachable — callers must fall back.
 */

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_THREAT_MODEL || 'tinyllama:1.1b'
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_THREAT_TIMEOUT_MS) || 90 * 1000
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim()
const GROQ_MODEL = process.env.GROQ_THREAT_MODEL || 'llama-3.1-8b-instant'
const GROQ_BACKUP_MODEL = process.env.GROQ_THREAT_BACKUP_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct'
const GROQ_TIMEOUT_MS = Number(process.env.GROQ_THREAT_TIMEOUT_MS) || 60 * 1000

// Threat-summary call budget (strict — summaries are expensive / rare)
const GROQ_MAX_CALLS_PER_24H = Math.max(1, parseInt(process.env.GROQ_THREAT_MAX_CALLS_PER_24H, 10) || 28)
const GROQ_MIN_INTERVAL_MS = Math.max(60 * 1000, parseInt(process.env.GROQ_THREAT_MIN_INTERVAL_MS, 10) || 55 * 60 * 1000)

// Tagging/scoring budget (lighter, separate from threat summary)
const GROQ_TAG_MAX_CALLS_PER_24H = Math.max(1, parseInt(process.env.GROQ_TAG_MAX_CALLS_PER_24H, 10) || 48)
const GROQ_TAG_MIN_INTERVAL_MS = Math.max(5 * 1000, parseInt(process.env.GROQ_TAG_MIN_INTERVAL_MS, 10) || 30 * 1000)

const threatTimestamps = []
let lastThreatCall = 0
const tagTimestamps = []
let lastTagCall = 0

function prune(timestamps, windowMs) {
  const cutoff = Date.now() - windowMs
  while (timestamps.length > 0 && timestamps[0] < cutoff) timestamps.shift()
}

function canCallThreat() {
  prune(threatTimestamps, 24 * 60 * 60 * 1000)
  if (threatTimestamps.length >= GROQ_MAX_CALLS_PER_24H) return false
  if (lastThreatCall > 0 && Date.now() - lastThreatCall < GROQ_MIN_INTERVAL_MS) return false
  return true
}

function recordThreatCall() {
  lastThreatCall = Date.now()
  threatTimestamps.push(lastThreatCall)
}

function canCallTag() {
  prune(tagTimestamps, 24 * 60 * 60 * 1000)
  if (tagTimestamps.length >= GROQ_TAG_MAX_CALLS_PER_24H) return false
  if (lastTagCall > 0 && Date.now() - lastTagCall < GROQ_TAG_MIN_INTERVAL_MS) return false
  return true
}

function recordTagCall() {
  lastTagCall = Date.now()
  tagTimestamps.push(lastTagCall)
}

async function callOllama(prompt, { timeoutMs = OLLAMA_TIMEOUT_MS, maxTokens = 1024 } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.2, num_predict: maxTokens },
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

async function callGroq(prompt, { model = GROQ_MODEL, timeoutMs = GROQ_TIMEOUT_MS, maxTokens = 1024 } = {}) {
  if (!GROQ_API_KEY) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
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
        max_tokens: maxTokens,
        temperature: 0.2,
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

function hasLlmConfigured() {
  return Boolean(GROQ_API_KEY) || Boolean(OLLAMA_BASE)
}

/**
 * Threat-summary path: Groq (rate-limited) or Ollama.
 */
async function callThreatModel(prompt) {
  if (!GROQ_API_KEY) return callOllama(prompt)
  if (!canCallThreat()) return null
  const primary = await callGroq(prompt, { model: GROQ_MODEL })
  if (primary) {
    recordThreatCall()
    return primary
  }
  if (!canCallThreat()) return null
  const backup = await callGroq(prompt, { model: GROQ_BACKUP_MODEL })
  if (backup) {
    recordThreatCall()
    return backup
  }
  return null
}

/**
 * Per-item / batch tagging path: lighter Groq budget, or Ollama.
 * Returns null when rate-limited or unreachable — callers use heuristics.
 */
async function callTagModel(prompt, { maxTokens = 800 } = {}) {
  if (!GROQ_API_KEY) return callOllama(prompt, { maxTokens, timeoutMs: 45 * 1000 })
  if (!canCallTag()) return null
  const primary = await callGroq(prompt, { model: GROQ_MODEL, maxTokens, timeoutMs: 45 * 1000 })
  if (primary) {
    recordTagCall()
    return primary
  }
  if (!canCallTag()) return null
  const backup = await callGroq(prompt, { model: GROQ_BACKUP_MODEL, maxTokens, timeoutMs: 45 * 1000 })
  if (backup) {
    recordTagCall()
    return backup
  }
  return null
}

module.exports = {
  hasLlmConfigured,
  callThreatModel,
  callTagModel,
  callOllama,
  callGroq,
  GROQ_API_KEY,
}
