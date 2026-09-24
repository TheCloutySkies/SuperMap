import { useState, useEffect } from 'react'
import axios from 'axios'
import WidgetCard from './WidgetCard'
import { getApiBase } from '../../lib/homeBootstrap'

const API_BASE = getApiBase()

function headlinesFromNews(news) {
  if (!news?.features) return []
  const excludeSources = /^BBC\b|BBC World|BBC News/i
  return news.features
    .map((f) => ({
      title: f.properties?.title || f.properties?.name || 'Untitled',
      url: f.properties?.link || f.properties?.url,
      source: (f.properties?.source || '').trim(),
      description: (f.properties?.description || '').trim().slice(0, 500),
    }))
    .filter((x) => x.title && x.title !== 'Untitled' && !excludeSources.test(x.source))
    .slice(0, 6)
}

export default function HeadlinesWidget({ initialNews }) {
  const [items, setItems] = useState(() => headlinesFromNews(initialNews))
  const [loading, setLoading] = useState(() => !headlinesFromNews(initialNews).length)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(() =>
    headlinesFromNews(initialNews).length
      ? new Date().toLocaleTimeString(undefined, { timeStyle: 'short' })
      : null
  )
  const [expandedIndex, setExpandedIndex] = useState(null)

  useEffect(() => {
    const fromProp = headlinesFromNews(initialNews)
    if (fromProp.length) {
      setItems(fromProp)
      setLoading(false)
      setError(null)
      setUpdatedAt(new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }))
      return
    }
    // No bootstrap data yet — wait for prop update; do not hit /api/news (HomeScreen owns that)
    if (initialNews == null) return
    setLoading(false)
  }, [initialNews])

  // Fallback fetch only when mounted without a parent bootstrap prop (standalone)
  useEffect(() => {
    if (initialNews !== undefined || items.length) return
    let cancelled = false
    setLoading(true)
    axios.get(`${API_BASE}/api/news`, { timeout: 28000 })
      .then((res) => {
        if (!cancelled && res.data?.features) {
          setItems(headlinesFromNews(res.data))
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
  }, [initialNews, items.length])

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
