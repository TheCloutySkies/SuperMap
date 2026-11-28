import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DataFreshness from '../DataFreshness'
import ThreatScoreButton from '../ThreatScoreButton'
import ItemMenu from '../../features/accounts/ItemMenu'
import { REGIONS, regionForPoint, regionForText } from '../../lib/consoleSignals'
import { getSnapshotState, startSnapshotPolling, subscribeSnapshot } from '../../lib/snapshotClient'
import './gpn.css'

/**
 * GPN — Good Palantir News, presented as a 2004 BBC News page.
 *
 * Presentation only: the desk fetches, filters and sorts in FeedsView and hands
 * the finished list down here. Every block below slices that one list, so the
 * lead, the boxes, the region columns and the right rail never disagree.
 */

/** The console's own theatres, which is what "Around the world now" groups by. */
const GEO_REGIONS = ['ukraine', 'baltic', 'mideast', 'europe', 'pacific', 'southAsia', 'africa', 'oceania', 'americas']

const COPYRIGHT_YEAR = String(new Date().getFullYear())

/** Cities the weather box can carry, since the weather view takes a lat/lon. */
const WEATHER_CITIES = [
  { label: 'London', lat: 51.5074, lon: -0.1278 },
  { label: 'Washington', lat: 38.9072, lon: -77.0369 },
  { label: 'New York', lat: 40.7128, lon: -74.006 },
  { label: 'Brussels', lat: 50.8476, lon: 4.3572 },
  { label: 'Kyiv', lat: 50.4501, lon: 30.5234 },
  { label: 'Jerusalem', lat: 31.7683, lon: 35.2137 },
  { label: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { label: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { label: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { label: 'Sydney', lat: -33.8688, lon: 151.2093 },
]

function isRealImage(url) {
  if (!url || typeof url !== 'string') return false
  if (url.includes('google.com/s2/favicons')) return false
  return /^https?:\/\//i.test(url)
}

function articleImage(item) {
  const url = item?.image || item?.thumbnail
  return isRealImage(url) ? url : null
}

function keyOf(item, index) {
  return item?._key || item?.link || item?.id || String(index)
}

function itemTime(item) {
  const raw = item?.pubDate || item?.timestamp
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  const clock = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${day}, ${clock} GMT`
}

/** "Friday, 30 July, 2004, 16:36 GMT" — the BBC's long stamp. */
function longStamp(iso) {
  const at = iso ? new Date(iso) : null
  if (!at || Number.isNaN(at.getTime())) return ''
  const weekday = at.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
  const day = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const clock = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${weekday}, ${day.replace(' ', ', ')}, ${clock} GMT`
}

function summaryOf(item, max = 180) {
  const text = String(item?.contentSnippet || item?.description || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** A story's theatre: from its point when it has one, else from its words. */
function regionSlot(item) {
  const coords = Array.isArray(item?.coordinates) ? item.coordinates : null
  if (coords && coords.length >= 2) {
    const byPoint = regionForPoint(Number(coords[0]), Number(coords[1]))
    if (GEO_REGIONS.includes(byPoint)) return byPoint
  }
  const byText = regionForText(`${item?.title || ''} ${item?.contentSnippet || item?.description || ''}`)
  return GEO_REGIONS.includes(byText) ? byText : null
}

function GlobeMark({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <circle cx="22" cy="22" r="20" fill="#f0b429" stroke="#990000" strokeWidth="1.5" />
      <path
        d="M2 22h40M22 2c7 5 7 35 0 40M22 2c-7 5-7 35 0 40"
        fill="none"
        stroke="#990000"
        strokeWidth="1"
      />
      <path d="M6 11c8 4 24 4 32 0M6 33c8-4 24-4 32 0" fill="none" stroke="#990000" strokeWidth="0.8" />
    </svg>
  )
}

function WorldMark() {
  return (
    <svg className="gpn-nav-map" viewBox="0 0 108 56" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="107" height="55" fill="#e9f2fa" stroke="#7f9db9" />
      <path d="M8 16l14-6 10 6-6 8-12 2z" fill="#9dc3e6" />
      <path d="M16 30l10-2 6 8-4 10-10-4z" fill="#9dc3e6" />
      <path d="M44 12l16-4 12 6-4 8-14 2z" fill="#9dc3e6" />
      <path d="M48 26l12 2 8 10-8 6-12-8z" fill="#9dc3e6" />
      <path d="M80 12l14-2 6 8-8 6-12-4z" fill="#9dc3e6" />
      <path d="M84 34l12-2 4 8-10 4z" fill="#9dc3e6" />
      <path d="M2 28h104M54 2v52" stroke="#bcd4e8" strokeWidth="0.6" />
    </svg>
  )
}

function Thumb({ item, variant = 'lead' }) {
  const src = articleImage(item)
  return (
    <span className={`gpn-thumb gpn-thumb--${variant}`}>
      {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : <GlobeMark className="gpn-thumb-globe" />}
    </span>
  )
}

function StoryLink({ item, onOpen, bold = false }) {
  return (
    <button
      type="button"
      className={`gpn-link${bold ? ' gpn-link--bold' : ''}`}
      onClick={() => onOpen?.(item)}
      title={item?.title || ''}
    >
      {item?.title || 'Untitled'}
    </button>
  )
}

function Headline({ item, size = 'secondary', onOpen }) {
  return (
    <h2 className={`gpn-headline gpn-headline--${size}`}>
      <button type="button" className="gpn-link" onClick={() => onOpen?.(item)}>
        {item?.title || 'Untitled'}
      </button>
    </h2>
  )
}

function StoryActions({ item, toMenuItem }) {
  return (
    <span className="gpn-actions">
      <ThreatScoreButton item={item} kind="news" placement="inline" />
      {toMenuItem ? <ItemMenu item={toMenuItem(item)} inline /> : null}
    </span>
  )
}

function SectionHead({ title }) {
  return (
    <div className="gpn-section-head">
      <h2 className="gpn-section-title">{title}</h2>
    </div>
  )
}

export default function GpnNewsPage({
  items = [],
  categories = [],
  sorts = [],
  sources = [],
  categoryFilter = 'all',
  sourceFilter = 'all',
  sortBy = 'newest',
  search = '',
  loading = false,
  refreshing = false,
  isEmpty = false,
  quotaExhausted = false,
  onSetCategory,
  onSetSource,
  onSetSort,
  onSetSearch,
  onClearSearch,
  onRefresh,
  onOpen,
  toMenuItem,
}) {
  const navigate = useNavigate()
  const pageRef = useRef(null)
  const [city, setCity] = useState('')
  const [updatedAt, setUpdatedAt] = useState(() => getSnapshotState().manifest?.generatedAt || '')

  useEffect(() => {
    startSnapshotPolling()
    return subscribeSnapshot((state) => setUpdatedAt(state?.manifest?.generatedAt || ''))
  }, [])

  const blocks = useMemo(() => {
    const lead = items[0] || null
    const secondary = items.slice(1, 3)
    const boxes = items.slice(3, 6)
    const pair = items.slice(6, 8)
    const rightTop = items.slice(8, 14)
    const also = items.slice(14, 16)
    const rest = items.slice(16)

    const related = lead
      ? rest.filter((item) => item.category && item.category === lead.category).slice(0, 3)
      : []

    const markets = rest.filter((item) => item.category === 'business').slice(0, 2)
    const videoPick = rest.find((item) => articleImage(item)) || null

    const byRegion = new Map()
    for (const item of rest) {
      const slot = regionSlot(item)
      if (!slot) continue
      if (!byRegion.has(slot)) byRegion.set(slot, [])
      const list = byRegion.get(slot)
      if (list.length < 2) list.push(item)
    }
    const regionGroups = []
    for (const slot of GEO_REGIONS) {
      const list = byRegion.get(slot)
      if (list && list.length) regionGroups.push({ slot, label: REGIONS[slot]?.label || slot, items: list })
    }

    const topicGroups = []
    for (const def of categories) {
      if (def.key === 'all') continue
      const list = rest.filter((item) => item.category === def.key).slice(0, 2)
      if (list.length) topicGroups.push({ key: def.key, label: def.label, items: list })
    }
    for (const item of rest) {
      const key = item.category || 'general'
      if (categories.some((def) => def.key === key)) continue
      let group = topicGroups.find((entry) => entry.key === key)
      if (!group) {
        group = { key, label: key, items: [] }
        topicGroups.push(group)
      }
      if (group.items.length < 2 && !group.items.includes(item)) group.items.push(item)
    }

    return { lead, secondary, boxes, pair, rightTop, also, related, markets, videoPick, regionGroups, topicGroups }
  }, [items, categories])

  const backToTop = () => {
    let node = pageRef.current?.parentElement
    while (node && node !== document.body) {
      if (node.scrollHeight > node.clientHeight) {
        node.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      node = node.parentElement
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openWeather = () => {
    const pick = WEATHER_CITIES.find((entry) => entry.label === city)
    if (!pick) return
    navigate(`/weather?lat=${pick.lat}&lon=${pick.lon}`)
  }

  return (
    <div className="gpn-page" ref={pageRef}>
      <div className="gpn-utility">
        <span className="gpn-logo">
          <span className="gpn-logo-blocks" aria-hidden="true" />
          GPN
        </span>
        <nav className="gpn-utility-nav" aria-label="GPN sections">
          <button type="button" className="gpn-link" onClick={() => navigate('/news')}>News</button>
          <span className="gpn-pipe" aria-hidden="true">|</span>
          <button type="button" className="gpn-link" onClick={() => navigate('/maps')}>Maps</button>
          <span className="gpn-pipe" aria-hidden="true">|</span>
          <button type="button" className="gpn-link" onClick={() => navigate('/weather')}>Weather</button>
          <span className="gpn-pipe" aria-hidden="true">|</span>
          <button type="button" className="gpn-link" onClick={() => navigate('/batman/overview')}>Batman</button>
          <span className="gpn-pipe" aria-hidden="true">|</span>
          <button type="button" className="gpn-link" onClick={() => navigate('/resources')}>Resources</button>
        </nav>
        <form
          className="gpn-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            onSetSearch?.(String(search).trim())
          }}
        >
          <input
            type="search"
            value={search}
            aria-label="Search GPN"
            placeholder={quotaExhausted ? 'Search saved headlines' : 'Search GPN'}
            onChange={(event) => onSetSearch?.(event.target.value)}
          />
          <button type="submit" className="gpn-btn gpn-btn--black">Search</button>
          {search ? (
            <button
              type="button"
              className="gpn-link"
              onClick={() => {
                onSetSearch?.('')
                onClearSearch?.()
              }}
            >
              Clear
            </button>
          ) : null}
        </form>
      </div>

      <div className="gpn-blackbar">
        <span className="gpn-blackbar-left">
          <span>Low Graphics version</span>
          <span className="gpn-pipe" aria-hidden="true">|</span>
          <span>Change edition</span>
          <span className="gpn-pipe" aria-hidden="true">|</span>
          <label className="gpn-inline-field">
            Source:
            <select value={sourceFilter} onChange={(event) => onSetSource?.(event.target.value)}>
              <option value="all">All sources</option>
              {sources.map((source) => (
                <option key={source.key} value={source.key}>{source.label}</option>
              ))}
            </select>
          </label>
          <label className="gpn-inline-field">
            Sort:
            <select value={sortBy} onChange={(event) => onSetSort?.(event.target.value)}>
              {sorts.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </span>
        <span className="gpn-blackbar-right">
          <button type="button" className="gpn-btn" onClick={onRefresh} disabled={refreshing || loading}>
            {refreshing || loading ? 'Updating…' : 'Refresh'}
          </button>
          <span className="gpn-pipe" aria-hidden="true">|</span>
          <button type="button" className="gpn-link" onClick={() => navigate('/resources')}>Help</button>
        </span>
      </div>

      <div className="gpn-masthead">
        <GlobeMark className="gpn-mast-globe" />
        <div className="gpn-mast-block">
          <span className="gpn-mast-name">GPN <strong>NEWS</strong></span>
          <span className="gpn-mast-tag">GOOD PALANTIR NEWS · UPDATED EVERY MINUTE · WORLD EDITION</span>
        </div>
        <button type="button" className="gpn-watch" onClick={() => navigate('/news/broadcasts')}>
          WATCH/LISTEN TO GPN
        </button>
      </div>

      <div className="gpn-ticker">
        <p className="gpn-ticker-latest">
          <span className="gpn-ticker-kicker">LATEST:</span>{' '}
          {blocks.lead ? <StoryLink item={blocks.lead} onOpen={onOpen} /> : <span>Waiting for the wire.</span>}
        </p>
        <p className="gpn-ticker-stamp">
          Last Updated: {longStamp(updatedAt) || 'the snapshot has not landed yet'}
        </p>
        <DataFreshness className="gpn-freshness" />
        {refreshing || loading ? (
          <p className="gpn-status"><progress /> Updating the desk…</p>
        ) : null}
        {quotaExhausted ? (
          <p className="gpn-status">Live search is paused. Saved headlines are still below.</p>
        ) : null}
      </div>

      <div className="gpn-columns">
        <nav className="gpn-nav" aria-label="GPN topics">
          <h2 className="gpn-nav-title">News Front Page</h2>
          <ul className="gpn-nav-list">
            {categories.map((category) => (
              <li key={category.key}>
                <button
                  type="button"
                  className={`gpn-link gpn-nav-item${categoryFilter === category.key ? ' is-active' : ''}`}
                  aria-current={categoryFilter === category.key ? 'true' : undefined}
                  onClick={() => onSetCategory?.(category.key)}
                >
                  {category.label}
                </button>
              </li>
            ))}
          </ul>
          <WorldMark />
          <button type="button" className="gpn-block gpn-block--live" onClick={() => navigate('/news/broadcasts')}>
            GPN LIVE
          </button>
          <button type="button" className="gpn-block gpn-block--weather" onClick={() => navigate('/weather')}>
            GPN WEATHER
          </button>
          <button type="button" className="gpn-block gpn-block--pictures" onClick={() => navigate('/news/x')}>
            IN PICTURES
          </button>
        </nav>

        <div className="gpn-main">
          {loading && !items.length ? (
            <p className="gpn-empty">Loading the desk…</p>
          ) : !items.length ? (
            <p className="gpn-empty">
              {isEmpty
                ? 'Couldn’t load news. Start the API, then use Refresh.'
                : 'No stories match these filters. Try another topic, source, or search term.'}
            </p>
          ) : (
            <>
              {blocks.lead ? (
                <div className="gpn-lead">
                  <button
                    type="button"
                    className="gpn-lead-media"
                    onClick={() => onOpen?.(blocks.lead)}
                    aria-label={`Open ${blocks.lead.title || 'the lead story'}`}
                  >
                    <Thumb item={blocks.lead} variant="lead" />
                  </button>
                  <div className="gpn-lead-copy">
                    <Headline item={blocks.lead} size="lead" onOpen={onOpen} />
                    {summaryOf(blocks.lead) ? <p className="gpn-summary">{summaryOf(blocks.lead)}</p> : null}
                    <p className="gpn-meta">
                      {blocks.lead.source}
                      {itemTime(blocks.lead) ? ` · ${itemTime(blocks.lead)}` : ''}
                    </p>
                    {blocks.related.length ? (
                      <p className="gpn-related">
                        {blocks.related.map((item, index) => (
                          <StoryLink key={keyOf(item, index)} item={item} onOpen={onOpen} />
                        ))}
                      </p>
                    ) : null}
                    <StoryActions item={blocks.lead} toMenuItem={toMenuItem} />
                  </div>
                </div>
              ) : null}

              {blocks.secondary.length ? (
                <>
                  <div className="gpn-rule" />
                  <div className="gpn-secondary">
                    {blocks.secondary.map((item, index) => (
                      <div key={keyOf(item, index)} className="gpn-secondary-story">
                        <button
                          type="button"
                          onClick={() => onOpen?.(item)}
                          aria-label={`Open ${item.title || 'story'}`}
                        >
                          <Thumb item={item} variant="secondary" />
                        </button>
                        <div>
                          <Headline item={item} size="secondary" onOpen={onOpen} />
                          {summaryOf(item, 110) ? <p className="gpn-summary">{summaryOf(item, 110)}</p> : null}
                          <StoryActions item={item} toMenuItem={toMenuItem} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {blocks.boxes.length ? (
                <div className="gpn-boxes">
                  {blocks.boxes.map((item, index) => (
                    <div key={keyOf(item, index)} className="gpn-box">
                      <button
                        type="button"
                        onClick={() => onOpen?.(item)}
                        aria-label={`Open ${item.title || 'story'}`}
                      >
                        <Thumb item={item} variant="box" />
                      </button>
                      <StoryLink item={item} onOpen={onOpen} bold />
                      {summaryOf(item, 90) ? <p className="gpn-box-text">{summaryOf(item, 90)}</p> : null}
                      <StoryActions item={item} toMenuItem={toMenuItem} />
                    </div>
                  ))}
                </div>
              ) : null}

              {blocks.regionGroups.length ? (
                <section className="gpn-section" aria-label="Around the world now">
                  <SectionHead title="Around the world now" />
                  <div className="gpn-region-grid">
                    {blocks.regionGroups.map((group) => (
                      <div key={group.slot} className="gpn-region">
                        <h3 className="gpn-region-title">{group.label}</h3>
                        <ul className="gpn-link-list">
                          {group.items.map((item, index) => (
                            <li key={keyOf(item, index)}>
                              <StoryLink item={item} onOpen={onOpen} />
                              <StoryActions item={item} toMenuItem={toMenuItem} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {blocks.topicGroups.length ? (
                <section className="gpn-section" aria-label="More from GPN online">
                  <SectionHead title="More from GPN online" />
                  <div className="gpn-region-grid">
                    {blocks.topicGroups.map((group) => (
                      <div key={group.key} className="gpn-region">
                        <h3 className="gpn-region-title">{group.label}</h3>
                        <ul className="gpn-link-list">
                          {group.items.map((item, index) => (
                            <li key={keyOf(item, index)}>
                              <StoryLink item={item} onOpen={onOpen} />
                              <StoryActions item={item} toMenuItem={toMenuItem} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {blocks.pair.length ? (
                <div className="gpn-pair">
                  {blocks.pair.map((item, index) => (
                    <div key={keyOf(item, index)} className="gpn-box">
                      <button
                        type="button"
                        onClick={() => onOpen?.(item)}
                        aria-label={`Open ${item.title || 'story'}`}
                      >
                        <Thumb item={item} variant="box" />
                      </button>
                      <StoryLink item={item} onOpen={onOpen} bold />
                      {summaryOf(item, 90) ? <p className="gpn-box-text">{summaryOf(item, 90)}</p> : null}
                      <StoryActions item={item} toMenuItem={toMenuItem} />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>

        <aside className="gpn-rail" aria-label="More from GPN">
          {blocks.rightTop.length ? (
            <div className="gpn-rail-block">
              <h2 className="gpn-rail-title">Other top stories</h2>
              <ul className="gpn-link-list">
                {blocks.rightTop.map((item, index) => (
                  <li key={keyOf(item, index)}>
                    <StoryLink item={item} onOpen={onOpen} />
                    <StoryActions item={item} toMenuItem={toMenuItem} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {blocks.also.length ? (
            <div className="gpn-rail-block">
              <h2 className="gpn-rail-title">Also in the news</h2>
              <ul className="gpn-rail-also">
                {blocks.also.map((item, index) => (
                  <li key={keyOf(item, index)}>
                    <button
                      type="button"
                      className="gpn-also-media"
                      aria-hidden="true"
                      tabIndex={-1}
                      onClick={() => onOpen?.(item)}
                    >
                      <Thumb item={item} variant="also" />
                    </button>
                    <StoryLink item={item} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {blocks.markets.length ? (
            <div className="gpn-sport">
              <h2 className="gpn-rail-title gpn-rail-title--on-yellow">
                GPN Markets <span className="gpn-badge">LIVE</span>
              </h2>
              <ul className="gpn-link-list">
                {blocks.markets.map((item, index) => (
                  <li key={keyOf(item, index)}>
                    <StoryLink item={item} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="gpn-rail-block">
            <h2 className="gpn-rail-title gpn-rail-title--red">
              Watch/Listen <span className="gpn-badge">REAL MEDIA</span>
            </h2>
            <p className="gpn-rail-sub">Video choice</p>
            <button
              type="button"
              className="gpn-video-choice"
              onClick={() => navigate('/news/videos')}
              aria-label="Open the video desk"
            >
              <Thumb item={blocks.videoPick} variant="video" />
            </button>
            <ul className="gpn-link-list">
              <li>
                <button type="button" className="gpn-link" onClick={() => navigate('/news/videos')}>
                  Video choice <span className="gpn-badge">VIDEO</span>
                </button>
              </li>
              <li>
                <button type="button" className="gpn-link" onClick={() => navigate('/news/broadcasts')}>
                  News bulletins <span className="gpn-badge">AUDIO</span>
                </button>
              </li>
              <li>
                <button type="button" className="gpn-link" onClick={() => navigate('/news/broadcasts')}>
                  World service <span className="gpn-badge">AUDIO</span>
                </button>
              </li>
            </ul>
          </div>

          <div className="gpn-rail-block">
            <h2 className="gpn-rail-title gpn-rail-title--red">Services</h2>
            <Thumb item={blocks.lead} variant="services" />
            <button type="button" className="gpn-link gpn-link--bold" onClick={() => navigate('/resources')}>
              Email news
            </button>
            <p className="gpn-rail-text">
              Headlines in your inbox, plus the RSS feeds this desk reads.
            </p>
          </div>

          <div className="gpn-weather">
            <h2 className="gpn-weather-title">GPN Weather</h2>
            <label className="gpn-weather-field">
              Select a city:
              <select value={city} onChange={(event) => setCity(event.target.value)}>
                <option value="">Choose a city</option>
                {WEATHER_CITIES.map((entry) => (
                  <option key={entry.label} value={entry.label}>{entry.label}</option>
                ))}
              </select>
            </label>
            <button type="button" className="gpn-btn" onClick={openWeather} disabled={!city}>Go</button>
          </div>
        </aside>
      </div>

      <div className="gpn-footer-bar">
        <button type="button" className="gpn-link" onClick={() => navigate('/settings')}>News alerts</button>
        <span className="gpn-pipe" aria-hidden="true">|</span>
        <button type="button" className="gpn-link" onClick={() => navigate('/resources')}>E-mail services</button>
        <span className="gpn-pipe" aria-hidden="true">|</span>
        <button type="button" className="gpn-link" onClick={() => navigate('/settings')}>Desktop ticker</button>
        <span className="gpn-pipe" aria-hidden="true">|</span>
        <button type="button" className="gpn-link" onClick={() => navigate('/settings')}>Mobiles/PDAs</button>
        <span className="gpn-pipe" aria-hidden="true">|</span>
        <button type="button" className="gpn-link" onClick={() => navigate('/resources')}>RSS version</button>
      </div>

      <div className="gpn-footer">
        <div className="gpn-footer-row">
          <span>© {COPYRIGHT_YEAR} GPN — Good Palantir News</span>
          <button type="button" className="gpn-link gpn-backtop" onClick={backToTop}>Back to top ^^</button>
        </div>
        <p className="gpn-footer-links">
          {categories.filter((category) => category.key !== 'all').map((category) => (
            <button
              key={category.key}
              type="button"
              className="gpn-link"
              onClick={() => onSetCategory?.(category.key)}
            >
              {category.label}
            </button>
          ))}
        </p>
        <p className="gpn-footer-links">
          <button type="button" className="gpn-link" onClick={() => navigate('/dashboard')}>GPN Homepage &gt;&gt;</button>
          <button type="button" className="gpn-link" onClick={() => navigate('/maps')}>Maps &gt;&gt;</button>
          <button type="button" className="gpn-link" onClick={() => navigate('/weather')}>Weather &gt;&gt;</button>
          <button type="button" className="gpn-link" onClick={() => navigate('/batman/overview')}>Batman &gt;&gt;</button>
        </p>
        <p className="gpn-footer-links">
          <button type="button" className="gpn-link" onClick={() => navigate('/resources')}>About GPN</button>
          <button type="button" className="gpn-link" onClick={() => navigate('/resources')}>Help</button>
          <button type="button" className="gpn-link" onClick={() => navigate('/bulletin')}>Feedback</button>
          <button type="button" className="gpn-link" onClick={() => navigate('/resources')}>News sources</button>
          <button type="button" className="gpn-link" onClick={() => navigate('/resources')}>Privacy &amp; Cookies Policy</button>
        </p>
      </div>
    </div>
  )
}
