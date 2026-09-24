import './ModeRail.css'

const MODES = [
  { id: 'HOME', label: 'Home', icon: '⌂' },
  { id: 'MAPS', label: 'Maps', icon: '◎' },
  { id: 'CRIME', label: 'Crime', icon: '📉' },
  { id: 'FEEDS', label: 'Feeds', icon: '☰' },
  { id: 'TOOLS', label: 'Tools', icon: '⚒' },
  { id: 'RESOURCES', label: 'Resources', icon: '▣' },
  { id: 'REPORTS', label: 'Reports', icon: '✎' },
  { id: 'SETTINGS', label: 'Settings', icon: '⚙' },
]

export default function ModeRail({ appMode, onModeSelect }) {
  return (
    <nav className="mode-rail" aria-label="Primary modes">
      <div className="mode-rail-brand" title="SuperMap">
        <span className="mode-rail-brand-mark">SM</span>
      </div>
      <div className="mode-rail-list">
        {MODES.map((m) => {
          const active = appMode === m.id
          return (
            <button
              key={m.id}
              type="button"
              className={`mode-rail-btn ${active ? 'active' : ''}`}
              onClick={() => onModeSelect(m.id)}
              aria-current={active ? 'page' : undefined}
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
  )
}

export { MODES as MODE_RAIL_ITEMS }
