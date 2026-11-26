/**
 * Registry of strategic sources, so the collector and the routes share one list.
 *
 * Every entry is one thing to fetch and one file to publish. `kind` says whether
 * the payload is a map layer or a desk panel; `optional` means an upstream that
 * fails on its own (only `ucdp` needs a token) and must not be counted as site
 * staleness.
 */
const warspotting = require('./strategic/warspotting')
const celestrak = require('./strategic/celestrak')
const launchLibrary = require('./strategic/launchLibrary')
const ooni = require('./strategic/ooni')
const cisaKev = require('./strategic/cisaKev')
const ransomware = require('./strategic/ransomware')
const safecast = require('./strategic/safecast')
const sondehub = require('./strategic/sondehub')
const ucdp = require('./strategic/ucdp')
const iswBriefs = require('./strategic/iswBriefs')

const SOURCES = [
  { name: 'strategic-warspotting', kind: 'map', fetch: warspotting.fetchWarspotting, gateHours: 4 },
  { name: 'strategic-satellites', kind: 'map', fetch: celestrak.fetchCelestrak, gateHours: 4 },
  { name: 'strategic-launches', kind: 'panel', fetch: launchLibrary.fetchLaunchLibrary, gateHours: 4 },
  { name: 'strategic-briefs', kind: 'panel', fetch: iswBriefs.fetchIswBriefs, gateHours: 4, optional: true },
  { name: 'strategic-ucdp', kind: 'map', fetch: ucdp.fetchUcdp, gateHours: 4, optional: true },
  { name: 'strategic-censorship', kind: 'panel', fetch: ooni.fetchOoni, gateHours: 4 },
  { name: 'strategic-kev', kind: 'panel', fetch: cisaKev.fetchCisaKev, gateHours: 4 },
  { name: 'strategic-ransomware', kind: 'panel', fetch: ransomware.fetchRansomware, gateHours: 4 },
  { name: 'strategic-radiation', kind: 'map', fetch: safecast.fetchSafecast, gateHours: 4 },
  { name: 'strategic-balloons', kind: 'map', fetch: sondehub.fetchSondehub, gateHours: 2 },
]

const BY_NAME = new Map(SOURCES.map((source) => [source.name, source]))

/** Which optional keys exist, so boot can say what is gated without logging values. */
function keyStatus() {
  return {
    ucdp: ucdp.ucdpConfigured(),
  }
}

module.exports = { SOURCES, BY_NAME, keyStatus }
