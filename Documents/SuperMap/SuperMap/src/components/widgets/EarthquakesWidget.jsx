import { useState, useEffect } from 'react'
import axios from 'axios'
import WidgetCard from './WidgetCard'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

function formatQuakeTime(time) {
  if (!time) return '—'
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function EarthquakesWidget({ onShowOnMap }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [detailEvent, setDetailEvent] = useState(null)

  useEffect(() => {
    let cancelled = false
    const parseUsgs = (data) => {
      const features = data?.features || []
      return features.slice(0, 4).map((f) => {
        const p = f.properties || {}
        const place = (p.place || '').replace(/^\d+\s+km\s+(?:[NESW]+\s+of\s+)?/i, '').trim().slice(0, 80) || '—'
        const id = f.id
        return {
          id,
          mag: p.mag,
          place,
          time: p.time,
          depth: f.geometry?.coordinates?.[2] ?? null,
          url: id ? `https://earthquake.usgs.gov/earthquakes/eventpage/${id}` : null,
        }
      })
    }
    axios.get(`${API_BASE}/api/earthquakes/widget`, { timeout: 10000 })
      .then((res) => {
        if (!cancelled && Array.isArray(res.data?.events)) {
          setEvents(res.data.events.slice(0, 4))
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
              <button
                type="button"
                className="widget-earthquakes-item-btn"
                onClick={() => setDetailEvent(ev)}
                title="View details"
              >
                <span className="widget-earthquakes-mag">M{ev.mag ?? '—'}</span>
                <span className="widget-earthquakes-place">{ev.place || '—'}</span>
                <span className="widget-earthquakes-time">{formatQuakeTime(ev.time)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : !loading && !error && (
        <p className="widget-outage-empty">No recent quakes (M2.5+). Data from USGS.</p>
      )}
      {detailEvent && (
        <div className="widget-earthquakes-detail-backdrop" role="dialog" aria-modal="true" aria-label="Earthquake details" onClick={() => setDetailEvent(null)}>
          <div className="widget-earthquakes-detail-card card-y2k" onClick={(e) => e.stopPropagation()}>
            <h3 className="widget-earthquakes-detail-title">Earthquake details</h3>
            <dl className="widget-earthquakes-detail-dl">
              <dt>Magnitude</dt>
              <dd>M{detailEvent.mag ?? '—'}</dd>
              <dt>Location</dt>
              <dd>{detailEvent.place || '—'}</dd>
              <dt>Time</dt>
              <dd>{detailEvent.time ? new Date(detailEvent.time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</dd>
              {detailEvent.depth != null && (
                <>
                  <dt>Depth</dt>
                  <dd>{Number(detailEvent.depth).toFixed(1)} km</dd>
                </>
              )}
            </dl>
            <div className="widget-earthquakes-detail-actions">
              {onShowOnMap && detailEvent.place && (
                <button type="button" className="btn-y2k widget-earthquakes-detail-link" onClick={() => { onShowOnMap(detailEvent.place); setDetailEvent(null) }}>
                  Show on map
                </button>
              )}
              {detailEvent.url && (
                <a href={detailEvent.url} target="_blank" rel="noopener noreferrer" className="btn-y2k widget-earthquakes-detail-link">
                  View on USGS
                </a>
              )}
              <button type="button" className="btn-y2k widget-earthquakes-detail-close" onClick={() => setDetailEvent(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </WidgetCard>
  )
}
