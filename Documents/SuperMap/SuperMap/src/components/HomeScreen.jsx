import { useState, useEffect } from 'react'
import axios from 'axios'
import './HomeScreen.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'

const QUICK_LINKS = [
  { id: 'osint-map', label: 'OSINT Map', desc: 'View news, intel, and events on the map', icon: '🗺️', path: 'osint-map' },
  { id: 'conflict-map', label: 'Conflict Map', desc: 'Tactical and conflict layers', icon: '⚔️', path: 'conflict-map' },
  { id: 'news-feeds', label: 'News Feeds', desc: 'Wikipedia, Reddit, Google News, BBC', icon: '📰', path: 'news-feeds' },
  { id: 'osint-feeds', label: 'OSINT Feeds', desc: 'Bellingcat, CISA, DW, tactical intel', icon: '📡', path: 'osint-feeds' },
  { id: 'osint-x', label: 'OSINT (X)', desc: 'Posts from OSINT X/Twitter accounts via RSS', icon: '𝕏', path: 'osint-x' },
  { id: 'community', label: 'Community Forum', desc: 'Browse communities and post in the forum', icon: '💬', path: 'community' },
  { id: 'report-maker', label: 'Report Maker', desc: 'Build and save intelligence reports', icon: '📝', path: 'report-maker' },
  { id: 'resources', label: 'Resources', desc: 'Open OSINT tools and reference resources', icon: '📚', path: 'resources' },
]

function formatDate() {
  const d = new Date()
  const month = d.toLocaleString('en-US', { month: 'long' })
  const day = d.getDate()
  const year = d.getFullYear()
  return `${month} ${day} | ${year}`
}

function stripHtml(html) {
  if (!html || typeof html !== 'string') return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || div.innerText || '').trim().slice(0, 100)
}

