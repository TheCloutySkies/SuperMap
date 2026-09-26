import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

/** Country overview — metro pins only below this zoom. */
export const METRO_DETAIL_ZOOM = 7
/** Residence-level points uncluster further past this. */
export const RESIDENCE_ZOOM = 11

const US_CENTER = [-98.35, 39.5]
const US_ZOOM = 3.4

const STREET_STYLE = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap © CARTO',
    },
  },
  layers: [{ id: 'basemap', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 20 }],
}

function circlePolygon(lon, lat, radiusMiles, steps = 64) {
  const coords = []
  const latRad = (lat * Math.PI) / 180
  const milesPerDegLat = 69.0
  const milesPerDegLon = Math.max(0.01, Math.cos(latRad) * 69.0)
  for (let i = 0; i <= steps; i++) {
    const θ = (i / steps) * 2 * Math.PI
    const dLat = (radiusMiles * Math.sin(θ)) / milesPerDegLat
    const dLon = (radiusMiles * Math.cos(θ)) / milesPerDegLon
    coords.push([lon + dLon, lat + dLat])
  }
  return {
    type: 'Feature',
    properties: { kind: 'radius' },
    geometry: { type: 'Polygon', coordinates: [coords] },
  }
}

function metrosToGeoJSON(metros) {
  return {
    type: 'FeatureCollection',
    features: (metros || [])
      .filter((m) => Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lon)))
      .map((m) => ({
        type: 'Feature',
        properties: {
          id: String(m.id),
          name: m.name || m.id,
          count: Number(m.count) || 0,
        },
        geometry: {
          type: 'Point',
          coordinates: [Number(m.lon), Number(m.lat)],
        },
      })),
  }
}

function markersToGeoJSON(markers) {
  return {
    type: 'FeatureCollection',
    features: (markers || [])
      .filter((m) => Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lon)))
      .map((m) => ({
        type: 'Feature',
        properties: {
          id: String(m.id),
          risk: m.risk || '',
        },
        geometry: {
          type: 'Point',
          coordinates: [Number(m.lon), Number(m.lat)],
        },
      })),
  }
}

function ensureLayers(map) {
  if (!map.getSource('so-metros')) {
    map.addSource('so-metros', { type: 'geojson', data: metrosToGeoJSON([]) })
    map.addLayer({
      id: 'so-metros-glow',
      type: 'circle',
      source: 'so-metros',
      paint: {
        'circle-radius': 14,
        'circle-color': '#3d9a6a',
        'circle-opacity': 0.25,
      },
    })
    map.addLayer({
      id: 'so-metros-core',
      type: 'circle',
      source: 'so-metros',
      paint: {
        'circle-radius': 7,
        'circle-color': '#6ed9a0',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#0a1610',
      },
    })
    map.addLayer({
      id: 'so-metros-label',
      type: 'symbol',
      source: 'so-metros',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-offset': [0, 1.35],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: {
        'text-color': '#cfe8da',
        'text-halo-color': '#0a1610',
        'text-halo-width': 1.2,
      },
    })
  }

  if (!map.getSource('so-offenders')) {
    map.addSource('so-offenders', {
      type: 'geojson',
      data: markersToGeoJSON([]),
      cluster: true,
      clusterMaxZoom: RESIDENCE_ZOOM - 1,
      clusterRadius: 48,
    })
    map.addLayer({
      id: 'so-clusters',
      type: 'circle',
      source: 'so-offenders',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#c9a227',
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          14,
          25, 18,
          100, 24,
        ],
        'circle-opacity': 0.85,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#0a1610',
      },
    })
    map.addLayer({
      id: 'so-cluster-count',
      type: 'symbol',
      source: 'so-offenders',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-size': 11,
      },
      paint: {
        'text-color': '#0a1610',
      },
    })
    map.addLayer({
      id: 'so-points',
      type: 'circle',
      source: 'so-offenders',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          METRO_DETAIL_ZOOM, 3.5,
          RESIDENCE_ZOOM, 5,
          14, 7,
        ],
        'circle-color': '#e0b83a',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#0a1610',
      },
    })
  }

  if (!map.getSource('so-user')) {
    map.addSource('so-user', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer({
      id: 'so-user-radius-fill',
      type: 'fill',
      source: 'so-user',
      filter: ['==', ['get', 'kind'], 'radius'],
      paint: {
        'fill-color': '#3d9a6a',
        'fill-opacity': 0.12,
      },
    })
    map.addLayer({
      id: 'so-user-radius-line',
      type: 'line',
      source: 'so-user',
      filter: ['==', ['get', 'kind'], 'radius'],
      paint: {
        'line-color': '#6ed9a0',
        'line-width': 2,
        'line-opacity': 0.85,
      },
    })
    map.addLayer({
      id: 'so-user-dot',
      type: 'circle',
      source: 'so-user',
      filter: ['==', ['get', 'kind'], 'me'],
      paint: {
        'circle-radius': 8,
        'circle-color': '#4db8ff',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#e8fff2',
      },
    })
  }
}

