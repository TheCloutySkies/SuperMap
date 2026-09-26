import './ModeRail.css'
import { BRAND_LOGO_SRC, BRAND_LOGO_ALT, PRODUCT_NAME } from '../constants'

/** Mode ids. CRIME opens CrimeIntelligenceView via App handleFooterNav → CRIME_VIEW_ID (`crime`). */
const MODES = [
  { id: 'HOME', label: 'Home', icon: '⌂' },
  { id: 'MAPS', label: 'Maps', icon: '◎' },
  { id: 'CRIME', label: 'Crime', icon: '📉' },
  { id: 'FEEDS', label: 'Glowie', icon: '☰' },
  { id: 'TOOLS', label: 'Tools', icon: '⚒' },
  { id: 'RESOURCES', label: 'Resources', icon: '▣' },
  { id: 'REPORTS', label: 'Reports', icon: '✎' },
  { id: 'SETTINGS', label: 'Settings', icon: '⚙' },
]

export default function ModeRail({ appMode, onModeSelect }) {
  return (
    <nav className="mode-rail" aria-label="Primary modes">
      <div className="mode-rail-brand" title={PRODUCT_NAME}>
        <img
          className="mode-rail-brand-logo"
          src={BRAND_LOGO_SRC}
          alt={BRAND_LOGO_ALT}
          width={28}
          height={28}
        />
        <span className="mode-rail-brand-text">{PRODUCT_NAME}</span>
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
