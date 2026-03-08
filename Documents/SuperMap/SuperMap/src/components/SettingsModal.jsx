import { useState, useEffect } from 'react'
import {
  getTabVisibility,
  setTabVisibility,
  DEFAULT_TAB_VISIBILITY,
  getRapidApiKeys,
  setRapidApiKeys,
} from '../constants'
import './SettingsModal.css'

const TAB_LABELS = {
  osintMap: 'OSINT Map',
  conflictMap: 'Conflict Map',
  osintFeeds: 'OSINT Feeds',
  newsFeeds: 'News Feeds',
}

const RAPIDAPI_SEARCH_URL = 'https://rapidapi.com/hub?q=Crime+Data+Police+Dispatch+Traffic'

export default function SettingsModal({ onClose }) {
  const [prefs, setPrefs] = useState(() => getTabVisibility())
  const [rapidApiKeys, setRapidApiKeysState] = useState(() => getRapidApiKeys())
  const [activeSection, setActiveSection] = useState('tabs')

  useEffect(() => {
    setTabVisibility(prefs)
  }, [prefs])

  useEffect(() => {
    setRapidApiKeys(rapidApiKeys)
  }, [rapidApiKeys])

  const toggle = (key) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
  }

  const reset = () => {
    setPrefs({ ...DEFAULT_TAB_VISIBILITY })
  }

  const updateRapidApiKey = (name, value) => {
    setRapidApiKeysState((prev) => ({ ...prev, [name]: value }))
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
              <h3>RapidAPI Keys</h3>
              <p className="settings-hint">
                Add API keys for ADS-B, Flock Cameras, and other RapidAPI integrations.
              </p>
              <div className="settings-rapidapi">
                <label>
                  <span>Default / Primary Key</span>
                  <input
                    type="password"
                    value={rapidApiKeys.default || ''}
                    onChange={(e) => updateRapidApiKey('default', e.target.value)}
                    placeholder="x-rapidapi-key"
                  />
                </label>
                <label>
                  <span>RapidAPI Key (alt)</span>
                  <input
                    type="password"
                    value={rapidApiKeys.rapidapi || ''}
                    onChange={(e) => updateRapidApiKey('rapidapi', e.target.value)}
                    placeholder="Optional second key"
                  />
                </label>
              </div>
              <a
                href={RAPIDAPI_SEARCH_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="settings-rapidapi-search"
              >
                Search RapidAPI
              </a>
              <p className="settings-rapidapi-hint">
                Search for Crime Data, Police Dispatch, or Traffic APIs to integrate later.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
