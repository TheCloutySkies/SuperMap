import './HomeScreen.css'

const QUICK_LINKS = [
  { id: 'osint-map', label: 'OSINT Map', desc: 'View news, intel, and events on the map', icon: '🗺️', path: 'osint-map' },
  { id: 'conflict-map', label: 'Conflict Map', desc: 'Tactical and conflict layers', icon: '⚔️', path: 'conflict-map' },
  { id: 'news-feeds', label: 'News Feeds', desc: 'Wikipedia, Reddit, Google News, BBC', icon: '📰', path: 'news-feeds' },
  { id: 'osint-feeds', label: 'OSINT Feeds', desc: 'Bellingcat, CISA, DW, tactical intel', icon: '📡', path: 'osint-feeds' },
  { id: 'osint-x', label: 'OSINT (X)', desc: 'Posts from OSINT X/Twitter accounts via RSS', icon: '𝕏', path: 'osint-x' },
]

export default function HomeScreen({ onNavigate }) {
  const handleCardClick = (path) => {
    if (onNavigate && path) onNavigate(path)
  }

  return (
    <div className="home-screen">
      <div className="home-screen-map-bg" aria-hidden />
      <div className="home-screen-hero">
        <h1 className="home-screen-title">SuperMap</h1>
        <p className="home-screen-tagline">Open-source OSINT & tactical dashboard</p>
        <p className="home-screen-desc">This tool is like Palantir if it wasn't evil.</p>
      </div>

      <section className="home-screen-section">
        <h2 className="home-screen-section-title">Quick access</h2>
        <div className="home-screen-grid">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              className="home-screen-card"
              onClick={() => handleCardClick(link.path)}
            >
              <span className="home-screen-card-icon" aria-hidden>{link.icon}</span>
              <h3 className="home-screen-card-title">{link.label}</h3>
              <p className="home-screen-card-desc">{link.desc}</p>
              <span className="home-screen-card-arrow">→</span>
            </button>
          ))}
        </div>
      </section>

      <section className="home-screen-section home-screen-actions">
        <button
          type="button"
          className="home-screen-settings"
          onClick={() => onNavigate('settings')}
        >
          ⚙️ Settings & API keys
        </button>
        <p className="home-screen-hint">
          Use the footer to switch <strong>HOME</strong>, <strong>MAPS</strong>, <strong>FEEDS</strong>, and <strong>SETTINGS</strong>. On the map, use the top bar to search places or OSINT data.
        </p>
      </section>
    </div>
  )
}
