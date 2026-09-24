/**
 * Free, no-key hazard feeds for map layers and SA ingest.
 * NWS alerts, EMSC earthquakes, USGS elevated volcanoes, NHC tropical centers.
 */

const axios = require('axios')

const REQUEST_HEADERS = {
  'User-Agent': 'SuperMap/1.0 (situational awareness; https://github.com/supermap)',
  Accept: 'application/json, application/geo+json, application/xml, text/xml, */*',
}

function emptyFC() {
  return { type: 'FeatureCollection', features: [] }
}

function inBbox(lon, lat, bbox) {
  if (!bbox || bbox.length < 4) return true
  const [w, s, e, n] = bbox
  return lon >= w && lon <= e && lat >= s && lat <= n
}

function parseBbox(query = {}) {
  if (!query.bbox) return null
  const parts = String(query.bbox).split(',').map(Number)
  if (parts.length < 4 || parts.some((n) => !Number.isFinite(n))) return null
  return parts
}

/** NWS active alerts (GeoJSON). Prefer features with geometry; MapServer fallback for polygons. */
async function getNwsAlerts(query = {}) {
  const bbox = parseBbox(query)
  const features = []
  try {
    const res = await axios.get('https://api.weather.gov/alerts/active', {
      params: { status: 'actual', message_type: 'alert' },
      timeout: 15000,
      headers: { ...REQUEST_HEADERS, Accept: 'application/geo+json' },
    })
    const raw = Array.isArray(res.data?.features) ? res.data.features : []
    for (const f of raw) {
      const geom = f.geometry
      if (!geom) continue
      const props = f.properties || {}
      let lon = null
      let lat = null
      if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
        lon = geom.coordinates[0]
        lat = geom.coordinates[1]
      } else if (geom.type === 'Polygon' && geom.coordinates?.[0]?.[0]) {
        lon = geom.coordinates[0][0][0]
        lat = geom.coordinates[0][0][1]
      } else if (geom.type === 'MultiPolygon' && geom.coordinates?.[0]?.[0]?.[0]) {
        lon = geom.coordinates[0][0][0][0]
        lat = geom.coordinates[0][0][0][1]
      }
      if (lon != null && lat != null && !inBbox(lon, lat, bbox)) continue
      features.push({
        type: 'Feature',
        properties: {
          source: 'nws',
          event: props.event || 'Alert',
          headline: props.headline || props.event || 'NWS Alert',
          severity: props.severity || '',
          urgency: props.urgency || '',
          areaDesc: props.areaDesc || '',
          onset: props.onset || props.effective || '',
          ends: props.ends || props.expires || '',
          link: props.id || props['@id'] || 'https://www.weather.gov/',
          title: props.headline || props.event || 'NWS Alert',
        },
        geometry: geom,
      })
    }
  } catch (err) {
    console.warn('[hazards] NWS alerts:', err.message)
  }

  if (features.length < 5) {
    try {
      const res = await axios.get(
        'https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer/0/query',
        {
          params: {
            where: '1=1',
            outFields: 'prod_type,msg_type,phenom,url,expiration,onset,ends,issuance',
            returnGeometry: true,
            f: 'geojson',
            resultRecordCount: 200,
          },
          timeout: 15000,
          headers: REQUEST_HEADERS,
        }
      )
      const raw = Array.isArray(res.data?.features) ? res.data.features : []
      for (const f of raw) {
        if (!f.geometry) continue
        const p = f.properties || {}
        features.push({
          type: 'Feature',
          properties: {
            source: 'nws-wwa',
            event: p.prod_type || p.msg_type || 'Watch/Warning',
            headline: p.prod_type || 'NWS Watch/Warning',
            title: p.prod_type || 'NWS Watch/Warning',
            onset: p.onset || p.issuance || '',
            ends: p.ends || p.expiration || '',
            link: p.url || 'https://www.weather.gov/',
          },
          geometry: f.geometry,
        })
      }
    } catch (err) {
      console.warn('[hazards] NWS WWA MapServer:', err.message)
    }
  }

  return { type: 'FeatureCollection', features }
}

/** EMSC / Seismic Portal global quakes (GeoJSON). Complements USGS. */
async function getEmscEarthquakes(query = {}) {
  const bbox = parseBbox(query)
  try {
    const params = {
      format: 'json',
      limit: 100,
      minmag: query.minmag != null ? Number(query.minmag) : 4.0,
      orderby: 'time',
    }
    if (bbox) {
      params.minlon = bbox[0]
      params.minlat = bbox[1]
      params.maxlon = bbox[2]
      params.maxlat = bbox[3]
    }
    const res = await axios.get('https://www.seismicportal.eu/fdsnws/event/1/query', {
      params,
      timeout: 15000,
      headers: REQUEST_HEADERS,
    })
    const raw = Array.isArray(res.data?.features) ? res.data.features : []
    const features = raw
      .map((f) => {
        const p = f.properties || {}
        const coords = f.geometry?.coordinates
        if (!coords || coords.length < 2) return null
        const lon = Number(coords[0])
        const lat = Number(coords[1])
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
        if (!inBbox(lon, lat, bbox)) return null
        const mag = p.mag != null ? Number(p.mag) : null
        return {
          type: 'Feature',
          properties: {
            source: 'emsc',
            mag,
            place: p.flynn_region || p.auth || 'Earthquake',
            time: p.time || '',
            depth: p.depth != null ? Number(p.depth) : (coords[2] != null ? Number(coords[2]) : null),
            title: mag != null ? `M${mag} ${p.flynn_region || 'Earthquake'}` : (p.flynn_region || 'Earthquake'),
            link: p.unid
              ? `https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=${encodeURIComponent(p.source_id || p.unid)}`
              : 'https://www.emsc-csem.org/',
          },
          geometry: { type: 'Point', coordinates: [lon, lat] },
        }
      })
      .filter(Boolean)
    return { type: 'FeatureCollection', features }
  } catch (err) {
    console.warn('[hazards] EMSC:', err.message)
    return emptyFC()
  }
}

