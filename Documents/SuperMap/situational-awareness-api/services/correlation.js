/**
 * Simple event correlation: cluster events by location, time window, and shared tags.
 * Used to link e.g. wildfire + power outage + news article.
 */

const turf = require('@turf/turf')

const DEFAULT_KM = 50
const DEFAULT_MS = 24 * 60 * 60 * 1000

function correlate(events, options = {}) {
  const radiusKm = options.radiusKm ?? DEFAULT_KM
  const timeWindowMs = options.timeWindowMs ?? DEFAULT_MS
  const clusters = []
  const used = new Set()

  const eventsWithCoords = events.filter((e) => e.lat != null && e.lon != null && e.timestamp != null)
  if (eventsWithCoords.length === 0) return clusters

  for (const event of eventsWithCoords) {
    if (used.has(event.id)) continue
    const center = turf.point([event.lon, event.lat])
    const ts = event.timestamp
    const tagSet = new Set((event.tagsStr || '').split(/\s+/).filter(Boolean))
    const cluster = [event]
    used.add(event.id)

    for (const other of eventsWithCoords) {
      if (used.has(other.id)) continue
      const pt = turf.point([other.lon, other.lat])
      const dist = turf.distance(center, pt, { units: 'kilometers' })
      const timeDiff = Math.abs((other.timestamp || 0) - ts)
      const otherTags = (other.tagsStr || '').split(/\s+/).filter(Boolean)
      const sharedTag = otherTags.some((t) => tagSet.has(t))
      if (dist <= radiusKm && timeDiff <= timeWindowMs && (sharedTag || dist < radiusKm / 2)) {
        cluster.push(other)
        used.add(other.id)
        otherTags.forEach((t) => tagSet.add(t))
      }
    }
    if (cluster.length >= 1) {
      clusters.push({
        id: `cluster_${event.id}`,
        events: cluster,
        center: [event.lon, event.lat],
        tagCount: tagSet.size,
      })
    }
  }
  return clusters
}

module.exports = { correlate }
