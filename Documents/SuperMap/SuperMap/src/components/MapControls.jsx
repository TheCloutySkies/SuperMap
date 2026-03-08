import { useState, useEffect } from 'react'
import './MapControls.css'

export default function MapControls({ map }) {
  const [zoom, setZoom] = useState(2)
  const [bearing, setBearing] = useState(0)
  const [locating, setLocating] = useState(false)
  const [userLocation, setUserLocation] = useState(null)

  useEffect(() => {
    if (!map) return
    const onMove = () => {
      setZoom(map.getZoom())
      setBearing(map.getBearing())
    }
    map.on('move', onMove)
    onMove()
    return () => map.off('move', onMove)
  }, [map])

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
          style={{ transform: `rotate(${-bearing}deg)` }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M12 2l-4 8h3v10h2V10h3L12 2z" />
          </svg>
        </button>
      </div>
      <div className="map-controls-locate-wrap">
        <button
          type="button"
          className={`map-control-btn map-control-locate ${userLocation ? 'active' : ''} ${locating ? 'locating' : ''}`}
          onClick={locateMe}
          aria-label="Locate me"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0-11.5C6.48 2.5 2.5 6.48 2.5 12S6.48 21.5 12 21.5 21.5 17.52 21.5 12 17.52 2.5 12 2.5zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
          </svg>
          {userLocation && <span className="locate-pulse" />}
        </button>
      </div>
    </>
  )
}
