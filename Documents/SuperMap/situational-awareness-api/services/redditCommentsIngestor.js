/**
 * Reddit Live Comment Intelligence Feed.
 * Fetches comments from high-value subreddits, detects signals, normalizes to events, and ingests into unified search.
 */

const axios = require('axios')
const { detectSignals } = require('./signalDetector')
const { extractPlaces, geocodePlace } = require('./geotagger')
const {
  insertOrIgnore,
  ensureEntity,
  linkEventTag,
  linkEventEntity,
} = require('../database')
const { addToIndex } = require('./searchIndex')
const { tagEvent } = require('./tagging')
const { extractEntities } = require('./entityExtraction')

const USER_AGENT = 'SuperMap-OSINT/1.0 (Reddit comment monitor; https://github.com/supermap)'
const { getSubreddits } = require('../config/userConfig')

/** Delay between subreddit requests to avoid Reddit 429 rate limit (aim for ~1 req/sec) */
const REDDIT_DELAY_MS = 2200

/** Freshness boost for signal score: &lt; 10 min → +50, &lt; 1 hour → +20 */
function freshnessBoost(createdUtc) {
  if (createdUtc == null) return 0
  const ageSec = Date.now() / 1000 - Number(createdUtc)
  if (ageSec < 10 * 60) return 50
  if (ageSec < 60 * 60) return 20
  return 0
}

/** signalScore = comment.score + (signals.length * 20) + freshnessBoost */
function signalScore(comment, signals) {
  const score = Number(comment.score) || 0
  const signalBonus = (signals && signals.length) ? signals.length * 20 : 0
  return score + signalBonus + freshnessBoost(comment.created_utc)
}

/**
 * Fetch comments from a subreddit via Reddit JSON API.
 * @param {string} subreddit
 * @returns {Promise<object[]>} Raw comment objects (Reddit data shape)
 */
async function fetchSubredditComments(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit}/comments.json?limit=100`
  try {
    const res = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': USER_AGENT },
      validateStatus: (s) => s === 200,
    })
    const data = res.data
    const children = data?.data?.children
    if (!Array.isArray(children)) return []
    return children
      .filter((c) => c && c.data && c.data.body)
      .map((c) => ({ ...c.data, _subreddit: subreddit }))
  } catch (err) {
    const is429 = err.response && err.response.status === 429
    if (is429) {
      console.warn(`[reddit-comments] ${subreddit}: rate limited (429)`)
    } else {
      console.warn(`[reddit-comments] ${subreddit}:`, err.message)
    }
    return []
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Fetch comments from all target subreddits.
 * Throttles requests to avoid Reddit 429 rate limit.
 * @returns {Promise<object[]>} Array of { id, type, subreddit, text, author, score, created, link, ... }
 */
async function fetchRedditComments() {
  const SUBREDDITS = getSubreddits()
  const results = []
  for (let i = 0; i < SUBREDDITS.length; i++) {
    if (i > 0) await delay(REDDIT_DELAY_MS)
    const sub = SUBREDDITS[i]
    const comments = await fetchSubredditComments(sub)
    for (const c of comments) {
      results.push({
        id: c.id,
        type: 'reddit_comment',
        subreddit: c._subreddit || sub,
        text: c.body || '',
        author: c.author || '[deleted]',
        score: c.score ?? 0,
        created: c.created_utc,
        link: c.permalink ? `https://reddit.com${c.permalink}` : null,
        _raw: c,
      })
    }
  }
  return results
}

/**
 * Normalize a Reddit comment to unified event schema and optionally geocode.
 * @param {object} comment - From fetchRedditComments
 * @param {string[]} signals - From detectSignals
 * @param {number} signalScoreNum
 */
