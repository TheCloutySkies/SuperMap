import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  getTabVisibility,
  setTabVisibility,
  DEFAULT_TAB_VISIBILITY,
  getVisualsPrefs,
  setVisualsPrefs,
} from '../constants'
import XpListview from './xp/XpListview'

const TAB_LABELS = {
  osintMap: 'OSINT Map',
  conflictMap: 'Conflict Map',
  exploreMap: 'Explore',
  flockMap: 'Flock Cameras',
  liveWebcams: 'Live Webcams',
  printMap: 'Print Map',
  osintFeeds: 'OSINT Feeds',
  newsFeeds: 'GPN — Good Palantir News',
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

const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export default function SettingsView({ apiBase, onVisualsChange }) {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('visuals')

  // The sheet edits a draft; nothing is written until Apply or OK.
  const [savedVisuals, setSavedVisuals] = useState(() => getVisualsPrefs())
  const [visuals, setVisuals] = useState(() => getVisualsPrefs())
  const [savedTabPrefs, setSavedTabPrefs] = useState(() => getTabVisibility())
  const [tabPrefs, setTabPrefs] = useState(() => getTabVisibility())

  const [savedHandles, setSavedHandles] = useState([])
  const [osintXHandles, setOsintXHandles] = useState([])
  const [defaultOsintXHandles, setDefaultOsintXHandles] = useState([])
  const [savedTickers, setSavedTickers] = useState([])
  const [stockTickers, setStockTickers] = useState([])

  const [configLoading, setConfigLoading] = useState(true)
  const [configSaving, setConfigSaving] = useState(false)
  const [configWriteError, setConfigWriteError] = useState('')
  const [newHandle, setNewHandle] = useState('')
  const [newTickerSymbol, setNewTickerSymbol] = useState('')
  const [newTickerName, setNewTickerName] = useState('')

  const fetchConfig = useCallback(() => {
    if (!apiBase) {
      setConfigLoading(false)
      return
    }
    setConfigLoading(true)
    axios
      .get(`${apiBase}/api/config`, { timeout: 5000 })
      .then((res) => {
        const handles = res.data.osintXHandles || []
        const tickers = Array.isArray(res.data.stockTickers) ? res.data.stockTickers : []
        setOsintXHandles(handles)
        setSavedHandles(handles)
        setDefaultOsintXHandles(res.data.defaultOsintXHandles || [])
        setStockTickers(tickers)
        setSavedTickers(tickers)
      })
      .catch(() => {
        setOsintXHandles([])
        setSavedHandles([])
        setDefaultOsintXHandles([])
        setStockTickers([])
        setSavedTickers([])
      })
      .finally(() => setConfigLoading(false))
  }, [apiBase])

  useEffect(() => fetchConfig(), [fetchConfig])

  const saveConfig = (updates) => {
    if (!apiBase) {
      setConfigWriteError('The API is not reachable, so this could not be saved.')
      return
    }
    setConfigSaving(true)
    setConfigWriteError('')
    const headers = {}
    const token = readConfigWriteToken().trim()
    if (token) headers['X-Config-Token'] = token
    axios
      .post(`${apiBase}/api/config`, updates, { timeout: 5000, headers })
      .then((res) => {
        const handles = res.data.osintXHandles || []
        setOsintXHandles(handles)
        setSavedHandles(handles)
        if (res.data.stockTickers !== undefined) {
          const tickers = res.data.stockTickers || []
          setStockTickers(tickers)
          setSavedTickers(tickers)
        }
      })
      .catch(() => {
        setConfigWriteError('Could not save.')
      })
      .finally(() => setConfigSaving(false))
  }

  const dirty = useMemo(() => (
    !sameList(savedVisuals, visuals) ||
    !sameList(savedTabPrefs, tabPrefs) ||
    !sameList(savedHandles, osintXHandles) ||
    !sameList(savedTickers, stockTickers)
  ), [savedVisuals, visuals, savedTabPrefs, tabPrefs, savedHandles, osintXHandles, savedTickers, stockTickers])

  const apply = () => {
    setVisualsPrefs(visuals)
    setTabVisibility(tabPrefs)
    onVisualsChange?.()
    setSavedVisuals(visuals)
    setSavedTabPrefs(tabPrefs)

    const updates = {}
    if (!sameList(savedHandles, osintXHandles)) updates.osintXHandles = osintXHandles
    if (!sameList(savedTickers, stockTickers)) updates.stockTickers = stockTickers
    if (Object.keys(updates).length > 0) saveConfig(updates)
  }

  const revert = () => {
    setVisuals(savedVisuals)
    setTabPrefs(savedTabPrefs)
    setOsintXHandles(savedHandles)
    setStockTickers(savedTickers)
    setConfigWriteError('')
  }

  const addHandle = () => {
    const handle = newHandle.trim().replace(/^@/, '')
    if (!handle) return
    setOsintXHandles((list) => [...list, { name: handle, handle, priority: 'medium' }])
    setNewHandle('')
  }

  const removeHandle = (index) => {
    setOsintXHandles((list) => list.filter((_, i) => i !== index))
  }

  const restoreDefaultOsintX = () => {
    if (defaultOsintXHandles.length === 0) return
    setOsintXHandles(defaultOsintXHandles)
  }

  const addStockTicker = () => {
    const symbol = newTickerSymbol.trim()
    if (!symbol) return
    const name = newTickerName.trim() || symbol
    setStockTickers((list) => [...list, { symbol, name }])
    setNewTickerSymbol('')
    setNewTickerName('')
  }

  const removeStockTicker = (index) => {
    setStockTickers((list) => list.filter((_, i) => i !== index))
  }

  const sections = [
    { id: 'visuals', label: 'Visuals' },
    { id: 'tabs', label: 'Tab visibility' },
    { id: 'xhandles', label: 'X (Twitter) handles' },
    { id: 'stocktickers', label: 'Stock tickers' },
    { id: 'firebase', label: 'Firebase' },
  ]

  const handleColumns = [
    { key: 'handle', label: 'Handle' },
    { key: 'name', label: 'Name', render: (row) => (row.name && row.name !== row.handle ? row.name : '') },
    {
      key: 'remove',
      label: '',
      width: '76px',
      render: (row) => (
        <button type="button" onClick={() => removeHandle(row.index)} aria-label={`Remove @${row.handle}`}>
          Remove
        </button>
      ),
    },
  ]

  const tickerColumns = [
    { key: 'symbol', label: 'Symbol' },
    { key: 'name', label: 'Label', render: (row) => (row.name && row.name !== row.symbol ? row.name : '') },
    {
      key: 'remove',
      label: '',
      width: '76px',
      render: (row) => (
        <button type="button" onClick={() => removeStockTicker(row.index)} aria-label={`Remove ${row.symbol}`}>
          Remove
        </button>
      ),
    },
  ]

  return (
    <div className="xp-page">
      <div className="xp-page-tools">
        <menu role="tablist" className="xp-tabs" aria-label="Settings sections">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={activeSection === s.id}
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </menu>
        <p>{dirty ? 'Changes not applied yet' : 'All changes applied'}</p>
      </div>

      <div className="xp-page-body">
        {activeSection === 'visuals' && (
          <fieldset>
            <legend>Visuals</legend>
            <p className="xp-note">Night ops (charcoal + emerald) always runs inside the windows.</p>
            <div className="field-row">
              <input
                id="settings-compact"
                type="checkbox"
                checked={!!visuals.compact}
                onChange={(e) => setVisuals((v) => ({ ...v, compact: e.target.checked }))}
              />
              <label htmlFor="settings-compact">Compact density</label>
            </div>
            <div className="field-row">
              <label htmlFor="settings-font-size">Font size</label>
              <select
                id="settings-font-size"
                value={visuals.fontSize || 'normal'}
                onChange={(e) => setVisuals((v) => ({ ...v, fontSize: e.target.value }))}
              >
                <option value="small">Small</option>
                <option value="normal">Normal</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div className="field-row">
              <label htmlFor="settings-layout">Layout mode</label>
              <select
                id="settings-layout"
                value={visuals.layoutMode || 'auto'}
                onChange={(e) => setVisuals((v) => ({ ...v, layoutMode: e.target.value }))}
              >
                <option value="auto">Auto (detect device)</option>
                <option value="desktop">Force desktop layout</option>
                <option value="mobile">Force mobile layout</option>
              </select>
            </div>
            <div className="field-row">
              <button type="button" onClick={() => window.location.reload()}>
                Apply layout and reload
              </button>
              <a href="https://github.com/TheCloutySkies/SuperMap.git" target="_blank" rel="noopener noreferrer">
                Open GitHub repository
              </a>
            </div>
          </fieldset>
        )}

        {activeSection === 'tabs' && (
          <fieldset>
            <legend>Tab visibility</legend>
            <p className="xp-note">Show or hide tabs in the Start menu and the sub-navigation.</p>
            <div className="xp-check-grid">
              {Object.entries(TAB_LABELS).map(([key, label]) => (
                <div className="field-row" key={key}>
                  <input
                    id={`settings-tab-${key}`}
                    type="checkbox"
                    checked={tabPrefs[key] !== false}
                    onChange={() => setTabPrefs((p) => ({ ...p, [key]: !p[key] }))}
                  />
                  <label htmlFor={`settings-tab-${key}`}>{label}</label>
                </div>
              ))}
            </div>
            <div className="xp-page-actions">
              <button type="button" onClick={() => setTabPrefs({ ...DEFAULT_TAB_VISIBILITY })}>
                Reset to default
              </button>
            </div>
          </fieldset>
        )}

        {activeSection === 'xhandles' && (
          <fieldset>
            <legend>X (Twitter) handles</legend>
            {configWriteError && <p className="xp-note">{configWriteError}</p>}
            <div className="field-row">
              <input
                type="text"
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addHandle()}
                placeholder="@handle"
                aria-label="Handle to add"
              />
              <button type="button" onClick={addHandle} disabled={configSaving}>
                Add
              </button>
              {defaultOsintXHandles.length > 0 && (
                <button
                  type="button"
                  onClick={restoreDefaultOsintX}
                  disabled={configSaving || osintXHandles.length >= defaultOsintXHandles.length}
                >
                  Restore all {defaultOsintXHandles.length} defaults
                </button>
              )}
            </div>
            {configLoading ? (
              <p className="xp-note">Loading…</p>
            ) : (
              <XpListview
                label="X handles"
                columns={handleColumns}
                rows={osintXHandles.map((entry, index) => ({ ...entry, id: `${entry.handle}-${index}`, index }))}
                rowKey={(row) => row.id}
                emptyLabel="No handles yet."
              />
            )}
          </fieldset>
        )}

        {activeSection === 'stocktickers' && (
          <fieldset>
            <legend>Stock tickers</legend>
            <div className="field-row">
              <input
                type="text"
                value={newTickerSymbol}
                onChange={(e) => setNewTickerSymbol(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addStockTicker()}
                placeholder="Symbol (SPY, AAPL)"
                aria-label="Ticker symbol"
              />
              <input
                type="text"
                value={newTickerName}
                onChange={(e) => setNewTickerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addStockTicker()}
                placeholder="Label (optional)"
                aria-label="Ticker label"
              />
              <button type="button" onClick={addStockTicker} disabled={configSaving}>
                Add
              </button>
            </div>
            {configLoading ? (
              <p className="xp-note">Loading…</p>
            ) : (
              <XpListview
                label="Stock tickers"
                columns={tickerColumns}
                rows={stockTickers.map((t, index) => ({ ...t, id: `${t.symbol}-${index}`, index }))}
                rowKey={(row) => row.id}
                emptyLabel="No tickers yet."
              />
            )}
          </fieldset>
        )}

        {activeSection === 'firebase' && (
          <fieldset>
            <legend>Firebase</legend>
            <p>
              Accounts, chats and disappearing photos run on Firebase. The guide lists every console
              step in order: the three sign-in methods, enabling Storage, deploying the rules and
              indexes, the six values for Vercel, and the service-account key for GitHub Actions.
            </p>
            <div className="field-row">
              <a href="/firebase-setup.md" target="_blank" rel="noopener noreferrer">
                Open the step-by-step Firebase setup
              </a>
            </div>
            <p className="xp-note">
              Storage is the step that turns on photos and secure drops; until it is enabled the Photo
              button in a chat stays disabled.
            </p>
          </fieldset>
        )}
      </div>

      <div className="xp-page-actions">
        <button type="button" onClick={apply} disabled={!dirty || configSaving}>
          Apply
        </button>
        <button type="button" onClick={revert} disabled={!dirty}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            apply()
            navigate('/')
          }}
          disabled={configSaving}
        >
          OK
        </button>
      </div>
    </div>
  )
}
