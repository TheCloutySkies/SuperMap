import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { useSavedArticles } from '../contexts/SavedArticlesContext'
import './FeedsView.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

const FEED_MODE = { NEWS: 'GLOBAL_NEWS', OSINT: 'GENERAL_OSINT' }
const OSINT_SUB = { INTEL: 'intel', REDDIT: 'reddit' }

/** Display name for OSINT source (actual source, not alert type). */
function osintSourceDisplayName(source) {
  const s = (source || '').toLowerCase()
  if (s === 'bellingcat') return 'Bellingcat'
  if (s === 'cisa') return 'CISA'
  if (s === 'dw') return 'DW'
  if (s === 'isw') return 'ISW'
  if (s === 'defenseone') return 'Defense One'
  if (s === 'warontherocks') return 'War on the Rocks'
  if (s === 'defensenews') return 'Defense News'
  if (s === 'thewarzone') return 'The War Zone'
  return source || '—'
}
const SOURCE_SECTIONS_NEWS = [
  { key: 'all', label: 'All sources' },
  { key: 'Wikipedia', label: 'Wikipedia' },
  { key: 'Reddit', label: 'Reddit RSS' },
  { key: 'Google News', label: 'Google RSS' },
]

const SOURCE_SECTIONS_OSINT = [
  { key: 'all', label: 'All sources' },
  { key: 'bellingcat', label: 'Bellingcat' },
  { key: 'cisa', label: 'CISA' },
  { key: 'dw', label: 'DW' },
  { key: 'isw', label: 'Institute for the Study of War' },
  { key: 'defenseone', label: 'Defense One' },
  { key: 'warontherocks', label: 'War on the Rocks' },
  { key: 'defensenews', label: 'Defense News' },
  { key: 'thewarzone', label: 'The War Zone' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'source', label: 'Source (A–Z)' },
]

function matchesSource(item, sourceFilter, feedMode) {
  if (!sourceFilter || sourceFilter === 'all') return true
  const s = (item.source || '').toLowerCase()
  if (feedMode === FEED_MODE.OSINT) {
    return s === sourceFilter.toLowerCase()
  }
  if (sourceFilter === 'Wikipedia') return s.includes('wikipedia')
  if (sourceFilter === 'Reddit') return s.includes('reddit')
  if (sourceFilter === 'Google News') return s.includes('google')
  return s.includes(sourceFilter.toLowerCase())
}


function geoJsonToItems(data) {
  if (Array.isArray(data)) return data
  if (data?.features && Array.isArray(data.features)) {
    return data.features.map((f) => ({
      ...(f.properties || {}),
      id: f.properties?.id ?? f.id,
      title: f.properties?.title,
      source: f.properties?.source,
      link: f.properties?.link,
      pubDate: f.properties?.timestamp != null ? new Date(f.properties.timestamp).toISOString() : null,
      contentSnippet: f.properties?.description ?? f.properties?.contentSnippet,
      coordinates: f.geometry?.type === 'Point' ? f.geometry.coordinates : null,
    }))
  }
  return []
}

