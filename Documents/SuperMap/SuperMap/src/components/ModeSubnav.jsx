import './ModeSubnav.css'

/**
 * Expanding subnav for the active app mode.
 * items: [{ id, label, active?, onClick }]
 */
export default function ModeSubnav({
  open,
  title,
  items = [],
  onClose,
}) {
  const hasItems = Array.isArray(items) && items.length > 0
  if (!open || !hasItems) return null

  return (
    <aside className={`mode-subnav ${open ? 'mode-subnav--open' : ''}`} aria-label={`${title} navigation`}>
      <div className="mode-subnav-head">
        <h2 className="mode-subnav-title">{title}</h2>
        {onClose && (
          <button type="button" className="mode-subnav-close" onClick={onClose} aria-label="Collapse subnav" title="Collapse">
            ‹
          </button>
        )}
      </div>
      <nav className="mode-subnav-list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`mode-subnav-item ${item.active ? 'active' : ''}`}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