export default function HomeScreen({ onNavigate, footerMode, onFooterNav, footerTabs }) {
  const [nitterImages, setNitterImages] = useState([])
  const [forumPosts, setForumPosts] = useState([])
  const [forumCommunities, setForumCommunities] = useState([])

  useEffect(() => {
    if (!API_BASE) return
    axios
      .get(`${API_BASE}/api/osint-x`, { params: { limit: 80 }, timeout: 12000 })
      .then((res) => {
        const posts = Array.isArray(res.data) ? res.data : []
        const items = posts.flatMap((p) => {
          const postUrl = p.url && typeof p.url === 'string' && p.url.startsWith('http') ? p.url : null
          return (Array.isArray(p.images) ? p.images : [])
            .filter((src) => typeof src === 'string' && src.startsWith('http'))
            .map((src) => ({ src, postUrl: postUrl || src }))
        })
        setNitterImages(items.slice(0, 24))
      })
      .catch(() => setNitterImages([]))
  }, [])

  useEffect(() => {
    if (!API_BASE) return
    Promise.all([
      axios.get(`${API_BASE}/api/forum/posts`, { timeout: 12000 }),
      axios.get(`${API_BASE}/api/forum/communities`, { timeout: 12000 }),
    ])
      .then(([postsRes, communitiesRes]) => {
        const posts = Array.isArray(postsRes.data) ? postsRes.data.slice(0, 10) : []
        const communities = Array.isArray(communitiesRes.data) ? communitiesRes.data : []
        setForumPosts(posts)
        setForumCommunities(communities)
      })
      .catch(() => { setForumPosts([]); setForumCommunities([]) })
  }, [])

  const handleCardClick = (path) => {
    if (onNavigate && path) onNavigate(path)
  }

  const getCommunityName = (communityId) => {
    const c = forumCommunities.find((x) => x.id === communityId)
    return c?.name || 'Community'
  }

  const handleForumPostClick = (post) => {
    window.location.hash = `#/post/${post.id}`
    if (onNavigate) onNavigate('community')
  }

  return (
    <div className="home-screen">
      <div className="home-screen-map-bg" aria-hidden />
      <div className="home-screen-frame">
        <header className="home-screen-header">
          <div className="home-screen-header-brand">
            <h1 className="home-screen-logo">SuperMap</h1>
            <span className="home-screen-date">{formatDate()}</span>
          </div>
          {footerTabs && onFooterNav && (
            <nav className="home-screen-nav">
              {footerTabs.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`home-screen-nav-tab metallicss ${footerMode === key ? 'active' : ''}`}
                  onClick={() => onFooterNav(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
        </header>

        <div className="home-screen-main">
          <div className="home-screen-main-left">
            <div className="home-screen-featured">
              <p className="home-screen-featured-title">Open-source OSINT & tactical dashboard</p>
              <p className="home-screen-featured-sub">— This tool is like Palantir if it wasn&apos;t evil.</p>
            </div>
            <section className="home-screen-section">
              <h2 className="home-screen-section-title">Quick access</h2>
              <ul className="home-screen-list">
                {QUICK_LINKS.map((link) => (
                  <li key={link.id}>
                    <button
                      type="button"
                      className="home-screen-card"
                      onClick={() => handleCardClick(link.path)}
                    >
                      <span className="home-screen-card-icon" aria-hidden>{link.icon}</span>
                      <div className="home-screen-card-text">
                        <span className="home-screen-card-title">{link.label}</span>
                        <span className="home-screen-card-desc">{link.desc}</span>
                      </div>
                      <span className="home-screen-card-arrow">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="home-screen-section home-screen-forum">
              <h2 className="home-screen-section-title">Community posts</h2>
              {forumPosts.length === 0 ? (
                <p className="home-screen-forum-empty">No forum posts yet. Open Community to browse or post.</p>
              ) : (
                <ul className="home-screen-forum-list">
                  {forumPosts.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="home-screen-forum-item"
                        onClick={() => handleForumPostClick(p)}
                      >
                        <span className="home-screen-forum-item-title">{p.title || 'Untitled'}</span>
                        <span className="home-screen-forum-item-meta">
                          {getCommunityName(p.community_id)} · {p.created_at ? new Date(p.created_at).toLocaleDateString(undefined, { dateStyle: 'short' }) : ''}
                        </span>
                        {p.content && (
                          <span className="home-screen-forum-item-preview">{stripHtml(p.content)}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="home-screen-forum-link btn-y2k"
                onClick={() => handleCardClick('community')}
              >
                Open Community →
              </button>
            </section>
          </div>
          <aside className="home-screen-sidebar">
            <div className="home-screen-sidebar-block card-y2k">
              <button
                type="button"
                className="home-screen-settings btn-y2k metallicss"
                onClick={() => onNavigate('settings')}
              >
                ⚙️ Settings & API keys
              </button>
            </div>
            <div className="home-screen-sidebar-block card-y2k home-screen-sidebar-photos">
              <h3 className="home-screen-sidebar-photos-title">From OSINT (X) feed</h3>
              {nitterImages.length > 0 ? (
                <div className="home-screen-sidebar-photos-grid">
                  {nitterImages.map((item, i) => (
                    <a
                      key={`${item.src}-${i}`}
                      href={item.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="home-screen-sidebar-photo"
                      title="Open post"
                    >
                      <img src={item.src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="home-screen-hint">Connect to the API to show photos from the Nitter/OSINT X feed.</p>
              )}
            </div>
          </aside>
        </div>

        <footer className="home-screen-footer-strip">
          <div className="home-screen-footer-col">
            <h3 className="home-screen-footer-head">Quick access</h3>
            <ul className="home-screen-footer-list">
              {QUICK_LINKS.slice(0, 4).map((link) => (
                <li key={link.id}>
                  <button type="button" className="home-screen-footer-link" onClick={() => handleCardClick(link.path)}>{link.label}</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="home-screen-footer-col">
            <h3 className="home-screen-footer-head">Navigate</h3>
            <ul className="home-screen-footer-list">
              {footerTabs?.map(({ key, label }) => (
                <li key={key}>
                  <button type="button" className="home-screen-footer-link" onClick={() => onFooterNav?.(key)}>{label}</button>
                </li>
              ))}
            </ul>
          </div>
        </footer>
      </div>
    </div>
  )
}
