import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
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
  osintFeeds: 'OSINT Feeds',
  newsFeeds: 'News Feeds',
  osintX: 'OSINT (X)',
  places: 'My Places',
  saved: 'Saved',
  updates: 'Updates',
  broadcasts: 'Broadcasts',
}

export default function SettingsView({ apiBase, onVisualsChange }) {
  const { user, deleteAccount } = useAuth()
  const [activeSection, setActiveSection] = useState('visuals')
  const [tabPrefs, setTabPrefs] = useState(() => getTabVisibility(user?.id || null))
  const [visuals, setVisuals] = useState(() => getVisualsPrefs(user?.id || null))
  const [osintXHandles, setOsintXHandles] = useState([])
  const [defaultOsintXHandles, setDefaultOsintXHandles] = useState([])
  const [subreddits, setSubreddits] = useState([])
  const [stockTickers, setStockTickers] = useState([])
  const [configLoading, setConfigLoading] = useState(true)
  const [configSaving, setConfigSaving] = useState(false)
  const [newHandle, setNewHandle] = useState('')
  const [newSubreddit, setNewSubreddit] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  useEffect(() => setTabVisibility(tabPrefs, user?.id || null), [tabPrefs, user?.id])
  useEffect(() => {
    setVisualsPrefs(visuals, user?.id || null)
    onVisualsChange?.()
  }, [visuals, onVisualsChange, user?.id])

  useEffect(() => {
    setTabPrefs(getTabVisibility(user?.id || null))
    setVisuals(getVisualsPrefs(user?.id || null))
  }, [user?.id])

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
        setSubreddits(res.data.subreddits || [])
        setStockTickers(Array.isArray(res.data.stockTickers) ? res.data.stockTickers : [])
      })
      .catch(() => {
        setOsintXHandles([])
        setDefaultOsintXHandles([])
        setSubreddits([])
        setStockTickers([])
      })
      .finally(() => setConfigLoading(false))
  }, [apiBase])

  useEffect(() => fetchConfig(), [fetchConfig])

  const saveConfig = (updates) => {
    if (!apiBase) return
    setConfigSaving(true)
    axios
      .post(`${apiBase}/api/config`, updates, { timeout: 5000 })
      .then((res) => {
        setOsintXHandles(res.data.osintXHandles || [])
        setSubreddits(res.data.subreddits || [])
        if (res.data.stockTickers !== undefined) setStockTickers(res.data.stockTickers || [])
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

  const addSubreddit = () => {
    const sub = newSubreddit.trim().replace(/^r\//, '')
    if (!sub || subreddits.includes(sub)) return
    const next = [...subreddits, sub]
    setSubreddits(next)
    setNewSubreddit('')
    saveConfig({ subreddits: next })
  }

  const removeSubreddit = (index) => {
    const next = subreddits.filter((_, i) => i !== index)
    setSubreddits(next)
    saveConfig({ subreddits: next })
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
    { id: 'subreddits', label: 'Subreddits' },
    { id: 'stocktickers', label: 'Stock tickers' },
    { id: 'account', label: 'Account' },
  ]

  return (
    <div className="settings-view">
      <header className="settings-view-header">
        <h1 className="settings-view-title">Settings</h1>
        <p className="settings-view-desc">Visuals, API keys, and feed sources. X handles and subreddits are saved to the backend and used by the API.</p>
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
              <select
                value={visuals.theme || 'dark'}
                onChange={(e) => setVisuals((v) => ({ ...v, theme: e.target.value }))}
                className="settings-select"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
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
            <p className="settings-hint">OSINT (X) feed uses these accounts. Saved to backend; next ingest will include them.</p>
            {configLoading ? (
              <p className="settings-loading">Loading…</p>
            ) : (
              <>
                <p className="settings-hint">OSINT (X) feeds are fetched via Nitter RSS. If you only see a few creators, click below to restore all default feeds.</p>
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

        {activeSection === 'subreddits' && (
          <section className="settings-view-section">
            <h2>Subreddits</h2>
            <p className="settings-hint">Reddit comment signals use these subreddits. Saved to backend.</p>
            {configLoading ? (
              <p className="settings-loading">Loading…</p>
            ) : (
              <>
                <div className="settings-list-add">
                  <input
                    type="text"
                    value={newSubreddit}
                    onChange={(e) => setNewSubreddit(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSubreddit()}
                    placeholder="subreddit name (e.g. worldnews)"
                    className="settings-input"
                  />
                  <button type="button" className="settings-add-btn" onClick={addSubreddit} disabled={configSaving}>
                    Add
                  </button>
                </div>
                <ul className="settings-list">
                  {subreddits.map((sub, i) => (
                    <li key={sub} className="settings-list-item">
                      <span className="settings-list-label">r/{sub}</span>
                      <button type="button" className="settings-remove-btn" onClick={() => removeSubreddit(i)} aria-label="Remove">
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
            <p className="settings-hint">Symbols shown in the homepage Stocks widget (e.g. SPY, AAPL, GC=F). Finnhub symbols; save to backend.</p>
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

        {activeSection === 'account' && (
          <section className="settings-view-section">
            <h2>Account</h2>
            <p className="settings-hint">Danger zone: delete your account data from the database.</p>
            {!user ? (
              <p className="settings-loading">Sign in to manage account actions.</p>
            ) : (
              <button
                type="button"
                className="settings-delete-account-btn"
                disabled={deletingAccount}
                onClick={async () => {
                  const ok = window.confirm('Delete your account and all your saved data? This cannot be undone.')
                  if (!ok) return
                  setDeletingAccount(true)
                  try {
                    await deleteAccount()
                    window.location.reload()
                  } catch (err) {
                    window.alert(err?.message || 'Could not delete account')
                  } finally {
                    setDeletingAccount(false)
                  }
                }}
              >
                {deletingAccount ? 'Deleting…' : 'Delete account (wipe all user data)'}
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
