import { useState, useEffect } from 'react'
import axios from 'axios'
import WidgetCard from './WidgetCard'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'
const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?limit=20&status=open'
const PRESCRIBED_FIRE = /prescribed\s*fire|rx\s*pcs|controlled\s*burn/i

export default function SpaceWidget() {
  const [data, setData] = useState(null)
  const [eonet, setEonet] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      axios.get(`${API_BASE}/api/space`, { timeout: 12000 }).then((r) => r.data).catch(() => null),
      axios.get(EONET_URL, { timeout: 10000 }).then((r) => r.data?.events || []).catch(() => []),
    ]).then(([spaceData, eonetEvents]) => {
      if (cancelled) return
      setData(spaceData || {})
      const list = Array.isArray(eonetEvents)
        ? eonetEvents
            .filter((e) => !PRESCRIBED_FIRE.test(e.title || '') && !PRESCRIBED_FIRE.test((e.categories?.[0]?.title || '')))
            .slice(0, 8)
            .map((e) => ({
              id: e.id,
              title: e.title || 'Event',
              category: e.categories?.[0]?.title || 'Natural',
              date: e.geometry?.[0]?.date || e.lastDate,
            }))
        : []
      const fromBackend = (spaceData?.eonet || []).filter((e) => !PRESCRIBED_FIRE.test(e.title || ''))
      setEonet(fromBackend.length ? fromBackend : list)
      setUpdatedAt(spaceData?.updatedAt || new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }))
    }).catch((err) => { if (!cancelled) setError(err.message || 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const hasUseful = (eonet?.length > 0) || (data?.nasaNews?.length > 0)
  if (!loading && !error && !hasUseful) return null

  return (
    <WidgetCard title="NASA EONET" loading={loading} error={error} updatedAt={updatedAt}>
      {eonet.length > 0 && (
        <div className="widget-space-eonet">
          <ul className="widget-space-eonet-list">
            {eonet.map((e) => (
              <li key={e.id}>
                <span className="widget-space-eonet-title">{e.title}</span>
                <span className="widget-space-eonet-meta">{e.category} · {e.date ? new Date(e.date).toLocaleDateString(undefined, { dateStyle: 'short' }) : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data?.nasaNews && data.nasaNews.length > 0 && (
        <div className="widget-space-news">
          <span className="widget-space-asteroids-label">NASA News</span>
          <ul className="widget-headlines-list">
            {data.nasaNews.map((n, i) => (
              <li key={i} className="widget-headlines-item">
                {n.link ? (
                  <a href={n.link} target="_blank" rel="noopener noreferrer" className="widget-headlines-link">{n.title}</a>
                ) : (
                  <span className="widget-headlines-title">{n.title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data?.apod && (eonet.length > 0 || data?.nasaNews?.length > 0) && (
        <div className="widget-space-apod-compact">
          <a href={data.apod.url} target="_blank" rel="noopener noreferrer" className="widget-headlines-link">
            Today’s image: {data.apod.title || 'NASA APOD'}
          </a>
        </div>
      )}
    </WidgetCard>
  )
}
