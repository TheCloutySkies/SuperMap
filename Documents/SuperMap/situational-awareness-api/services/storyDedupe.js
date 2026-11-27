/**
 * One story, one row — the API half.
 *
 * This is the same file as `SuperMap/src/lib/storyDedupe.js`, written as a
 * CommonJS module (the way `glowieRelevance` is mirrored). The collector builds
 * the news snapshot through `services/news.js`, so the published payload is
 * collapsed there as well: every visitor, the home widgets and the console then
 * read a list where one story appears once.
 *
 * Two items are the same story when:
 *   - their article links are the same page, or
 *   - their titles are the same once the outlet tail is removed, or
 *   - they share three or more distinctive words that make up at least half of
 *     the shorter headline, or two words that all but fill a long one.
 */

/** Words that say nothing about which story a headline is. */
const FILLER = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'will', 'would', 'could', 'should',
  'has', 'have', 'had', 'are', 'was', 'were', 'is', 'be', 'been', 'being', 'not', 'but', 'its',
  'his', 'her', 'they', 'their', 'them', 'there', 'these', 'those', 'after', 'before', 'amid',
  'over', 'into', 'about', 'under', 'more', 'most', 'top', 'first', 'last', 'next', 'now',
  'just', 'still', 'again', 'also', 'may', 'might', 'can', 'one', 'two', 'three', 'other',
  'some', 'many', 'all', 'any', 'out', 'off', 'down', 'final', 'says', 'said', 'say', 'told', 'tells',
  'new', 'news', 'report', 'reports', 'reported', 'update', 'updates', 'latest', 'live',
  'breaking', 'watch', 'video', 'exclusive', 'why', 'how', 'what', 'who', 'when', 'where',
  'today', 'yesterday', 'week', 'year', 'day', 'days', 'time', 'times', 'here', 'whats',
  'photos', 'photo', 'ahead', 'back', 'eyes', 'face', 'faces', 'amid', 'per', 'via', 'vs',
])

/** "… - The Guardian", "… | Reuters", "… — Bloomberg.com" at the end of a title. */
const OUTLET_TAIL = /(?:\s+[-–—|]\s+[^-–—|]{2,60})+\s*$/

/** Query junk that does not change which article a link points at. */
const URL_NOISE = /^(utm_[a-z]+|s|ref|ref_src|source|cmpid|fbclid|gclid|at_[a-z]+|ocid)$/i

