// Generic Mapbox/MapLibre camera layer helper for non-React contexts.
// Usage:
//   const layer = createCameraLayer(map, { apiBase: 'http://localhost:3001' })
//   layer.start()
//   layer.stop()

export function createCameraLayer(map, { apiBase = 'http://localhost:3001' } = {}) {
  let timer = null
  const sourceId = 'camera-repo'
  const hiddenIds = new Set()

  const ensureLayer = () => {
    if (map.getSource(sourceId)) return
    map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 12,
    })
    map.addLayer({
      id: `${sourceId}-clusters`,
      type: 'circle',
      source: sourceId,
      filter: ['has', 'point_count'],
      paint: { 'circle-color': '#2563eb', 'circle-radius': ['step', ['get', 'point_count'], 18, 50, 24, 200, 30] },
    })
    map.addLayer({
      id: `${sourceId}-cluster-count`,
      type: 'symbol',
      source: sourceId,
      filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
      paint: { 'text-color': '#ffffff' },
    })
    map.addLayer({
      id: `${sourceId}-points`,
      type: 'symbol',
      source: sourceId,
      filter: ['!', ['has', 'point_count']],
      layout: { 'text-field': '📷', 'text-size': 14, 'text-allow-overlap': true },
      paint: { 'text-color': '#ffffff' },
    })
  }

  const toFeatureCollection = (rows) => ({
    type: 'FeatureCollection',
    features: (rows || []).map((c) => ({
      type: 'Feature',
      properties: c,
      geometry: { type: 'Point', coordinates: [Number(c.lon), Number(c.lat)] },
    })),
  })

  const fetchVisible = async () => {
    ensureLayer()
    const b = map.getBounds()
    const params = new URLSearchParams({
      minLat: String(b.getSouth()),
      maxLat: String(b.getNorth()),
      minLon: String(b.getWest()),
      maxLon: String(b.getEast()),
    })
    const [repoRes, seedRes] = await Promise.all([
      fetch(`${apiBase}/api/cameras?${params}`),
      fetch(`${apiBase}/api/seed-cameras?${params}`),
    ])
    const [repoRows, seedRows] = await Promise.all([repoRes.json(), seedRes.json()])
    const merged = [...(Array.isArray(seedRows) ? seedRows : []), ...(Array.isArray(repoRows) ? repoRows : [])]
    const dedup = new Map()
    merged.forEach((c) => {
      const key = String(c?.id || c?.stream || '')
      if (!key || hiddenIds.has(key)) return
      dedup.set(key, c)
    })
    const fc = toFeatureCollection(Array.from(dedup.values()))
    const src = map.getSource(sourceId)
    if (src) src.setData(fc)
  }

  const renderMedia = (props = {}) => {
    const stream = String(props.stream || '')
    const type = String(props.type || '').toLowerCase()
    const key = String(props.id || props.stream || '')
    if (!stream) return '<p>No stream URL available.</p>'
    if (type === 'hls') {
      return `<video controls autoplay muted playsinline style="width:100%;max-width:280px;border-radius:8px;" onerror="window.__cameraHide && window.__cameraHide('${key}')"><source src="${stream}" type="application/x-mpegURL"></video>`
    }
    if (type === 'jpeg' || type === 'mjpeg') {
      return `<img src="${stream}" alt="Camera stream" style="width:100%;max-width:280px;border-radius:8px;" onerror="window.__cameraHide && window.__cameraHide('${key}')" />`
    }
    if (type === 'rtsp') {
      return `<p>RTSP stream detected. Relay required.<br /><code>${stream}</code></p>`
    }
    return `<a href="${stream}" target="_blank" rel="noopener noreferrer">Open stream</a>`
  }

  const wirePopups = () => {
    if (map.__cameraPopupsWired) return
    map.__cameraPopupsWired = true
    window.__cameraHide = (key) => {
      if (!key) return
      hiddenIds.add(String(key))
      fetchVisible().catch(() => {})
    }
    map.on('click', `${sourceId}-points`, (e) => {
      const f = e.features?.[0]
      if (!f) return
      const props = f.properties || {}
      const html = `<div style="min-width:220px"><h4 style="margin:.2rem 0 .4rem">${props.name || 'Camera'}</h4>${renderMedia(props)}</div>`
      // eslint-disable-next-line no-undef
      new maplibregl.Popup({ closeButton: true, closeOnClick: true })
        .setLngLat(f.geometry.coordinates)
        .setHTML(html)
        .addTo(map)
    })
    map.on('error', () => {})
  }

  const start = () => {
    ensureLayer()
    wirePopups()
    fetchVisible().catch(() => {})
    timer = setInterval(() => fetchVisible().catch(() => {}), 60000)
  }

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = null
  }

  return { start, stop, fetchVisible }
}

