import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import './FeedsView.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

const FEED_MODE = { NEWS: 'GLOBAL_NEWS', OSINT: 'GENERAL_OSINT', VIDEOS: 'RECENT_VIDEOS' }
const OSINT_SUB = { INTEL: 'intel' }

const CATEGORY_OPTIONS = [
  { key: 'all', label: 'All topics' },
  { key: 'general', label: 'World' },
  { key: 'business', label: 'Business' },
  { key: 'technology', label: 'Technology' },
  { key: 'health', label: 'Health' },
  { key: 'science', label: 'Science' },
  { key: 'politics', label: 'Politics' },
]

const TOPIC_SECTION_ORDER = [
  { key: 'general', label: 'World & geopolitics' },
  { key: 'politics', label: 'Politics & policy' },
  { key: 'business', label: 'Markets & economy' },
  { key: 'technology', label: 'Technology & cyber' },
  { key: 'health', label: 'Health' },
  { key: 'science', label: 'Science' },
]

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

function isRealImage(url) {
  if (!url || typeof url !== 'string') return false
  if (url.includes('google.com/s2/favicons')) return false
  return /^https?:\/\//i.test(url)
}

function articleImage(item) {
  const url = item?.image || item?.thumbnail
  return isRealImage(url) ? url : null
}

function normalizeCategory(raw, title = '', snippet = '') {
  const c = String(raw || '').toLowerCase().trim()
  if (['general', 'business', 'technology', 'health', 'science', 'politics', 'entertainment', 'sports'].includes(c)) {
    if (c === 'entertainment' || c === 'sports') return 'general'
    return c
  }
  const text = `${title} ${snippet}`.toLowerCase()
  if (/\b(election|congress|parliament|president|senate|white house|legislation)\b/.test(text)) return 'politics'
  if (/\b(cyber|hack|tech|chip|ai|software)\b/.test(text)) return 'technology'
  if (/\b(market|stock|economy|bank|oil|trade)\b/.test(text)) return 'business'
  if (/\b(health|hospital|vaccine|disease)\b/.test(text)) return 'health'
  if (/\b(science|climate|space|nasa|research)\b/.test(text)) return 'science'
  return 'general'
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
  return s === sourceFilter.toLowerCase() || s.includes(sourceFilter.toLowerCase())
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
            thumbnail: f.properties?.thumbnail,
            image: f.properties?.image || f.properties?.thumbnail,
            category: f.properties?.category,
            coordinates: f.geometry?.type === 'Point' ? f.geometry.coordinates : null,
          }))
        : []

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
    out.push({
      ...item,
      _key: primary,
      category: normalizeCategory(item.category, title, item.contentSnippet || item.description || ''),
    })
  }
  return out
}

function formatStoryDate(item) {
  const d = item.pubDate || item.timestamp
  if (!d) return ''
  try {
    return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}

function NewsHeroStory({ item }) {
  const img = articleImage(item)
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="news-desk-hero-story"
    >
      {img && (
        <div className="news-desk-hero-media" aria-hidden>
          <img src={img} alt="" className="news-desk-hero-img" />
        </div>
      )}
      <div className="news-desk-hero-copy">
        <span className="news-desk-kicker">{item.source}</span>
        <h2 className="news-desk-hero-title">{item.title || 'Untitled'}</h2>
        {(item.contentSnippet || item.description) && (
          <p className="news-desk-hero-deck">
            {String(item.contentSnippet || item.description).slice(0, 180)}
          </p>
        )}
        <span className="news-desk-meta">{formatStoryDate(item)}</span>
      </div>
    </a>
  )
}

function NewsTile({ item, size = 'md' }) {
  const img = articleImage(item)
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className={`news-desk-tile news-desk-tile--${size}`}
    >
      {img && (
        <div className="news-desk-tile-media" aria-hidden>
          <img src={img} alt="" loading="lazy" />
        </div>
      )}
      <div className="news-desk-tile-body">
        <span className="news-desk-kicker">{item.source}</span>
        <h3 className="news-desk-tile-title">{item.title || 'Untitled'}</h3>
        <span className="news-desk-meta">{formatStoryDate(item)}</span>
      </div>
    </a>
  )
}

