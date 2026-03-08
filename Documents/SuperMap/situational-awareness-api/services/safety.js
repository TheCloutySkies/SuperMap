const axios = require('axios')
const { normalizeToEvent, ingestEvent, eventToFeature } = require('./ingest')

const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query'
const OPENFEMA_URL = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries'

async function getEarthquakes(query = {}) {
  try {
    const params = { format: 'geojson', orderby: 'time-asc' }
    if (query.bbox) {
      const [w, s, e, n] = query.bbox.split(',').map(Number)
      Object.assign(params, { minlatitude: s, maxlatitude: n, minlongitude: w, maxlongitude: e })
    }
    const res = await axios.get(USGS_URL, { params, timeout: 10000 })
    const fc = res.data
    const features = fc.features || []
    const events = []
    for (const f of features) {
      const props = f.properties || {}
      const coords = f.geometry?.coordinates
      const raw = {
        id: f.id || props.id,
        title: props.title || `M${props.mag ?? ''} ${props.place || 'Earthquake'}`,
        description: props.place || '',
        time: props.time,
        lat: coords?.[1],
        lon: coords?.[0],
        confidence: 'high',
        ...props,
      }
      const event = normalizeToEvent(raw, 'disaster', 'USGS')
      if (coords?.length >= 2) {
        event.lat = coords[1]
        event.lon = coords[0]
      }
      ingestEvent(event)
      events.push(event)
    }
    return { type: 'FeatureCollection', features: events.map(eventToFeature).filter((f) => f.geometry) }
  } catch (err) {
    console.warn('[safety getEarthquakes]', err.message)
    return { type: 'FeatureCollection', features: [] }
  }
}

async function getDisasters(query = {}) {
  try {
    const params = { $top: 100 }
    const res = await axios.get(OPENFEMA_URL, { params, timeout: 10000 })
    const data = res.data?.DisasterDeclarationsSummaries || []
    const events = []
    for (const d of data) {
      const raw = {
        id: d.id,
        declarationTitle: d.declarationTitle,
        incidentType: d.incidentType,
        declarationType: d.declarationType,
        declaredDate: d.declaredDate,
        state: d.state,
        latitude: d.latitude,
        longitude: d.longitude,
        country: d.state ? 'US' : null,
        confidence: 'high',
      }
      const event = normalizeToEvent(raw, 'disaster', 'FEMA')
      if (d.longitude != null && d.latitude != null) {
        event.lon = Number(d.longitude)
        event.lat = Number(d.latitude)
      }
      ingestEvent(event)
      events.push(event)
    }
    const features = events.map(eventToFeature)
    return { type: 'FeatureCollection', features }
  } catch (err) {
    console.warn('[safety getDisasters]', err.message)
    return { type: 'FeatureCollection', features: [] }
  }
}

module.exports = { getEarthquakes, getDisasters }
