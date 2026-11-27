import { ACCENTS, CONSOLE_WINDOWS } from '../../lib/consolePrefs'
import { DOMAINS, DOMAIN_ORDER, REGION_OPTIONS, SORTS } from '../../lib/consoleSignals'

/**
 * Desk-local controls. These are filters, not navigation: the app's ModeRail
 * still owns where you are.
 */
export default function ConsoleRail({
  prefs,
  onPatch,
  views,
  onSaveView,
  onLoadView,
  onDeleteView,
  onExport,
  onReset,
  open,
  onClose,
}) {
  const toggleDomain = (id) => {
    const has = prefs.domains.includes(id)
    const next = has ? prefs.domains.filter((domain) => domain !== id) : [...prefs.domains, id]
    if (next.length === 0) return
    onPatch({ domains: DOMAIN_ORDER.filter((domain) => next.includes(domain)) })
  }

  return (
    <aside className={`console-rail ${open ? 'is-open' : ''}`} aria-label="Console filters">
      <div className="console-rail-head">
        <h2>Focus</h2>
        <button type="button" className="console-rail-close" onClick={onClose} aria-label="Close filters">✕</button>
      </div>

      <div className="console-field">
        <label htmlFor="console-region">Theater / region</label>
        <select
          id="console-region"
          className="console-select"
          value={prefs.region}
          onChange={(event) => onPatch({ region: event.target.value })}
        >
          {REGION_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="console-field">
        <label htmlFor="console-window">Time window</label>
        <select
          id="console-window"
          className="console-select"
          value={prefs.windowHours}
          onChange={(event) => onPatch({ windowHours: Number(event.target.value) })}
        >
          {CONSOLE_WINDOWS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="console-field">
        <span className="console-field-label">Signal domains</span>
        <div className="console-chips">
          {DOMAIN_ORDER.map((id) => {
            const domain = DOMAINS[id]
            const on = prefs.domains.includes(id)
            return (
              <button
                key={id}
                type="button"
                className={`console-chip ${on ? 'is-on' : ''}`}
                onClick={() => toggleDomain(id)}
                aria-pressed={on}
              >
                <span className="console-chip-dot" style={{ background: domain.hex }} aria-hidden />
                {domain.short}
              </button>
            )
          })}
        </div>
      </div>

      <h2>Filters</h2>

      <div className="console-field">
        <label htmlFor="console-confidence">
          Min confidence · <span className="console-field-value">{prefs.minConfidence}%</span>
        </label>
        <input
          id="console-confidence"
          className="console-range"
          type="range"
          min="0"
          max="90"
          step="5"
          value={prefs.minConfidence}
          onChange={(event) => onPatch({ minConfidence: Number(event.target.value) })}
        />
      </div>

      <div className="console-field">
        <label htmlFor="console-sort">Rank by</label>
        <select
          id="console-sort"
          className="console-select"
          value={prefs.sort}
          onChange={(event) => onPatch({ sort: event.target.value })}
        >
          {SORTS.map((sort) => (
            <option key={sort.id} value={sort.id}>{sort.label}</option>
          ))}
        </select>
      </div>

      <div className="console-field">
        <span className="console-field-label">Display density</span>
        <div className="console-seg" role="group" aria-label="Display density">
          <button
            type="button"
            className={prefs.density === 'comfort' ? 'is-on' : ''}
            onClick={() => onPatch({ density: 'comfort' })}
          >
            Comfortable
          </button>
          <button
            type="button"
            className={prefs.density === 'compact' ? 'is-on' : ''}
            onClick={() => onPatch({ density: 'compact' })}
          >
            Compact
          </button>
        </div>
      </div>

      <div className="console-field">
        <label htmlFor="console-accent">Signal accent</label>
        <select
          id="console-accent"
          className="console-select"
          value={prefs.accent}
          onChange={(event) => onPatch({ accent: event.target.value })}
        >
          {ACCENTS.map((accent) => (
            <option key={accent.id} value={accent.id}>{accent.label}</option>
          ))}
        </select>
      </div>

      <h2>Alerts</h2>

      <div className="console-switch-row">
        <span>Tell me when things line up</span>
        <button
          type="button"
          className={`console-toggle ${prefs.alerts ? 'is-on' : ''}`}
          role="switch"
          aria-checked={prefs.alerts}
          aria-label="Tell me when things line up"
          onClick={() => onPatch({ alerts: !prefs.alerts })}
        />
      </div>

      <div className="console-field">
        <label htmlFor="console-alert-threshold">
          Alert threshold · <span className="console-field-value">{prefs.alertThreshold}</span>
        </label>
        <input
          id="console-alert-threshold"
          className="console-range"
          type="range"
          min="40"
          max="95"
          step="5"
          value={prefs.alertThreshold}
          onChange={(event) => onPatch({ alertThreshold: Number(event.target.value) })}
        />
      </div>

      <div className="console-switch-row">
        <span>Chime on alert</span>
        <button
          type="button"
          className={`console-toggle ${prefs.sound ? 'is-on' : ''}`}
          role="switch"
          aria-checked={prefs.sound}
          aria-label="Chime on alert"
          onClick={() => onPatch({ sound: !prefs.sound })}
        />
      </div>

      <h2>Saved views</h2>
      <div className="console-views">
        {views.length === 0 ? (
          <p className="console-note">Save a filter combination to recall it instantly.</p>
        ) : views.map((view) => (
          <div className="console-view" key={view.name}>
            <button type="button" className="console-view-name" onClick={() => onLoadView(view)}>
              {view.name}
            </button>
            <button type="button" className="console-view-del" onClick={() => onDeleteView(view.name)} aria-label={`Delete ${view.name}`}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="console-btn" onClick={onSaveView}>＋ Save current view</button>

      <h2>Console</h2>
      <div className="console-btn-row">
        <button type="button" className="console-btn" onClick={onExport}>⭳ Export brief</button>
        <button type="button" className="console-btn is-danger" onClick={onReset}>↺ Reset</button>
      </div>
    </aside>
  )
}
