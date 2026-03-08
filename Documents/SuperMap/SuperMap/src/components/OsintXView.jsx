import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { useSavedXPosts } from '../contexts/SavedXPostsContext'
import './OsintXView.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

function relativeTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const now = Date.now()
  const sec = Math.floor((now - d) / 1000)
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`
  return d.toLocaleDateString(undefined, { dateStyle: 'short' })
}

function youtubeEmbedUrl(url) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

function vimeoEmbedUrl(url) {
  if (!url || !url.includes('vimeo.com')) return null
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  return m ? `https://player.vimeo.com/video/${m[1]}` : null
}

const SORT_OPTIONS = [
  { value: 'time', label: 'Time (newest)' },
  { value: 'time-asc', label: 'Time (oldest)' },
  { value: 'creator', label: 'Creator (A–Z)' },
  { value: 'tags', label: 'Tags' },
]

const REPORT_X_POSTS_KEY = 'supermap_report_x_posts'

export default function OsintXView({ keywordFilter = '', onClearFilter, onPinnedToMap }) {
  const { user } = useAuth()
  const { addPost, isSavedPost } = useSavedXPosts()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sortBy, setSortBy] = useState('time')
  const [filterTag, setFilterTag] = useState('')
  const [filterCreator, setFilterCreator] = useState('')
  const [pinningId, setPinningId] = useState(null)
  const [pinError, setPinError] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [saveError, setSaveError] = useState(null)

  const fetchPosts = () => {
    if (!API_BASE) {
      setPosts([])
      setLoading(false)
      return
    }
    axios
      .get(`${API_BASE}/api/osint-x`, { params: { limit: 150 }, timeout: 15000 })
      .then((res) => setPosts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPosts([]))
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }

  useEffect(() => {
    setLoading(true)
    fetchPosts()
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchPosts()
  }

  const q = (keywordFilter || '').trim().toLowerCase()
  const filterTags = useMemo(() => [...new Set(posts.flatMap((p) => (p.tags || []).filter((t) => t !== 'x' && t !== 'osint')))].sort(), [posts])
  const filterCreators = useMemo(() => [...new Set(posts.map((p) => p.account).filter(Boolean))].sort(), [posts])

  const filtered = useMemo(() => {
    let list = posts
    if (q) {
      list = list.filter((p) => {
        const text = `${p.account || ''} ${p.title || ''} ${p.content || ''} ${(p.tags || []).join(' ')}`.toLowerCase()
        return text.includes(q)
      })
    }
    if (filterTag) {
      list = list.filter((p) => (p.tags || []).includes(filterTag))
    }
    if (filterCreator) {
      list = list.filter((p) => (p.account || '') === filterCreator)
    }
    if (sortBy === 'time') list = [...list].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    else if (sortBy === 'time-asc') list = [...list].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    else if (sortBy === 'creator') list = [...list].sort((a, b) => (a.account || '').localeCompare(b.account || ''))
    else if (sortBy === 'tags') list = [...list].sort((a, b) => (a.tags || []).join(',').localeCompare((b.tags || []).join(',')))
    return list
  }, [posts, q, filterTag, filterCreator, sortBy])

  const handlePinToMap = (post) => {
    if (!API_BASE || !onPinnedToMap) return
    setPinError(null)
    setPinningId(post.id)
    axios
      .post(`${API_BASE}/api/events/pin-from-text`, {
        title: post.title || post.content?.slice(0, 200) || 'Post',
        description: post.content || '',
        source: 'x',
        url: post.url,
      }, { timeout: 12000 })
      .then((res) => {
        if (res.data?.error) {
          setPinError(res.data.error)
          return
        }
        if (res.data && onPinnedToMap) onPinnedToMap(res.data)
      })
      .catch((err) => setPinError(err.response?.data?.error || err.message || 'Could not find location'))
      .finally(() => setPinningId(null))
  }

  const handleSavePost = async (post) => {
    if (!user) {
      setSaveError('Sign in to save X posts')
      return
    }
    setSaveError(null)
    setSavingId(post.id)
    try {
      await addPost(post)
    } catch (err) {
      setSaveError(err?.message || 'Could not save post')
    } finally {
      setSavingId(null)
    }
  }

  const handlePinToReport = (post) => {
    try {
      const current = JSON.parse(localStorage.getItem(REPORT_X_POSTS_KEY) || '[]')
      const next = Array.isArray(current) ? current : []
      const url = String(post?.url || '').trim()
      if (!url) return
      if (!next.some((p) => p.url === url)) {
        next.unshift({
          url,
          account: post?.account || '',
          title: post?.title || '',
          content: post?.content || '',
          timestamp: post?.timestamp || null,
        })
      }
      localStorage.setItem(REPORT_X_POSTS_KEY, JSON.stringify(next.slice(0, 100)))
    } catch {}
  }

  return (
    <div className="osint-x-view">
      <header className="osint-x-header">
        <h2 className="osint-x-title">OSINT (X)</h2>
        <p className="osint-x-subtitle">Posts from OSINT accounts via RSS (Nitter). Sorted by priority and recency.</p>
        <p className="osint-x-map-hint">To see these posts on the map, switch to the <strong>MAPS</strong> tab below, then open <strong>OSINT Map</strong> in the sidebar.</p>
        <div className="osint-x-toolbar">
          <label className="osint-x-filter-label">
            Sort:
            <select className="osint-x-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="osint-x-filter-label">
            Creator:
            <select className="osint-x-select" value={filterCreator} onChange={(e) => setFilterCreator(e.target.value)}>
              <option value="">All</option>
              {filterCreators.map((c) => <option key={c} value={c}>@{c}</option>)}
            </select>
          </label>
          <label className="osint-x-filter-label">
            Tag:
            <select className="osint-x-select" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
              <option value="">All</option>
              {filterTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="osint-x-refresh"
            onClick={handleRefresh}
            disabled={loading || refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          {q && onClearFilter && (
            <button type="button" className="osint-x-clear-filter" onClick={onClearFilter}>
              Clear search
            </button>
          )}
        </div>
        {pinError && <p className="osint-x-pin-error">{pinError}</p>}
        {saveError && <p className="osint-x-pin-error">{saveError}</p>}
      </header>

      {loading && !refreshing ? (
        <p className="osint-x-loading">Loading OSINT X feed…</p>
      ) : !API_BASE ? (
        <p className="osint-x-error">Connect to the situational-awareness API (VITE_API_URL) to load this feed.</p>
      ) : filtered.length === 0 ? (
        <div className="osint-x-empty">
          <p>{q ? 'No posts match the current search.' : 'No posts yet. The feed updates every 2 minutes. Try Refresh.'}</p>
          {q && onClearFilter && (
            <button type="button" className="osint-x-clear-filter" onClick={onClearFilter}>Clear search</button>
          )}
        </div>
      ) : (
        <ul className="osint-x-list">
          {filtered.map((post) => (
            <li key={post.id} className="osint-x-card">
              <div className="osint-x-card-meta">
                <span className="osint-x-account">@{post.account}</span>
                <span className="osint-x-time">{relativeTime(post.timestamp)}</span>
                {post.priority && post.priority !== 'medium' && (
                  <span className={`osint-x-priority osint-x-priority--${post.priority}`}>{post.priority}</span>
                )}
              </div>
              {(post.tags || []).length > 0 && (
                <div className="osint-x-tags">
                  {(post.tags || []).filter((t) => t !== 'x' && t !== 'osint').map((tag) => (
                    <span key={tag} className="osint-x-tag">{tag}</span>
                  ))}
                </div>
              )}
              <p className="osint-x-content">
                {post.title || post.content || '—'}
              </p>
              {Array.isArray(post.images) && post.images.length > 0 && (
                <div className="osint-x-media osint-x-media--images">
                  {post.images.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="osint-x-media-link">
                      <img src={src} alt="" className="osint-x-img" loading="lazy" referrerPolicy="no-referrer" />
                    </a>
                  ))}
                </div>
              )}
              {Array.isArray(post.videos) && post.videos.length > 0 && (
                <div className="osint-x-media osint-x-media--videos">
                  {(post.videos || []).map((src, i) => {
                    const yt = youtubeEmbedUrl(src)
                    const vimeo = vimeoEmbedUrl(src)
                    const isDirect = /\.(mp4|webm|ogg)(\?|$)/i.test(src)
                    if (yt) {
                      return (
                        <div key={i} className="osint-x-video-wrap">
                          <iframe title="YouTube" src={yt} className="osint-x-embed" allowFullScreen />
                        </div>
                      )
                    }
                    if (vimeo) {
                      return (
                        <div key={i} className="osint-x-video-wrap">
                          <iframe title="Vimeo" src={vimeo} className="osint-x-embed" allowFullScreen />
                        </div>
                      )
                    }
                    if (isDirect) {
                      return (
                        <div key={i} className="osint-x-video-wrap">
                          <video src={src} controls className="osint-x-video" />
                        </div>
                      )
                    }
                    return (
                      <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="osint-x-link">
                        Watch video →
                      </a>
                    )
                  })}
                </div>
              )}
              <div className="osint-x-card-actions">
                {post.url && (
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="osint-x-link"
                  >
                    View Source →
                  </a>
                )}
                {onPinnedToMap && API_BASE && (
                  <button
                    type="button"
                    className="osint-x-pin-btn"
                    onClick={() => handlePinToMap(post)}
                    disabled={pinningId === post.id}
                    title="Find location and pin to Conflict Map"
                  >
                    {pinningId === post.id ? '…' : 'Pin to map'}
                  </button>
                )}
                <button
                  type="button"
                  className="osint-x-pin-btn"
                  onClick={() => handlePinToReport(post)}
                  title="Add this post to Report Maker"
                >
                  Pin to report
                </button>
                <button
                  type="button"
                  className="osint-x-pin-btn"
                  onClick={() => handleSavePost(post)}
                  disabled={savingId === post.id || isSavedPost(post.url)}
                  title="Save post to your account"
                >
                  {isSavedPost(post.url) ? 'Saved' : savingId === post.id ? 'Saving…' : 'Save post'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
