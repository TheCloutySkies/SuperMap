import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import axios from 'axios'
import { getApiBase, readHomeSnapshot, writeHomeSnapshot } from '../lib/homeBootstrap'
import './OsintXView.css'

const API_BASE = getApiBase()
const POLL_MS = 90 * 1000

function relativeTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const now = Date.now()
  const sec = Math.floor((now - d) / 1000)
  if (sec < 60) return `${Math.max(1, sec)}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatCount(n) {
  const v = Number(n) || 0
  if (v < 1000) return String(v)
  if (v < 10000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`
  if (v < 1000000) return `${Math.round(v / 1000)}K`
  return `${(v / 1000000).toFixed(1).replace(/\.0$/, '')}M`
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

/** True when URL is an X/Twitter CDN video host that needs /api/proxy-video. */
function isTwimgVideoHost(url) {
  if (!url || typeof url !== 'string') return false
  try {
    const host = (new URL(url).hostname || '').toLowerCase()
    return /(^|\.)(video\.twimg\.com|v\.twimg\.com|twimg\.com)$/i.test(host) || /twimg\.com$/i.test(host)
  } catch {
    return /(?:video\.twimg\.com|v\.twimg\.com)/i.test(url)
  }
}

/** Proxied same-origin URL so <video> can play twimg MP4s without CORS errors. */
function playableVideoSrc(url) {
  if (!url || typeof url !== 'string') return null
  if (!isTwimgVideoHost(url)) return url
  if (!/\.mp4(\?|$)/i.test(url) && !/(?:video\.twimg\.com|v\.twimg\.com)/i.test(url)) return null
  return `${API_BASE}/api/proxy-video?url=${encodeURIComponent(url)}`
}

function readSnapshotPosts() {
  try {
    const snap = readHomeSnapshot()
    return Array.isArray(snap?.osintX) ? snap.osintX : []
  } catch {
    return []
  }
}

function avatarInitial(post) {
  const name = (post.displayName || post.account || '?').trim()
  return (name[0] || '?').toUpperCase()
}

/**
 * Merge incoming posts into the visible list without wiping / remounting.
 * New ids prepend (newest-first); existing ids update in place.
 */
function mergePostsStable(prev, next) {
  if (!Array.isArray(next)) return prev
  if (next.length === 0) return prev.length ? prev : next

  const prevById = new Map(prev.map((p) => [p.id, p]))
  const nextById = new Map(next.map((p) => [p.id, p]))
  const incomingNew = []

  for (const p of next) {
    if (!prevById.has(p.id)) incomingNew.push(p)
  }

  // Preserve previous visual order for known posts; refresh their fields.
  const kept = []
  for (const p of prev) {
    const updated = nextById.get(p.id)
    if (updated) kept.push({ ...p, ...updated })
  }

  // Prepend brand-new posts (API already sorts by priority+time; keep that order among new).
  incomingNew.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  return [...incomingNew, ...kept]
}

const SORT_OPTIONS = [
  { value: 'time', label: 'Latest' },
  { value: 'time-asc', label: 'Oldest' },
  { value: 'creator', label: 'Account' },
  { value: 'tags', label: 'Tags' },
]

const REPORT_X_POSTS_KEY = 'supermap_report_x_posts'

