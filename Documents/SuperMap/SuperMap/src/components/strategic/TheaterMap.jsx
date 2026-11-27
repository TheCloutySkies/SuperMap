import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DOMAINS, GEO_DOMAINS, HOUR, REGIONS } from '../../lib/consoleSignals'

const MAP_STYLE = {
  version: 8,
  sources: {
    base: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Esri, OpenStreetMap contributors',
    },
    labels: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Esri',
    },
  },
  layers: [
    { id: 'console-bg', type: 'background', paint: { 'background-color': '#060912' } },
    { id: 'console-base', type: 'raster', source: 'base' },
    { id: 'console-labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } },
  ],
}

const MAX_POINTS = 3000

function collectionFor(signals, domain, since) {
  const features = []
  for (const signal of signals) {
    if (signal.domain !== domain) continue
    if (signal.lat == null || signal.lon == null) continue
    if (signal.at < since) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [signal.lon, signal.lat] },
      properties: {
        sigId: signal.id,
        domain,
        magnitude: Number(signal.magnitude.toFixed(2)),
        title: signal.title.slice(0, 120),
      },
    })
    if (features.length >= MAX_POINTS) break
  }
  return { type: 'FeatureCollection', features }
}

/**
 * Theater map on the app's dark basemap. Pins are real published coordinates,
 * clustered per domain, and clicking one opens the same drawer as the board.
 */
