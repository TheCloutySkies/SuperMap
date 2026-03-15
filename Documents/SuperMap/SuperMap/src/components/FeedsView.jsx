import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { useSavedArticles } from '../contexts/SavedArticlesContext'
import './FeedsView.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

const FEED_MODE = { NEWS: 'GLOBAL_NEWS', OSINT: 'GENERAL_OSINT', VIDEOS: 'RECENT_VIDEOS' }
const OSINT_SUB = { INTEL: 'intel' }

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
  { key: 'Al Jazeera', label: 'Al Jazeera' },
  { key: 'Foreign Affairs', label: 'Foreign Affairs' },
  { key: 'International Crisis Group', label: 'International Crisis Group' },
  { key: 'POLITICO Defense', label: 'POLITICO Defense' },
  { key: 'POLITICO Politics', label: 'POLITICO Politics' },
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

function feedsDebugEnabled() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('supermap_debug_feeds') === '1'
  } catch {
    return false
  }
}

function youtubeEmbedUrl(url) {
  if (!url || typeof url !== 'string') return null
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

function vimeoEmbedUrl(url) {
  if (!url || !url.includes('vimeo.com')) return null
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  return m ? `https://player.vimeo.com/video/${m[1]}` : null
}

function VideoCard({ item, onExpand }) {
  const link = item.videoUrl || item.link
  const tags = Array.isArray(item.tags) ? item.tags : []
  const ytEmbed = youtubeEmbedUrl(link)
  const vimeoEmbed = vimeoEmbedUrl(link)
  const canEmbed = ytEmbed || vimeoEmbed
  const embedSrc = ytEmbed || vimeoEmbed
  return (
    <div
      className="feeds-video-card feeds-video-card--clickable"
      role="button"
      tabIndex={0}
      onClick={() => onExpand(item)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpand(item) } }}
      aria-label={`Play ${item.title || 'video'}`}
    >
      <div className="feeds-video-card-thumb-wrap">
        {canEmbed ? (
          <iframe
            src={embedSrc + (ytEmbed ? '?rel=0&modestbranding=1' : '')}
            title={item.title || 'Video'}
            className="feeds-video-card-embed"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            onClick={(e) => e.stopPropagation()}
          />
        ) : item.thumbnail ? (
          <span className="feeds-video-card-thumb-link">
            <img src={item.thumbnail} alt="" className="feeds-video-card-thumb" loading="lazy" />
            <span className="feeds-video-card-play-overlay" aria-hidden>▶</span>
          </span>
        ) : (
          <span className="feeds-video-card-thumb-placeholder" aria-hidden>▶</span>
        )}
        {!canEmbed && <span className="feeds-video-card-source">{item.source}</span>}
        {canEmbed && <span className="feeds-video-card-source feeds-video-card-source--overlay">{item.source}</span>}
      </div>
      <div className="feeds-video-card-body">
        <h3 className="feeds-video-card-title">{item.title || 'Untitled'}</h3>
        <span className="feeds-video-card-date">
          {item.timestamp ? new Date(item.timestamp).toLocaleDateString(undefined, { dateStyle: 'short' }) : ''}
        </span>
        {tags.length > 0 && (
          <div className="feeds-video-card-tags">
            {tags.map((t, i) => (
              <span key={`${item._key || item.id}-tag-${i}`} className="feeds-video-card-tag">{t}</span>
            ))}
          </div>
        )}
        <span className="feeds-video-card-expand-hint">Click to expand and play</span>
      </div>
    </div>
  )
}

function matchesSource(item, sourceFilter, feedMode) {
  if (!sourceFilter || sourceFilter === 'all') return true
  const s = (item.source || '').toLowerCase()
  if (feedMode === FEED_MODE.OSINT) {
    return s === sourceFilter.toLowerCase()
  }
  if (sourceFilter === 'Al Jazeera') return s.includes('al jazeera')
  if (sourceFilter === 'Foreign Affairs') return s.includes('foreign affairs')
  if (sourceFilter === 'POLITICO Defense') return s.includes('politico defense')
  if (sourceFilter === 'POLITICO Politics') return s.includes('politico politics')
  if (sourceFilter === 'Reddit') return s.includes('reddit')
  if (sourceFilter === 'Google News') return s.includes('google')
  return s.includes(sourceFilter.toLowerCase())
}


