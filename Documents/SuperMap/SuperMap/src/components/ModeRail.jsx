import './ModeRail.css'

const MODES = [
  { id: 'HOME', label: 'Home', icon: '⌂' },
  { id: 'MAPS', label: 'Maps', icon: '◎' },
  { id: 'FEEDS', label: 'Feeds', icon: '☰' },
  { id: 'TOOLS', label: 'Tools', icon: '⚒' },
  { id: 'RESOURCES', label: 'Resources', icon: '▣' },
  { id: 'REPORTS', label: 'Reports', icon: '✎' },
  { id: 'SETTINGS', label: 'Settings', icon: '⚙' },
]

const FLYOUT_MODES = new Set(['MAPS', 'FEEDS', 'TOOLS', 'RESOURCES'])

/**
 * Left icon rail + optional flyout panel for map/feed/tool/resource selectors.
 * Flyout overlays the map (does not push layout).
 *
 * flyout: { title, items: [{ id, label, active?, onClick }], open, onClose }
 */
export default function ModeRail({ appMode, onModeSelect, flyout = null }) {
  const flyoutOpen = !!(flyout?.open && Array.isArray(flyout.items) && flyout.items.length > 0)

  const handleModeClick = (modeId) => {
    // Re-clicking the active flyout mode collapses the panel instead of navigating again.
    if (flyoutOpen && modeId === appMode && FLYOUT_MODES.has(modeId)) {
      flyout.onClose?.()
      return
    }
    onModeSelect?.(modeId)
  }

  return (
    <div className={`mode-rail-shell ${flyoutOpen ? 'mode-rail-shell--flyout-open' : ''}`}>
      <nav className="mode-rail" aria-label="Primary modes">
        <div className="mode-rail-brand" title="SuperMap">
          <span className="mode-rail-brand-mark">SM</span>
        </div>
        <div className="mode-rail-list">
          {MODES.map((m) => {
            const active = appMode === m.id
            const hasFlyout = FLYOUT_MODES.has(m.id)
            return (
              <button
                key={m.id}
                type="button"
                className={`mode-rail-btn ${active ? 'active' : ''} ${active && flyoutOpen && hasFlyout ? 'mode-rail-btn--flyout' : ''}`}
                onClick={() => handleModeClick(m.id)}
                aria-current={active ? 'page' : undefined}
                aria-expanded={hasFlyout && active ? flyoutOpen : undefined}
                title={m.label}
              >
                <span className="mode-rail-icon" aria-hidden>{m.icon}</span>
                <span className="mode-rail-label">{m.label}</span>
                {active && <span className="mode-rail-indicator" aria-hidden />}
              </button>
            )
          })}
        </div>
      </nav>

      {flyoutOpen && (
        <aside className="mode-rail-flyout" aria-label={`${flyout.title || 'Section'} navigation`}>
          <div className="mode-rail-flyout-head">
            <h2 className="mode-rail-flyout-title">{flyout.title}</h2>
            {flyout.onClose && (
              <button
                type="button"
                className="mode-rail-flyout-close"
                onClick={flyout.onClose}
                aria-label="Collapse menu"
                title="Collapse"
              >
                ‹
              </button>
            )}
          </div>
          <nav className="mode-rail-flyout-list">
            {flyout.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`mode-rail-flyout-item ${item.active ? 'active' : ''}`}
                onClick={item.onClick}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>
      )}
    </div>
  )
}

export { MODES as MODE_RAIL_ITEMS }