export default function FeedsView({ title, activeView, keywordFilter = '', onClearFilter, initialNews, onPinnedToMap }) {
  const initialItems = initialNews ? geoJsonToItems(initialNews) : []
  const isNewsOnly = activeView === 'news-feeds'
  const isOsintOnly = activeView === 'osint-feeds'
  const [feedMode, setFeedMode] = useState(isOsintOnly ? FEED_MODE.OSINT : FEED_MODE.NEWS)
  const [newsItems, setNewsItems] = useState(initialItems)
  const [osintItems, setOsintItems] = useState([])
  const [newsLoading, setNewsLoading] = useState(initialItems.length === 0)
  const [osintLoading, setOsintLoading] = useState(true)
  const { user, isConfigured: authConfigured } = useAuth()
  const { add: saveArticle, remove: unsaveArticle, isSaved } = useSavedArticles()
  const [savingId, setSavingId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [osintSub, setOsintSub] = useState(OSINT_SUB.INTEL)
  const [redditSignals, setRedditSignals] = useState([])
  const [redditSignalsLoading, setRedditSignalsLoading] = useState(false)
  const [pinningId, setPinningId] = useState(null)
  const [pinError, setPinError] = useState(null)

  useEffect(() => {
    if (activeView === 'news-feeds') setFeedMode(FEED_MODE.NEWS)
    else if (activeView === 'osint-feeds') setFeedMode(FEED_MODE.OSINT)
  }, [activeView])

  useEffect(() => {
    if (!API_BASE) {
      setNewsLoading(false)
      return
    }
    let cancelled = false
    let retryId = null
    if (!initialNews) setNewsLoading(true)

    function doFetch() {
      axios.get(`${API_BASE}/api/news`, { timeout: 25000 })
        .then((res) => {
          if (cancelled) return
          const items = geoJsonToItems(res.data)
          setNewsItems(items)
          if (Array.isArray(items) && items.length === 0) {
            retryId = setTimeout(() => {
              if (cancelled) return
              setNewsLoading(true)
              doFetch()
            }, 2500)
          }
        })
        .catch(() => {
          if (!cancelled) setNewsItems([])
          retryId = setTimeout(() => {
            if (cancelled) return
            setNewsLoading(true)
            doFetch()
          }, 2500)
        })
        .finally(() => {
          if (!cancelled) setNewsLoading(false)
        })
    }
    doFetch()
    return () => {
      cancelled = true
      if (retryId) clearTimeout(retryId)
    }
  }, [])

  useEffect(() => {
    if (!API_BASE) {
      setOsintLoading(false)
      return
    }
    let cancelled = false
    setOsintLoading(true)
    axios.get(`${API_BASE}/api/osint`, { timeout: 25000 })
      .then((res) => { if (!cancelled) setOsintItems(geoJsonToItems(res.data)) })
      .catch(() => { if (!cancelled) setOsintItems([]) })
      .finally(() => { if (!cancelled) setOsintLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (osintSub !== OSINT_SUB.REDDIT) return
    let cancelled = false
    setRedditSignalsLoading(true)
    axios.get(`${API_BASE}/api/reddit-signals`, { params: { limit: 80 }, timeout: 15000 })
      .then((res) => { if (!cancelled) setRedditSignals(Array.isArray(res.data) ? res.data : []) })
      .catch(() => { if (!cancelled) setRedditSignals([]) })
      .finally(() => { if (!cancelled) setRedditSignalsLoading(false) })
    return () => { cancelled = true }
  }, [osintSub])

  const handlePinToMap = (item) => {
    if (!API_BASE || !onPinnedToMap) return
    const id = item.id || item.link
    setPinError(null)
    setPinningId(id)
    axios
      .post(`${API_BASE}/api/events/pin-from-text`, {
        title: item.title || 'Untitled',
        description: item.contentSnippet || '',
        source: item.source || 'osint',
        url: item.link,
      }, { timeout: 12000 })
      .then((res) => {
        if (res.data?.error) {
          setPinError(res.data.error)
          return
        }
        if (res.data && onPinnedToMap) onPinnedToMap(res.data)
      })
      .catch((err) => {
        setPinError(err.response?.data?.error || err.message || 'Could not find location')
      })
      .finally(() => setPinningId(null))
  }

  const refreshFeeds = () => {
    setRefreshing(true)
    setNewsLoading(true)
    setOsintLoading(true)
    if (osintSub === OSINT_SUB.REDDIT) setRedditSignalsLoading(true)
    const requests = [
      axios.get(`${API_BASE}/api/news`, { timeout: 15000 }),
      axios.get(`${API_BASE}/api/osint`, { timeout: 15000 }),
    ]
    if (osintSub === OSINT_SUB.REDDIT) {
      requests.push(axios.get(`${API_BASE}/api/reddit-signals`, { params: { limit: 80 }, timeout: 15000 }))
    }
    Promise.all(requests)
      .then((responses) => {
        setNewsItems(geoJsonToItems(responses[0].data))
        setOsintItems(geoJsonToItems(responses[1].data))
        if (osintSub === OSINT_SUB.REDDIT && responses[2] && Array.isArray(responses[2].data)) {
          setRedditSignals(responses[2].data)
        }
      })
      .catch(() => {
        setNewsItems([])
        setOsintItems([])
        if (osintSub === OSINT_SUB.REDDIT) setRedditSignals([])
      })
      .finally(() => {
        setNewsLoading(false)
        setOsintLoading(false)
        setRefreshing(false)
        if (osintSub === OSINT_SUB.REDDIT) setRedditSignalsLoading(false)
      })
  }

  const q = (keywordFilter || '').trim().toLowerCase()

  const newsSourceList = useMemo(() => newsItems, [newsItems])

  const filteredAndSortedNews = useMemo(() => {
    let list = newsSourceList.filter(
      (item) =>
        matchesSource(item, sourceFilter, FEED_MODE.NEWS) &&
        (!q ||
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.source && item.source.toLowerCase().includes(q)) ||
          (item.contentSnippet && item.contentSnippet.toLowerCase().includes(q)))
    )
    if (sortBy === 'newest') list = [...list].sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    else if (sortBy === 'oldest') list = [...list].sort((a, b) => new Date(a.pubDate || 0) - new Date(b.pubDate || 0))
    else if (sortBy === 'source') list = [...list].sort((a, b) => (a.source || '').localeCompare(b.source || ''))
    return list
  }, [newsSourceList, sourceFilter, sortBy, q])

  const filteredAndSortedOsint = useMemo(() => {
    let list = osintItems.filter(
      (item) =>
        matchesSource(item, sourceFilter, FEED_MODE.OSINT) &&
        (!q ||
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.source && item.source.toLowerCase().includes(q)) ||
          (item.contentSnippet && item.contentSnippet.toLowerCase().includes(q)))
    )
    if (sortBy === 'newest') list = [...list].sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    else if (sortBy === 'oldest') list = [...list].sort((a, b) => new Date(a.pubDate || 0) - new Date(b.pubDate || 0))
    else if (sortBy === 'source') list = [...list].sort((a, b) => (a.source || '').localeCompare(b.source || ''))
    return list
  }, [osintItems, sourceFilter, sortBy, q])

  const loading = newsLoading || osintLoading
  const isEmpty = feedMode === FEED_MODE.NEWS ? !newsSourceList.length : !osintItems.length
  const filteredEmpty = feedMode === FEED_MODE.NEWS ? !filteredAndSortedNews.length : !filteredAndSortedOsint.length

  return (
    <div className={`feeds-dashboard feeds-dashboard--${feedMode === FEED_MODE.NEWS ? 'news' : 'osint'}`}>
      <div className="feeds-dashboard-header">
        <div className="feeds-dashboard-title-row">
          <h1>{title}</h1>
          <button
            type="button"
            className="feeds-refresh-btn"
            onClick={refreshFeeds}
            disabled={refreshing || loading}
            title="Reload feeds from the API"
          >
            {refreshing || loading ? '…' : '↻'} Refresh
          </button>
        </div>
        <p className="feeds-dashboard-subtitle">
          {feedMode === FEED_MODE.NEWS ? 'Wikipedia, Reddit, Google News, BBC & more' : 'Breaking alerts (Faytuks), Investigations (Bellingcat), Cybersecurity (CISA), International news (DW)'}
        </p>
      </div>

      {!isNewsOnly && !isOsintOnly && (
        <div className="feeds-subnav">
          <button
            type="button"
            className={`feeds-subnav-btn ${feedMode === FEED_MODE.NEWS ? 'active' : ''}`}
            onClick={() => { setFeedMode(FEED_MODE.NEWS); setSourceFilter('all') }}
          >
            News
          </button>
          <button
            type="button"
            className={`feeds-subnav-btn ${feedMode === FEED_MODE.OSINT ? 'active' : ''}`}
            onClick={() => { setFeedMode(FEED_MODE.OSINT); setSourceFilter('all') }}
          >
            OSINT
          </button>
        </div>
      )}

      <div className="feeds-toolbar">
        <div className="feeds-source-filter">
          <span className="feeds-toolbar-label">Source:</span>
          {(feedMode === FEED_MODE.OSINT || isOsintOnly ? SOURCE_SECTIONS_OSINT : SOURCE_SECTIONS_NEWS).map((sec) => (
            <button
              key={sec.key}
              type="button"
              className={`feeds-source-chip ${sourceFilter === sec.key ? 'active' : ''}`}
              onClick={() => setSourceFilter(sec.key)}
            >
              {sec.label}
            </button>
          ))}
        </div>
        <div className="feeds-sort">
          <label htmlFor="feeds-sort-select" className="feeds-toolbar-label">Sort:</label>
          <select
            id="feeds-sort-select"
            className="feeds-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {(feedMode === FEED_MODE.NEWS || isNewsOnly) && (
        <div className="feeds-news-section">
          {newsLoading ? (
            <p className="feeds-loading">Loading news…</p>
          ) : filteredEmpty ? (
            <div className="feeds-empty">
              {isEmpty ? (
                <p>Couldn’t load feeds. Run <code>npm run dev:all</code> from the SuperMap folder, then use <strong>Refresh</strong>.</p>
              ) : (
                <>
                  <p>No items match the current filters.</p>
                  {onClearFilter && (
                    <button type="button" className="feeds-clear-filter" onClick={onClearFilter}>Clear search</button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="feeds-masonry feeds-masonry--news">
              {filteredAndSortedNews.map((item, i) => {
                const link = item.link || item.url
                const saved = authConfigured && isSaved(link)
                const handleSave = (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!authConfigured) return
                  if (!user) {
                    onSignInRequired?.()
                    return
                  }
                  if (saved) {
                    unsaveArticle(link)
                    return
                  }
                  setSavingId(link)
                  saveArticle(item).finally(() => setSavingId(null))
                }
                return (
                  <div key={item.link || item.id || i} className="feeds-news-card-wrap">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="feeds-news-card"
                    >
                      {item.thumbnail && (
                        <div className="feeds-news-card-img-wrap">
                          <img src={item.thumbnail} alt="" className="feeds-news-card-img" />
                        </div>
                      )}
                      <div className="feeds-news-card-body">
                        <span className="feeds-news-card-source">{item.source}</span>
                        <h3 className="feeds-news-card-title">{item.title || 'Untitled'}</h3>
                        <span className="feeds-news-card-date">
                          {item.pubDate ? new Date(item.pubDate).toLocaleDateString(undefined, { dateStyle: 'short' }) : ''}
                        </span>
                      </div>
                    </a>
                    {authConfigured && (
                      <button
                        type="button"
                        className={`feeds-save-btn ${saved ? 'saved' : ''}`}
                        onClick={handleSave}
                        disabled={savingId === link}
                        title={saved ? 'Unsave' : 'Save article'}
                      >
                        {savingId === link ? '…' : saved ? '✓ Saved' : 'Save'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {(feedMode === FEED_MODE.OSINT || isOsintOnly) && (
        <div className="feeds-osint-section">
          <div className="feeds-osint-subnav">
            <button
              type="button"
              className={`feeds-osint-subnav-btn ${osintSub === OSINT_SUB.INTEL ? 'active' : ''}`}
              onClick={() => setOsintSub(OSINT_SUB.INTEL)}
            >
              Intel Feed
            </button>
            <button
              type="button"
              className={`feeds-osint-subnav-btn ${osintSub === OSINT_SUB.REDDIT ? 'active' : ''}`}
              onClick={() => setOsintSub(OSINT_SUB.REDDIT)}
            >
              Live Reddit Discourse
            </button>
            <span className="feeds-osint-warning">(WARNING: Might include cringe.)</span>
          </div>

          {osintSub === OSINT_SUB.INTEL && (
            <>
              {osintLoading ? (
                <p className="feeds-loading">Loading OSINT…</p>
              ) : filteredEmpty ? (
                <div className="feeds-empty feeds-empty--osint">
                  {isEmpty ? (
                    <p>Couldn’t load OSINT feeds. Start the API (<code>npm run dev</code> in situational-awareness-api) and use <strong>Refresh</strong>.</p>
                  ) : (
                    <>
                      <p>No items match the current filters.</p>
                      {sourceFilter && sourceFilter !== 'all' && (
                        <p className="feeds-empty-hint">The API fetches ISW, Defense One, War on the Rocks, Defense News, and The War Zone every few minutes. Try <strong>Refresh</strong> in a moment.</p>
                      )}
                      {onClearFilter && (
                        <button type="button" className="feeds-clear-filter" onClick={onClearFilter}>Clear search</button>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="feeds-osint-table-wrap">
                  <table className="feeds-terminal-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Source</th>
                        <th>Alert</th>
                        <th>Content</th>
                        {authConfigured && <th>Save</th>}
                        {onPinnedToMap && <th>Map</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {pinError && (
                        <tr><td colSpan={4 + (authConfigured ? 1 : 0) + (onPinnedToMap ? 1 : 0)} className="feeds-pin-error">{pinError}</td></tr>
                      )}
                      {filteredAndSortedOsint.map((item, i) => {
                        const link = item.link || item.url
                        const saved = authConfigured && isSaved(link)
                        const handleSave = (e) => {
                          if (!user) {
                            onSignInRequired?.()
                            return
                          }
                          if (saved) {
                            unsaveArticle(link)
                            return
                          }
                          setSavingId(link)
                          saveArticle(item).finally(() => setSavingId(null))
                        }
                        return (
                        <tr
                          key={item.link || item.id || i}
                          className={`feeds-osint-row feeds-osint-alert-${item.alertLevel || 'medium'}`}
                        >
                          <td className="feeds-osint-time">
                            {item.pubDate ? new Date(item.pubDate).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                          </td>
                          <td className="feeds-osint-source">{osintSourceDisplayName(item.source)}</td>
                          <td className="feeds-osint-badge">{item.alertLevel || '—'}</td>
                          <td className="feeds-osint-content">
                            <a href={item.link} target="_blank" rel="noopener noreferrer">
                              {item.title || 'Untitled'}
                            </a>
                            {item.contentSnippet && (
                              <div className="feeds-osint-raw">{item.contentSnippet.slice(0, 200)}</div>
                            )}
                          </td>
                          {authConfigured && (
                            <td className="feeds-osint-save">
                              <button
                                type="button"
                                className={`feeds-pin-to-map-btn feeds-save-btn-inline ${saved ? 'saved' : ''}`}
                                onClick={handleSave}
                                disabled={savingId === link}
                                title={saved ? 'Unsave' : 'Save article'}
                              >
                                {savingId === link ? '…' : saved ? '✓' : 'Save'}
                              </button>
                            </td>
                          )}
                          {onPinnedToMap && (
                            <td className="feeds-osint-pin">
                              <button
                                type="button"
                                className="feeds-pin-to-map-btn"
                                onClick={() => handlePinToMap(item)}
                                disabled={pinningId === (item.id || item.link)}
                                title="Find location from text and pin to Conflict Map"
                              >
                                {pinningId === (item.id || item.link) ? '…' : 'Pin to map'}
                              </button>
                            </td>
                          )}
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {osintSub === OSINT_SUB.REDDIT && (
            <div className="feeds-reddit-stream">
              {redditSignalsLoading ? (
                <p className="feeds-loading">Loading Reddit signals…</p>
              ) : !redditSignals.length ? (
                <div className="feeds-empty feeds-empty--osint">
                  <p>No Reddit signals yet. The API ingests comments every 60s from conflict, OSINT, and news subreddits.</p>
                  <p>Use <strong>Refresh</strong> after the backend has run at least one cycle.</p>
                </div>
              ) : (
                <div className="feeds-reddit-list">
                  {redditSignals.map((sig) => {
                    const age = sig.timestamp ? (() => {
                      const min = Math.floor((Date.now() - sig.timestamp) / 60000)
                      if (min < 1) return '<1m'
                      if (min < 60) return `${min}m`
                      const h = Math.floor(min / 60)
                      return `${h}h`
                    })() : '—'
                    return (
                      <article key={sig.id} className="feeds-reddit-card">
                        <div className="feeds-reddit-meta">
                          {(sig.signals && sig.signals.length) ? (
                            <span className="feeds-reddit-signal-tags">
                              {sig.signals.map((s) => (
                                <span key={s} className="feeds-reddit-signal-tag">{s}</span>
                              ))}
                            </span>
                          ) : null}
                          <span className="feeds-reddit-sub">r/{sig.subreddit}</span>
                          <span className="feeds-reddit-score">Score: {sig.score ?? '—'}</span>
                          <span className="feeds-reddit-age">Age: {age}</span>
                        </div>
                        <blockquote className="feeds-reddit-comment">
                          "{((sig.description || sig.title || '').slice(0, 300))}{(sig.description && sig.description.length > 300) ? '…' : ''}"
                        </blockquote>
                        {sig.link && (
                          <a href={sig.link} target="_blank" rel="noopener noreferrer" className="feeds-reddit-link">
                            View Thread
                          </a>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
