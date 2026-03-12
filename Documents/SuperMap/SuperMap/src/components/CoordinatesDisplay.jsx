import { useState, useCallback } from 'react'
import './CoordinatesDisplay.css'

function formatCoord(n, type) {
  const abs = Math.abs(n)
  const d = Math.floor(abs)
  const m = (abs - d) * 60
  const s = (m - Math.floor(m)) * 60
  const sign = n < 0 ? (type === 'lat' ? 'S' : 'W') : type === 'lat' ? 'N' : 'E'
  return `${d}°${Math.floor(m)}′${s.toFixed(2)}″${sign}`
}

export default function CoordinatesDisplay({ lat, lon, onClick }) {
  const [copied, setCopied] = useState(false)

  const handleClick = useCallback(() => {
    if (lat == null || lon == null) return
    const text = `${lat.toFixed(6)}, ${lon.toFixed(6)}`
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
    onClick?.()
  }, [lat, lon, onClick])

  if (lat == null || lon == null) return null

  return (
    <button
      type="button"
      className="coordinates-display"
      onClick={handleClick}
      title="Click to copy coordinates"
      aria-label="Map center coordinates, click to copy"
    >
      <span className="coordinates-display-text">
        {formatCoord(lat, 'lat')} {formatCoord(lon, 'lon')}
      </span>
      <span className="coordinates-display-copy-hint">
        {copied ? 'Copied!' : 'Click to copy'}
      </span>
    </button>
  )
}
