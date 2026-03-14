import { useState, useEffect } from 'react'
import axios from 'axios'
import WidgetCard from './WidgetCard'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

export default function HeadlinesWidget() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    let cancelled = false
    axios.get(`${API_BASE}/api/news`, { timeout: 12000 })
      .then((res) => {
        if (!cancelled && res.data?.features) {
          const excludeSources = /^BBC\b|BBC World|BBC News/i
          const list = res.data.features
            .map((f) => ({
              title: f.properties?.title || f.properties?.name || 'Untitled',
              url: f.properties?.link || f.properties?.url,
              source: (f.properties?.source || '').trim(),
            }))
            .filter((x) => x.title && x.title !== 'Untitled' && !excludeSources.test(x.source))
            .slice(0, 6)
          setItems(list)
          setUpdatedAt(new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }))
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <WidgetCard title="Headlines" loading={loading} error={error} updatedAt={updatedAt}>
      {items.length > 0 ? (
        <ul className="widget-headlines-list">
          {items.map((item, i) => (
            <li key={i} className="widget-headlines-item">
              {item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="widget-headlines-link">
                  {item.title}
                </a>
              ) : (
                <span className="widget-headlines-title">{item.title}</span>
              )}
              {item.source && <span className="widget-headlines-source">{item.source}</span>}
            </li>
          ))}
        </ul>
      ) : !loading && !error && (
        <p className="widget-outage-empty">No headlines. Start the API to load news feeds.</p>
      )}
    </WidgetCard>
  )
}