function plainTitle(value) {
  return String(value || '')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A title with the outlet tail and every decorative character removed. */
function storyTitleKey(value) {
  let title = plainTitle(value)
  // Some headlines carry two tails: "- The Guardian" then "| Reuters".
  for (let pass = 0; pass < 2; pass += 1) title = title.replace(OUTLET_TAIL, '')
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** The page a headline points at, with tracking and ordering dropped. */
function storyUrlKey(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  let url
  try {
    url = new URL(raw)
  } catch {
    return raw.toLowerCase().replace(/\/+$/, '')
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase()
  const params = [...url.searchParams.keys()]
    .filter((key) => !URL_NOISE.test(key))
    .sort()
  return `${host}${path}${params.length ? `?${params.join('&')}` : ''}`
}

/** Distinctive words of a headline, singularised so "storm"/"storms" match. */
function storyTokens(value) {
  const tokens = new Set()
  for (const word of storyTitleKey(value).split(' ')) {
    if (word.length < 3 || FILLER.has(word)) continue
    tokens.add(word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word)
  }
  return tokens
}

/** Do these two sets of words describe the same story? */
function sameStoryTokens(a, b) {
  const shortest = Math.min(a.size, b.size)
  if (shortest < 3) return false
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  const containment = shared / shortest
  if (shared >= 3 && containment >= 0.5) return true
  return shared >= 2 && shortest >= 7 && containment >= 0.65
}

/**
 * One-off outcomes. Two reports that name the same outcome — an election count,
 * a court ruling, a summit — are the same story even when every outlet worded
 * its headline differently, which is exactly what a country's big news day
 * looks like. Words here are never enough on their own: a merge also needs two
 * shared headline words, so a country and a topic alone group nothing.
 */
const DECISION = new Set([
  'election', 'vote', 'poll', 'ballot', 'referendum', 'recount', 'result', 'count',
  'majority', 'coalition', 'parliament', 'seat', 'verdict', 'ruling', 'sentence',
  'appoint', 'resign', 'summit', 'deal', 'ceasefire', 'truce', 'launch',
])

/** Two outlets report one outcome inside this window, or not at all. */
const STORY_WINDOW_MS = 12 * 60 * 60 * 1000

/**
 * Two headlines about the same one-off outcome: three shared words, at least one
 * of them a decision word, inside a twelve-hour window.
 */
function sameDecision(aTokens, bTokens, aAt, bAt) {
  if (aAt != null && bAt != null && Math.abs(aAt - bAt) > STORY_WINDOW_MS) return false
  let shared = 0
  let decision = 0
  for (const word of aTokens) {
    if (!bTokens.has(word)) continue
    shared += 1
    if (DECISION.has(word)) decision += 1
  }
  return shared >= 3 && decision >= 1
}

function timeOf(item) {
  const at = Date.parse(item?.pubDate || item?.date || item?.publishedAt || item?.timestamp || '')
  return Number.isFinite(at) ? at : null
}

function richness(item, getTitle, getLink) {
  // A Google News row is a mirror of an outlet's own article: same story, a
  // clunkier title and an extra hop before the reader reaches it, so the
  // outlet's own row wins when both carry the story.
  const aggregator = /google news/i.test(String(item?.source || ''))
  const image = String(item?.image || item?.thumbnail || item?.urlToImage || '')
  const hasImage = /^https?:/i.test(image) && !image.includes('google.com/s2/favicons')
  const body = String(item?.description || item?.contentSnippet || item?.content || '')
  return [
    aggregator ? 0 : 1,
    hasImage ? 1 : 0,
    body.length,
    String(getLink(item) || '').length ? 1 : 0,
    Date.parse(item?.pubDate || item?.date || '') || 0,
    // Last: the shorter headline, which is the outlet's own and not a mirror's.
    -String(getTitle(item) || '').length,
  ]
}

function richerThan(candidate, incumbent, getTitle, getLink) {
  const a = richness(candidate, getTitle, getLink)
  const b = richness(incumbent, getTitle, getLink)
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

/**
 * Collapse the copies of one story, keeping the richest copy at the position the
 * first copy held, so the order of the list does not otherwise change.
 */
function dedupeStories(items, options = {}) {
  const getTitle = options.getTitle || ((item) => item?.title)
  const getLink = options.getLink || ((item) => item?.link || item?.url)
  const list = Array.isArray(items) ? items : []
  const byUrl = new Map()
  const byTitle = new Map()
  const kept = []

  for (const item of list) {
    const url = storyUrlKey(getLink(item))
    const title = storyTitleKey(getTitle(item))
    // The same page twice, or the same headline twice, is never worth two rows.
    const twin = (url && byUrl.get(url)) || (title && byTitle.get(title)) || null
    if (twin) {
      if (richerThan(item, twin.item, getTitle, getLink)) twin.item = item
      if (url) byUrl.set(url, twin)
      if (title) byTitle.set(title, twin)
      continue
    }
    const tokens = storyTokens(getTitle(item))
    const at = timeOf(item)
    const story = kept.find((entry) => sameStoryTokens(tokens, entry.tokens))
      || kept.find((entry) => entry.members.some((member) => sameDecision(tokens, member.tokens, at, member.at)))
      || null
    if (story) {
      if (richerThan(item, story.item, getTitle, getLink)) story.item = item
      story.members.push({ at, tokens })
      if (url) byUrl.set(url, story)
      if (title) byTitle.set(title, story)
      continue
    }
    const entry = { item, url, title, tokens, members: [{ at, tokens }] }
    if (url) byUrl.set(url, entry)
    if (title) byTitle.set(title, entry)
    kept.push(entry)
  }

  return kept.map((entry) => entry.item)
}

module.exports = {
  dedupeStories,
  sameDecision,
  sameStoryTokens,
  storyTokens,
  storyTitleKey,
  storyUrlKey,
}
