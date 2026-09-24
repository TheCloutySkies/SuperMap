import './MobileChipBar.css'

/** Horizontal scroll chip picker for map/feed/tool sub-views. */
export default function MobileChipBar({ items = [], ariaLabel = 'Sub views' }) {
  if (!items.length) return null
  return (
    <div className="mobile-chip-bar" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={!!item.active}
          className={`mobile-chip ${item.active ? 'is-active' : ''}`}
          onClick={item.onClick}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
