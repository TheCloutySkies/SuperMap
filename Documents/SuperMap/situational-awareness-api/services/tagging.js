/**
 * Tag events from title + description using keywords and regex.
 * Tags: weather, wildfire, earthquake, conflict, aviation, shipping,
 * infrastructure, energy, transport, cyber, communications, environment, etc.
 *
 * Prefer word boundaries on short tokens so "award" ≠ war, "reported" ≠ port.
 */

const TAG_RULES = [
  { tag: 'earthquake', patterns: [/\bearthquake\b/i, /\bseismic\b/i, /magnitude\s*\d/i, /\busgs\b/i] },
  { tag: 'wildfire', patterns: [/\bwildfire\b/i, /\bbrush fire\b/i, /\bforest fire\b/i, /\bfirms\b/i, /\bburn(?:ing|ed)?\b/i] },
  { tag: 'weather', patterns: [/\bstorm\b/i, /\bhurricane\b/i, /\bcyclone\b/i, /\bflood(?:ing|s)?\b/i, /\btornado\b/i, /\bblizzard\b/i, /\bsnow\b/i] },
  { tag: 'conflict', patterns: [/\bconflict\b/i, /\bmilitary\b/i, /\battack(?:s|ed|ing)?\b/i, /\binvasion\b/i, /\bwar\b/i, /\bcrisis\b/i, /\bcisa\b/i, /\bsecurity alert\b/i] },
  { tag: 'geopolitics', patterns: [/geopolitic/i, /\bnato\b/i, /\bsanction/i, /\bembargo\b/i, /\btreaty\b/i, /diplomac/i, /\bsummit\b/i, /\bescalation\b/i, /\btension\b/i] },
  { tag: 'war', patterns: [/\bwar\b/i, /\bcombat\b/i, /\bshelling\b/i, /\bairstrike\b/i, /\bdrone strike\b/i, /\bfrontline\b/i, /\bceasefire\b/i] },
  { tag: 'military', patterns: [/\bmilitary\b/i, /\barmed forces\b/i, /\bdefense\b/i, /\bdefence\b/i, /\bnavy\b/i, /\barmy\b/i, /\bair force\b/i, /\bpentagon\b/i] },
  { tag: 'osint', patterns: [/\bosint\b/i, /open source intelligence/i, /\bbellingcat\b/i, /geolocat/i] },
  { tag: 'intelligence', patterns: [/\bintelligence\b/i, /\bintel\b/i, /\bespionage\b/i, /\bcia\b/i, /\bmi6\b/i, /\bfsb\b/i] },
  { tag: 'security', patterns: [/national security/i, /homeland security/i, /threat level/i, /security alert/i] },
  { tag: 'aviation', patterns: [/\bairport\b/i, /\bflight\b/i, /\baircraft\b/i, /\bplane\b/i, /\bairline\b/i, /\bfaa\b/i] },
  { tag: 'shipping', patterns: [/\bship(?:s|ping)?\b/i, /\bvessel\b/i, /\bmaritime\b/i, /\bseaport\b/i, /\bcargo\b/i, /\bharbor\b/i, /\bharbour\b/i] },
  { tag: 'infrastructure', patterns: [/\binfrastructure\b/i, /\bpower\b/i, /\bgrid\b/i, /\boutage\b/i, /\btower\b/i, /\bbroadband\b/i] },
  { tag: 'energy', patterns: [/\benergy\b/i, /\boil\b/i, /\bgas\b/i, /\bpipelines?\b/i, /\bnuclear\b/i, /\brenewable\b/i] },
  { tag: 'transport', patterns: [/\btransport\b/i, /\brail\b/i, /\bhighway\b/i, /\btransit\b/i, /\blogistics\b/i] },
  { tag: 'cyber', patterns: [/\bcyber\b/i, /\bhack(?:ed|ing|er)?\b/i, /\bbreach\b/i, /\bransomware\b/i, /\bmalware\b/i] },
  { tag: 'communications', patterns: [/\bcommunications?\b/i, /\binternet\b/i, /\btelecom\b/i] },
  { tag: 'environment', patterns: [/\benvironment\b/i, /\bpollution\b/i, /\bclimate\b/i, /\bdisaster\b/i, /\bfema\b/i] },
  { tag: 'disaster', patterns: [/\bdisaster\b/i, /\bemergency\b/i, /\bdeclaration\b/i, /\bevacuat/i] },
  { tag: 'health', patterns: [/\bpandemic\b/i, /\bvirus\b/i, /\boutbreak\b/i, /health\s*alert/i] },
]

function tagEvent(event) {
  const text = [event.title, event.description].filter(Boolean).join(' ').toLowerCase()
  if (!text) return []
  const tags = new Set()
  for (const { tag, patterns } of TAG_RULES) {
    if (patterns.some((p) => p.test(text))) tags.add(tag)
  }
  return [...tags]
}

module.exports = { tagEvent, TAG_RULES }
