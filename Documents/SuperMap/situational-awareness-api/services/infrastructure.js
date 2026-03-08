const axios = require('axios')
const { normalizeToEvent, ingestEvent, eventToFeature } = require('./ingest')

const OPENCELLID_BASE = 'https://opencellid.org/api'
const PEERINGDB_API = 'https://www.peeringdb.com/api'

async function getTowers(query = {}) {
  const key = process.env.OPENCELL_KEY
  if (!key) {
    return { type: 'FeatureCollection', features: [] }
  }
  const { bbox, limit = 100 } = query
  if (!bbox) {
    return { type: 'FeatureCollection', features: [] }
  }
  const [w, s, e, n] = bbox.split(',').map(Number)
  if ([w, s, e, n].some(Number.isNaN)) {
    return { type: 'FeatureCollection', features: [] }
  }
  try {
    const url = `${OPENCELLID_BASE}/cell/getInArea?key=${key}&BBOX=${s},${w},${n},${e}&format=json`
    const res = await axios.get(url, { timeout: 15000 })
    const data = res.data
    const list = Array.isArray(data) ? data : (data && data.cells) ? data.cells : []
    const events = []
    for (const c of list.slice(0, limit)) {
      const raw = {
        id: String(c.cellid || c.id || `${c.mcc}-${c.mnc}-${c.lac}`),
        title: `Cell ${c.cellid || c.id}`,
        description: `MCC: ${c.mcc} MNC: ${c.mnc} LAC: ${c.lac}`,
        lat: c.lat,
        lon: c.lon,
        mcc: c.mcc,
        mnc: c.mnc,
        lac: c.lac,
      }
      const event = normalizeToEvent(raw, 'infrastructure', 'OpenCellID')
      if (c.lon != null && c.lat != null) {
        event.lon = Number(c.lon)
        event.lat = Number(c.lat)
      }
      ingestEvent(event)
      events.push(event)
    }
    const features = events.map(eventToFeature).filter((f) => f.geometry)
    return { type: 'FeatureCollection', features }
  } catch (err) {
    console.warn('[infrastructure getTowers]', err.message)
    return { type: 'FeatureCollection', features: [] }
  }
}

async function getPeeringDb(query = {}) {
  try {
    const res = await axios.get(`${PEERINGDB_API}/net`, { timeout: 10000 })
    const data = res.data?.data || []
    return data
  } catch (err) {
    console.warn('[infrastructure getPeeringDb]', err.message)
    return []
  }
}

module.exports = { getTowers, getPeeringDb }
