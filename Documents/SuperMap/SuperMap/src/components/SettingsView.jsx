import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  getTabVisibility,
  setTabVisibility,
  DEFAULT_TAB_VISIBILITY,
  getVisualsPrefs,
  setVisualsPrefs,
} from '../constants'
import './SettingsView.css'

const TAB_LABELS = {
  osintMap: 'OSINT Map',
  conflictMap: 'Conflict Map',
  exploreMap: 'Explore',
  flockMap: 'Flock Cameras',
  liveWebcams: 'Live Webcams',
  printMap: 'Print Map',
  osintFeeds: 'OSINT Feeds',
  newsFeeds: 'Glowie Report',
  osintX: 'OSINT (X)',
  broadcasts: 'Broadcasts',
}

const CONFIG_WRITE_TOKEN_KEY = 'supermap_configWriteToken'

function readConfigWriteToken() {
  try {
    return String(localStorage.getItem(CONFIG_WRITE_TOKEN_KEY) || '')
  } catch {
    return ''
  }
}

export default function SettingsView({ apiBase, onVisualsChange }) {
  const [activeSection, setActiveSection] = useState('visuals')
  const [tabPrefs, setTabPrefs] = useState(() => getTabVisibility())
  const [visuals, setVisuals] = useState(() => getVisualsPrefs())
  const [osintXHandles, setOsintXHandles] = useState([])
  const [defaultOsintXHandles, setDefaultOsintXHandles] = useState([])
  const [stockTickers, setStockTickers] = useState([])
  const [configLoading, setConfigLoading] = useState(true)
  const [configSaving, setConfigSaving] = useState(false)
  const [configWriteError, setConfigWriteError] = useState('')
  const [newHandle, setNewHandle] = useState('')

  useEffect(() => setTabVisibility(tabPrefs), [tabPrefs])
  useEffect(() => {
    setVisualsPrefs(visuals)
    onVisualsChange?.()
  }, [visuals, onVisualsChange])

  const fetchConfig = useCallback(() => {
    if (!apiBase) {
      setConfigLoading(false)
      return
    }
    setConfigLoading(true)
    axios
      .get(`${apiBase}/api/config`, { timeout: 5000 })
      .then((res) => {
        setOsintXHandles(res.data.osintXHandles || [])
        setDefaultOsintXHandles(res.data.defaultOsintXHandles || [])
        setStockTickers(Array.isArray(res.data.stockTickers) ? res.data.stockTickers : [])
      })
      .catch(() => {
        setOsintXHandles([])
        setDefaultOsintXHandles([])
        setStockTickers([])
      })
      .finally(() => setConfigLoading(false))
  }, [apiBase])

  useEffect(() => fetchConfig(), [fetchConfig])

  const saveConfig = (updates) => {
    if (!apiBase) return
    setConfigSaving(true)
    setConfigWriteError('')
    const headers = {}
    const token = readConfigWriteToken().trim()
    if (token) headers['X-Config-Token'] = token
    axios
      .post(`${apiBase}/api/config`, updates, { timeout: 5000, headers })
      .then((res) => {
        setOsintXHandles(res.data.osintXHandles || [])
        if (res.data.stockTickers !== undefined) setStockTickers(res.data.stockTickers || [])
      })
      .catch(() => {
        setConfigWriteError('Could not save.')
      })
      .finally(() => setConfigSaving(false))
  }

  const addHandle = () => {
    const handle = newHandle.trim().replace(/^@/, '')
    if (!handle) return
    const next = [...osintXHandles, { name: handle, handle, priority: 'medium' }]
    setOsintXHandles(next)
    setNewHandle('')
    saveConfig({ osintXHandles: next })
  }

  const removeHandle = (index) => {
    const next = osintXHandles.filter((_, i) => i !== index)
    setOsintXHandles(next)
    saveConfig({ osintXHandles: next })
  }

  const restoreDefaultOsintX = () => {
    if (defaultOsintXHandles.length === 0) return
    setOsintXHandles(defaultOsintXHandles)
    saveConfig({ osintXHandles: defaultOsintXHandles })
  }

  const [newTickerSymbol, setNewTickerSymbol] = useState('')
  const [newTickerName, setNewTickerName] = useState('')
  const addStockTicker = () => {
    const symbol = newTickerSymbol.trim()
    if (!symbol) return
    const name = newTickerName.trim() || symbol
    const next = [...stockTickers, { symbol, name }]
    setStockTickers(next)
    setNewTickerSymbol('')
    setNewTickerName('')
    saveConfig({ stockTickers: next })
  }
  const removeStockTicker = (index) => {
    const next = stockTickers.filter((_, i) => i !== index)
    setStockTickers(next)
    saveConfig({ stockTickers: next })
  }

  const sections = [
    { id: 'visuals', label: 'Visuals' },
    { id: 'tabs', label: 'Tab visibility' },
    { id: 'xhandles', label: 'X (Twitter) handles' },
    { id: 'stocktickers', label: 'Stock tickers' },
    { id: 'firebase', label: 'Firebase' },
  ]

  return (
    <div className="settings-view">
      <header className="settings-view-header">
        <h1 className="settings-view-title">Settings</h1>
      </header>

      <nav className="settings-view-nav">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`settings-view-nav-btn ${activeSection === s.id ? 'active' : ''}`}
            onClick={() => setActiveSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="settings-view-body">
        {activeSection === 'visuals' && (
          <section className="settings-view-section">
            <h2>Visuals</h2>
            <div className="settings-field">
              <label>Theme</label>
              <p className="settings-hint">Night ops (charcoal + emerald) is always on.</p>
            </div>
            <div className="settings-field">
              <label>
                <input
                  type="checkbox"
                  checked={!!visuals.compact}
                  onChange={(e) => setVisuals((v) => ({ ...v, compact: e.target.checked }))}
                />
                <span>Compact density</span>
              </label>
            </div>
            <div className="settings-field">
              <label>Font size</label>
              <select
                value={visuals.fontSize || 'normal'}
                onChange={(e) => setVisuals((v) => ({ ...v, fontSize: e.target.value }))}
                className="settings-select"
              >
                <option value="small">Small</option>
                <option value="normal">Normal</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div className="settings-field">
              <label>Layout mode</label>
              <select
                value={visuals.layoutMode || 'auto'}
                onChange={(e) => setVisuals((v) => ({ ...v, layoutMode: e.target.value }))}
                className="settings-select"
              >
                <option value="auto">Auto (detect device)</option>
                <option value="desktop">Force desktop layout</option>
                <option value="mobile">Force mobile layout</option>
              </select>
              <p className="settings-hint">If the UI does not update instantly after forcing mobile/desktop, click apply below.</p>
              <button
                type="button"
                className="settings-reset"
                onClick={() => window.location.reload()}
              >
                Apply layout (refresh page)
              </button>
            </div>
            <div className="settings-field">
              <a className="settings-link" href="https://github.com/TheCloutySkies/SuperMap.git" target="_blank" rel="noopener noreferrer">
                Open GitHub Repository
              </a>
            </div>
          </section>
        )}

        {activeSection === 'tabs' && (
          <section className="settings-view-section">
            <h2>Tab visibility</h2>
            <p className="settings-hint">Show or hide tabs in the sidebar.</p>
            <ul className="settings-toggles">
              {Object.entries(TAB_LABELS).map(([key, label]) => (
                <li key={key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={tabPrefs[key] !== false}
                      onChange={() => setTabPrefs((p) => ({ ...p, [key]: !p[key] }))}
                    />
                    <span>{label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" className="settings-reset" onClick={() => setTabPrefs({ ...DEFAULT_TAB_VISIBILITY })}>
              Reset to default
            </button>
          </section>
        )}

        {activeSection === 'xhandles' && (
          <section className="settings-view-section">
            <h2>X (Twitter) handles</h2>
            {configWriteError && <p className="settings-hint settings-hint--warn">{configWriteError}</p>}
            {configLoading ? (
              <p className="settings-loading">Loading…</p>
            ) : (
              <>
                {defaultOsintXHandles.length > 0 && (
                  <button
                    type="button"
                    className="settings-restore-default-btn"
                    onClick={restoreDefaultOsintX}
                    disabled={configSaving || osintXHandles.length >= defaultOsintXHandles.length}
                  >
                    Restore all {defaultOsintXHandles.length} default OSINT X feeds
                  </button>
                )}
                <div className="settings-list-add">
                  <input
                    type="text"
                    value={newHandle}
                    onChange={(e) => setNewHandle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addHandle()}
                    placeholder="@handle or handle"
                    className="settings-input"
                  />
                  <button type="button" className="settings-add-btn" onClick={addHandle} disabled={configSaving}>
                    Add
                  </button>
                </div>
                <ul className="settings-list">
                  {osintXHandles.map((entry, i) => (
                    <li key={`${entry.handle}-${i}`} className="settings-list-item">
                      <span className="settings-list-label">@{entry.handle}</span>
                      <span className="settings-list-meta">{entry.name !== entry.handle ? entry.name : ''}</span>
                      <button type="button" className="settings-remove-btn" onClick={() => removeHandle(i)} aria-label="Remove">
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {activeSection === 'stocktickers' && (
          <section className="settings-view-section">
            <h2>Stock tickers</h2>
            {configLoading ? (
              <p className="settings-loading">Loading…</p>
            ) : (
              <>
                <div className="settings-list-add">
                  <input
                    type="text"
                    value={newTickerSymbol}
                    onChange={(e) => setNewTickerSymbol(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addStockTicker()}
                    placeholder="Symbol (e.g. SPY, AAPL)"
                    className="settings-input"
                  />
                  <input
                    type="text"
                    value={newTickerName}
                    onChange={(e) => setNewTickerName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addStockTicker()}
                    placeholder="Label (optional)"
                    className="settings-input"
                  />
                  <button type="button" className="settings-add-btn" onClick={addStockTicker} disabled={configSaving}>
                    Add
                  </button>
                </div>
                <ul className="settings-list">
                  {stockTickers.map((t, i) => (
                    <li key={`${t.symbol}-${i}`} className="settings-list-item">
                      <span className="settings-list-label">{t.symbol}</span>
                      <span className="settings-list-meta">{t.name !== t.symbol ? t.name : ''}</span>
                      <button type="button" className="settings-remove-btn" onClick={() => removeStockTicker(i)} aria-label="Remove">
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
        {activeSection === 'firebase' && (
          <section className="settings-view-section">
            <h2>Firebase</h2>
            <p className="settings-hint">
              Accounts, chats and disappearing photos run on Firebase. The guide lists every console
              step in order: the three sign-in methods, enabling Storage, deploying the rules and
              indexes, the six values for Vercel, and the service-account key for GitHub Actions.
            </p>
            <div className="settings-field">
              <label>Setup guide</label>
              <a
                className="settings-link-btn"
                href="/firebase-setup.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open the step-by-step Firebase setup →
              </a>
            </div>
            <p className="settings-hint">
              Storage is the step that turns on photos and secure drops; until it is enabled the Photo
              button in a chat stays disabled.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