export default function TheaterMap({
  signals,
  domains,
  onToggleDomain,
  region,
  selectedId,
  onSelect,
  now,
  scrubHours,
  onScrub,
  windowHours,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const boundLayers = useRef(new Set())
  const selectRef = useRef(onSelect)
  const featureRef = useRef(null)
  const [ready, setReady] = useState(false)

  const plotted = useMemo(() => {
    const since = now - scrubHours * HOUR
    let total = 0
    for (const signal of signals) {
      if (!GEO_DOMAINS.includes(signal.domain)) continue
      if (!domains.includes(signal.domain)) continue
      if (signal.lat == null || signal.lon == null) continue
      if (signal.at < since) continue
      total += 1
      if (total >= MAX_POINTS) break
    }
    return total
  }, [signals, domains, scrubHours, now])

  useEffect(() => {
    selectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined
    let destroyed = false
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: REGIONS.global.center,
      zoom: REGIONS.global.zoom,
      minZoom: 1,
      maxZoom: 12,
      attributionControl: true,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    const handleLoad = () => {
      if (destroyed) return
      try {
        map.resize()
      } catch { /* the map is gone */ }
      setReady(true)
    }
    const handleClick = (event) => {
      if (destroyed) return
      const layers = GEO_DOMAINS
        .flatMap((domain) => [`console-${domain}-cluster`, `console-${domain}-point`])
        .filter((id) => map.getLayer(id))
      if (!layers.length) return
      let hits = []
      try {
        hits = map.queryRenderedFeatures(event.point, { layers })
      } catch {
        return
      }
      if (!hits.length) return
      const hit = hits[0]
      if (hit.properties?.point_count) {
        const source = map.getSource(hit.layer.source)
        if (!source?.getClusterExpansionZoom) return
        source.getClusterExpansionZoom(hit.properties.cluster_id)
          .then((zoom) => {
            if (!destroyed) map.easeTo({ center: hit.geometry.coordinates, zoom: Math.min(12, zoom + 0.4) })
          })
          .catch(() => {})
        return
      }
      const id = hit.properties?.sigId
      if (id) selectRef.current?.(id)
    }
    const handleError = (event) => {
      // Tile and shader errors are logged, never rethrown into React.
      if (event?.error?.message) console.warn('[strategic map]', event.error.message)
    }

    map.on('load', handleLoad)
    map.on('click', handleClick)
    map.on('error', handleError)

    return () => {
      destroyed = true
      map.off('load', handleLoad)
      map.off('click', handleClick)
      map.off('error', handleError)
      try {
        map.remove()
      } catch { /* already disposed */ }
      mapRef.current = null
      boundLayers.current = new Set()
    }
  }, [])

  // Pins: one clustered source per geographic domain.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return
    const since = now - scrubHours * HOUR
    let features = 0

    try {
      for (const domain of GEO_DOMAINS) {
      const sourceId = `console-${domain}`
      const clusterId = `${sourceId}-cluster`
      const pointId = `${sourceId}-point`
      const collection = domains.includes(domain)
        ? collectionFor(signals, domain, since)
        : { type: 'FeatureCollection', features: [] }

      if (!collection.features.length) {
        if (map.getLayer(clusterId)) map.removeLayer(clusterId)
        if (map.getLayer(pointId)) map.removeLayer(pointId)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
        boundLayers.current.delete(clusterId)
        boundLayers.current.delete(pointId)
        continue
      }

      features += collection.features.length

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: collection,
          cluster: true,
          clusterRadius: 38,
          clusterMaxZoom: 7,
        })
      } else {
        map.getSource(sourceId).setData(collection)
      }

      const color = DOMAINS[domain]?.hex || '#22d3ee'

      if (!map.getLayer(clusterId)) {
        map.addLayer({
          id: clusterId,
          type: 'circle',
          source: sourceId,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': color,
            'circle-opacity': 0.16,
            'circle-stroke-color': color,
            'circle-stroke-width': 1.4,
            'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 11, 20, 22, 200, 34],
          },
        })
      }
      if (!map.getLayer(pointId)) {
        map.addLayer({
          id: pointId,
          type: 'circle',
          source: sourceId,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2.6, 7, 5, 11, 8],
            'circle-color': color,
            'circle-opacity': 0.88,
            'circle-stroke-color': '#060912',
            'circle-stroke-width': 1,
          },
        })
      }

      for (const layerId of [clusterId, pointId]) {
        if (boundLayers.current.has(layerId)) continue
        boundLayers.current.add(layerId)
        map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = '' })
      }
      }
      // Instrumentation for the paint check: the number of features handed to
      // the map's sources, readable without a screenshot of a WebGL canvas.
      if (containerRef.current) containerRef.current.dataset.features = String(features)
      if (featureRef.current) featureRef.current.textContent = `${features.toLocaleString()} features`
    } catch (err) {
      console.warn('[strategic map] pins:', err.message)
    }
  }, [ready, signals, domains, scrubHours, now])

  // Camera follows the chosen theater.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return
    const target = REGIONS[region] || REGIONS.global
    try {
      map.flyTo({ center: target.center, zoom: target.zoom, duration: 700 })
    } catch (err) {
      console.warn('[strategic map] camera:', err.message)
    }
  }, [region, ready])

  // Selected signal highlight.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return
    const sourceId = 'console-selected'
    const selected = signals.find((signal) => signal.id === selectedId)
    const data = selected && selected.lat != null && selected.lon != null
      ? {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [selected.lon, selected.lat] },
          properties: { sigId: selected.id },
        }],
      }
      : { type: 'FeatureCollection', features: [] }

    try {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: 'geojson', data })
        map.addLayer({
          id: 'console-selected-ring',
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-radius': 13,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': '#f3efe6',
            'circle-stroke-width': 1.6,
          },
        })
      } else {
        map.getSource(sourceId).setData(data)
      }
    } catch (err) {
      console.warn('[strategic map] selection:', err.message)
    }
  }, [ready, selectedId, signals])

  const activeGeoDomains = GEO_DOMAINS.filter((domain) => domains.includes(domain))
  const scrubLabel = scrubHours >= windowHours ? 'window' : `last ${scrubHours} h`

  return (
    <div className="console-map-wrap">
      <div className="console-map" ref={containerRef} />

      <div className="console-map-hud">
        <div className="console-map-layers">
          {GEO_DOMAINS.map((domain) => (
            <button
              key={domain}
              type="button"
              className={`console-chip ${domains.includes(domain) ? 'is-on' : ''}`}
              onClick={() => onToggleDomain(domain)}
              aria-pressed={domains.includes(domain)}
            >
              <span className="console-chip-dot" style={{ background: DOMAINS[domain].hex }} aria-hidden />
              {DOMAINS[domain].short}
            </button>
          ))}
        </div>
      </div>

      <div className="console-map-legend">
        {activeGeoDomains.map((domain) => (
          <span key={domain}><i style={{ background: DOMAINS[domain].hex }} />{DOMAINS[domain].short}</span>
        ))}
      </div>

      <div className="console-map-stats" data-plotted={plotted}>
        {plotted.toLocaleString()} pins · <span ref={featureRef}>0 features</span> · {activeGeoDomains.length} layers
      </div>

      <label className="console-scrub">
        <span>Replay</span>
        <input
          type="range"
          min="1"
          max={windowHours}
          step="1"
          value={scrubHours}
          onChange={(event) => onScrub(Number(event.target.value))}
          aria-label="Show signals from the last N hours"
        />
        <span className="console-scrub-value">{scrubLabel}</span>
      </label>
    </div>
  )
}
