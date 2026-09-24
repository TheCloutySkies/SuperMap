import './RadialMenu.css'

export const RADIAL_ORBIT_ITEMS = [
  { id: 'MAPS', label: 'Maps', icon: '◎' },
  { id: 'CRIME', label: 'Crime', icon: '▦' },
  { id: 'FEEDS', label: 'Feeds', icon: '☰' },
  { id: 'TOOLS', label: 'Tools', icon: '⚒' },
  { id: 'RESOURCES', label: 'Resources', icon: '▣' },
  { id: 'REPORTS', label: 'Reports', icon: '✎' },
  { id: 'SETTINGS', label: 'Settings', icon: '⚙' },
]

/**
 * Circular menu: center SuperMap (Home), orbit items equally spaced.
 */
export default function RadialMenu({ onSelectHome, onSelectMode, activeMode }) {
  const n = RADIAL_ORBIT_ITEMS.length

  return (
    <nav className="radial-menu" aria-label="SuperMap modes">
      <div className="radial-menu-ring" aria-hidden />
      <button
        type="button"
        className="radial-menu-center"
        onClick={onSelectHome}
        aria-label="SuperMap Home"
      >
        <span className="radial-menu-center-title">SuperMap</span>
        <span className="radial-menu-center-sub">Home</span>
      </button>
      {RADIAL_ORBIT_ITEMS.map((item, i) => {
        const angle = (360 / n) * i - 90
        const active = activeMode === item.id
        return (
          <button
            key={item.id}
            type="button"
            className={`radial-menu-item ${active ? 'is-active' : ''}`}
            style={{
              '--radial-angle': `${angle}deg`,
              '--radial-delay': `${0.05 + i * 0.045}s`,
            }}
            onClick={() => onSelectMode?.(item.id)}
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
