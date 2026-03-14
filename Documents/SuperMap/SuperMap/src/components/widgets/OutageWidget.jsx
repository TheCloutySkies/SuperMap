import { useState, useEffect } from 'react'
import axios from 'axios'
import WidgetCard from './WidgetCard'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

export default function OutageWidget() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    let cancelled = false
    axios.get(`${API_BASE}/api/netblocks`, { timeout: 12000 })
      .then((res) => {
        if (!cancelled && Array.isArray(res.data?.events)) {
          setItems(res.data.events.slice(0, 8))
          setUpdatedAt(res.data.updatedAt || new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }))
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <WidgetCard title="Internet outages" loading={loading} error={error} updatedAt={updatedAt}>
      {items.length > 0 ? (
        <ul className="widget-outage-list">
          {items.map((ev, i) => (
            <li key={ev.id || i} className="widget-outage-item">
              <span className="widget-outage-country">{ev.country || ev.region || '—'}</span>
              <span className="widget-outage-status">{ev.status || ev.type || 'Outage'}</span>
              <span className="widget-outage-time">{ev.time || ev.date || '—'}</span>
            </li>
          ))}
        </ul>
      ) : !loading && !error && (
        <p className="widget-outage-empty">No recent outage reports.</p>
      )}
    </WidgetCard>
  )
}
