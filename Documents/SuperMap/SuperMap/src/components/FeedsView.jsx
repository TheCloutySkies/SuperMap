import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import ArticlePreviewSheet from './ArticlePreviewSheet'
import DataFreshness from './DataFreshness'
import GpnNewsPage from './gpn/GpnNewsPage'
import ThreatScoreButton from './ThreatScoreButton'
import ItemMenu from '../features/accounts/ItemMenu'
import { readHomeSnapshot, writeHomeSnapshot } from '../lib/homeBootstrap'
import { isGlowieRelevant } from '../lib/glowieRelevance'
import { dedupeStories } from '../lib/storyDedupe'
import './FeedsView.css'
import { getApiBase } from '../lib/homeBootstrap'

const API_BASE = getApiBase()

const OSINT_FEED_SNAP_KEY = 'supermap_osint_feeds_snap'
const VIDEOS_FEED_SNAP_KEY = 'supermap_videos_feeds_snap'
const FEED_SNAP_MAX_AGE_MS = 24 * 60 * 60 * 1000

function readLocalSnap(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    if (parsed && Array.isArray(parsed.items)) {
      const savedAt = parsed.savedAt ? Date.parse(parsed.savedAt) : 0
      if (savedAt && Date.now() - savedAt > FEED_SNAP_MAX_AGE_MS) {
        return parsed.items // still usable as stale paint
      }
      return parsed.items
    }
    return null
  } catch {
    return null
  }
}

function writeLocalSnap(key, items) {
  try {
    if (Array.isArray(items) && items.length) {
      localStorage.setItem(
        key,
        JSON.stringify({ items: items.slice(0, 120), savedAt: new Date().toISOString() }),
      )
    }
  } catch { /* optional */ }
}

/** Prefer richer desk content — never replace a fat local snap with a thin live slice. */
function preferRicherItems(next, prev) {
  const n = Array.isArray(next) ? next.length : 0
  const p = Array.isArray(prev) ? prev.length : 0
  if (n === 0) return prev || []
  if (p === 0) return next
  if (n >= p) return next
  // Live conspicuously thinner (cold mid-catch-up) — keep last-good paint.
  // No absolute n<40 gate: mid-thin (50 vs 80) still wiped OSINT/videos desks.
  if (p > 20 && n < p * 0.6) return prev
  return next
}

const FEED_MODE = { NEWS: 'GLOBAL_NEWS', VIDEOS: 'RECENT_VIDEOS' }

/** Intel rows become Glowie stories, named by the desk that filed them. */
function osintStoriesFrom(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    source: osintSourceDisplayName(item.source),
    kind: 'osint',
  }))
}

/** Publisher stories and intel stories are one list, without duplicates. */
function mergeDesks(base, extra) {
  const seen = new Set(base.map((row) => row._key))
  const out = [...base]
  for (const row of extra) {
    if (seen.has(row._key)) continue
    seen.add(row._key)
    out.push(row)
  }
  return out
}

const CATEGORY_OPTIONS = [
  { key: 'all', label: 'All topics' },
  { key: 'general', label: 'World' },
  { key: 'politics', label: 'Politics' },
  { key: 'business', label: 'Markets' },
  { key: 'technology', label: 'Technology' },
  { key: 'weather', label: 'Weather' },
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

/** Poster URL for grid cards — never loads a live player until expand. */
function videoPosterUrl(item) {
  const link = item?.videoUrl || item?.link
  if (isRealImage(item?.thumbnail)) return item.thumbnail
  if (isRealImage(item?.image)) return item.image
  if (!link || typeof link !== 'string') return null
  const yt = link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  if (yt) return `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`
  return null
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
  if (/\b(weather|storm|hurricane|typhoon|cyclone|tornado|earthquake|wildfire|flood|tsunami|blizzard)\b/.test(text)) return 'weather'
  if (/\b(election|congress|parliament|president|senate|white house|legislation)\b/.test(text)) return 'politics'
  if (/\b(cyber|hack|tech|chip|ai|software)\b/.test(text)) return 'technology'
  if (/\b(market|stock|economy|bank|oil|trade)\b/.test(text)) return 'business'
  if (/\b(health|hospital|vaccine|disease)\b/.test(text)) return 'health'
  if (/\b(science|climate|space|nasa|research)\b/.test(text)) return 'science'
  return 'general'
}

function VideoCard({ item, onExpand }) {
  const tags = Array.isArray(item.tags) ? item.tags : []
  const thumb = videoPosterUrl(item)

  const handleActivate = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onExpand(item)
  }

  return (
    <div
      className="feeds-video-card feeds-video-card--clickable"
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleActivate(e)
      }}
      aria-label={`Play ${item.title || 'video'}`}
    >
      <div className="feeds-video-card-thumb-wrap">
        {thumb ? (
          <span className="feeds-video-card-thumb-link">
            <img src={thumb} alt="" className="feeds-video-card-thumb" loading="lazy" draggable={false} />
            <span className="feeds-video-card-play-overlay" aria-hidden>▶</span>
          </span>
        ) : (
          <span className="feeds-video-card-thumb-placeholder" aria-hidden>▶</span>
        )}
        <span className="feeds-video-card-source feeds-video-card-source--overlay">{item.source}</span>
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
      <ItemMenu item={feedMenuItem(item)} />
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

