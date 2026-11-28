/**
 * The menu bar under a window's title bar: File, the mode's own sub-views, and
 * Help. It replaces the dark side strip that used to carry the sub-views.
 */
import { useEffect, useRef, useState } from 'react'

export default function XpMenuBar({
  viewLabel = 'View',
  viewItems = [],
  onClose,
  onRefresh,
  onAbout,
}) {
  const [open, setOpen] = useState(null)
  const barRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!barRef.current?.contains(event.target)) setOpen(null)
    }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(null) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const menus = [
    {
      id: 'file',
      label: 'File',
      items: [{ label: 'Close', onSelect: onClose }],
    },
    {
      id: 'view',
      label: viewLabel,
      items: [
        ...viewItems,
        ...(viewItems.length ? [{ separator: true }] : []),
        { label: 'Refresh data', onSelect: onRefresh },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [{ label: 'About Good Palantir', onSelect: onAbout }],
    },
  ]

  return (
    <div className="xp-menubar" ref={barRef} role="menubar">
      {menus.map((menu) => (
        <div className="xp-menu" key={menu.id}>
          <button
            type="button"
            role="menuitem"
            className={open === menu.id ? 'is-open' : ''}
            aria-expanded={open === menu.id}
            onClick={() => setOpen(open === menu.id ? null : menu.id)}
          >
            {menu.label}
          </button>
          {open === menu.id ? (
            <div className="xp-menu-pop" role="menu">
              {menu.items.map((item) => (item.separator ? (
                <div className="xp-menu-sep" key={`sep-${item.label || Math.random()}`} role="separator" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={item.active ? 'is-active' : ''}
                  onClick={() => {
                    setOpen(null)
                    item.onSelect?.()
                  }}
                >
                  <span className="xp-menu-check" aria-hidden="true">{item.active ? '✓' : ''}</span>
                  {item.label}
                </button>
              )))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
