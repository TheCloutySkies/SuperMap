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
  const [expandedIndex, setExpandedIndex] = useState(null)

  useEffect(() => {
    let cancelled = false
    axios.get(`${API_BASE}/api/news`, { timeout: 28000 })
      .then((res) => {
        if (!cancelled && res.data?.features) {
          const excludeSources = /^BBC\b|BBC World|BBC News/i
          const list = res.data.features
            .map((f) => ({
              title: f.properties?.title || f.properties?.name || 'Untitled',
              url: f.properties?.link || f.properties?.url,
              source: (f.properties?.source || '').trim(),
              description: (f.properties?.description || '').trim().slice(0, 500),
            }))
            .filter((x) => x.title && x.title !== 'Untitled' && !excludeSources.test(x.source))
            .slice(0, 6)
          setItems(list)
          setUpdatedAt(new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err.code === 'ECONNABORTED' ? 'News took too long to load. Try again.' : (err.message || 'Failed to load')
          setError(msg)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const toggleExpanded = (i) => {
    setExpandedIndex((prev) => (prev === i ? null : i))
  }

  return (
    <WidgetCard title="Headlines" loading={loading} error={error} updatedAt={updatedAt}>
      {items.length > 0 ? (
        <ul className="widget-headlines-list">
          {items.map((item, i) => {
            const isExpanded = expandedIndex === i
            return (
              <li key={i} className={`widget-headlines-item ${isExpanded ? 'widget-headlines-item--expanded' : ''}`}>
                <button
                  type="button"
                  className="widget-headlines-item-btn"
                  onClick={() => toggleExpanded(i)}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? 'Collapse headline' : 'Expand headline'}
                >
                  <span className="widget-headlines-title-preview">{item.title}</span>
                  {item.source && <span className="widget-headlines-source">{item.source}</span>}
                  <span className="widget-headlines-expand-icon" aria-hidden>{isExpanded ? '−' : '+'}</span>
                </button>
                {isExpanded && (
                  <div className="widget-headlines-detail">
                    <p className="widget-headlines-detail-title">{item.title}</p>
                    {item.description && <p className="widget-headlines-detail-synopsis">{item.description}</p>}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="widget-headlines-detail-link btn-y2k">
                        Read full article
                      </a>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ) : !loading && !error && (
        <p className="widget-outage-empty">No headlines. Start the API to load news feeds.</p>
      )}
    </WidgetCard>
  )
}
