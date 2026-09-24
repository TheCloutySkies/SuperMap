import { useState, useEffect, useMemo, useRef } from 'react'
import axios from 'axios'
import { getApiBase, readHomeSnapshot, writeHomeSnapshot } from '../lib/homeBootstrap'
import './OsintXView.css'

const API_BASE = getApiBase()

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

/** Hosts that serve video without CORS; use link instead of <video> to avoid CORS errors. */
function isCrossOriginVideoNoCors(url) {
  if (!url || typeof url !== 'string') return false
  try {
    const u = new URL(url)
    const host = (u.hostname || '').toLowerCase()
    return /twimg\.com/i.test(host)
  } catch {
    return /twimg\.com/i.test(url)
  }
}

function readSnapshotPosts() {
  try {
    const snap = readHomeSnapshot()
    return Array.isArray(snap?.osintX) ? snap.osintX : []
  } catch {
    return []
  }
}

const SORT_OPTIONS = [
  { value: 'time', label: 'Time (newest)' },
  { value: 'time-asc', label: 'Time (oldest)' },
  { value: 'creator', label: 'Creator (A–Z)' },
  { value: 'tags', label: 'Tags' },
]

const REPORT_X_POSTS_KEY = 'supermap_report_x_posts'

export default function OsintXView({ keywordFilter = '', onClearFilter, onPinnedToMap }) {
  const snapshotPosts = useRef(typeof window !== 'undefined' ? readSnapshotPosts() : [])
  const [posts, setPosts] = useState(() => snapshotPosts.current)
  const [loading, setLoading] = useState(() => snapshotPosts.current.length === 0)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [sortBy, setSortBy] = useState('time')
  const [filterTag, setFilterTag] = useState('')
  const [filterCreator, setFilterCreator] = useState('')
  const [pinningId, setPinningId] = useState(null)
  const [pinError, setPinError] = useState(null)
  const [videoDialog, setVideoDialog] = useState(null)
  const [imageDialog, setImageDialog] = useState(null)
  const [imageDownloading, setImageDownloading] = useState(false)
  const fetchGen = useRef(0)

  const openImageDialog = (post, src) => {
    setImageDialog({
      src: String(src || '').trim(),
      postUrl: String(post?.url || '').trim(),
      caption: (post?.content || post?.title || '').trim().slice(0, 500),
    })
  }

  const handleDownloadImage = async () => {
    if (!imageDialog?.src || imageDownloading) return
    setImageDownloading(true)
    try {
      const res = await fetch(imageDialog.src, { mode: 'cors', credentials: 'omit' })
      if (!res.ok) throw new Error(res.statusText)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `osint-image-${Date.now()}.${(blob.type || 'image').split('/')[1] || 'jpg'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      window.open(imageDialog.src, '_blank', 'noopener,noreferrer')
    } finally {
      setImageDownloading(false)
    }
  }

  const applyPosts = (next) => {
    if (!Array.isArray(next)) return
    setPosts(next)
    setLoadError(null)
    try {
      const prev = readHomeSnapshot() || {}
      writeHomeSnapshot({ ...prev, osintX: next.slice(0, 100) })
    } catch { /* optional cache */ }
  }

  const fetchPosts = async (force = false) => {
    if (!API_BASE) {
      setPosts([])
      setLoading(false)
      setRefreshing(false)
      setLoadError('No API URL configured (VITE_API_URL).')
      return
    }
    const gen = ++fetchGen.current
    const params = { limit: 150 }
    if (force) params.refresh = '1'
    // Soft load: allow up to 45s. Force: API budgets ~22s so 50s is ample.
    const timeout = force ? 50000 : 45000
    try {
      const res = await axios.get(`${API_BASE}/api/osint-x`, {
        params,
        timeout,
        headers: force ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : undefined,
      })
      if (gen !== fetchGen.current) return
      const next = Array.isArray(res.data) ? res.data : []
      if (next.length > 0) {
        applyPosts(next)
        return
      }
      if (!force) {
        // Empty DB — try one soft force pull, but keep snapshot if that fails
        setRefreshing(true)
        try {
          const retry = await axios.get(`${API_BASE}/api/osint-x`, {
            params: { limit: 150, refresh: '1' },
            timeout: 50000,
            headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
          })
          if (gen !== fetchGen.current) return
          const retryPosts = Array.isArray(retry.data) ? retry.data : []
          if (retryPosts.length > 0) {
            applyPosts(retryPosts)
            return
          }
          setLoadError('FxTwitter returned no posts yet. Retry in a minute.')
        } catch (err) {
          if (gen !== fetchGen.current) return
          setLoadError(err.code === 'ECONNABORTED'
            ? 'Timed out loading OSINT X. The API may be cold — tap Retry.'
            : (err.message || 'Failed to load OSINT X.'))
        }
        return
      }
      setLoadError('No posts in the last 48h. Tap Retry to pull FxTwitter again.')
    } catch (err) {
      if (gen !== fetchGen.current) return
      // Never wipe existing posts on failure — avoids empty ↔ refresh loop.
      const timedOut = err.code === 'ECONNABORTED'
      setPosts((prev) => {
        if (prev.length === 0) {
          setLoadError(timedOut
            ? 'Timed out reaching the API. Tap Retry (cold starts can take a minute).'
            : (err.response?.data?.error || err.message || 'Failed to load OSINT X.'))
        } else {
          setLoadError(timedOut
            ? 'Refresh timed out — still showing last loaded posts.'
            : `Refresh failed — still showing last loaded posts. (${err.message || 'error'})`)
        }
        return prev
      })
    } finally {
      if (gen === fetchGen.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  useEffect(() => {
    if (snapshotPosts.current.length) setLoading(false)
    fetchPosts(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    setLoadError(null)
    fetchPosts(true)
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

  const openVideoDialog = (post, src) => {
    setVideoDialog({
      src: String(src || '').trim(),
      postUrl: String(post?.url || '').trim(),
      account: post?.account || 'x',
    })
  }

  return (
    <div className="osint-x-view">
      <header className="osint-x-header">
        <h2 className="osint-x-title">OSINT (X)</h2>
        <p className="osint-x-subtitle">Posts from OSINT accounts via FxTwitter (no API key). Sorted by priority and recency.</p>
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
        {loadError && !loading && <p className="osint-x-load-error" role="status">{loadError}</p>}
      </header>

      {loading && !refreshing && posts.length === 0 ? (
        <p className="osint-x-loading">Loading OSINT X feed…</p>
      ) : !API_BASE ? (
        <p className="osint-x-error">Connect to the situational-awareness API (VITE_API_URL) to load this feed.</p>
      ) : filtered.length === 0 ? (
        <div className="osint-x-empty">
          <p>
            {q
              ? 'No posts match the current search.'
              : (loadError || 'No posts in the last 48 hours yet.')}
          </p>
          {!q && (
            <button type="button" className="osint-x-refresh" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Retry'}
            </button>
          )}
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
                  {post.images.map((src, i) => {
                    const isPossibleVideoThumb = /(?:pbs\.twimg\.com|twimg\.com)\/media\//i.test(src) && !(Array.isArray(post.videos) && post.videos.length > 0)
                    return (
                      <div key={i} className="osint-x-media-img-wrap">
                        <button type="button" className="osint-x-media-link osint-x-media-link--expand" onClick={() => openImageDialog(post, src)} title="Expand">
                          <img src={src} alt="" className="osint-x-img" loading="lazy" referrerPolicy="no-referrer" />
                          <span className="osint-x-media-expand-label">Expand</span>
                        </button>
                        {isPossibleVideoThumb && post.url && (
                          <a href={post.url} target="_blank" rel="noopener noreferrer" className="osint-x-media-open-post osint-x-media-watch-video">
                            Watch video on X →
                          </a>
                        )}
                        <a href={post.url || src} target="_blank" rel="noopener noreferrer" className="osint-x-media-open-post">Open post →</a>
                      </div>
                    )
                  })}
                </div>
              )}
              {Array.isArray(post.videos) && post.videos.length > 0 && (
                <div className="osint-x-media osint-x-media--videos">
                  {(post.videos || []).map((src, i) => {
                    const yt = youtubeEmbedUrl(src)
                    const vimeo = vimeoEmbedUrl(src)
                    const isDirect = /\.(mp4|webm|ogg)(\?|$)/i.test(src) || /(?:video\.twimg\.com|v\.twimg\.com)/i.test(src)
                    if (yt) {
                      return (
                        <div key={i} className="osint-x-video-wrap">
                          <iframe
                            title="YouTube"
                            src={`${yt}?rel=0&modestbranding=1`}
                            className="osint-x-embed"
                            loading="lazy"
                            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                            allowFullScreen
                          />
                          <button type="button" className="osint-x-video-expand" onClick={() => openVideoDialog(post, src)} title="Expand / watch on X">
                            Expand
                          </button>
                          {post.url && (
                            <a href={post.url} target="_blank" rel="noopener noreferrer" className="osint-x-video-open-post">Open on X →</a>
                          )}
                        </div>
                      )
                    }
                    if (vimeo) {
                      return (
                        <div key={i} className="osint-x-video-wrap">
                          <iframe
                            title="Vimeo"
                            src={vimeo}
                            className="osint-x-embed"
                            loading="lazy"
                            allow="autoplay; fullscreen; picture-in-picture"
                            allowFullScreen
                          />
                          <button type="button" className="osint-x-video-expand" onClick={() => openVideoDialog(post, src)} title="Expand / watch on X">
                            Expand
                          </button>
                          {post.url && (
                            <a href={post.url} target="_blank" rel="noopener noreferrer" className="osint-x-video-open-post">Open on X →</a>
                          )}
                        </div>
                      )
                    }
                    if (isDirect && !isCrossOriginVideoNoCors(src)) {
                      return (
                        <div key={i} className="osint-x-video-wrap">
                          <video src={src} controls className="osint-x-video" playsInline crossOrigin="anonymous" />
                          <button type="button" className="osint-x-video-expand" onClick={() => openVideoDialog(post, src)} title="Expand">
                            Expand
                          </button>
                          {post.url && (
                            <a href={post.url} target="_blank" rel="noopener noreferrer" className="osint-x-video-open-post">Open on X →</a>
                          )}
                        </div>
                      )
                    }
                    if (isDirect && isCrossOriginVideoNoCors(src)) {
                      return (
                        <div key={i} className="osint-x-video-wrap osint-x-video-wrap--fallback">
                          <a
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="osint-x-video-fallback osint-x-video-fallback--standalone"
                          >
                            Watch video (opens in new tab)
                          </a>
                          {post.url && (
                            <a href={post.url} target="_blank" rel="noopener noreferrer" className="osint-x-video-open-post">Open post on X →</a>
                          )}
                        </div>
                      )
                    }
                    return (
                      <div key={i} className="osint-x-video-wrap osint-x-video-wrap--fallback">
                        <button
                          type="button"
                          className="osint-x-video-fallback osint-x-video-fallback--standalone"
                          onClick={() => openVideoDialog(post, src)}
                        >
                          Watch video on X
                        </button>
                        {post.url && (
                          <a href={post.url} target="_blank" rel="noopener noreferrer" className="osint-x-video-open-post">Open post →</a>
                        )}
                      </div>
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
              </div>
            </li>
          ))}
        </ul>
      )}
      {imageDialog && (
        <div className="osint-x-video-dialog-backdrop" role="dialog" aria-modal="true" onClick={() => setImageDialog(null)}>
          <div className="osint-x-video-dialog osint-x-image-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Image</h3>
            <img src={imageDialog.src} alt="" className="osint-x-image-dialog-img" />
            {/(?:pbs\.twimg\.com|twimg\.com)\/media\//i.test(imageDialog.src) && (
              <p className="osint-x-image-dialog-hint">This may be a video thumbnail. Open the post on X to watch the video.</p>
            )}
            {imageDialog.caption && <p className="osint-x-image-dialog-caption">{imageDialog.caption}</p>}
            <div className="osint-x-video-dialog-actions">
              <button
                type="button"
                className="osint-x-pin-btn"
                onClick={handleDownloadImage}
                disabled={imageDownloading}
              >
                {imageDownloading ? 'Downloading…' : 'Download image'}
              </button>
              {imageDialog.postUrl && (
                <a href={imageDialog.postUrl} target="_blank" rel="noopener noreferrer" className="osint-x-pin-btn">Open original post</a>
              )}
              <button type="button" className="osint-x-clear-filter" onClick={() => setImageDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {videoDialog && (
        <div className="osint-x-video-dialog-backdrop" role="dialog" aria-modal="true">
          <div className="osint-x-video-dialog">
            <h3>Video</h3>
            {isCrossOriginVideoNoCors(videoDialog.src) ? (
              <p className="osint-x-video-dialog-fallback-msg">This video is served from a host that blocks embedding. Use the links below to watch in a new tab or on X.</p>
            ) : (
              <>
                <div className="osint-x-video-dialog-player">
                  <video src={videoDialog.src} controls className="osint-x-video" playsInline crossOrigin="anonymous" />
                </div>
                <p className="osint-x-video-dialog-fallback-msg">If the video does not play above (blocked by host), open it on X.</p>
              </>
            )}
            <div className="osint-x-video-dialog-actions">
              {videoDialog.postUrl && (
                <a href={videoDialog.postUrl} target="_blank" rel="noopener noreferrer" className="osint-x-pin-btn">
                  Watch on X
                </a>
              )}
              <a href={videoDialog.src} target="_blank" rel="noopener noreferrer" className="osint-x-link">
                Open raw video link
              </a>
              <button type="button" className="osint-x-clear-filter" onClick={() => setVideoDialog(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
