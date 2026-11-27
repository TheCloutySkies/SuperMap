/**
 * Console signal engine checks — pure, offline, no browser.
 *
 *   node scripts/test-console-signals.mjs
 *
 * Covers determinism, the board cap, the convergence floor and pairs, the
 * advisory posture floor, and the never-shrink payload merge.
 */
import {
  BOARD_LIMIT,
  DOMAIN_ORDER,
  DOMAIN_TILE_CAP,
  buildBoardTiles,
  buildSignals,
  computeConvergence,
  computePosture,
  computeCharts,
} from '../src/lib/consoleSignals.js'
import { mergeConsolePayloads } from '../src/lib/consoleMerge.js'

const NOW = Date.UTC(2026, 10, 27, 2, 0, 0)
const ISO = (msAgo) => new Date(NOW - msAgo).toISOString()
let failures = 0

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
}

const signal = (domain, region, magnitude = 0.6, extra = {}) => ({
  domain,
  region,
  at: NOW - 60 * 60 * 1000,
  magnitude,
  weight: 1,
  confidence: 0.7,
  meta: {},
  ...extra,
})

/* ------------------------------------------------------------------ fixtures */

const payloads = {
  abuseCh: {
    items: [
      { feed: 'Feodo Tracker', label: 'QakBot', count: 4, online: 1 },
      { feed: 'OpenPhish', label: 'example-bank.top', count: 9 },
      { feed: 'Spamhaus DROP', label: 'within 45.0.0.0/8', count: 22 },
    ],
  },
  ripestat: {
    items: [{ cc: 'RU', v4: 39745, v6: 3290, asns: 4428, registered: 5778, routed: 5031, deltaPct: 0.2, observedAt: '2026-11-23T00:00:00' }],
  },
  unhcr: {
    items: [{ iso2: 'SD', iso3: 'SDN', name: 'Sudan', total: 12900343, refugees: 2820737, idps: 9139309, stateless: 0, changePct: -10, year: 2025 }],
  },
  nwss: {
    pathogen: 'SARS-CoV-2',
    items: [{ state: 'South Carolina', percentile: 93.4, ptc15d: -12, detectProp: 100, dateEnd: '2026-11-20' }],
  },
  hpai: {
    items: [{ state: 'North Dakota', recent: 2, total: 228, livestock: 31, wild: 197, birds: 320216, dairy: true, lastConfirmed: ISO(6 * 24 * 3600 * 1000) }],
  },
  usgsWater: {
    items: [{
      site: '0208111310', lat: 36.04, lon: -76.98, gage: 7.95, unit: 'ft', discharge: 934,
      dischargeUnit: 'ft^3/s', at: ISO(3600 * 1000), alert: 'Flood Warning', severity: 'severe',
      onset: ISO(3600 * 1000), expires: ISO(-3600 * 1000), rise: false,
    }],
  },
  meteoalarm: {
    items: [{
      country: 'IT', severity: 'severe', event: 'Orange Thunderstorm Warning', area: 'Lazio',
      onset: ISO(3600 * 1000), expires: ISO(-3600 * 1000), lat: 41.9, lon: 12.5,
      link: 'https://meteoalarm.org', certainty: 'Likely',
    }],
  },
  advisories: {
    counts: { 1: 85, 2: 82, 3: 27, 4: 24 },
    items: [{
      country: 'Ukraine', iso2: 'UA', iso3: 'UKR', level: 4, label: 'Do Not Travel',
      fcdoFloor: 3, agreement: 2, floor: 4, url: 'https://travel.state.gov', updated: ISO(24 * 3600 * 1000),
    }],
  },
  nasAirspace: {
    items: [{
      airport: 'HNL', airportName: 'Honolulu International', type: 'notice', reason: '!HNL 11/428',
      start: ISO(2 * 3600 * 1000), end: ISO(-3600 * 1000), issued: ISO(2 * 3600 * 1000), notam: 428,
      lat: 21.32, lon: -157.92,
    }],
  },
  cyclones: { items: [] },
  kev: {
    count: 1805,
    ransomwareLinked: 362,
    recent: [{ cve: 'CVE-2026-0001', vendor: 'Acme', product: 'Widget', name: 'x', added: '2026-11-20', ransomware: true }],
  },
  warspotting: {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: '1',
      properties: { type: 'Tank', model: 'T-72', status: 'destroyed', place: 'Pisky', date: '2026-11-20' },
      geometry: { type: 'Point', coordinates: [37.5, 48.5] },
    }],
  },
}

