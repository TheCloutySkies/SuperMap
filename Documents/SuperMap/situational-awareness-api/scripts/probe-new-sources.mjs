#!/usr/bin/env node
/**
 * Probe the ten keyless console sources before any fetcher is trusted.
 *
 *   node scripts/probe-new-sources.mjs
 *
 * Writes probe-report.json beside this script. A source ships only if its probe
 * is ok; the report records the exact failures for the ones that are not.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const UA = 'GoodPalantir/1.0 (+https://goodpalantir.cloutyskies.org; contact: goodpalantir@cloutyskies.org)'
const HERE = path.dirname(fileURLToPath(import.meta.url))

const CANDIDATES = [
  // S1 GPSJam — expected to fail: the site is a client-side app with no data file.
  { name: 'gpsjam-index', url: 'https://gpsjam.org/', accept: 'text/html', source: 'GPSJam' },
  { name: 'gpsjam-data', url: 'https://gpsjam.org/data/latest.json', source: 'GPSJam' },

  // S2 abuse.ch — URLhaus is gone; Feodo, OpenPhish and Spamhaus answer.
  { name: 'urlhaus-download', url: 'https://urlhaus.abuse.ch/downloads/json_recent/', source: 'abuse.ch' },
  { name: 'urlhaus-api', url: 'https://urlhaus-api.abuse.ch/v1/urls/recent/', method: 'POST', body: '{}', source: 'abuse.ch' },
  { name: 'feodo', url: 'https://feodotracker.abuse.ch/downloads/ipblocklist.json', source: 'abuse.ch' },
  { name: 'openphish', url: 'https://openphish.com/feed.txt', accept: 'text/plain', source: 'abuse.ch' },
  { name: 'spamhaus-drop', url: 'https://www.spamhaus.org/drop/drop.txt', accept: 'text/plain', source: 'abuse.ch' },

  // S3 RIPEstat
  { name: 'ripestat-country', url: 'https://stat.ripe.net/data/country-resource-stats/data.json?resource=RU', source: 'RIPEstat' },
  { name: 'ripestat-asns', url: 'https://stat.ripe.net/data/country-asns/data.json?resource=RU', source: 'RIPEstat' },

  // S4 UNHCR
  { name: 'unhcr', url: 'https://api.unhcr.org/population/v1/population/?year=2024&coo_all=true&coa_all=true&limit=1000&page=1', source: 'UNHCR' },
  { name: 'hapi', url: 'https://hapi.humdata.org/api/v1/', source: 'OCHA HAPI' },

  // S5 CDC NWSS
  { name: 'nwss', url: 'https://data.cdc.gov/resource/2ew6-ywp6.json?$order=date_end%20DESC&$limit=2', source: 'CDC NWSS' },

  // S6 USDA APHIS
  { name: 'aphis-livestock', url: 'https://services1.arcgis.com/jWQlP64OuwDh6GGX/arcgis/rest/services/hpai_commercial_backyard_usa/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=2', source: 'APHIS' },
  { name: 'aphis-wildbirds', url: 'https://services1.arcgis.com/jWQlP64OuwDh6GGX/arcgis/rest/services/hpai_wildbirds_usa/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=2', source: 'APHIS' },

  // S7 USGS Water
  { name: 'usgs-water-gage', url: 'https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items?f=json&parameter_code=00065&limit=2', source: 'USGS Water' },
  { name: 'usgs-water-flow', url: 'https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items?f=json&parameter_code=00060&limit=2', source: 'USGS Water' },
  { name: 'nwps-gauges', url: 'https://api.water.noaa.gov/nwps/v1/gauges', source: 'NWPS (not used)' },

  // S8 MeteoAlarm
  { name: 'meteoalarm-europe', url: 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-europe', accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8', source: 'MeteoAlarm' },
  { name: 'meteoalarm-germany', url: 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-germany', accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8', source: 'MeteoAlarm' },
  { name: 'meteoalarm-france', url: 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-france', accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8', source: 'MeteoAlarm' },

  // S9 Advisories
  { name: 'state-advisories', url: 'https://travel.state.gov/_res/rss/TAsTWs.xml', accept: 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8', source: 'State Dept' },
  { name: 'fcdo-index', url: 'https://www.gov.uk/api/content/foreign-travel-advice', source: 'FCDO' },
  { name: 'fcdo-ukraine', url: 'https://www.gov.uk/api/content/foreign-travel-advice/ukraine', source: 'FCDO' },

  // S10 FAA — TFR has no JSON; NAS airport events do.
  { name: 'faa-tfr-root', url: 'https://tfr.faa.gov/', accept: 'text/html', source: 'FAA TFR' },
  { name: 'faa-tfr-list', url: 'https://tfr.faa.gov/tfr3/?page=list', accept: 'text/html', source: 'FAA TFR' },
  { name: 'faa-nas-events', url: 'https://nasstatus.faa.gov/api/airport-events', source: 'FAA NAS' },

  // S11 JTWC / NHC
  { name: 'jtwc', url: 'https://www.metoc.navy.mil/jtwc/rss/jtwc.rss', accept: 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8', source: 'JTWC' },
  { name: 'nhc', url: 'https://www.nhc.noaa.gov/CurrentStorms.json', source: 'NHC' },
]

async function probe(candidate) {
  const started = Date.now()
  try {
    const res = await fetch(candidate.url, {
      method: candidate.method || 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: candidate.accept || 'application/json',
        ...(candidate.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: candidate.body,
      signal: AbortSignal.timeout(20000),
    })
    const text = await res.text()
    let sampleKeys = null
    try {
      const parsed = JSON.parse(text)
      sampleKeys = Array.isArray(parsed) ? `array[${parsed.length}]` : Object.keys(parsed).slice(0, 10)
    } catch {
      sampleKeys = text.replace(/\s+/g, ' ').slice(0, 90)
    }
    return {
      name: candidate.name,
      source: candidate.source,
      url: candidate.url,
      status: res.status,
      contentType: res.headers.get('content-type'),
      bytes: Buffer.byteLength(text),
      ms: Date.now() - started,
      sampleKeys,
      // NHC answers `{activeStorms:[]}` in a quiet season: that is a pass.
      ok: res.ok && (Buffer.byteLength(text) > 200 || candidate.name === 'nhc'),
    }
  } catch (error) {
    return {
      name: candidate.name,
      source: candidate.source,
      url: candidate.url,
      status: 0,
      error: String(error?.message || error),
      ms: Date.now() - started,
      ok: false,
    }
  }
}

async function main() {
  const rows = []
  for (const candidate of CANDIDATES) rows.push(await probe(candidate))
  const table = rows.map(({ name, status, bytes, ok }) => ({ name, status, bytes, ok }))
  console.table(table)
  await fs.writeFile(path.join(HERE, 'probe-report.json'), `${JSON.stringify(rows, null, 2)}\n`, 'utf8')
  const ok = rows.filter((row) => row.ok).length
  console.log(`\n${ok}/${rows.length} reachable. Report: scripts/probe-report.json`)
}

main().catch((error) => {
  console.error('[probe] fatal:', error)
  process.exit(1)
})
