import { useState } from 'react'
import axios from 'axios'
import './AdvancedSearch.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

const DUCKDUCKGO_URL = 'https://duckduckgo.com/'

export default function AdvancedSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSearch = () => {
    const q = String(query).trim()
    if (!q) return
    setLoading(true)
    setError(null)
    setResults([])
    if (!API_BASE) {
      setError('Connect to the situational-awareness backend (VITE_API_URL) to use SearXNG search.')
      setLoading(false)
      return
    }
    axios
      .get(`${API_BASE}/api/search/searxng`, { params: { q }, timeout: 20000 })
      .then((res) => {
        const apiError = res.data?.error
        if (apiError) {
          setError(apiError)
          setResults([])
          return
        }
        const raw = res.data?.results ?? []
        const items = raw.map((r) => ({
          title: r.title,
          link: r.url,
          url: r.url,
          snippet: r.content,
          description: r.content,
        }))
        setResults(items.slice(0, 30))
      })
      .catch((err) => {
        const status = err.response?.status
        const msg = err.response?.data?.error || err.message || 'Search failed.'
        const hint = status === 404 || err.code === 'ERR_NETWORK'
          ? ' Ensure the situational-awareness API is running (e.g. npm run dev in situational-awareness-api) and reachable at http://localhost:3001, or set VITE_API_URL in .env.'
          : status === 502
            ? ' SearXNG instance may be down. Try "Open DuckDuckGo in new tab" below.'
            : ''
        setError(msg + hint)
        setResults([])
      })
      .finally(() => setLoading(false))
  }

  const openDuckDuckGo = () => {
    const q = String(query).trim()
    if (!q) return
    window.open(`${DUCKDUCKGO_URL}?q=${encodeURIComponent(q)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="advanced-search-page">
      <div className="advanced-search-top">
        <section className="advanced-search">
          <h3 className="advanced-search-title">Advanced search (SearXNG)</h3>
          <p className="advanced-search-desc">
            Uses the backend SearXNG instance. Results appear below. If the backend is unavailable, use <strong>Open DuckDuckGo in new tab</strong>.
          </p>
          <div className="advanced-search-bar">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search the web…"
              className="advanced-search-input"
            />
            <button type="button" className="advanced-search-btn" onClick={handleSearch} disabled={loading || !String(query).trim()}>
              {loading ? '…' : 'Search'}
            </button>
            <button type="button" className="advanced-search-btn advanced-search-btn--secondary" onClick={openDuckDuckGo} disabled={!String(query).trim()} title="Fallback: open DuckDuckGo in new tab">
              Open DuckDuckGo in new tab
            </button>
          </div>
          {error && <p className="advanced-search-error">{error}</p>}
          {results.length > 0 && (
            <ul className="advanced-search-results">
              {results.map((r, i) => (
                <li key={r.link || r.url || i} className="advanced-search-result">
                  <a href={r.link || r.url || '#'} target="_blank" rel="noopener noreferrer" className="advanced-search-link">
                    {r.title || r.name || 'Untitled'}
                  </a>
                  {(r.snippet || r.description) && (
                    <p className="advanced-search-snippet">{(r.snippet || r.description).slice(0, 200)}{(r.snippet || r.description).length > 200 ? '…' : ''}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="advanced-search-dorking">
          <h4 className="advanced-search-dorking-title">Search operators (SearXNG)</h4>
          <ul className="advanced-search-dorking-list">
            <li><code>site:example.com</code> — only results from that site</li>
            <li><code>filetype:pdf</code> — e.g. PDFs, XLS, DOC</li>
            <li><code>intitle:"phrase"</code> — phrase in page title</li>
            <li><code>inurl:admin</code> — URL contains “admin”</li>
            <li><code>"exact phrase"</code> — exact match</li>
            <li><code>-word</code> — exclude pages containing <em>word</em></li>
            <li><code>word1 OR word2</code> — either term</li>
            <li><code>after:2024-01-01</code> — results after date</li>
            <li><code>intext:keyword</code> — keyword in body</li>
          </ul>
          <p className="advanced-search-dorking-note">Combine operators (e.g. <code>site:gov filetype:pdf "report"</code>) for OSINT.</p>
        </aside>
      </div>
    </div>
  )
}
