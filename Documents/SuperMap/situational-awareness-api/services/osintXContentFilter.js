/**
 * Filter OSINT X posts toward current events / geopolitical / military / intel.
 * Drops personal/lifestyle noise when it lacks intel signals.
 *
 * Tunable via env or per-request opts:
 *   OSINT_X_CONTENT_FILTER = off | balanced | strict   (default: balanced)
 *   OSINT_X_MIN_RISK       = 1–5                       (default: 1 balanced, 2 strict)
 *   OSINT_X_MIN_PRIORITY   = low | medium | high       (default: low)
 */

const PRIORITY_RANK = { high: 3, medium: 2, low: 1 }

const INTEL_TAGS = new Set([
  'military', 'conflict', 'drone', 'missile', 'explosion', 'strike', 'attack',
  'cyberattack', 'satellite', 'aircraft', 'nuclear', 'evacuation', 'security',
  'geopolitics', 'infrastructure', 'power', 'earthquake', 'osint', 'intel',
  'war', 'defense', 'defence', 'nato', 'sanctions', 'hostage',
])

const INTEL_KEYWORDS = [
  'war', 'conflict', 'invasion', 'strike', 'drone', 'missile', 'military', 'defense', 'defence',
  'nato', 'frontline', 'ukraine', 'russia', 'gaza', 'israel', 'iran', 'syria', 'yemen', 'taiwan',
  'china', 'north korea', 'osint', 'intel', 'intelligence', 'combat', 'shelling', 'airstrike',
  'ceasefire', 'sanction', 'crisis', 'geopolitic', 'bellingcat', 'refugee', 'humanitarian',
  'weapon', 'troop', 'battalion', 'brigade', 'artillery', 'tank', 'fighter jet', 'bomber',
  'nuclear', 'cyber', 'ransomware', 'hostage', 'evacuat', 'explosion', 'blast', 'casualt',
  'pentagon', 'kremlin', 'idf', 'hamas', 'hezbollah', 'putin', 'xi jinping', 'taiwan strait',
  'black sea', 'red sea', 'houthis', 'satellite', 'isr', 'recon', 'intercept', 'air defense',
  'air defence', 'ballistic', 'hypersonic', 'naval', 'warship', 'carrier', 'submarine',
]

const LIFESTYLE_DENY = [
  /\b(?:my|our)\s+(?:cat|dog|puppy|kitten|coffee|latte|brunch|breakfast|lunch|dinner|workout|gym|selfie|vacation|holiday)\b/i,
  /\b(?:good\s+morning|gm\s+everyone|happy\s+birthday|just\s+woke\s+up|date\s+night|selfie\s+time)\b/i,
  /\b(?:new\s+haircut|outfit\s+of\s+the\s+day|ootd|gym\s+selfie|foodie|recipe\s+of\s+the\s+day)\b/i,
  /\b(?:boyfriend|girlfriend|wedding\s+photos?|anniversary\s+dinner)\b/i,
  /\b(?:streaming\s+now|subscribe\s+to\s+my|check\s+out\s+my\s+(?:merch|onlyfans|patreon))\b/i,
  /\b(?:random\s+thoughts?|life\s+update|personal\s+update|day\s+in\s+my\s+life)\b/i,
]

function normalizeMode(raw) {
  const m = String(raw || '').trim().toLowerCase()
  if (m === 'off' || m === 'none' || m === '0' || m === 'false') return 'off'
  if (m === 'strict' || m === 'hard') return 'strict'
  return 'balanced'
}

function getDefaultOpts() {
  const mode = normalizeMode(process.env.OSINT_X_CONTENT_FILTER || 'balanced')
  const envMinRisk = parseInt(process.env.OSINT_X_MIN_RISK || '', 10)
  const minRisk = Number.isFinite(envMinRisk)
    ? Math.min(5, Math.max(1, envMinRisk))
    : (mode === 'off' ? 1 : 2)
  const minPriority = String(process.env.OSINT_X_MIN_PRIORITY || 'low').toLowerCase()
  return { mode, minRisk, minPriority: PRIORITY_RANK[minPriority] ? minPriority : 'low' }
}

