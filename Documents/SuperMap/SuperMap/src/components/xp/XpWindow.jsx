/**
 * One XP window frame. v1 is a single maximised window per route, so this is
 * the shell around the active view: title bar with the three real controls,
 * then the view, which keeps its own scroll.
 */
import { useEffect, useRef } from 'react'
import { minimizeWindow, closeWindow } from '../../lib/xpWindows'

export default function XpWindow({ title, icon, onHome, children, maximized = true, onToggleMaximized }) {
  const windowRef = useRef(null)

  useEffect(() => {
    const node = windowRef.current
    if (!node) return
    node.focus({ preventScroll: true })
  }, [])

  return (
    <div
      className={`xp-frame window${maximized ? ' is-max' : ' is-restored'}`}
      ref={windowRef}
      tabIndex={-1}
      role="region"
      aria-label={title}
    >
      <div className="title-bar">
        <div className="title-bar-text">
          {icon ? <span className="xp-title-icon" aria-hidden>{icon}</span> : null}
          {title}
        </div>
        <div className="title-bar-controls">
          {/* XP.css draws the glyph from these exact aria-labels — never change them. */}
          <button type="button" aria-label="Minimize" title="Minimize" onClick={() => { minimizeWindow(); onHome?.() }} />
          <button
            type="button"
            aria-label={maximized ? 'Restore' : 'Maximize'}
            title={maximized ? 'Restore' : 'Maximize'}
            onClick={() => onToggleMaximized?.()}
          />
          <button type="button" aria-label="Close" title="Close" onClick={() => { closeWindow(); onHome?.() }} />
        </div>
      </div>
      <div className="xp-window-body">{children}</div>
    </div>
  )
}