function setLayerVisibility(map, showMetros, showOffenders) {
  const metroVis = showMetros ? 'visible' : 'none'
  const offVis = showOffenders ? 'visible' : 'none'
  for (const id of ['so-metros-glow', 'so-metros-core', 'so-metros-label']) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', metroVis)
  }
  for (const id of ['so-clusters', 'so-cluster-count', 'so-points']) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', offVis)
  }
}

function applySelectionPaint(map, selectedId) {
  if (!map.getLayer('so-points')) return
  const sel = selectedId != null ? String(selectedId) : ''
  map.setPaintProperty('so-points', 'circle-color', [
    'case',
    ['==', ['get', 'id'], sel],
    '#6ed9a0',
    '#e0b83a',
  ])
  map.setPaintProperty('so-points', 'circle-radius', [
    'case',
    ['==', ['get', 'id'], sel],
    9,
    [
      'interpolate', ['linear'], ['zoom'],
      METRO_DETAIL_ZOOM, 3.5,
      RESIDENCE_ZOOM, 5,
      14, 7,
    ],
  ])
}

function userLocationGeoJSON(userLocation, userRadiusMiles) {
  if (!userLocation || !Number.isFinite(userLocation.lat) || !Number.isFinite(userLocation.lon)) {
    return { type: 'FeatureCollection', features: [] }
  }
  const radius = Number(userRadiusMiles) || 10
  return {
    type: 'FeatureCollection',
    features: [
      circlePolygon(userLocation.lon, userLocation.lat, radius),
      {
        type: 'Feature',
        properties: { kind: 'me' },
        geometry: {
          type: 'Point',
          coordinates: [userLocation.lon, userLocation.lat],
        },
      },
    ],
  }
}

/**
 * Interactive MapLibre street map for Crime → Offenders.
 * Country view = metro pins; zoom / pin click = individual markers (clustered → residence).
 */
