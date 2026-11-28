/**
 * GPN on a phone: a card list, not the BBC page. It reads the same two
 * endpoints the desk reads and shows them as one list, newest first.
 */
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import ArticlePreviewSheet from '../components/ArticlePreviewSheet'
import { getApiBase } from '../lib/homeBootstrap'
import { dedupeStories } from '../lib/storyDedupe'

const API_BASE = getApiBase()

const TOPICS = [
  { key: 'all', label: 'All' },
  { key: 'general', label: 'World' },
  { key: 'politics', label: 'Politics' },
  { key: 'business', label: 'Markets' },
  { key: 'technology', label: 'Tech' },
  { key: 'weather', label: 'Weather' },
]

function isImage(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) && !url.includes('google.com/s2/favicons')
}

function toStories(data) {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.features)
      ? data.features.map((feature) => ({
        ...(feature.properties || {}),
        id: feature.properties?.id ?? feature.id,
        pubDate: feature.properties?.timestamp ? new Date(feature.properties.timestamp).toISOString() : null,
      }))
      : []
  return rows.map((row, index) => ({
    ...row,
    _key: String(row.link || row.url || row.id || `${row.source}-${index}`),
    image: isImage(row.image) ? row.image : isImage(row.thumbnail) ? row.thumbnail : '',
    category: String(row.category || 'general').toLowerCase(),
  }))
}

function timeOf(row) {
  const raw = row?.pubDate || row?.timestamp
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  const minutes = Math.round((Date.now() - date.getTime()) / 60000)
  if (minutes < 60) return `${Math.max(1, minutes)}m`
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function MobileNews() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [topic, setTopic] = useState('all')
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    let cancelled = false
    // The first paint is a skeleton; the snapshot fills it in.
    Promise.all([
      axios.get(`${API_BASE}/api/news`, { timeout: 12000 }).catch(() => null),
      axios.get(`${API_BASE}/api/osint`, { timeout: 12000 }).catch(() => null),
    ]).then(([news, intel]) => {
      if (cancelled) return
      const merged = [...toStories(news?.data), ...toStories(intel?.data)]
      setItems(dedupeStories(merged))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const refresh = () => {
    setRefreshing(true)
    Promise.all([
      axios.get(`${API_BASE}/api/news`, { params: { refresh: '1' }, timeout: 20000 }).catch(() => null),
      axios.get(`${API_BASE}/api/osint`, { timeout: 20000 }).catch(() => null),
    ]).then(([news, intel]) => {
      const merged = [...toStories(news?.data), ...toStories(intel?.data)]
      if (merged.length) setItems(dedupeStories(merged))
    }).finally(() => setRefreshing(false))
  }

  const rows = useMemo(() => {
    const list = topic === 'all' ? items : items.filter((row) => row.category === topic)
    return [...list].sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
  }, [items, topic])

  return (
    <div className="mob-stack">
      <div className="mob-chips" role="tablist" aria-label="Topics">
        {TOPICS.map((row) => (
          <button
            key={row.key}
            type="button"
            role="tab"
            aria-selected={topic === row.key}
            className={`mob-chip${topic === row.key ? ' is-on' : ''}`}
            onClick={() => setTopic(row.key)}
          >
            {row.label}
          </button>
        ))}
        <button type="button" className="mob-chip mob-chip--action" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Updating…' : 'Refresh'}
        </button>
      </div>

      {loading && !items.length ? (
        <p className="mob-card-text">Loading the desk…</p>
      ) : rows.length === 0 ? (
        <p className="mob-card-text">No stories match that topic. Try another, or refresh.</p>
      ) : (
        <ul className="mob-stories">
          {rows.slice(0, 60).map((row) => (
            <li key={row._key}>
              <button type="button" className="mob-story" onClick={() => setPicked(row)}>
                {row.image ? <img src={row.image} alt="" loading="lazy" /> : <span className="mob-story-blank" aria-hidden />}
                <span className="mob-story-copy">
                  <span className="mob-story-title">{row.title || 'Untitled'}</span>
                  <span className="mob-story-meta">{row.source}{timeOf(row) ? ` · ${timeOf(row)}` : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ArticlePreviewSheet
        item={picked}
        open={!!picked}
        onClose={() => setPicked(null)}
        sourceLabel={picked?.source}
      />
    </div>
  )
}