function NewsTextRow({ item }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="news-desk-text-row"
    >
      <span className="news-desk-text-row-source">{item.source}</span>
      <span className="news-desk-text-row-title">{item.title || 'Untitled'}</span>
      <span className="news-desk-text-row-date">{formatStoryDate(item)}</span>
    </a>
  )
}

export default function FeedsView({ title, activeView, keywordFilter = '', onClearFilter, initialNews, onPinnedToMap }) {
  const initialItems = initialNews ? geoJsonToItems(initialNews) : []
  const isNewsOnly = activeView === 'news-feeds'
  const isOsintOnly = activeView === 'osint-feeds'
  const isVideosOnly = activeView === 'recent-videos'
  const [feedMode, setFeedMode] = useState(isVideosOnly ? FEED_MODE.VIDEOS : isOsintOnly ? FEED_MODE.OSINT : FEED_MODE.NEWS)
  const [newsItems, setNewsItems] = useState(initialItems)
  const [newsMeta, setNewsMeta] = useState(initialNews?.meta || null)
  const [osintItems, setOsintItems] = useState([])
  const [videoItems, setVideoItems] = useState([])
  const [newsLoading, setNewsLoading] = useState(initialItems.length === 0)
  const [osintLoading, setOsintLoading] = useState(true)
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoTagFilter, setVideoTagFilter] = useState('all')
  const [refreshing, setRefreshing] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [localSearch, setLocalSearch] = useState('')
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
          setNewsMeta(res.data?.meta || null)
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
        setNewsMeta(responses[0].data?.meta || null)
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

  const omnibarQ = (keywordFilter || '').trim().toLowerCase()
  const localQ = (localSearch || '').trim().toLowerCase()
  const q = localQ || omnibarQ
  const quotaExhausted = !!newsMeta?.mediastack?.quotaExhausted

  const publisherSources = useMemo(() => {
    const counts = new Map()
    for (const item of newsItems) {
      const src = String(item.source || '').trim()
      if (!src) continue
      counts.set(src, (counts.get(src) || 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 18)
      .map(([key, count]) => ({ key, label: key, count }))
  }, [newsItems])

  const filteredAndSortedNews = useMemo(() => {
    let list = newsItems.filter((item) => {
      if (!matchesSource(item, sourceFilter, FEED_MODE.NEWS)) return false
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
      if (!q) return true
      const hay = `${item.title || ''} ${item.source || ''} ${item.contentSnippet || ''} ${item.description || ''} ${item.category || ''}`.toLowerCase()
      return hay.includes(q)
    })
    if (sortBy === 'newest') list = [...list].sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    else if (sortBy === 'oldest') list = [...list].sort((a, b) => new Date(a.pubDate || 0) - new Date(b.pubDate || 0))
    else if (sortBy === 'source') list = [...list].sort((a, b) => (a.source || '').localeCompare(b.source || ''))
    return list
  }, [newsItems, sourceFilter, categoryFilter, sortBy, q])

  const imageLed = useMemo(
    () => filteredAndSortedNews.filter((it) => articleImage(it)),
    [filteredAndSortedNews]
  )
  const hero = imageLed[0] || null
  const secondaryTiles = imageLed.slice(1, 4)
  const heroKeys = useMemo(() => {
    const set = new Set()
    ;[hero, ...secondaryTiles].filter(Boolean).forEach((it) => set.add(it._key || it.link || it.id))
    return set
  }, [hero, secondaryTiles])

  const topicSections = useMemo(() => {
    const remaining = filteredAndSortedNews.filter((it) => !heroKeys.has(it._key || it.link || it.id))
    const byCat = new Map()
    for (const item of remaining) {
      const cat = item.category || 'general'
      if (!byCat.has(cat)) byCat.set(cat, [])
      byCat.get(cat).push(item)
    }
    const sections = []
    for (const def of TOPIC_SECTION_ORDER) {
      const items = byCat.get(def.key) || []
      if (items.length) sections.push({ ...def, items })
    }
    for (const [key, items] of byCat) {
      if (TOPIC_SECTION_ORDER.some((d) => d.key === key)) continue
      if (items.length) sections.push({ key, label: key, items })
    }
    return sections
  }, [filteredAndSortedNews, heroKeys])

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
  const isEmpty = feedMode === FEED_MODE.VIDEOS ? !videoItems.length : feedMode === FEED_MODE.NEWS ? !newsItems.length : !osintItems.length
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

  const showNewsDesk = feedMode === FEED_MODE.NEWS || isNewsOnly

  return (
    <div className={`feeds-dashboard feeds-dashboard--${feedMode === FEED_MODE.VIDEOS ? 'videos' : feedMode === FEED_MODE.NEWS ? 'news' : 'osint'}${showNewsDesk ? ' feeds-dashboard--news-desk' : ''}`}>
      {!showNewsDesk && (
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
            Breaking alerts, investigations, and defense OSINT
          </p>
        </div>
      )}

      {(activeView === 'news-feeds' || activeView === 'osint-feeds') && !isVideosOnly && (
        <div className={`feeds-subnav${showNewsDesk ? ' feeds-subnav--on-desk' : ''}`}>
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

      {showNewsDesk && (
        <div className="news-desk">
          <header className="news-desk-masthead">
            <div className="news-desk-masthead-brand">
              <p className="news-desk-brand">Good Palantir</p>
              <h1 className="news-desk-title">News Desk</h1>
              <p className="news-desk-tagline">Image-led headlines from trusted publishers, sorted by topic.</p>
            </div>
            <button
              type="button"
              className="news-desk-refresh"
              onClick={refreshFeeds}
              disabled={refreshing || loading}
            >
              {refreshing || loading ? 'Updating…' : 'Refresh'}
            </button>
          </header>

          <div className={`news-desk-search-wrap${quotaExhausted ? ' news-desk-search-wrap--emphasized' : ''}`}>
            <label className="news-desk-search-label" htmlFor="news-desk-search">
              {quotaExhausted
                ? 'MediaStack quota reached — search the local cache'
                : 'Search headlines'}
            </label>
            <input
              id="news-desk-search"
              type="search"
              className="news-desk-search"
              placeholder={quotaExhausted ? 'Search cached articles by title, source, or topic…' : 'Search titles, publishers, topics…'}
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              autoFocus={quotaExhausted}
            />
            {quotaExhausted && (
              <p className="news-desk-quota-note">
                Live MediaStack pulls are paused until the monthly quota resets. RSS and last-good cache stay available below.
              </p>
            )}
            {(localQ || omnibarQ) && (
              <button
                type="button"
                className="news-desk-clear-search"
                onClick={() => {
                  setLocalSearch('')
                  if (onClearFilter) onClearFilter()
                }}
              >
                Clear search
              </button>
            )}
          </div>

          <div className="news-desk-sources" role="toolbar" aria-label="Filter by publisher">
            <button
              type="button"
              className={`news-desk-source-btn${sourceFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => setSourceFilter('all')}
            >
              All sources
            </button>
            {publisherSources.map((sec) => (
              <button
                key={sec.key}
                type="button"
                className={`news-desk-source-btn${sourceFilter === sec.key ? ' is-active' : ''}`}
                onClick={() => setSourceFilter(sec.key)}
              >
                {sec.label}
              </button>
            ))}
          </div>

          <div className="news-desk-categories" role="toolbar" aria-label="Filter by category">
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat.key}
                type="button"
                className={`news-desk-cat-btn${categoryFilter === cat.key ? ' is-active' : ''}`}
                onClick={() => setCategoryFilter(cat.key)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {newsLoading ? (
            <p className="news-desk-loading">Loading the desk…</p>
          ) : filteredEmpty ? (
            <div className="news-desk-empty">
              {isEmpty ? (
                <p>Couldn’t load news. Start the API, then use Refresh.</p>
              ) : (
                <p>No stories match these filters. Try another source, category, or search term.</p>
              )}
            </div>
          ) : (
            <>
              {(hero || secondaryTiles.length > 0) && (
                <section className="news-desk-visual" aria-label="Image stories">
                  {hero && <NewsHeroStory item={hero} />}
                  {secondaryTiles.length > 0 && (
                    <div className="news-desk-secondary">
                      {secondaryTiles.map((item) => (
                        <NewsTile key={item._key || item.link} item={item} size="lg" />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {topicSections.map((section) => (
                <section key={section.key} className="news-desk-topic" aria-labelledby={`topic-${section.key}`}>
                  <div className="news-desk-topic-head">
                    <h2 id={`topic-${section.key}`} className="news-desk-topic-title">{section.label}</h2>
                    <span className="news-desk-topic-count">{section.items.length}</span>
                  </div>
                  <div className="news-desk-topic-grid">
                    {section.items.slice(0, 3).filter((it) => articleImage(it)).map((item) => (
                      <NewsTile key={item._key || item.link} item={item} size="md" />
                    ))}
                  </div>
                  <div className="news-desk-topic-list">
                    {section.items
                      .filter((it, idx) => !(idx < 3 && articleImage(it)))
                      .slice(0, 12)
                      .map((item) => (
                        <NewsTextRow key={item._key || item.link} item={item} />
                      ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      )}

      {feedMode !== FEED_MODE.VIDEOS && !showNewsDesk && (
        <div className="feeds-toolbar">
          <div className="feeds-source-filter">
            <span className="feeds-toolbar-label">Source:</span>
            {SOURCE_SECTIONS_OSINT.map((sec) => (
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
              <p className="feeds-empty-hint">Try <strong>Refresh</strong> or clear the tag filter.</p>
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

      {(feedMode === FEED_MODE.OSINT || isOsintOnly) && !showNewsDesk && (
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
                    <p>Couldn’t load OSINT feeds. Start the API and use <strong>Refresh</strong>.</p>
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
                <div className="feeds-osint-table-wrap">
                  <table className="feeds-terminal-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Source</th>
                        <th>Risk</th>
                        <th>Content</th>
                        {onPinnedToMap && <th>Map</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {pinError && (
                        <tr><td colSpan={4 + (onPinnedToMap ? 1 : 0)} className="feeds-pin-error">{pinError}</td></tr>
                      )}
                      {filteredAndSortedOsint.map((item, i) => (
                        <tr
                          key={item._key || item.link || item.id || i}
                          className={`feeds-osint-row feeds-osint-alert-${item.alertLevel || 'medium'}`}
                        >
                          <td className="feeds-osint-time">
                            {item.pubDate ? new Date(item.pubDate).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                          </td>
                          <td className="feeds-osint-source">{osintSourceDisplayName(item.source)}</td>
                          <td className="feeds-osint-badge">
                            {item.risk_score != null ? (
                              <span className={`feeds-risk-badge feeds-risk-badge--${Number(item.risk_score)}`} title={item.risk_label || `Risk ${item.risk_score}/5`}>
                                {item.risk_score}/5
                              </span>
                            ) : (
                              item.alertLevel || '—'
                            )}
                          </td>
                          <td className="feeds-osint-content">
                            <a href={item.link} target="_blank" rel="noopener noreferrer">
                              {item.title || 'Untitled'}
                            </a>
                            {item.contentSnippet && (
                              <div className="feeds-osint-raw">{item.contentSnippet.slice(0, 200)}</div>
                            )}
                          </td>
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
                      ))}
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
