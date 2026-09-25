import './RadialMenu.css'
import { CRIME_VIEW_ID, BRAND_LOGO_SRC, BRAND_LOGO_ALT } from '../constants'

export const RADIAL_ORBIT_ITEMS = [
  { id: 'MAPS', label: 'Maps', icon: '◎' },
  { id: 'CRIME', label: 'Crime', icon: '📉', viewId: CRIME_VIEW_ID },
  { id: 'FEEDS', label: 'Feeds', icon: '☰' },
  { id: 'TOOLS', label: 'Tools', icon: '⚒' },
  { id: 'RESOURCES', label: 'Resources', icon: '▣' },
  { id: 'REPORTS', label: 'Reports', icon: '✎' },
  { id: 'SETTINGS', label: 'Settings', icon: '⚙' },
]

/**
 * Circular menu: center Clouty Skies / Good Palantir (Home), orbit items equally spaced.
 * onSelectMode(item) — item may include viewId for direct views (e.g. Crime).
 */
export default function RadialMenu({ onSelectHome, onSelectMode, activeMode, activeView }) {
  const n = RADIAL_ORBIT_ITEMS.length

  return (
    <nav className="radial-menu" aria-label="Good Palantir modes">
      <div className="radial-menu-ring" aria-hidden />
      <button
        type="button"
        className="radial-menu-center"
        onClick={onSelectHome}
        aria-label="Good Palantir Home"
      >
        <img
          className="radial-menu-center-logo"
          src={BRAND_LOGO_SRC}
          alt={BRAND_LOGO_ALT}
          width={56}
          height={56}
        />
        <span className="radial-menu-center-sub">Home</span>
      </button>
      {RADIAL_ORBIT_ITEMS.map((item, i) => {
        const angle = (360 / n) * i - 90
        const active = item.viewId
          ? activeView === item.viewId
          : activeMode === item.id
        return (
          <button
            key={item.id}
            type="button"
            className={`radial-menu-item ${active ? 'is-active' : ''}`}
            style={{
              '--radial-angle': `${angle}deg`,
              '--radial-delay': `${0.05 + i * 0.045}s`,
            }}
            onClick={() => onSelectMode?.(item)}
            aria-current={active ? 'page' : undefined}
          >
            <span className="radial-menu-item-icon" aria-hidden>{item.icon}</span>
            <span className="radial-menu-item-label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
