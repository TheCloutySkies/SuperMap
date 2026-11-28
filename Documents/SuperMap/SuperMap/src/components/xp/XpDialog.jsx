/** A centred XP dialog: scrim, title bar, body, and an OK/Cancel row. */
import { useEffect, useRef } from 'react'

export default function XpDialog({ title, children, onClose, actions, width = 440 }) {
  const boxRef = useRef(null)

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
      if (event.key !== 'Tab' || !boxRef.current) return
      const focusables = boxRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    boxRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="xp-scrim" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <div
        className="window xp-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={boxRef}
        tabIndex={-1}
        style={{ width: `min(${width}px, 92vw)` }}
      >
        <div className="title-bar">
          <div className="title-bar-text">{title}</div>
          <div className="title-bar-controls">
            <button type="button" aria-label="Close" title="Close" onClick={onClose} />
          </div>
        </div>
        <div className="window-body">{children}</div>
        {actions ? <div className="xp-dialog-actions field-row">{actions}</div> : null}
      </div>
    </div>
  )
}
