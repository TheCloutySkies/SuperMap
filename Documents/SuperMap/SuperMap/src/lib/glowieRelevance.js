/**
 * Glowie Report brief: war, weather, OSINT/GEOINT, politics, technology, finance.
 * Keep this list aligned with situational-awareness-api/services/glowieRelevance.js.
 */

const OFF_BRIEF = [
  'premier league', 'champions league', 'world cup', 'super bowl', 'la liga', 'serie a', 'bundesliga',
  'formula 1', 'formula one', 'grand prix', 'world series', 'stanley cup', 'march madness',
  'nfl', 'nba', 'mlb', 'nhl', 'ufc', 'fifa', 'wimbledon', 'olympics', 'olympic',
  'touchdown', 'home run', 'quarterback', 'playoffs', 'playoff', 'goalkeeper', 'hat-trick',
  'soccer', 'basketball', 'baseball', 'hockey', 'cricket', 'athlete',
  'celebrity', 'hollywood', 'kardashian', 'red carpet', 'reality tv', 'reality show',
  'gossip', 'tabloid', 'box office', 'oscar', 'oscars', 'grammy', 'grammys',
  'actor', 'actress', 'movie star', 'film premiere', 'eurovision',
  'gay bar', 'nightclub', 'night club', 'strip club', 'horoscope',
]

const ON_BRIEF = [
  'war', 'conflict', 'invasion', 'troops', 'troop', 'soldier', 'soldiers', 'military', 'missile', 'drone',
  'airstrike', 'air strike', 'shelling', 'grenade', 'mine', 'mines', 'tanker', 'tankers',
  'ceasefire', 'nato', 'sanction', 'sanctions', 'embargo', 'coup', 'insurgent', 'terror', 'terrorist',
  'hostage', 'navy', 'army', 'weapon', 'nuclear', 'artillery', 'frontline', 'defense', 'defence',
  'intelligence', 'osint', 'geoint', 'espionage', 'surveillance', 'strike',
  'weather', 'storm', 'thunderstorm', 'hail', 'hurricane', 'typhoon', 'cyclone', 'tornado', 'earthquake',
  'wildfire', 'flood', 'tsunami', 'blizzard', 'drought', 'heatwave', 'landslide', 'volcano', 'forecast',
  'election', 'parliament', 'congress', 'senate', 'president', 'presidential', 'prime minister', 'diplomacy',
  'treaty', 'summit', 'minister', 'legislation', 'impeach', 'protest', 'white house', 'kremlin', 'ballot',
  'cyber', 'hack', 'ransomware', 'breach', 'malware', 'semiconductor', 'chip', 'satellite', 'spyware',
  'artificial intelligence', 'nasa', 'space',
  'market', 'stock', 'shares', 'economy', 'inflation', 'federal reserve', 'central bank', 'tariff',
  'recession', 'gdp', 'earnings', 'bond', 'currency', 'pipeline', 'oil', 'trade',
  'ukraine', 'ukrainian', 'russia', 'russian', 'gaza', 'israel', 'israeli', 'iran', 'iranian',
  'china', 'chinese', 'taiwan', 'taiwanese', 'korea', 'korean', 'syria', 'syrian', 'yemen', 'yemeni', 'sudan',
  'government', 'coalition', 'embassy', 'diplomat',
  'outbreak', 'pandemic', 'epidemic',
]

const STRONG_BRIEF = [
  'war', 'conflict', 'invasion', 'military', 'missile', 'drone', 'airstrike', 'air strike', 'ceasefire', 'nato',
  'sanction', 'sanctions', 'terror', 'terrorist', 'nuclear', 'intelligence', 'espionage', 'soldier', 'soldiers',
  'weather', 'hurricane', 'typhoon', 'tornado', 'earthquake', 'wildfire', 'flood', 'tsunami', 'thunderstorm',
  'election', 'congress', 'parliament', 'senate', 'diplomacy', 'presidential',
  'cyber', 'hack', 'ransomware', 'malware', 'semiconductor', 'satellite',
  'stock market', 'inflation', 'federal reserve', 'tariff', 'recession', 'oil',
]

function briefText(item) {
  return `${item?.title || ''} ${item?.contentSnippet || item?.description || ''}`.toLowerCase()
}

function briefHit(text, kw) {
  const k = String(kw).toLowerCase()
  if (!k) return false
  if (k.includes(' ')) return text.includes(k)
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

function anyHit(text, list) {
  return list.some((kw) => briefHit(text, kw))
}

export function isGlowieRelevant(item) {
  const title = `${item?.title || ''}`.toLowerCase()
  const blob = briefText(item)
  if (!title.trim()) return false
  const off = anyHit(blob, OFF_BRIEF)
  const strongTitle = anyHit(title, STRONG_BRIEF)
  if (off && !strongTitle) return false
  const category = String(item?.category || '').toLowerCase()
  if (['business', 'technology', 'weather', 'politics'].includes(category) && !off) return true
  return anyHit(title, ON_BRIEF) || strongTitle
}
