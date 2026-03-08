const axios = require('axios')
const { normalizeToEvent, ingestEvent, eventToFeature } = require('./ingest')

const WINDY_API = process.env.WINDY_API

async function getCameras(query = {}) {
  if (!WINDY_API) {
    return { type: 'FeatureCollection', features: [] }
  }
  const { lat, lon, radius = 50 } = query
  try {
    const url = `https://api.windy.com/api/webcams/v2/list?key=${WINDY_API}&limit=50`
    const params = {}
    if (lat != null && lon != null) {
      params.near = `${lat},${lon}`
      params.radius = String(radius)
    }
    const res = await axios.get(url, { params, timeout: 10000 })
    const data = res.data
    const cams = data.result?.webcams || []
    const events = []
    for (const c of cams) {
      const raw = {
        id: String(c.id),
        title: c.title,
        description: c.title,
        latitude: c.location?.latitude,
        longitude: c.location?.longitude,
        image: c.image?.current?.preview,
        stream: c.player?.live?.embed || c.player?.day?.embed || c.url?.current?.desktop || c.url?.current?.mobile || '',
      }
      const event = normalizeToEvent(raw, 'infrastructure', 'Windy')
      if (c.location?.longitude != null && c.location?.latitude != null) {
        event.lon = Number(c.location.longitude)
        event.lat = Number(c.location.latitude)
      }
      ingestEvent(event)
      events.push(event)
    }
    const features = events.map(eventToFeature).filter((f) => f.geometry)
    return { type: 'FeatureCollection', features }
  } catch (err) {
    console.warn('[cameras]', err.message)
    return { type: 'FeatureCollection', features: [] }
  }
}

module.exports = { getCameras }
