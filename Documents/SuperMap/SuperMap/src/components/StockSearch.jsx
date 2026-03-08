import { useState } from 'react'
import axios from 'axios'
import './StockSearch.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env.DEV ? '' : 'http://localhost:3000')

export default function StockSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSearch = () => {
    const q = query.trim()
    if (!q || !API_BASE) return
    setLoading(true)
    setError(null)
    setResults([])
    axios
      .get(`${API_BASE}/api/finance/search`, { params: { search: q }, timeout: 15000 })
      .then((res) => {
        const body = res.data?.body ?? res.data
        const arr = Array.isArray(body) ? body : body?.data ?? body?.quotes ?? []
        setResults(Array.isArray(arr) ? arr.slice(0, 20) : [])
      })
      .catch((err) => {
        setError(err.response?.status === 503 ? 'Set RAPIDAPI_KEY in backend .env' : err.message)
      })
      .finally(() => setLoading(false))
  }

  return (
    <div className="stock-search-wrap">
      <h4 className="stock-search-title">Stock search</h4>
      <div className="stock-search-bar">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Symbol or name (e.g. AA)"
          className="stock-search-input"
        />
        <button type="button" className="stock-search-btn" onClick={handleSearch} disabled={loading}>
          {loading ? '…' : 'Search'}
        </button>
      </div>
      {error && <p className="stock-search-error">{error}</p>}
      {results.length > 0 && (
        <ul className="stock-search-results">
          {results.map((r, i) => (
            <li key={r.symbol || r.ticker || i} className="stock-search-result">
              <span className="stock-search-symbol">{r.symbol || r.ticker || r.code || '—'}</span>
              <span className="stock-search-name">{r.shortName || r.name || r.longName || ''}</span>
              {r.regularMarketPrice != null && <span className="stock-search-price">{r.regularMarketPrice}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