function textOf(post) {
  return `${post.title || ''} ${post.content || ''} ${(post.tags || []).join(' ')}`.toLowerCase()
}

function hasIntelSignal(post) {
  const tags = Array.isArray(post.tags) ? post.tags : []
  for (const t of tags) {
    const key = String(t || '').toLowerCase().replace(/^risk-\d$/, '')
    if (INTEL_TAGS.has(key)) return true
  }
  const text = textOf(post)
  return INTEL_KEYWORDS.some((kw) => text.includes(kw))
}

function isLifestyleNoise(post) {
  const text = `${post.title || ''} ${post.content || ''}`
  return LIFESTYLE_DENY.some((re) => re.test(text))
}

function priorityOk(post, minPriority) {
  const rank = PRIORITY_RANK[post.priority] ?? 2
  const need = PRIORITY_RANK[minPriority] ?? 1
  return rank >= need
}

/**
 * Decide whether a post should appear in the curated feed.
 * @returns {{ keep: boolean, reason: string, relevance: number }}
 */
function assessOsintXPost(post, opts = {}) {
  const cfg = { ...getDefaultOpts(), ...opts }
  cfg.mode = normalizeMode(cfg.mode)

  if (cfg.mode === 'off') {
    return { keep: true, reason: 'filter-off', relevance: 1 }
  }

  if (!priorityOk(post, cfg.minPriority)) {
    return { keep: false, reason: 'priority-below-min', relevance: 0 }
  }

  const risk = post.risk_score != null ? Number(post.risk_score) : null
  const intel = hasIntelSignal(post)
  const lifestyle = isLifestyleNoise(post)
  const minRisk = Number(cfg.minRisk) || 1

  // Lifestyle without intel signal → drop
  if (lifestyle && !intel && !(risk != null && risk >= Math.max(minRisk, 3))) {
    return { keep: false, reason: 'lifestyle-noise', relevance: 0 }
  }

  if (cfg.mode === 'strict') {
    if (intel || (risk != null && risk >= Math.max(minRisk, 2))) {
      return { keep: true, reason: intel ? 'intel-signal' : 'risk-ok', relevance: intel ? 3 : 2 }
    }
    return { keep: false, reason: 'strict-no-signal', relevance: 0 }
  }

  // balanced: keep intel, keep risk>=minRisk, keep high-priority accounts even if soft
  if (intel) return { keep: true, reason: 'intel-signal', relevance: 3 }
  if (risk != null && risk >= minRisk) return { keep: true, reason: 'risk-ok', relevance: risk }
  if ((post.priority || '') === 'high' && !lifestyle) {
    return { keep: true, reason: 'high-priority-account', relevance: 1 }
  }
  // Soft / unclear with no intel signal — drop so random life doesn't dominate
  return { keep: false, reason: 'no-intel-signal', relevance: 0 }
}

/**
 * Filter a list of OSINT X posts.
 * @param {Array<object>} posts
 * @param {object} [opts]
 * @returns {{ posts: Array<object>, meta: object }}
 */
function filterOsintXPosts(posts, opts = {}) {
  const cfg = { ...getDefaultOpts(), ...opts }
  cfg.mode = normalizeMode(cfg.mode)
  const list = Array.isArray(posts) ? posts : []
  if (cfg.mode === 'off') {
    return {
      posts: list,
      meta: { mode: 'off', input: list.length, kept: list.length, dropped: 0 },
    }
  }

  const kept = []
  let dropped = 0
  const dropReasons = {}
  for (const post of list) {
    const a = assessOsintXPost(post, cfg)
    if (a.keep) {
      kept.push({ ...post, content_filter: a.reason, content_relevance: a.relevance })
    } else {
      dropped += 1
      dropReasons[a.reason] = (dropReasons[a.reason] || 0) + 1
    }
  }
  return {
    posts: kept,
    meta: {
      mode: cfg.mode,
      minRisk: cfg.minRisk,
      minPriority: cfg.minPriority,
      input: list.length,
      kept: kept.length,
      dropped,
      dropReasons,
    },
  }
}

module.exports = {
  filterOsintXPosts,
  assessOsintXPost,
  getDefaultOpts,
  hasIntelSignal,
  INTEL_KEYWORDS,
  INTEL_TAGS,
}
