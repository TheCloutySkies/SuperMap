import { useState } from 'react'
import axios from 'axios'
import './NewsTopicSearch.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env.DEV ? '' : 'http://localhost:3000')

const TOPICS = [
  { value: 'TECHNOLOGY', label: 'Technology' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'WORLD', label: 'World' },
  { value: 'POLITICS', label: 'Politics' },
  { value: 'SCIENCE', label: 'Science' },
]

export default function NewsTopicSearch({ onResults }) {
  const [topic, setTopic] = useState('TECHNOLOGY')
  const [limit, setLimit] = useState('30')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchTopicNews = () => {
    if (!API_BASE) return
    setLoading(true)
    setError(null)
    axios
      .get(`${API_BASE}/api/news/rapid`, {
        params: { topic, limit, country: 'US', lang: 'en' },
        timeout: 15000,
      })
      .then((res) => {
        const data = res.data?.data ?? res.data?.news ?? (Array.isArray(res.data) ? res.data : [])
        onResults?.(Array.isArray(data) ? data : [])
      })
      .catch((err) => {
        setError(err.response?.status === 503 ? 'Set RAPIDAPI_KEY in backend .env' : err.message)
        onResults?.([])
      })
      .finally(() => setLoading(false))
  }

  return (
    <div className="news-topic-search">
      <span className="news-topic-label">Topic:</span>
      <select
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        className="news-topic-select"
      >
        {TOPICS.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <select
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        className="news-topic-limit"
        aria-label="Limit"
      >
        <option value="10">10</option>
        <option value="30">30</option>
        <option value="50">50</option>
      </select>
      <button type="button" className="news-topic-btn" onClick={fetchTopicNews} disabled={loading}>
        {loading ? '…' : 'Fetch'}
      </button>
      {error && <span className="news-topic-error">{error}</span>}
    </div>
  )
}
