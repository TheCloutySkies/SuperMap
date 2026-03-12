import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchSpaceWeather } from '../services/newLayerFetchers'
import './MapControls.css'

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearing(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180)
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

export default function MapControls({ map }) {
  const [zoom, setZoom] = useState(2)
  const [mapBearing, setMapBearing] = useState(0)
  const [locating, setLocating] = useState(false)
  const [userLocation, setUserLocation] = useState(null)
  const [tapPinMode, setTapPinMode] = useState(false)

  const [spaceWx, setSpaceWx] = useState(null)
  const [measureMode, setMeasureMode] = useState(false)
  const [measurePoints, setMeasurePoints] = useState([])
  const [measureResult, setMeasureResult] = useState(null)
  const measureModeRef = useRef(false)
  const measurePointsRef = useRef([])

  useEffect(() => {
    fetchSpaceWeather().then(setSpaceWx).catch(() => {})
    const interval = setInterval(() => {
      fetchSpaceWeather().then(setSpaceWx).catch(() => {})
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!map) return
    const onMove = () => {
      setZoom(map.getZoom())
      setMapBearing(map.getBearing())
    }
    map.on('move', onMove)
    onMove()
    return () => map.off('move', onMove)
  }, [map])

  const handleMeasureClick = useCallback((e) => {
    if (!measureModeRef.current) return
    const { lng, lat } = e.lngLat
    const pts = [...measurePointsRef.current, [lng, lat]]
    measurePointsRef.current = pts
    setMeasurePoints(pts)
    if (pts.length === 2) {
      const dist = haversineDistance(pts[0][1], pts[0][0], pts[1][1], pts[1][0])
      const brng = bearing(pts[0][1], pts[0][0], pts[1][1], pts[1][0])
      setMeasureResult({ distance: dist, bearing: brng })
    }
  }, [])

  useEffect(() => {
    if (!map) return
    map.on('click', handleMeasureClick)
    return () => map.off('click', handleMeasureClick)
  }, [map, handleMeasureClick])

  useEffect(() => {
    if (!map) return
    if (measurePoints.length < 1) {
      if (map.getLayer('measure-line')) map.removeLayer('measure-line')
      if (map.getLayer('measure-pts')) map.removeLayer('measure-pts')
      if (map.getSource('measure-src')) map.removeSource('measure-src')
      return
    }
    const fc = {
      type: 'FeatureCollection',
      features: [
        ...measurePoints.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: p },
          properties: {},
        })),
        ...(measurePoints.length === 2
          ? [{
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: measurePoints },
              properties: {},
            }]
          : []),
      ],
    }
    if (map.getSource('measure-src')) {
      map.getSource('measure-src').setData(fc)
    } else {
      map.addSource('measure-src', { type: 'geojson', data: fc })
      map.addLayer({
        id: 'measure-line',
        type: 'line',
        source: 'measure-src',
        paint: { 'line-color': '#22d3ee', 'line-width': 2, 'line-dasharray': [4, 2] },
      })
      map.addLayer({
        id: 'measure-pts',
        type: 'circle',
        source: 'measure-src',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 6, 'circle-color': '#22d3ee', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
      })
    }
  }, [map, measurePoints])

  if (!map) return null

  const zoomIn = () => map.zoomIn()
  const zoomOut = () => map.zoomOut()
  const resetNorth = () => map.easeTo({ bearing: 0, pitch: 0 })
  const handleSlider = (e) => {
    const z = parseFloat(e.target.value)
    map.setZoom(z)
  }

  const locateMe = () => {
    if (!navigator.geolocation) {
      window.alert('Geolocation is not available in this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords
        setUserLocation([longitude, latitude])
        map.flyTo({ center: [longitude, latitude], zoom: 14, duration: 1000 })
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        window.alert(`Location request failed: ${err?.message || 'permission denied'}`)
      },
      { enableHighAccuracy: true }
    )
  }

  const toggleTapPinMode = () => {
    const next = !tapPinMode
    setTapPinMode(next)
    window.dispatchEvent(new CustomEvent('supermap-toggle-tap-pin', { detail: { enabled: next } }))
  }

  const toggleMeasure = () => {
    const next = !measureMode
    setMeasureMode(next)
    measureModeRef.current = next
    if (!next) {
      measurePointsRef.current = []
      setMeasurePoints([])
      setMeasureResult(null)
      if (map.getLayer('measure-line')) map.removeLayer('measure-line')
      if (map.getLayer('measure-pts')) map.removeLayer('measure-pts')
      if (map.getSource('measure-src')) map.removeSource('measure-src')
    } else {
      measurePointsRef.current = []
      setMeasurePoints([])
      setMeasureResult(null)
    }
  }

  const resetMeasure = () => {
    measurePointsRef.current = []
    setMeasurePoints([])
    setMeasureResult(null)
  }

  const kpColor = spaceWx
    ? spaceWx.kp >= 5 ? '#ef4444' : spaceWx.kp >= 4 ? '#f59e0b' : spaceWx.kp >= 3 ? '#eab308' : '#22c55e'
    : '#8b949e'

  return (
    <>
      <div className="map-controls">
        <div className="map-controls-zoom-group">
          <button type="button" className="map-control-btn" onClick={zoomIn} aria-label="Zoom in">
            +
          </button>
          <div className="map-controls-zoom-slider">
            <input
              type="range"
              min={0}
              max={22}
              step={0.5}
              value={zoom}
              onChange={handleSlider}
              className="zoom-slider"
            />
          </div>
          <button type="button" className="map-control-btn" onClick={zoomOut} aria-label="Zoom out">
            −
          </button>
        </div>
        <div className="map-controls-zoom-indicator">Z: {zoom.toFixed(1)}</div>
        <button
          type="button"
          className="map-control-btn map-control-compass"
          onClick={resetNorth}
          aria-label="Reset to North"
          style={{ transform: `rotate(${-mapBearing}deg)` }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M12 2l-4 8h3v10h2V10h3L12 2z" />
          </svg>
        </button>
      </div>

      {spaceWx && (
        <div
          className="space-wx-badge"
          title={`Kp ${spaceWx.kp.toFixed(1)} — ${spaceWx.label}. NOAA planetary K-index: geomagnetic activity (0–9). Affects radio & GPS.`}
        >
          <span className="space-wx-dot" style={{ background: kpColor }} aria-hidden />
          <span className="space-wx-copy">
            <span className="space-wx-text">Kp {spaceWx.kp.toFixed(1)}</span>
            <span className="space-wx-info">Geomagnetic activity (0–9)</span>
          </span>
        </div>
      )}

      {measureMode && (
        <div className="measure-hud">
          {!measureResult && measurePoints.length === 0 && <span>Click first point on map</span>}
          {!measureResult && measurePoints.length === 1 && <span>Click second point</span>}
          {measureResult && (
            <>
              <span>{measureResult.distance < 1 ? `${(measureResult.distance * 1000).toFixed(0)} m` : `${measureResult.distance.toFixed(2)} km`}</span>
              <span className="measure-bearing">{measureResult.bearing.toFixed(1)}°</span>
              <button type="button" className="measure-reset-btn" onClick={resetMeasure}>Reset</button>
            </>
          )}
        </div>
      )}

      <div className="map-controls-locate-wrap">
        <button
          type="button"
          className={`map-control-btn map-control-measure ${measureMode ? 'active' : ''}`}
          onClick={toggleMeasure}
          aria-label="Measure distance"
          title="Measure distance & bearing between two points"
        >
          <span aria-hidden>📏</span>
          <span>Measure</span>
        </button>
        <button
          type="button"
          className={`map-control-btn map-control-pin ${tapPinMode ? 'active' : ''}`}
          onClick={toggleTapPinMode}
          aria-label="Toggle tap-to-add pin mode"
          title="Tap map to add pin"
        >
          📍
        </button>
        <button
          type="button"
          className={`map-control-btn map-control-locate ${userLocation ? 'active' : ''} ${locating ? 'locating' : ''}`}
          onClick={locateMe}
          aria-label="Locate me"
          title="Center map on your location"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path fill="currentColor" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0-11.5C6.48 2.5 2.5 6.48 2.5 12S6.48 21.5 12 21.5 21.5 17.52 21.5 12 17.52 2.5 12 2.5zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
          </svg>
          <span>Locate</span>
          {userLocation && <span className="locate-pulse" />}
        </button>
      </div>
    </>
  )
}