function EngagementIcon({ kind }) {
  if (kind === 'reply') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.95-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z" />
      </svg>
    )
  }
  if (kind === 'repost') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.75 3.79l4.603 4.3-1.506 1.61L3 5.84l-1.006.94L3 7.75v8.5C3 18.99 5.01 21 7.5 21H13v-2H7.5c-1.38 0-2.5-1.12-2.5-2.5v-8.5l.844.79 1.506-1.61L4.75 3.79zm14.5 16.42l-4.603-4.3 1.506-1.61L21 18.16l1.006-.94L21 16.25v-8.5C21 5.01 18.99 3 16.5 3H11v2h5.5c1.38 0 2.5 1.12 2.5 2.5v8.5l-.844-.79-1.506 1.61 4.603 4.3z" />
      </svg>
    )
  }
  if (kind === 'like') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.112-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.503-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z" />
      </svg>
    )
  }
  // views
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z" />
    </svg>
  )
}

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
  const [expandedReplies, setExpandedReplies] = useState(() => new Set())
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

  const applyPosts = useCallback((next, { replace = false } = {}) => {
    if (!Array.isArray(next)) return
    setPosts((prev) => {
      if (next.length === 0 && prev.length > 0) return prev
      const merged = replace ? next : mergePostsStable(prev, next)
      if (merged.length > 0) {
        try {
          const snap = readHomeSnapshot() || {}
          writeHomeSnapshot({ ...snap, osintX: merged.slice(0, 100) })
        } catch { /* optional cache */ }
      }
      return merged
    })
    if (next.length > 0) setLoadError(null)
  }, [])

  const fetchPosts = useCallback(async (force = false, { silent = false } = {}) => {
    if (!API_BASE) {
      setLoading(false)
      setRefreshing(false)
      setLoadError('No API URL configured (VITE_API_URL).')
      return
    }
    const gen = ++fetchGen.current
    const params = { limit: 150 }
    if (force) params.refresh = '1'
    const timeout = force ? 20000 : 15000
    const hadCached = snapshotPosts.current.length > 0 || posts.length > 0
    if (!silent) {
      if (hadCached) {
        setLoading(false)
        setRefreshing(true)
      }
    }
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
        snapshotPosts.current = next
        return
      }
      if (!force && !hadCached) {
        setRefreshing(true)
        try {
          const retry = await axios.get(`${API_BASE}/api/osint-x`, {
            params: { limit: 150, refresh: '1' },
            timeout: 20000,
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
      if (!hadCached) {
        setLoadError('No posts in the last 48h. Tap Retry to pull FxTwitter again.')
      } else if (!silent) {
        setLoadError('Refresh still running — showing cached posts.')
      }
    } catch (err) {
      if (gen !== fetchGen.current) return
      const timedOut = err.code === 'ECONNABORTED'
      setPosts((prev) => {
        if (prev.length === 0) {
          setLoadError(timedOut
            ? 'Timed out reaching the API. Tap Retry (cold starts can take a minute).'
            : (err.response?.data?.error || err.message || 'Failed to load OSINT X.'))
        } else if (!silent) {
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
  }, [applyPosts, posts.length])

  useEffect(() => {
    if (snapshotPosts.current.length) setLoading(false)
    fetchPosts(false)
    const id = setInterval(() => fetchPosts(false, { silent: true }), POLL_MS)
    return () => clearInterval(id)
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
        const text = `${p.account || ''} ${p.displayName || ''} ${p.title || ''} ${p.content || ''} ${(p.tags || []).join(' ')}`.toLowerCase()
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

  const toggleReplies = (id) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderMedia = (post) => {
    const images = Array.isArray(post.images) ? post.images : []
    const videos = Array.isArray(post.videos) ? post.videos : []
    if (!images.length && !videos.length) return null

    return (
      <div className="x-post-media">
        {images.length > 0 && (
          <div className={`x-post-media-grid x-post-media-grid--${Math.min(images.length, 4)}`}>
            {images.slice(0, 4).map((src, i) => (
              <button
                key={`${post.id}-img-${i}`}
                type="button"
                className="x-post-media-cell"
                onClick={() => openImageDialog(post, src)}
                title="Expand image"
              >
                <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
              </button>
            ))}
          </div>
        )}
        {videos.map((src, i) => {
          const yt = youtubeEmbedUrl(src)
          const vimeo = vimeoEmbedUrl(src)
          const proxied = playableVideoSrc(src)
          const isDirect = /\.(mp4|webm|ogg)(\?|$)/i.test(src) || /(?:video\.twimg\.com|v\.twimg\.com)/i.test(src)
          if (yt) {
            return (
              <div key={`${post.id}-vid-${i}`} className="x-post-video">
                <iframe
                  title="YouTube"
                  src={`${yt}?rel=0&modestbranding=1`}
                  loading="lazy"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
            )
          }
          if (vimeo) {
            return (
              <div key={`${post.id}-vid-${i}`} className="x-post-video">
                <iframe
                  title="Vimeo"
                  src={vimeo}
                  loading="lazy"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )
          }
          if (isDirect && proxied) {
            return (
              <div key={`${post.id}-vid-${i}`} className="x-post-video">
                <video src={proxied} controls playsInline preload="metadata" />
              </div>
            )
          }
          return (
            <a
              key={`${post.id}-vid-${i}`}
              href={post.url || src}
              target="_blank"
              rel="noopener noreferrer"
              className="x-post-video-fallback"
            >
              Watch video on X →
            </a>
          )
        })}
      </div>
    )
  }

  return (
    <div className="osint-x-view x-feed">
      <header className="x-feed-header">
        <div className="x-feed-header-top">
          <h2 className="x-feed-title">OSINT</h2>
          <button
            type="button"
            className="x-feed-refresh"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            title="Refresh"
          >
            {refreshing ? '…' : '↻'}
          </button>
        </div>
        <p className="x-feed-subtitle">
          Curated geopolitical / military / intel posts via FxTwitter. Personal noise filtered server-side.
        </p>
        <div className="x-feed-toolbar">
          <label className="x-feed-filter">
            Sort
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="x-feed-filter">
            Account
            <select value={filterCreator} onChange={(e) => setFilterCreator(e.target.value)}>
              <option value="">All</option>
              {filterCreators.map((c) => <option key={c} value={c}>@{c}</option>)}
            </select>
          </label>
          <label className="x-feed-filter">
            Tag
            <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
              <option value="">All</option>
              {filterTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {q && onClearFilter && (
            <button type="button" className="x-feed-clear" onClick={onClearFilter}>
              Clear search
            </button>
          )}
        </div>
        {pinError && <p className="x-feed-status x-feed-status--error">{pinError}</p>}
        {loadError && !loading && <p className="x-feed-status" role="status">{loadError}</p>}
      </header>

      {loading && !refreshing && posts.length === 0 ? (
        <p className="x-feed-loading">Loading timeline…</p>
      ) : !API_BASE ? (
        <p className="x-feed-status x-feed-status--error">Connect to the situational-awareness API (VITE_API_URL) to load this feed.</p>
      ) : filtered.length === 0 ? (
        <div className="x-feed-empty">
          <p>
            {q
              ? 'No posts match the current search.'
              : (loadError || 'No curated posts in the last 48 hours yet.')}
          </p>
          {!q && (
            <button type="button" className="x-feed-clear" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Retry'}
            </button>
          )}
        </div>
      ) : (
        <ul className="x-timeline">
          {filtered.map((post) => {
            const handle = String(post.account || 'x').replace(/^@/, '')
            const displayName = post.displayName || handle
            const metrics = post.metrics || {}
            const replyN = metrics.replies ?? post.replyCount ?? 0
            const repliesOpen = expandedReplies.has(post.id)
            const tags = (post.tags || []).filter((t) => t !== 'x' && t !== 'osint' && !/^risk-[1-5]$/i.test(t))
            return (
              <li key={post.id} className="x-post">
                <div className="x-post-avatar-col">
                  {post.avatarUrl ? (
                    <img
                      className="x-post-avatar"
                      src={post.avatarUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="x-post-avatar x-post-avatar--fallback" aria-hidden>
                      {avatarInitial(post)}
                    </div>
                  )}
                </div>
                <div className="x-post-body">
                  <div className="x-post-meta">
                    <span className="x-post-name">
                      {displayName}
                      {post.verified ? <span className="x-post-verified" title="Verified">✓</span> : null}
                    </span>
                    <span className="x-post-handle">@{handle}</span>
                    <span className="x-post-dot">·</span>
                    <time className="x-post-time" dateTime={post.timestamp ? new Date(post.timestamp).toISOString() : undefined}>
                      {relativeTime(post.timestamp)}
                    </time>
                    {post.risk_score != null && Number(post.risk_score) >= 2 && (
                      <span
                        className={`x-post-risk x-post-risk--${Number(post.risk_score)}`}
                        title={post.risk_label || `Risk ${post.risk_score}/5`}
                      >
                        {post.risk_score}/5
                      </span>
                    )}
                  </div>
                  {tags.length > 0 && (
                    <div className="x-post-tags">
                      {tags.slice(0, 6).map((tag) => (
                        <span key={tag} className="x-post-tag">{tag}</span>
                      ))}
                    </div>
                  )}
                  <p className="x-post-text">{post.content || post.title || '—'}</p>
                  {renderMedia(post)}
                  <div className="x-post-engagement" aria-label="Engagement">
                    <button
                      type="button"
                      className="x-eng x-eng--reply"
                      onClick={() => toggleReplies(post.id)}
                      title="Replies"
                    >
                      <EngagementIcon kind="reply" />
                      <span>{formatCount(replyN)}</span>
                    </button>
                    <span className="x-eng" title="Reposts">
                      <EngagementIcon kind="repost" />
                      <span>{formatCount(metrics.reposts)}</span>
                    </span>
                    <span className="x-eng x-eng--like" title="Likes">
                      <EngagementIcon kind="like" />
                      <span>{formatCount(metrics.likes)}</span>
                    </span>
                    <span className="x-eng" title="Views">
                      <EngagementIcon kind="views" />
                      <span>{formatCount(metrics.views)}</span>
                    </span>
                  </div>
                  {repliesOpen && (
                    <div className="x-post-replies">
                      <p className="x-post-replies-note">
                        Reply threads are not returned by FxTwitter (counts only). Open the post on X to read replies.
                      </p>
                      {post.url && (
                        <a href={post.url} target="_blank" rel="noopener noreferrer" className="x-post-replies-link">
                          View {formatCount(replyN)} {replyN === 1 ? 'reply' : 'replies'} on X →
                        </a>
                      )}
                    </div>
                  )}
                  <div className="x-post-actions">
                    {post.url && (
                      <a href={post.url} target="_blank" rel="noopener noreferrer" className="x-post-action-link">
                        Open on X
                      </a>
                    )}
                    {onPinnedToMap && API_BASE && (
                      <button
                        type="button"
                        className="x-post-action-btn"
                        onClick={() => handlePinToMap(post)}
                        disabled={pinningId === post.id}
                      >
                        {pinningId === post.id ? '…' : 'Pin to map'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="x-post-action-btn"
                      onClick={() => handlePinToReport(post)}
                    >
                      Pin to report
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {imageDialog && (
        <div className="osint-x-video-dialog-backdrop" role="dialog" aria-modal="true" onClick={() => setImageDialog(null)}>
          <div className="osint-x-video-dialog osint-x-image-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Image</h3>
            <img src={imageDialog.src} alt="" className="osint-x-image-dialog-img" />
            {imageDialog.caption && <p className="osint-x-image-dialog-caption">{imageDialog.caption}</p>}
            <div className="osint-x-video-dialog-actions">
              <button type="button" className="x-post-action-btn" onClick={handleDownloadImage} disabled={imageDownloading}>
                {imageDownloading ? 'Downloading…' : 'Download image'}
              </button>
              {imageDialog.postUrl && (
                <a href={imageDialog.postUrl} target="_blank" rel="noopener noreferrer" className="x-post-action-btn">Open original post</a>
              )}
              <button type="button" className="x-feed-clear" onClick={() => setImageDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {videoDialog && (
        <div className="osint-x-video-dialog-backdrop" role="dialog" aria-modal="true">
          <div className="osint-x-video-dialog">
            <h3>Video</h3>
            {playableVideoSrc(videoDialog.src) ? (
              <div className="osint-x-video-dialog-player">
                <video
                  src={playableVideoSrc(videoDialog.src)}
                  controls
                  className="osint-x-video"
                  playsInline
                  preload="metadata"
                />
              </div>
            ) : (
              <p className="osint-x-video-dialog-fallback-msg">This video cannot be played inline. Use the links below.</p>
            )}
            <div className="osint-x-video-dialog-actions">
              {videoDialog.postUrl && (
                <a href={videoDialog.postUrl} target="_blank" rel="noopener noreferrer" className="x-post-action-btn">Watch on X</a>
              )}
              <button type="button" className="x-feed-clear" onClick={() => setVideoDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