/** USGS elevated-activity volcano notices (no key). */
async function getUsgsVolcanoes(query = {}) {
  const bbox = parseBbox(query)
  try {
    const res = await axios.get('https://volcanoes.usgs.gov/vsc/api/volcanoApi/elevated', {
      timeout: 15000,
      headers: { ...REQUEST_HEADERS, Accept: 'application/json' },
    })
    const rows = Array.isArray(res.data) ? res.data : []
    const features = rows
      .map((v) => {
        const lat = Number(v.lat)
        const lon = Number(v.long ?? v.lon)
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
        if (!inBbox(lon, lat, bbox)) return null
        return {
          type: 'Feature',
          properties: {
            source: 'usgs-volcano',
            name: v.vName || 'Volcano',
            title: `${v.vName || 'Volcano'} · ${v.alertLevel || ''}/${v.colorCode || ''}`.trim(),
            alertLevel: v.alertLevel || '',
            colorCode: v.colorCode || '',
            threat: v.nvewsThreat || '',
            synopsis: (v.noticeSynopsis || '').slice(0, 500),
            link: v.noticeUrl || 'https://volcanoes.usgs.gov/',
          },
          geometry: { type: 'Point', coordinates: [lon, lat] },
        }
      })
      .filter(Boolean)
    return { type: 'FeatureCollection', features }
  } catch (err) {
    console.warn('[hazards] USGS volcanoes:', err.message)
    return emptyFC()
  }
}

const NHC_FEEDS = [
  { url: 'https://www.nhc.noaa.gov/index-at.xml', basin: 'Atlantic' },
  { url: 'https://www.nhc.noaa.gov/index-ep.xml', basin: 'Eastern Pacific' },
  { url: 'https://www.nhc.noaa.gov/index-cp.xml', basin: 'Central Pacific' },
]

function parseNhcCenter(raw) {
  if (!raw) return null
  const m = String(raw).trim().match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return [lon, lat]
}

/**
 * NHC nests cyclone metadata under <nhc:Cyclone> — rss-parser customFields miss it.
 * Parse Summary items from raw XML instead.
 */
function parseNhcCyclonesFromXml(xml, basin) {
  const features = []
  const itemRe = /<item>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1]
    if (!/<nhc:center>/i.test(block) && !/<nhc:Cyclone>/i.test(block)) continue
    const titleM = block.match(/<title>([\s\S]*?)<\/title>/i)
    const title = titleM ? titleM[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : 'Tropical cyclone'
    const centerM = block.match(/<nhc:center>([\s\S]*?)<\/nhc:center>/i)
    const nameM = block.match(/<nhc:name>([\s\S]*?)<\/nhc:name>/i)
    const typeM = block.match(/<nhc:type>([\s\S]*?)<\/nhc:type>/i)
    const windM = block.match(/<nhc:wind>([\s\S]*?)<\/nhc:wind>/i)
    const pressureM = block.match(/<nhc:pressure>([\s\S]*?)<\/nhc:pressure>/i)
    const headlineM = block.match(/<nhc:headline>([\s\S]*?)<\/nhc:headline>/i)
    const linkM = block.match(/<link>([\s\S]*?)<\/link>/i)
    const coords = parseNhcCenter(centerM ? centerM[1] : '')
    if (!coords) continue
    const [lon, lat] = coords
    const name = nameM ? nameM[1].trim() : title
    const stormType = typeM ? typeM[1].trim() : ''
    features.push({
      type: 'Feature',
      properties: {
        source: 'nhc',
        basin,
        name,
        type: stormType,
        wind: windM ? windM[1].trim() : '',
        pressure: pressureM ? pressureM[1].trim() : '',
        title: `${stormType ? `${stormType} ` : ''}${name} (${basin})`.trim(),
        headline: headlineM ? headlineM[1].trim() : '',
        link: linkM ? linkM[1].trim() : 'https://www.nhc.noaa.gov/',
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })
  }
  return features
}

/** NHC tropical cyclone centers from public RSS (nhc:Cyclone / nhc:center). */
async function getNhcTropical(query = {}) {
  const bbox = parseBbox(query)
  const features = []
  const seen = new Set()
  for (const feed of NHC_FEEDS) {
    try {
      const res = await axios.get(feed.url, { timeout: 12000, headers: REQUEST_HEADERS, responseType: 'text' })
      const xml = typeof res.data === 'string' ? res.data : String(res.data || '')
      for (const f of parseNhcCyclonesFromXml(xml, feed.basin)) {
        const [lon, lat] = f.geometry.coordinates
        if (!inBbox(lon, lat, bbox)) continue
        const key = `${feed.basin}|${f.properties.name}|${lon}|${lat}`
        if (seen.has(key)) continue
        seen.add(key)
        features.push(f)
      }
    } catch (err) {
      console.warn(`[hazards] NHC ${feed.basin}:`, err.message)
    }
  }
  return { type: 'FeatureCollection', features }
}

module.exports = {
  getNwsAlerts,
  getEmscEarthquakes,
  getUsgsVolcanoes,
  getNhcTropical,
}
