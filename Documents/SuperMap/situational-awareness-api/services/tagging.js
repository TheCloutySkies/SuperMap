/**
 * Tag events from title + description using keywords and regex.
 * Tags: weather, wildfire, earthquake, conflict, aviation, shipping,
 * infrastructure, energy, transport, cyber, communications, environment, etc.
 */

const TAG_RULES = [
  { tag: 'earthquake', patterns: [/earthquake/i, /seismic/i, /magnitude\s*\d/i, /usgs/i] },
  { tag: 'wildfire', patterns: [/wildfire/i, /brush fire/i, /forest fire/i, /firms/i, /burn/i] },
  { tag: 'weather', patterns: [/storm/i, /hurricane/i, /cyclone/i, /flood/i, /tornado/i, /blizzard/i, /snow/i, /rain/i] },
  { tag: 'conflict', patterns: [/conflict/i, /military/i, /attack/i, /invasion/i, /war/i, /crisis/i, /cisa/i, /alert/i] },
  { tag: 'aviation', patterns: [/airport/i, /flight/i, /aircraft/i, /plane/i, /airline/i, /faa/i] },
  { tag: 'shipping', patterns: [/ship/i, /vessel/i, /maritime/i, /port/i, /cargo/i] },
  { tag: 'infrastructure', patterns: [/infrastructure/i, /power/i, /grid/i, /outage/i, /tower/i, /cell/i, /broadband/i] },
  { tag: 'energy', patterns: [/energy/i, /oil/i, /gas/i, /pipelines?/i, /nuclear/i, /renewable/i] },
  { tag: 'transport', patterns: [/transport/i, /rail/i, /highway/i, /transit/i, /logistics/i] },
  { tag: 'cyber', patterns: [/cyber/i, /hack/i, /breach/i, /ransomware/i, /malware/i] },
  { tag: 'communications', patterns: [/communications?/i, /internet/i, /outage/i, /telecom/i] },
  { tag: 'environment', patterns: [/environment/i, /pollution/i, /climate/i, /disaster/i, /fema/i] },
  { tag: 'disaster', patterns: [/disaster/i, /emergency/i, /declaration/i, /evacuation/i] },
  { tag: 'health', patterns: [/pandemic/i, /virus/i, /outbreak/i, /health\s*alert/i] },
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
