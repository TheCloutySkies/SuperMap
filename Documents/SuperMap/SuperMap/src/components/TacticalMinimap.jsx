import { useRef, useEffect, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './TacticalMinimap.css'

const TACTICAL_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OSM',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
      paint: {
        'raster-opacity': 0.95,
        'raster-contrast': 0.05,
        'raster-brightness-min': 0.2,
        'raster-brightness-max': 0.9,
      },
    },
  ],
}

export default function TacticalMinimap({ mainMap, minimized: initialMinimized = false }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [minimized, setMinimized] = useState(initialMinimized)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!mainMap || !containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TACTICAL_STYLE,
      center: mainMap.getCenter(),
      zoom: Math.max(0, mainMap.getZoom() - 4),
      interactive: false,
      attributionControl: false,
      transformRequest: (url, resourceType) => {
        if (resourceType === 'Source' && url && url.includes('openstreetmap')) {
          return { url, headers: { 'User-Agent': 'SuperMap/1.0 (https://github.com/supermap)' } }
        }
      },
    })
    mapRef.current = map
    map.on('load', () => {
      map.resize()
    })

    const syncFromMain = () => {
      if (!mapRef.current || !mainMap) return
      mapRef.current.setCenter(mainMap.getCenter())
      mapRef.current.setZoom(Math.max(0, mainMap.getZoom() - 4))
    }
    mainMap.on('move', syncFromMain)
    mainMap.on('zoom', syncFromMain)
    syncFromMain()

    return () => {
      mainMap.off('move', syncFromMain)
      mainMap.off('zoom', syncFromMain)
      map.remove()
      mapRef.current = null
    }
  }, [mainMap])

  if (!mainMap) return null
  if (hidden) {
    return (
      <div className="tactical-minimap tactical-minimap--hidden">
        <button type="button" className="tactical-minimap-toggle" onClick={() => setHidden(false)} title="Show minimap">
          ◷
        </button>
      </div>
    )
  }

  return (
    <div className={`tactical-minimap ${minimized ? 'tactical-minimap--minimized' : ''}`}>
      <div className="tactical-minimap-header">
        <span className="tactical-minimap-title">Minimap</span>
        <button type="button" className="tactical-minimap-btn" onClick={() => setMinimized((m) => !m)} title={minimized ? 'Expand' : 'Minimize'}>
          {minimized ? '⊕' : '−'}
        </button>
        <button type="button" className="tactical-minimap-btn" onClick={() => setHidden(true)} title="Hide">
          ×
        </button>
      </div>
      {!minimized && <div ref={containerRef} className="tactical-minimap-map" />}
    </div>
  )
}