function normalizeCommentToEvent(comment, signals, signalScoreNum) {
  const title = `r/${comment.subreddit}: ${(comment.text || '').slice(0, 80)}${comment.text && comment.text.length > 80 ? '…' : ''}`
  const description = (comment.text || '').slice(0, 2000)
  const timestamp = comment.created != null ? comment.created * 1000 : Date.now()
  const id = `reddit_${comment.id}`
  const raw = {
    subreddit: comment.subreddit,
    author: comment.author,
    score: comment.score,
    link: comment.link,
    signals,
    signalScore: signalScoreNum,
    confidence: 'low',
  }
  return {
    id,
    type: 'signal',
    title,
    description,
    lat: null,
    lon: null,
    timestamp,
    source: 'reddit',
    raw_data: JSON.stringify(raw),
  }
}

/**
 * Ingest a single comment event: DB, tags (signals + tagEvent), entities, search index.
 */
function ingestCommentEvent(event, extraTags) {
  insertOrIgnore(event)
  const text = [event.title, event.description].filter(Boolean).join(' ')
  const baseTags = tagEvent(event)
  const allTags = [...new Set([...(extraTags || []), ...baseTags])]
  allTags.forEach((t) => linkEventTag(event.id, t))
  const entities = extractEntities(text)
  for (const e of entities) {
    const id = ensureEntity(e.name, e.type)
    if (id) linkEventEntity(event.id, id)
  }
  addToIndex(event.type, {
    ...event,
    tags: allTags,
    entities: entities.map((e) => e.name),
  })
}

/**
 * Try to geocode comment text (e.g. "Explosion heard in Odessa") and set event lat/lon.
 */
async function tryGeocodeComment(event) {
  const text = [event.title, event.description].filter(Boolean).join(' ')
  const places = extractPlaces(text)
  for (const place of places) {
    const result = await geocodePlace(place)
    if (result && result.coords) {
      event.lon = result.coords[0]
      event.lat = result.coords[1]
      try {
        const raw = JSON.parse(event.raw_data || '{}')
        raw.geo = { place, confidence: 'low' }
        raw.country = result.countryCode || result.country || null
        raw.confidence = 'low'
        event.raw_data = JSON.stringify(raw)
      } catch (_) {}
      break
    }
  }
  return event
}

/**
 * Run full pipeline: fetch comments → detect signals → score → normalize → geocode (first place) → ingest.
 * Only ingests comments that have at least one signal, or optionally all (configurable).
 */
async function runRedditCommentsIngest(options = {}) {
  const { ingestAll = false } = options
  const comments = await fetchRedditComments()
  let ingested = 0
  for (const comment of comments) {
    const signals = detectSignals(comment)
    if (!ingestAll && signals.length === 0) continue
    const scoreNum = signalScore(comment, signals)
    recordSignalSpike(signals, comment.created ? comment.created * 1000 : Date.now())
    let event = normalizeCommentToEvent(comment, signals, scoreNum)
    event = await tryGeocodeComment(event)
    ingestCommentEvent(event, signals)
    ingested++
  }
  return { fetched: comments.length, ingested }
}

/** Optional: track keyword counts in last 5 min for early event detection */
const SPIKE_WINDOW_MS = 5 * 60 * 1000
const SPIKE_THRESHOLD = 20
const signalCounts = [] // { t, signal } entries

function recordSignalSpike(signals, timestamp) {
  if (!signals || !signals.length) return
  const t = timestamp || Date.now()
  signals.forEach((s) => signalCounts.push({ t, signal: s }))
  const cutoff = t - SPIKE_WINDOW_MS
  while (signalCounts.length && signalCounts[0].t < cutoff) signalCounts.shift()
  const bySignal = {}
  signalCounts.forEach(({ signal }) => { bySignal[signal] = (bySignal[signal] || 0) + 1 })
  Object.entries(bySignal).forEach(([sig, count]) => {
    if (count >= SPIKE_THRESHOLD) {
      console.warn(`[reddit-comments] SPIKE: ${sig} (${count} in 5m) — consider event alert`)
    }
  })
}

module.exports = {
  fetchRedditComments,
  fetchSubredditComments,
  signalScore,
  runRedditCommentsIngest,
}
