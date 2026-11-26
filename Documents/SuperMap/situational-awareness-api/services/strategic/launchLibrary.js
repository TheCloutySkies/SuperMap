/**
 * Launch Library 2: the next orbital launches.
 * https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=5
 */
const { fetchWithEtag } = require('../snapshotHttp')

const ENDPOINT = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=6'

function launchOf(item) {
  const net = item?.net || item?.window_start || null
  const provider = item?.launch_service_provider?.name || ''
  const pad = item?.pad?.name || ''
  const padLocation = item?.pad?.location?.name || ''
  const mission = item?.mission?.name || item?.name || ''
  return {
    id: item?.id || null,
    name: String(item?.name || mission || 'Launch').trim(),
    mission,
    provider,
    pad,
    padLocation,
    status: item?.status?.abbrev || item?.status?.name || '',
    statusDescription: item?.status?.description || '',
    net,
    netMs: net ? Date.parse(net) : null,
    rocket: item?.rocket?.configuration?.name || item?.rocket?.configuration?.full_name || '',
    orbit: item?.mission?.orbit?.abbrev || item?.mission?.orbit?.name || '',
  }
}

async function fetchLaunchLibrary({ etag = null, lastModified = null } = {}) {
  const res = await fetchWithEtag(ENDPOINT, {
    timeoutMs: 30000,
    etag,
    lastModified,
    headers: { Accept: 'application/json' },
  })
  if (res.notModified) return res
  const rows = Array.isArray(res.data?.results) ? res.data.results : []
  const launches = rows
    .map(launchOf)
    .sort((a, b) => (a.netMs || Infinity) - (b.netMs || Infinity))
  return {
    ...res,
    data: { launches, count: launches.length, fetchedAt: new Date().toISOString(), source: 'thespacedevs.com' },
  }
}

module.exports = { fetchLaunchLibrary }
