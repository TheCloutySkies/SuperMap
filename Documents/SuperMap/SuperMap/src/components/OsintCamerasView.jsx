import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import './OsintCamerasView.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

export default function OsintCamerasView({ onFlyTo }) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [userCoords, setUserCoords] = useState(null)
  const [hiddenIds, setHiddenIds] = useState(() => new Set())

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => setUserCoords({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {}
    )
  }, [])

  const distanceKm = (aLat, aLon, bLat, bLon) => {
    const toRad = (d) => (d * Math.PI) / 180
    const dLat = toRad(bLat - aLat)
    const dLon = toRad(bLon - aLon)
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  }

  const fetchCameras = () => {
    setLoading(true)
    Promise.all([
      axios.get(`${API_BASE}/api/cameras`, {
        params: { q: query.trim() || undefined, type: type || undefined, limit: 300 },
        timeout: 15000,
      }),
      axios.get(`${API_BASE}/api/seed-cameras`, {
        timeout: 15000,
      }),
    ])
      .then(([repoRes, seedRes]) => {
        const repo = Array.isArray(repoRes?.data) ? repoRes.data : []
        const seeds = Array.isArray(seedRes?.data) ? seedRes.data : []
        const merged = [...seeds, ...repo]
        const dedup = new Map()
        merged.forEach((c) => {
          const key = String(c?.id || c?.stream || '')
          if (!key || hiddenIds.has(key)) return
          dedup.set(key, { id: key, ...c })
        })
        setItems(Array.from(dedup.values()))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchCameras()
    const id = setInterval(fetchCameras, 60000)
    return () => clearInterval(id)
  }, [hiddenIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = useMemo(() => {
    const set = new Set(items.map((i) => i.type).filter(Boolean))
    return Array.from(set).slice(0, 12)
  }, [items])

  const hideCamera = (cameraId) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      next.add(String(cameraId))
      return next
    })
  }

  const fly = (c) => {
    if (c?.lat == null || c?.lon == null) return
    onFlyTo?.({ lat: Number(c.lat), lng: Number(c.lon), zoom: 13, properties: { title: c.name } })
  }

  return (
    <div className="osint-cameras-view">
      <div className="osint-cameras-toolbar">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search location/tags/stream..." />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="button" onClick={fetchCameras} disabled={loading}>{loading ? '…' : 'Search'}</button>
      </div>
      <p className="osint-cameras-count">{items.length} cameras</p>
      <div className="osint-cameras-list">
        {items.map((c) => (
          <div key={c.id} className="osint-cameras-item">
            <button type="button" className="osint-cameras-title" onClick={() => fly(c)}>
              {c.name || 'Camera'}
            </button>
            <div className="osint-cameras-meta">
              <span>{c.type || 'unknown'}</span>
              <span>{Number(c.lat).toFixed(3)}, {Number(c.lon).toFixed(3)}</span>
              {userCoords && (
                <span>
                  {distanceKm(userCoords.lat, userCoords.lon, Number(c.lat), Number(c.lon)).toFixed(1)} km
                </span>
              )}
            </div>
            <div className="osint-cameras-actions">
              {(c.link || c.stream) && <a href={c.link || c.stream} target="_blank" rel="noopener noreferrer">Watch</a>}
              <button type="button" onClick={() => hideCamera(c.id)}>Hide failed</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

