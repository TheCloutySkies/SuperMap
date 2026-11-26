#!/usr/bin/env node
/**
 * Probe the strategic sources before any of them is built.
 *
 * Four endpoints in the original brief were already dead (NGA MSI, the FAA TFR
 * list, ISW's feed, Critical Threats'), so this prints what each source really
 * answers now. Anything red here does not go into the registry.
 *
 *   node scripts/probe-strategic.mjs
 *   UCDP_ACCESS_TOKEN=… node scripts/probe-strategic.mjs
 */
const UA = 'SuperMap/1.0 (+https://github.com/TheCloutySkies/SuperMap)'

const TARGETS = [
  ['warspotting', 'https://ukr.warspotting.net/api/losses/russia/'],
  ['celestrak stations', 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json'],
  ['celestrak military', 'https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=json'],
  ['launch library', 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=3'],
  ['ooni', 'https://api.ooni.io/api/v1/measurements?limit=5'],
  ['cisa kev', 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'],
  ['ransomware.live', 'https://api.ransomware.live/v2/recentvictims'],
  ['safecast', 'https://api.safecast.org/measurements.json?limit=5'],
  ['sondehub', 'https://api.v2.sondehub.org/sondes'],
  ['isw (google news)', 'https://news.google.com/rss/search?q=%22Institute+for+the+Study+of+War%22&hl=en-US&gl=US&ceid=US:en'],
  ['nhc storms', 'https://www.nhc.noaa.gov/CurrentStorms.json'],
]

function shapeOf(data) {
  if (Array.isArray(data)) return `array(${data.length}) ${JSON.stringify(data[0] || null).slice(0, 110)}`
  if (data && typeof data === 'object') {
    const keys = Object.keys(data).slice(0, 6)
    const first = keys[0] && data[keys[0]]
    return `object[${keys.join(',')}] ${JSON.stringify(first).slice(0, 90)}`
  }
  return String(data).slice(0, 80)
}

async function probe(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*', ...headers },
    signal: AbortSignal.timeout(20000),
  })
  const text = await res.text()
  let parsed = text
  try {
    parsed = JSON.parse(text)
  } catch { /* keep the text */ }
  return { status: res.status, type: res.headers.get('content-type'), body: parsed }
}

async function main() {
  let ok = 0
  let bad = 0
  for (const [name, url] of TARGETS) {
    try {
      const res = await probe(url)
      const healthy = res.status >= 200 && res.status < 300
      if (healthy) ok += 1
      else bad += 1
      console.log(`${healthy ? 'ok  ' : 'FAIL'} ${name.padEnd(20)} ${res.status} ${res.type || ''}`)
      if (healthy) console.log(`     ${shapeOf(res.body)}`)
    } catch (err) {
      bad += 1
      console.log(`FAIL ${name.padEnd(20)} ${err.message}`)
    }
  }

  const token = String(process.env.UCDP_ACCESS_TOKEN || '').trim()
  const end = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const ucdp = `https://ucdpapi.pcr.uu.se/api/gedevents/26.1?pagesize=3&StartDate=${start}&EndDate=${end}`
  try {
    const res = await probe(ucdp, token ? { 'x-ucdp-access-token': token } : {})
    const healthy = res.status === 200
    console.log(`${healthy ? 'ok  ' : 'FAIL'} ${'ucdp'.padEnd(20)} ${res.status}${healthy ? '' : ` ${String(res.body).slice(0, 70)}`}`)
    if (healthy) console.log(`     ${shapeOf(res.body)}`)
    if (!token) console.log('     (no UCDP_ACCESS_TOKEN: request it from the API maintainer, 3-5 working days)')
  } catch (err) {
    console.log(`FAIL ${'ucdp'.padEnd(20)} ${err.message}`)
  }

  console.log(`\n${ok} reachable, ${bad} not. Only reachable sources belong in services/strategicSources.js.`)
}

main().catch((err) => {
  console.error('[probe] fatal:', err.message)
  process.exit(1)
})
