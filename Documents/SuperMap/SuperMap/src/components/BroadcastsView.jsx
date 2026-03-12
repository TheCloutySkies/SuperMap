import { useState } from 'react'
import StreamPlayer from './StreamPlayer'
import './BroadcastsView.css'

// hlsUrl + referer = in-page stream via backend proxy (works on localhost). YouTube kept as option.
const BROADCASTS = [
  { id: 'aljazeera', name: 'Al Jazeera English', officialLink: 'https://www.aljazeera.com/live', hlsUrl: 'https://live-hls-web-aje.getaj.net/AJE/index.m3u8', referer: 'https://www.aljazeera.com/', ytLink: 'https://www.youtube.com/@aljazeeraenglish/live', ytEmbed: 'https://www.youtube.com/embed/jGK0uYf-3c0' },
  { id: 'france24', name: 'France 24 English', officialLink: 'https://www.france24.com/en/live', hlsUrl: 'https://live.france24.com/hls/live/2037218-b/F24_EN_HI_HLS/master_500.m3u8', referer: 'https://www.france24.com/', ytLink: 'https://www.youtube.com/@FRANCE24/live', ytEmbed: 'https://www.youtube.com/embed/h3MuIUNCCzI' },
  { id: 'dw', name: 'DW News', officialLink: 'https://www.dw.com/en/live-tv/s-100825', ytLink: 'https://www.youtube.com/@dwnews/live', ytEmbed: 'https://www.youtube.com/embed/tZT2MCYu6Zw' },
  { id: 'bbc', name: 'BBC News', officialLink: 'https://www.bbc.com/news/live', ytLink: 'https://www.youtube.com/@BBCNews/live', ytEmbed: 'https://www.youtube.com/embed/ScY8G5TDqVA' },
  { id: 'cgtn', name: 'CGTN Live', officialLink: 'https://www.cgtn.com/live', ytLink: 'https://www.youtube.com/@CGTNLive/live', ytEmbed: 'https://www.youtube.com/embed/6LPl4xM1O2o' },
  { id: 'wion', name: 'WION', officialLink: 'https://www.wionews.com/live-tv', ytLink: 'https://www.youtube.com/@WION/live', ytEmbed: 'https://www.youtube.com/embed/3O_vT6i8b1I' },
  { id: 'ndtv', name: 'NDTV 24x7', officialLink: 'https://www.ndtv.com/video/live/channel/ndtv-24x7', ytLink: 'https://www.youtube.com/@ndtv/live', ytEmbed: 'https://www.youtube.com/embed/WB-y7_ymPJI' },
  { id: 'sky', name: 'Sky News', officialLink: 'https://news.sky.com/watch-live', ytLink: 'https://www.youtube.com/@SkyNews/live', ytEmbed: 'https://www.youtube.com/embed/9Auq9mYxFEE' },
  { id: 'nasa', name: 'NASA Live', officialLink: 'https://www.nasa.gov/nasatv/', ytLink: 'https://www.youtube.com/@NASA/live', ytEmbed: 'https://www.youtube.com/embed/21X5lGlDOfg' },
  { id: 'reuters', name: 'Reuters', officialLink: 'https://www.reuters.com/video/', ytLink: null, ytEmbed: null },
  { id: 'ap', name: 'Associated Press', officialLink: 'https://www.apnews.com/live', ytLink: null, ytEmbed: null },
  { id: 'cspan', name: 'C-SPAN', officialLink: 'https://www.c-span.org/live/', ytLink: 'https://www.youtube.com/@cspan/live', ytEmbed: null },
]