export default function SexOffendersMap({
  metros = [],
  markers = [],
  selectedId = null,
  selectedMetroId = '',
  userLocation = null,
  userRadiusMiles = 10,
  focusMode = 'country', // 'country' | 'metro' | 'nearby'
  onSelect,
  onSelectMetro,
  onZoomDetailChange,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const readyRef = useRef(false)
  const propsRef = useRef({})
  const lastFocusRef = useRef(null)

  propsRef.current = {
    metros,
    markers,
    selectedId,
    userLocation,
    userRadiusMiles,
    focusMode,
    onSelect,
    onSelectMetro,
    onZoomDetailChange,
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STREET_STYLE,
      center: US_CENTER,
      zoom: US_ZOOM,
      minZoom: 2,
      maxZoom: 18,
      attributionControl: true,
    })
    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), 'bottom-left')

    const pushDetail = () => {
      const z = map.getZoom()
      const detail = z >= METRO_DETAIL_ZOOM
      propsRef.current.onZoomDetailChange?.(detail, z)
    }

    map.on('load', () => {
      ensureLayers(map)
      readyRef.current = true
      const p = propsRef.current
      map.getSource('so-metros')?.setData(metrosToGeoJSON(p.metros))
      map.getSource('so-offenders')?.setData(markersToGeoJSON(p.markers))
      map.getSource('so-user')?.setData(userLocationGeoJSON(p.userLocation, p.userRadiusMiles))
      applySelectionPaint(map, p.selectedId)
      const showOff = (p.markers || []).length > 0 && map.getZoom() >= METRO_DETAIL_ZOOM
      setLayerVisibility(map, !showOff, showOff)
      pushDetail()
    })

    map.on('zoomend', pushDetail)

    map.on('click', 'so-metros-core', (e) => {
      const f = e.features?.[0]
      if (!f) return
      e.originalEvent?.stopPropagation?.()
      const id = f.properties?.id
      if (id) propsRef.current.onSelectMetro?.(id)
    })
    map.on('click', 'so-metros-glow', (e) => {
      const f = e.features?.[0]
      if (!f) return
      e.originalEvent?.stopPropagation?.()
      const id = f.properties?.id
      if (id) propsRef.current.onSelectMetro?.(id)
    })

    map.on('click', 'so-clusters', (e) => {
      const f = e.features?.[0]
      if (!f) return
      const clusterId = f.properties.cluster_id
      const source = map.getSource('so-offenders')
      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return
        map.easeTo({ center: f.geometry.coordinates, zoom })
      })
    })

    map.on('click', 'so-points', (e) => {
      const f = e.features?.[0]
      if (!f) return
      e.originalEvent?.stopPropagation?.()
      const id = f.properties?.id
      if (id != null) {
        const n = Number(id)
        propsRef.current.onSelect?.(Number.isFinite(n) ? n : id)
      }
    })

    for (const layer of ['so-metros-core', 'so-metros-glow', 'so-clusters', 'so-points']) {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
    }

    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.getSource('so-metros')?.setData(metrosToGeoJSON(metros))
  }, [metros])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.getSource('so-offenders')?.setData(markersToGeoJSON(markers))
    applySelectionPaint(map, selectedId)
  }, [markers, selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.getSource('so-user')?.setData(userLocationGeoJSON(userLocation, userRadiusMiles))
  }, [userLocation, userRadiusMiles])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return

    const key = `${focusMode}|${selectedMetroId}|${userLocation?.lat}|${userLocation?.lon}|${userRadiusMiles}`
    if (lastFocusRef.current === key) return
    lastFocusRef.current = key

    if (focusMode === 'nearby' && userLocation) {
      const radius = Number(userRadiusMiles) || 10
      const latPad = radius / 69
      const lonPad = radius / Math.max(0.01, Math.cos((userLocation.lat * Math.PI) / 180) * 69)
      map.fitBounds(
        [
          [userLocation.lon - lonPad, userLocation.lat - latPad],
          [userLocation.lon + lonPad, userLocation.lat + latPad],
        ],
        { padding: 48, maxZoom: 12, duration: 900 },
      )
      setLayerVisibility(map, false, true)
      return
    }

    if (focusMode === 'metro' && selectedMetroId) {
      const m = (metros || []).find((x) => x.id === selectedMetroId)
      if (m && Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lon))) {
        map.easeTo({ center: [Number(m.lon), Number(m.lat)], zoom: 10.2, duration: 900 })
        setLayerVisibility(map, false, true)
        return
      }
    }

    map.easeTo({ center: US_CENTER, zoom: US_ZOOM, duration: 700 })
    setLayerVisibility(map, true, false)
  }, [focusMode, selectedMetroId, userLocation, userRadiusMiles, metros])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const onZoom = () => {
      if (focusMode === 'nearby') {
        setLayerVisibility(map, false, true)
        return
      }
      const z = map.getZoom()
      if (z >= METRO_DETAIL_ZOOM) {
        setLayerVisibility(map, markers.length === 0, markers.length > 0)
      } else {
        setLayerVisibility(map, true, false)
      }
    }
    map.on('zoom', onZoom)
    onZoom()
    return () => { map.off('zoom', onZoom) }
  }, [focusMode, markers.length])

  return (
    <div className="ci-so-map" role="region" aria-label="Interactive sex offender street map">
      <div ref={containerRef} className="ci-so-map-canvas" />
    </div>
  )
}