/* -------------------------------------------------------------------- checks */

console.log('\n1. signals build and are deterministic')
const first = buildSignals(payloads, NOW)
const second = buildSignals(payloads, NOW)
check('two runs are byte-identical', JSON.stringify(first) === JSON.stringify(second))
check('signals exist', first.length > 0, `${first.length}`)

const byDomain = {}
for (const entry of first) byDomain[entry.domain] = (byDomain[entry.domain] || 0) + 1
console.log('   per domain:', byDomain)

for (const domain of ['cyberinfra', 'network', 'displacement', 'health', 'outbreak', 'hydro', 'advisory', 'airspace']) {
  check(`domain ${domain} produced a signal`, Boolean(byDomain[domain]), '0')
}
check('meteoalarm folded into hazards', first.some((entry) => entry.domain === 'hazards' && entry.meta.kind === 'meteoalarm'))
check('every domain id is registered', first.every((entry) => DOMAIN_ORDER.includes(entry.domain)))
check('coordinates are valid', first.every((entry) => entry.lat == null || (Math.abs(entry.lat) <= 90 && Math.abs(entry.lon) <= 180)))

console.log('\n2. board cap')
const many = Array.from({ length: 500 }, (_value, index) => signal('hydro', 'americas', 0.4 + (index % 10) / 20))
const tiles = buildBoardTiles(many, 'significance')
const perDomain = tiles.reduce((acc, entry) => {
  acc[entry.domain] = (acc[entry.domain] || 0) + 1
  return acc
}, {})
check('tile list respects the board limit', tiles.length <= BOARD_LIMIT, `${tiles.length}`)
check('no domain exceeds its cap', Object.values(perDomain).every((count) => count <= DOMAIN_TILE_CAP), JSON.stringify(perDomain))

console.log('\n3. convergence floor and pairs')
const threeDomains = [
  ...['conflict', 'losses', 'hydro'].flatMap((domain) => [signal(domain, 'ukraine'), signal(domain, 'ukraine')]),
  signal('conflict', 'ukraine'),
]
check('three domains with five signals fire', computeConvergence(threeDomains, { now: NOW }).length === 1)
const twoDomains = [
  ...['conflict', 'losses'].flatMap((domain) => Array.from({ length: 6 }, () => signal(domain, 'ukraine'))),
]
check('two domains never fire', computeConvergence(twoDomains, { now: NOW }).length === 0)
const paired = computeConvergence([
  ...['cyber', 'cyberinfra', 'conflict'].flatMap((domain) => [signal(domain, 'mideast'), signal(domain, 'mideast')]),
], { now: NOW })[0]
check('cyber + cyberinfra cluster names the coincidence', Boolean(paired?.pairs?.includes('exploitation campaign in progress')), JSON.stringify(paired?.pairs))

console.log('\n4. advisory posture floor')
const advisoryOnly = [signal('advisory', 'ukraine', 0.9, { meta: { level: '4', agreement: '2' } })]
const posture = computePosture({ signals: advisoryOnly, convergence: [], threat: null, defcon: null, now: NOW })
check('Do-Not-Travel alone cannot read CALM', posture.score >= 55, `score ${posture.score}`)
check('floor is reported in inputs', posture.inputs.advisoryFloor >= 55, String(posture.inputs.advisoryFloor))

console.log('\n5. never-shrink merge')
const merged = mergeConsolePayloads({ a: { keep: true }, b: { keep: true } }, { a: null, c: { new: true } })
check('a null incoming payload keeps the old copy', merged.a?.keep === true)
check('a new payload is added', merged.c?.new === true)

console.log('\n6. charts')
const charts = computeCharts(payloads, first)
const chartIds = charts.map((chart) => chart.id)
check('malicious infrastructure chart exists', chartIds.includes('abuse-ch'), chartIds.join(','))
check('advisory chart exists', chartIds.includes('advisories'))
check('hazards chart stays first', chartIds[0] === 'hazards', chartIds.join(','))

console.log(`\n${failures === 0 ? 'PASS' : `FAIL (${failures})`}`)
process.exit(failures === 0 ? 0 : 1)