function feedMenuItem(item) {
  const coords = Array.isArray(item.coordinates) ? item.coordinates : null
  return {
    type: 'article',
    title: item.title || 'Untitled',
    summary: item.contentSnippet || item.description || item.source || '',
    url: item.link || item.url || '',
    image: articleImage(item) || item.image || item.thumbnail || '',
    kind: item.kind || item.type || 'news',
    lat: item.lat ?? item.latitude ?? coords?.[1],
    lon: item.lon ?? item.lng ?? item.longitude ?? coords?.[0],
    coordinates: coords,
  }
}

export default function FeedsView({ title, activeView, keywordFilter = '', onClearFilter, initialNews, onPinnedToMap }) {
  const homeSnap = typeof window !== 'undefined' ? readHomeSnapshot() : null
  const seedNews = initialNews || homeSnap?.news || null
  const initialItems = seedNews ? geoJsonToItems(seedNews) : []
  const seedOsint = (typeof window !== 'undefined' && readLocalSnap(OSINT_FEED_SNAP_KEY)) || []
  const seedVideos = (typeof window !== 'undefined' && readLocalSnap(VIDEOS_FEED_SNAP_KEY)) || []
  const isNewsOnly = activeView === 'news-feeds'
  const isVideosOnly = activeView === 'recent-videos'
  const [feedMode, setFeedMode] = useState(isVideosOnly ? FEED_MODE.VIDEOS : FEED_MODE.NEWS)
  const [newsItems, setNewsItems] = useState(initialItems)
  const [newsMeta, setNewsMeta] = useState(seedNews?.meta || null)
  const [osintItems, setOsintItems] = useState(() => osintStoriesFrom(seedOsint))
  const [videoItems, setVideoItems] = useState(seedVideos)
  const [newsLoading, setNewsLoading] = useState(initialItems.length === 0)
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoTagFilter, setVideoTagFilter] = useState('all')
  const [refreshing, setRefreshing] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [localSearch, setLocalSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [pinningId, setPinningId] = useState(null)
  const [pinError, setPinError] = useState(null)
  const [expandedVideo, setExpandedVideo] = useState(null)
  const [previewItem, setPreviewItem] = useState(null)

  useEffect(() => {
    if (activeView === 'recent-videos') setFeedMode(FEED_MODE.VIDEOS)
    else setFeedMode(FEED_MODE.NEWS)
  }, [activeView])

  useEffect(() => {
    if (feedMode !== FEED_MODE.VIDEOS || !API_BASE) return
    let cancelled = false
    // Soft: only spin when we have nothing to paint
    setVideoLoading(videoItems.length === 0)
    axios.get(`${API_BASE}/api/feeds/videos`, { timeout: 12000 })
      .then((res) => {
        if (cancelled) return
        const features = res.data?.features ?? []
        if (features.length > 0) {
          const items = features.map((f) => ({
            ...(f.properties || {}),
            id: f.properties?.id ?? f.id,
            _key: f.properties?.id ?? f.id ?? Math.random(),
          }))
          setVideoItems((prev) => {
            const chosen = preferRicherItems(items, prev)
            if (chosen === items) writeLocalSnap(VIDEOS_FEED_SNAP_KEY, items)
            return chosen
          })
        }
      })
      .catch(() => {
        // Keep last-good on failure — never blank the tab
      })
      .finally(() => { if (!cancelled) setVideoLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedMode])

  useEffect(() => {
    if (!API_BASE) {
      setNewsLoading(false)
      return
    }
    // On recent-videos tab, do not drive loading / infinite news retry
    if (isVideosOnly || feedMode === FEED_MODE.VIDEOS) {
      setNewsLoading(false)
      return
    }
    let cancelled = false
    let retryId = null
    let attempts = 0
    const MAX_NEWS_RETRIES = 4 // ~10s total with 2.5s gap — never infinite blank loop
    // Keep snapshot / cached items visible while refresh runs
    if (initialItems.length === 0 && newsItems.length === 0) setNewsLoading(true)
    else setNewsLoading(false)

    function doFetch() {
      const t0 = Date.now()
      attempts += 1
      axios.get(`${API_BASE}/api/news`, { timeout: 12000 })
        .then((res) => {
          if (cancelled) return
          const items = geoJsonToItems(res.data)
          if (feedsDebugEnabled()) {
            console.debug('[FEEDS news] OUTPUT', { count: items.length, ms: Date.now() - t0, attempts })
          }
          if (items.length > 0) {
            setNewsItems((prev) => preferRicherItems(items, prev.length ? prev : initialItems))
            setNewsMeta(res.data?.meta || null)
            try {
              const snap = readHomeSnapshot() || {}
              writeHomeSnapshot({ ...snap, news: res.data })
            } catch { /* optional */ }
          } else if (
            newsItems.length === 0
            && initialItems.length === 0
            && feedMode !== FEED_MODE.VIDEOS
            && attempts < MAX_NEWS_RETRIES
          ) {
            retryId = setTimeout(() => {
              if (cancelled) return
              doFetch()
            }, 2500)
          }
        })
        .catch((err) => {
          // Keep cached newsItems on failure
          if (feedsDebugEnabled()) {
            console.debug('[FEEDS news] OUTPUT error', { message: err?.message || String(err), ms: Date.now() - t0, attempts })
          }
          if (
            newsItems.length === 0
            && initialItems.length === 0
            && feedMode !== FEED_MODE.VIDEOS
            && attempts < MAX_NEWS_RETRIES
          ) {
            retryId = setTimeout(() => {
              if (cancelled) return
              doFetch()
            }, 2500)
          }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedMode, isVideosOnly])

  useEffect(() => {
    if (!API_BASE) return undefined
    let cancelled = false
    // Soft: paint the local snap immediately, then refresh it.
    const t0 = Date.now()
    if (feedsDebugEnabled()) console.debug('[FEEDS osint] INPUT', { url: `${API_BASE}/api/osint` })
    axios.get(`${API_BASE}/api/osint`, { timeout: 12000 })
      .then((res) => {
        const items = osintStoriesFrom(geoJsonToItems(res.data))
        if (!cancelled && items.length > 0) {
          setOsintItems((prev) => {
            const chosen = preferRicherItems(items, prev)
            if (chosen === items) writeLocalSnap(OSINT_FEED_SNAP_KEY, items)
            return chosen
          })
        }
        if (feedsDebugEnabled()) console.debug('[FEEDS osint] OUTPUT', { count: items.length, ms: Date.now() - t0 })
      })
      .catch((err) => {
        // Keep cached OSINT on failure
        if (feedsDebugEnabled()) console.debug('[FEEDS osint] OUTPUT error', { message: err?.message || String(err), ms: Date.now() - t0 })
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Soft refresh: keep current items visible while updating.
    // refresh=1 forces news rebuild (MediaStack/RSS) so cold empty desks refill.
    const requests = [
      axios.get(`${API_BASE}/api/news`, { params: { refresh: '1' }, timeout: 20000 }),
      axios.get(`${API_BASE}/api/osint`, { timeout: 20000 }),
    ]
    if (feedMode === FEED_MODE.VIDEOS) {
      setVideoLoading((prev) => (videoItems.length === 0 ? true : false))
      requests.push(axios.get(`${API_BASE}/api/feeds/videos`, { timeout: 20000 }))
    }
    Promise.all(requests)
      .then((responses) => {
        const nextNews = geoJsonToItems(responses[0].data)
        if (nextNews.length > 0) {
          setNewsItems((prev) => preferRicherItems(nextNews, prev))
          setNewsMeta(responses[0].data?.meta || null)
        }
        const nextOsint = osintStoriesFrom(geoJsonToItems(responses[1].data))
        if (nextOsint.length > 0) {
          setOsintItems((prev) => {
            const chosen = preferRicherItems(nextOsint, prev)
            if (chosen === nextOsint) writeLocalSnap(OSINT_FEED_SNAP_KEY, nextOsint)
            return chosen
          })
        }
        if (feedMode === FEED_MODE.VIDEOS && responses[2]) {
          const features = responses[2].data?.features ?? []
          if (features.length > 0) {
            const items = features.map((f) => ({
              ...(f.properties || {}),
              id: f.properties?.id ?? f.id,
              _key: f.properties?.id ?? f.id ?? Math.random(),
            }))
            setVideoItems((prev) => {
              const chosen = preferRicherItems(items, prev)
              if (chosen === items) writeLocalSnap(VIDEOS_FEED_SNAP_KEY, items)
              return chosen
            })
          }
        }
        if (nextNews.length > 0) {
          try {
            const snap = readHomeSnapshot() || {}
            writeHomeSnapshot({ ...snap, news: responses[0].data })
          } catch { /* optional */ }
        }
      })
      .catch(() => {
        // Keep existing items — do not blank the desk on refresh failure
      })
      .finally(() => {
        setNewsLoading(false)
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
    for (const item of mergedNews) {
      const src = String(item.source || '').trim()
      if (!src) continue
      counts.set(src, (counts.get(src) || 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 18)
      .map(([key, count]) => ({ key, label: key, count }))
  }, [mergedNews])

  // GPN is one desk: publisher stories and intel stories together.
  const mergedNews = useMemo(() => mergeDesks(newsItems, osintItems), [newsItems, osintItems])

  const filteredAndSortedNews = useMemo(() => {
    const filtered = mergedNews.filter((item) => {
      if (!isGlowieRelevant(item)) return false
      if (!matchesSource(item, sourceFilter, FEED_MODE.NEWS)) return false
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
      if (!q) return true
      const hay = `${item.title || ''} ${item.source || ''} ${item.contentSnippet || ''} ${item.description || ''} ${item.category || ''}`.toLowerCase()
      return hay.includes(q)
    })
    // One story, one row: the same article reaches the desk from the outlet, from
    // its Google News mirror and from other feeds that syndicate it.
    let list = dedupeStories(filtered)
    if (sortBy === 'newest') list = [...list].sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    else if (sortBy === 'oldest') list = [...list].sort((a, b) => new Date(a.pubDate || 0) - new Date(b.pubDate || 0))
    else if (sortBy === 'source') list = [...list].sort((a, b) => (a.source || '').localeCompare(b.source || ''))
    return list
  }, [mergedNews, sourceFilter, categoryFilter, sortBy, q])

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

  const loading = feedMode === FEED_MODE.VIDEOS ? videoLoading : newsLoading
  const isEmpty = feedMode === FEED_MODE.VIDEOS ? !videoItems.length : !mergedNews.length
  const filteredEmpty = feedMode === FEED_MODE.VIDEOS ? !filteredVideos.length : !filteredAndSortedNews.length

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
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setExpandedVideo(null)
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="feeds-video-modal"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
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

  const showNewsDesk = feedMode !== FEED_MODE.VIDEOS || isNewsOnly

  return (
    <div className={`feeds-dashboard feeds-dashboard--${feedMode === FEED_MODE.VIDEOS ? 'videos' : 'news'}${showNewsDesk ? ' feeds-dashboard--news-desk' : ''}`}>
      {!showNewsDesk && (
        <div className="xp-page-tools" role="toolbar" aria-label={title}>
          <button
            type="button"
            onClick={refreshFeeds}
            disabled={refreshing || loading}
            title="Refresh"
          >
            {refreshing || loading ? '…' : '↻'} Refresh
          </button>
          <span className="xp-spacer" />
          <DataFreshness />
        </div>
      )}

      {showNewsDesk && (
        <GpnNewsPage
          items={filteredAndSortedNews}
          categories={CATEGORY_OPTIONS}
          sorts={SORT_OPTIONS}
          sources={publisherSources}
          categoryFilter={categoryFilter}
          sourceFilter={sourceFilter}
          sortBy={sortBy}
          search={localSearch || keywordFilter || ''}
          loading={loading}
          refreshing={refreshing}
          isEmpty={isEmpty}
          quotaExhausted={quotaExhausted}
          onSetCategory={setCategoryFilter}
          onSetSource={setSourceFilter}
          onSetSort={setSortBy}
          onSetSearch={setLocalSearch}
          onClearSearch={() => { if (onClearFilter) onClearFilter() }}
          onRefresh={refreshFeeds}
          onOpen={setPreviewItem}
          toMenuItem={feedMenuItem}
        />
      )}

      {feedMode === FEED_MODE.VIDEOS && (
        <div className="feeds-videos-toolbar xp-page-tools">
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
          {videoLoading && videoItems.length === 0 ? (
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

      <ArticlePreviewSheet
        item={previewItem}
        open={!!previewItem}
        onClose={() => { setPreviewItem(null); setPinError(null) }}
        sourceLabel={previewItem?.source}
        onPin={onPinnedToMap ? handlePinToMap : undefined}
        pinning={!!previewItem && pinningId === (previewItem.id || previewItem.link)}
        pinError={pinError}
      />
    </div>
  )
}
