import { useState, useEffect } from 'react'
import axios from 'axios'
import WidgetCard from './WidgetCard'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

export default function EarthquakesWidget() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    let cancelled = false
    const parseUsgs = (data) => {
      const features = data?.features || []
      return features.slice(0, 8).map((f) => {
        const p = f.properties || {}
        const place = (p.place || '').replace(/^\d+\s+km\s+(?:[NESW]+\s+of\s+)?/i, '').trim().slice(0, 50) || '—'
        return { id: f.id, mag: p.mag, place, time: p.time }
      })
    }
    axios.get(`${API_BASE}/api/earthquakes/widget`, { timeout: 10000 })
      .then((res) => {
        if (!cancelled && Array.isArray(res.data?.events)) {
          setEvents(res.data.events.slice(0, 8))
          setUpdatedAt(res.data.updatedAt || new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }))
        }
        if (!cancelled) setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        axios.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', { timeout: 10000 })
          .then((usgs) => {
            if (!cancelled) {
              setEvents(parseUsgs(usgs.data))
              setUpdatedAt(new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }))
            }
          })
          .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load') })
          .finally(() => { if (!cancelled) setLoading(false) })
      })
    return () => { cancelled = true }
  }, [])

  return (
    <WidgetCard title="Recent earthquakes" loading={loading} error={error} updatedAt={updatedAt}>
      {events.length > 0 ? (
        <ul className="widget-earthquakes-list">
          {events.map((ev, i) => (
            <li key={ev.id || i} className="widget-earthquakes-item">
              <span className="widget-earthquakes-mag">M{ev.mag ?? '—'}</span>
              <span className="widget-earthquakes-place">{ev.place || '—'}</span>
              <span className="widget-earthquakes-time">{ev.time ? new Date(ev.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
            </li>
          ))}
        </ul>
      ) : !loading && !error && (
        <p className="widget-outage-empty">No recent quakes (M2.5+). Data from USGS.</p>
      )}
    </WidgetCard>
  )
}
