import { useState, useEffect } from 'react'
import { getTabVisibility, setTabVisibility, DEFAULT_TAB_VISIBILITY } from '../constants'
import './SettingsModal.css'

const TAB_LABELS = {
  osintMap: 'OSINT Map',
  conflictMap: 'Conflict Map',
  osintFeeds: 'OSINT Feeds',
  newsFeeds: 'News Feeds',
}

export default function SettingsModal({ onClose }) {
  const [prefs, setPrefs] = useState(() => getTabVisibility())
  const [activeSection, setActiveSection] = useState('tabs')

  useEffect(() => {
    setTabVisibility(prefs)
  }, [prefs])

  const toggle = (key) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
  }

  const reset = () => {
    setPrefs({ ...DEFAULT_TAB_VISIBILITY })
  }

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>Settings</h2>
          <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="settings-modal-tabs">
          <button
            type="button"
            className={activeSection === 'tabs' ? 'active' : ''}
            onClick={() => setActiveSection('tabs')}
          >
            Tabs
          </button>
          <button
            type="button"
            className={activeSection === 'advanced' ? 'active' : ''}
            onClick={() => setActiveSection('advanced')}
          >
            Advanced
          </button>
        </div>
        <div className="settings-modal-body">
          {activeSection === 'tabs' && (
            <section className="settings-section">
              <h3>Tab visibility</h3>
              <p className="settings-hint">Show or hide tabs in the sidebar.</p>
              <ul className="settings-toggles">
                {Object.entries(TAB_LABELS).map(([key, label]) => (
                  <li key={key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={prefs[key] !== false}
                        onChange={() => toggle(key)}
                      />
                      <span>{label}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <button type="button" className="settings-reset" onClick={reset}>
                Reset to default
              </button>
            </section>
          )}

          {activeSection === 'advanced' && (
            <section className="settings-section">
              <h3>Advanced</h3>
              <p className="settings-hint">
                RapidAPI-based features (ADS-B, Flock Cameras, Yahoo Finance, Meteostat weather, etc.) have been removed. Use the Resources and Tools tabs for embedded alternatives (e.g. ADS-B Exchange, adsb.lol).
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
