/**
 * Registry for the ten keyless console sources.
 *
 * One entry = one upstream family, one snapshot file, one cache namespace.
 * Everything here is additive: the strategic registry and the collector's
 * existing shape are untouched, and the collector imports this list so the
 * source names cannot drift apart.
 */
const abuseCh = require('./abuseCh')
const ripestat = require('./ripestat')
const unhcr = require('./unhcr')
const nwss = require('./nwss')
const hpai = require('./hpai')
const usgsWater = require('./usgsWater')
const meteoalarm = require('./meteoalarm')
const advisories = require('./advisories')
const nasAirspace = require('./nasAirspace')
const cyclones = require('./cyclones')

const SOURCES = [
  {
    name: 'free-abuse-ch',
    key: 'abuse-ch',
    fetch: abuseCh.fetchAbuseCh,
    ttlSec: 2 * 60 * 60,
    gateHours: 2,
    timeoutMs: 120000,
  },
  {
    name: 'free-ripestat',
    key: 'ripestat',
    fetch: ripestat.fetchRipestat,
    ttlSec: 12 * 60 * 60,
    gateHours: 12,
    timeoutMs: 240000,
  },
  {
    name: 'free-unhcr',
    key: 'unhcr',
    fetch: unhcr.fetchUnhcr,
    ttlSec: 24 * 60 * 60,
    gateHours: 24,
    timeoutMs: 240000,
  },
  {
    name: 'free-nwss',
    key: 'nwss',
    fetch: nwss.fetchNwss,
    ttlSec: 24 * 60 * 60,
    gateHours: 24,
    timeoutMs: 90000,
  },
  {
    name: 'free-hpai',
    key: 'hpai',
    fetch: hpai.fetchHpai,
    ttlSec: 24 * 60 * 60,
    gateHours: 24,
    timeoutMs: 120000,
  },
  {
    name: 'free-usgs-water',
    key: 'usgs-water',
    fetch: usgsWater.fetchUsgsWater,
    ttlSec: 2 * 60 * 60,
    gateHours: 2,
    timeoutMs: 150000,
  },
  {
    name: 'free-meteoalarm',
    key: 'meteoalarm',
    fetch: meteoalarm.fetchMeteoalarm,
    ttlSec: 4 * 60 * 60,
    gateHours: 4,
    timeoutMs: 300000,
  },
  {
    name: 'free-advisories',
    key: 'advisories',
    fetch: advisories.fetchAdvisories,
    ttlSec: 6 * 60 * 60,
    gateHours: 6,
    timeoutMs: 300000,
  },
  {
    name: 'free-nas-airspace',
    key: 'nas-airspace',
    fetch: nasAirspace.fetchNasAirspace,
    ttlSec: 60 * 60,
    gateHours: 1,
    timeoutMs: 60000,
  },
  {
    name: 'free-cyclones',
    key: 'cyclones',
    fetch: cyclones.fetchCyclones,
    ttlSec: 2 * 60 * 60,
    gateHours: 2,
    timeoutMs: 60000,
    // No active storm is a valid answer outside the season.
    allowEmpty: true,
    optional: true,
  },
]

const BY_KEY = new Map(SOURCES.map((source) => [source.key, source]))
const BY_NAME = new Map(SOURCES.map((source) => [source.name, source]))

/** Optional tokens that improve throughput but are never required. */
function tokenStatus() {
  return {
    SOCRATA_APP_TOKEN: Boolean(String(process.env.SOCRATA_APP_TOKEN || '').trim()),
  }
}

module.exports = { SOURCES, BY_KEY, BY_NAME, tokenStatus }