export default function BroadcastsView() {
  const [expanded, setExpanded] = useState(null)
  const [useYtEmbed, setUseYtEmbed] = useState(true)
  const [playingOfficialId, setPlayingOfficialId] = useState(null)
  const [streamError, setStreamError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refreshAll = () => {
    setExpanded(null)
    setPlayingOfficialId(null)
    setStreamError(null)
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="broadcasts-view">
      <header className="broadcasts-header">
        <h2 className="broadcasts-title">Live Broadcasts</h2>
        <p className="broadcasts-subtitle">
          Use <strong>Play official stream</strong> to watch in-page (works on localhost when YouTube embeds don’t). Or open <strong>Official stream</strong> / <strong>YouTube</strong> in a new tab.
        </p>
        <div className="broadcasts-header-options">
          <button type="button" className="broadcasts-refresh-btn" onClick={refreshAll}>
            Refresh streams
          </button>
          <label className="broadcasts-embed-toggle">
            <input
              type="checkbox"
              checked={useYtEmbed}
              onChange={(e) => setUseYtEmbed(e.target.checked)}
            />
            <span>Show YouTube embeds (turn off if they don’t load)</span>
          </label>
        </div>
      </header>
      <div className="broadcasts-grid">
        {BROADCASTS.map((b) => (
          <div key={b.id} className={`broadcasts-card ${expanded === b.id ? 'broadcasts-card--expanded' : ''}`}>
            <div className="broadcasts-card-header">
              <h3 className="broadcasts-card-title">{b.name}</h3>
              <div className="broadcasts-card-actions">
                {b.hlsUrl && (
                  <button
                    type="button"
                    className="broadcasts-card-link broadcasts-card-link--primary broadcasts-card-btn-inline"
                    onClick={() => {
                      setPlayingOfficialId(playingOfficialId === b.id ? null : b.id)
                      setStreamError(null)
                    }}
                  >
                    {playingOfficialId === b.id ? 'Stop stream' : 'Play official stream'}
                  </button>
                )}
                {b.officialLink && (
                  <a href={b.officialLink} target="_blank" rel="noopener noreferrer" className="broadcasts-card-link">
                    Official site
                  </a>
                )}
                {b.ytLink && (
                  <a href={b.ytLink} target="_blank" rel="noopener noreferrer" className="broadcasts-card-link">
                    YouTube
                  </a>
                )}
                {(b.ytEmbed && useYtEmbed) && (
                  <button
                    type="button"
                    className="broadcasts-card-toggle"
                    onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                  >
                    {expanded === b.id ? 'Collapse' : 'Expand'}
                  </button>
                )}
              </div>
            </div>
            {playingOfficialId === b.id && b.hlsUrl && (
              <StreamPlayer
                key={`${b.id}-${refreshKey}`}
                streamUrl={b.hlsUrl}
                referer={b.referer || ''}
                name={b.name}
                onError={(msg) => setStreamError(msg)}
                reloadKey={refreshKey}
              />
            )}
            {streamError && playingOfficialId === b.id && (
              <p className="broadcasts-stream-error">{streamError}</p>
            )}
            {playingOfficialId !== b.id && (b.ytEmbed && useYtEmbed) ? (
              <div className="broadcasts-card-embed-wrap">
                <iframe
                  key={`${b.id}-${refreshKey}`}
                  title={b.name}
                  src={`${b.ytEmbed}${b.ytEmbed.includes('?') ? '&' : '?'}playsinline=1&rel=0`}
                  className="broadcasts-embed"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
                <div className="broadcasts-embed-fallback">
                  <span>If embed fails, watch directly:</span>
                  {b.ytLink && (
                    <a href={b.ytLink} target="_blank" rel="noopener noreferrer" className="broadcasts-card-link">
                      Open on YouTube
                    </a>
                  )}
                  {b.officialLink && (
                    <a href={b.officialLink} target="_blank" rel="noopener noreferrer" className="broadcasts-card-link">
                      Official site
                    </a>
                  )}
                </div>
              </div>
            ) : playingOfficialId !== b.id ? (
              <div className="broadcasts-card-links-only">
                <p className="broadcasts-card-links-hint">Open the live stream in a new tab:</p>
                <div className="broadcasts-card-buttons">
                  {b.officialLink && (
                    <a href={b.officialLink} target="_blank" rel="noopener noreferrer" className="broadcasts-card-btn broadcasts-card-btn--primary">
                      Open on {b.name}
                    </a>
                  )}
                  {b.ytLink && (
                    <a href={b.ytLink} target="_blank" rel="noopener noreferrer" className="broadcasts-card-btn">
                      Open on YouTube
                    </a>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