function geoJsonToItems(data) {
  const raw = Array.isArray(data)
    ? data
    : (data?.features && Array.isArray(data.features))
        ? data.features.map((f) => ({
            ...(f.properties || {}),
            id: f.properties?.id ?? f.id,
            title: f.properties?.title,
            source: f.properties?.source,
            link: f.properties?.link,
            pubDate: f.properties?.timestamp != null ? new Date(f.properties.timestamp).toISOString() : null,
            contentSnippet: f.properties?.description ?? f.properties?.contentSnippet,
            coordinates: f.geometry?.type === 'Point' ? f.geometry.coordinates : null,
          }))
        : []

  // Dedupe to avoid React key collisions (feeds sometimes contain duplicates across sources/retries).
  const seen = new Set()
  const out = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] || {}
    const link = String(item.link || item.url || '').trim()
    const id = String(item.id || '').trim()
    const source = String(item.source || '').trim()
    const pubDate = String(item.pubDate || '').trim()
    const title = String(item.title || '').trim()
    const primary = link || id || `${source}|${title}|${pubDate}`
    if (!primary) continue
    if (seen.has(primary)) continue
    seen.add(primary)
    out.push({ ...item, _key: primary })
  }
  return out
}

export default function FeedsView({ title, activeView, keywordFilter = '', onClearFilter, initialNews, onPinnedToMap, onSignInRequired }) {
  const initialItems = initialNews ? geoJsonToItems(initialNews) : []
  const isNewsOnly = activeView === 'news-feeds'
  const isOsintOnly = activeView === 'osint-feeds'
  const isVideosOnly = activeView === 'recent-videos'
  const [feedMode, setFeedMode] = useState(isVideosOnly ? FEED_MODE.VIDEOS : isOsintOnly ? FEED_MODE.OSINT : FEED_MODE.NEWS)
  const [newsItems, setNewsItems] = useState(initialItems)
  const [osintItems, setOsintItems] = useState([])
  const [videoItems, setVideoItems] = useState([])
  const [newsLoading, setNewsLoading] = useState(initialItems.length === 0)
  const [osintLoading, setOsintLoading] = useState(true)
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoTagFilter, setVideoTagFilter] = useState('all')
  const { user, isConfigured: authConfigured } = useAuth()
  const { add: saveArticle, remove: unsaveArticle, isSaved } = useSavedArticles()
  const [savingId, setSavingId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [osintSub, setOsintSub] = useState(OSINT_SUB.INTEL)
  const [pinningId, setPinningId] = useState(null)
  const [pinError, setPinError] = useState(null)
  const [expandedVideo, setExpandedVideo] = useState(null)

  useEffect(() => {
    if (activeView === 'recent-videos') setFeedMode(FEED_MODE.VIDEOS)
    else if (activeView === 'news-feeds') setFeedMode(FEED_MODE.NEWS)
    else if (activeView === 'osint-feeds') setFeedMode(FEED_MODE.OSINT)
  }, [activeView])

  useEffect(() => {
    if (feedMode !== FEED_MODE.VIDEOS || !API_BASE) return
    let cancelled = false
    setVideoLoading(true)
    axios.get(`${API_BASE}/api/feeds/videos`, { timeout: 20000 })
      .then((res) => {
        if (cancelled) return
        const features = res.data?.features ?? []
        const items = features.map((f) => ({
          ...(f.properties || {}),
          id: f.properties?.id ?? f.id,
          _key: f.properties?.id ?? f.id ?? Math.random(),
        }))
        setVideoItems(items)
      })
      .catch(() => { if (!cancelled) setVideoItems([]) })
      .finally(() => { if (!cancelled) setVideoLoading(false) })
    return () => { cancelled = true }
  }, [feedMode])

  useEffect(() => {
    if (!API_BASE) {
      setNewsLoading(false)
      return
    }
    let cancelled = false
    let retryId = null
    if (!initialNews) setNewsLoading(true)

    function doFetch() {
      const t0 = Date.now()
      axios.get(`${API_BASE}/api/news`, { timeout: 25000 })
        .then((res) => {
          if (cancelled) return
          const items = geoJsonToItems(res.data)
          if (feedsDebugEnabled()) {
            console.debug('[FEEDS news] OUTPUT', { count: items.length, ms: Date.now() - t0 })
          }
          setNewsItems(items)
          if (Array.isArray(items) && items.length === 0) {
            retryId = setTimeout(() => {
              if (cancelled) return
              setNewsLoading(true)
              doFetch()
            }, 2500)
          }
        })
        .catch((err) => {
          if (!cancelled) setNewsItems([])
          if (feedsDebugEnabled()) {
            console.debug('[FEEDS news] OUTPUT error', { message: err?.message || String(err), ms: Date.now() - t0 })
          }
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
    if (feedsDebugEnabled()) console.debug('[FEEDS news] INPUT', { url: `${API_BASE}/api/news` })
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
    const t0 = Date.now()
    if (feedsDebugEnabled()) console.debug('[FEEDS osint] INPUT', { url: `${API_BASE}/api/osint` })
    axios.get(`${API_BASE}/api/osint`, { timeout: 25000 })
      .then((res) => {
        const items = geoJsonToItems(res.data)
        if (!cancelled) setOsintItems(items)
        if (feedsDebugEnabled()) console.debug('[FEEDS osint] OUTPUT', { count: items.length, ms: Date.now() - t0 })
      })
      .catch((err) => {
        if (!cancelled) setOsintItems([])
        if (feedsDebugEnabled()) console.debug('[FEEDS osint] OUTPUT error', { message: err?.message || String(err), ms: Date.now() - t0 })
      })
      .finally(() => { if (!cancelled) setOsintLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handlePinToMap = (item) => {
    if (!API_BASE || !onPinnedToMap) return
    const id = item.id || item.link
    setPinError(null)
    setPinningId(id)
    if (feedsDebugEnabled()) {
      console.debug('[FEEDS pin-from-text] INPUT', {
        title: item.title || 'Untitled',
        source: item.source || 'osint',
        url: item.link,
      })
    }
    axios
      .post(`${API_BASE}/api/events/pin-from-text`, {
        title: item.title || 'Untitled',
        description: item.contentSnippet || '',
        source: item.source || 'osint',
        url: item.link,
      }, { timeout: 12000 })
      .then((res) => {
        if (feedsDebugEnabled()) console.debug('[FEEDS pin-from-text] OUTPUT', { ok: !res.data?.error })
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
    if (feedMode === FEED_MODE.VIDEOS) setVideoLoading(true)
    const requests = [
      axios.get(`${API_BASE}/api/news`, { timeout: 15000 }),
      axios.get(`${API_BASE}/api/osint`, { timeout: 15000 }),
    ]
    if (feedMode === FEED_MODE.VIDEOS) {
      requests.push(axios.get(`${API_BASE}/api/feeds/videos`, { timeout: 20000 }))
    }
    Promise.all(requests)
      .then((responses) => {
        setNewsItems(geoJsonToItems(responses[0].data))
        setOsintItems(geoJsonToItems(responses[1].data))
        if (feedMode === FEED_MODE.VIDEOS && responses[2]) {
          const features = responses[2].data?.features ?? []
          setVideoItems(features.map((f) => ({
            ...(f.properties || {}),
            id: f.properties?.id ?? f.id,
            _key: f.properties?.id ?? f.id ?? Math.random(),
          })))
        }
      })
      .catch(() => {
        setNewsItems([])
        setOsintItems([])
        if (feedMode === FEED_MODE.VIDEOS) setVideoItems([])
      })
      .finally(() => {
        setNewsLoading(false)
        setOsintLoading(false)
        if (feedMode === FEED_MODE.VIDEOS) setVideoLoading(false)
        setRefreshing(false)
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

  const allVideoTags = useMemo(() => {
    const set = new Set()
    videoItems.forEach((it) => {
      const tags = it.tags
      if (Array.isArray(tags)) tags.forEach((t) => set.add(t))
    })
    return Array.from(set).sort()
  }, [videoItems])
  const filteredVideos = useMemo(() => {
    if (videoTagFilter === 'all') return videoItems
    return videoItems.filter((it) => Array.isArray(it.tags) && it.tags.includes(videoTagFilter))
  }, [videoItems, videoTagFilter])

  const loading = newsLoading || osintLoading || (feedMode === FEED_MODE.VIDEOS && videoLoading)
  const isEmpty = feedMode === FEED_MODE.VIDEOS ? !videoItems.length : feedMode === FEED_MODE.NEWS ? !newsSourceList.length : !osintItems.length
  const filteredEmpty = feedMode === FEED_MODE.VIDEOS ? !filteredVideos.length : feedMode === FEED_MODE.NEWS ? !filteredAndSortedNews.length : !filteredAndSortedOsint.length

  const expandedVideoModal = useMemo(() => {
    if (!expandedVideo) return null
    const link = expandedVideo.videoUrl || expandedVideo.link
    const ytEmbed = youtubeEmbedUrl(link)
    const vimeoEmbed = vimeoEmbedUrl(link)
    const useIframe = ytEmbed || vimeoEmbed
    const proxySrc = API_BASE && !useIframe && link
      ? `${API_BASE}/api/proxy-video?url=${encodeURIComponent(link)}`
      : null
    return (
      <div
        className="feeds-video-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Video preview"
        onClick={() => setExpandedVideo(null)}
      >
        <div className="feeds-video-modal" onClick={(e) => e.stopPropagation()}>
          <div className="feeds-video-modal-header">
            <h2 className="feeds-video-modal-title">{expandedVideo.title || 'Untitled'}</h2>
            <span className="feeds-video-modal-source">{expandedVideo.source}</span>
            <button
              type="button"
              className="feeds-video-modal-close"
              onClick={() => setExpandedVideo(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="feeds-video-modal-player">
            {useIframe ? (
              <iframe
                src={(ytEmbed || vimeoEmbed) + (ytEmbed ? '?autoplay=1&rel=0' : '?autoplay=1')}
                title={expandedVideo.title || 'Video'}
                className="feeds-video-modal-embed"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : proxySrc ? (
              <video
                src={proxySrc}
                controls
                autoPlay
                playsInline
                className="feeds-video-modal-video"
              />
            ) : (
              <div className="feeds-video-modal-fallback">
                <p>Cannot play this video inline. Open in a new tab to watch.</p>
                <a href={link} target="_blank" rel="noopener noreferrer" className="feeds-video-modal-open-link">
                  Open in new tab →
                </a>
              </div>
            )}
          </div>
          <div className="feeds-video-modal-actions">
            <a href={link} target="_blank" rel="noopener noreferrer" className="feeds-video-modal-open-link">
              Open in new tab
            </a>
            <button type="button" className="feeds-video-modal-close-btn" onClick={() => setExpandedVideo(null)}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }, [expandedVideo])

  return (
    <div className={`feeds-dashboard feeds-dashboard--${feedMode === FEED_MODE.VIDEOS ? 'videos' : feedMode === FEED_MODE.NEWS ? 'news' : 'osint'}`}>
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

      {(activeView === 'news-feeds' || activeView === 'osint-feeds') && !isVideosOnly && (
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
          <button
            type="button"
            className={`feeds-subnav-btn ${feedMode === FEED_MODE.VIDEOS ? 'active' : ''}`}
            onClick={() => { setFeedMode(FEED_MODE.VIDEOS); setVideoTagFilter('all') }}
          >
            Recent videos
          </button>
        </div>
      )}

      {feedMode !== FEED_MODE.VIDEOS && (
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
      )}

      {feedMode === FEED_MODE.VIDEOS && (
        <div className="feeds-videos-toolbar">
          <span className="feeds-toolbar-label">Filter by tag:</span>
          <div className="feeds-video-tags">
            <button
              type="button"
              className={`feeds-video-tag ${videoTagFilter === 'all' ? 'active' : ''}`}
              onClick={() => setVideoTagFilter('all')}
            >
              All
            </button>
            {allVideoTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`feeds-video-tag ${videoTagFilter === tag ? 'active' : ''}`}
                onClick={() => setVideoTagFilter(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {(feedMode === FEED_MODE.VIDEOS) && (
        <div className="feeds-videos-section">
          {videoLoading ? (
            <p className="feeds-loading">Loading recent videos…</p>
          ) : filteredEmpty ? (
            <div className="feeds-empty">
              <p>No videos match the current filters.</p>
              <p className="feeds-empty-hint">Video feeds include Al Jazeera Video, DW News, BBC World Video, plus video items from news and OSINT sources. Try <strong>Refresh</strong> or clear the tag filter.</p>
              {videoTagFilter !== 'all' && (
                <button type="button" className="feeds-clear-filter" onClick={() => setVideoTagFilter('all')}>Show all</button>
              )}
            </div>
          ) : (
            <>
              <div className="feeds-video-timeline">
                {filteredVideos.map((item) => (
                  <VideoCard
                    key={item._key || item.id || item.link}
                    item={item}
                    onExpand={setExpandedVideo}
                  />
                ))}
              </div>
              {expandedVideoModal}
            </>
          )}
        </div>
      )}

      {(feedMode === FEED_MODE.NEWS || isNewsOnly) && (
        <div className="feeds-news-section">
          {newsLoading ? (
            <p className="feeds-loading">Loading news…</p>
          ) : filteredEmpty ? (
            <div className="feeds-empty">
              {isEmpty ? (
                <p>Couldn’t load feeds. Run <code>npm run dev:all</code> from the SuperMap folder, then use <strong>Refresh</strong>.</p>
              ) : sourceFilter === 'Reddit' ? (
                <>
                  <p>Reddit is currently rate-limiting requests from this network, so there may be no Reddit items available.</p>
                  <p>Try again later, or switch to another source (Wikipedia / Google RSS / BBC).</p>
                </>
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
                  <div key={item._key || item.link || item.id || i} className="feeds-news-card-wrap">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="feeds-news-card"
                    >
                      {item.thumbnail && !String(item.thumbnail).includes('google.com/s2/favicons') && (
                        <div className="feeds-news-card-img-wrap">
                          <img src={item.thumbnail} alt="" className="feeds-news-card-img" />
                        </div>
                      )}
                      <div className="feeds-news-card-body">
                        <span className="feeds-news-card-source">
                          {item.thumbnail && String(item.thumbnail).includes('google.com/s2/favicons') && (
                            <img src={item.thumbnail} alt="" className="feeds-news-card-favicon" loading="lazy" />
                          )}
                          {item.source}
                        </span>
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
                          key={item._key || item.link || item.id || i}
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

        </div>
      )}
    </div>
  )
}
