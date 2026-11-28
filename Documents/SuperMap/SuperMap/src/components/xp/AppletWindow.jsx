/**
 * A floating preview window: one homepage panel, most recent data only, with a
 * door to its full page. Never touches the URL; the frame is remembered.
 */
import { useRef } from 'react'
import XpIcon from './XpIcon'
import { closeWindow, focusWindow, moveFrame } from '../../lib/xpWindows'
import { panelById } from '../operations/panels/panelRegistry'

export default function AppletWindow({ win, active, onOpenPage }) {
  const panel = panelById(win.id)
  const dragRef = useRef(null)
  if (!panel) return null
  const Preview = panel.component

  const startDrag = (event) => {
    if (event.button !== 0) return
    if (event.target.closest('.title-bar-controls')) return
    focusWindow(win.id)
    dragRef.current = {
      mode: 'move',
      dx: event.clientX - win.frame.x,
      dy: event.clientY - win.frame.y,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const startResize = (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    focusWindow(win.id)
    dragRef.current = {
      mode: 'resize',
      fromX: event.clientX,
      fromY: event.clientY,
      w: win.frame.w,
      h: win.frame.h,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.mode === 'move') {
      moveFrame(win.id, { ...win.frame, x: event.clientX - drag.dx, y: event.clientY - drag.dy })
      return
    }
    moveFrame(win.id, {
      ...win.frame,
      w: drag.w + (event.clientX - drag.fromX),
      h: drag.h + (event.clientY - drag.fromY),
    })
  }

  const endDrag = () => {
    dragRef.current = null
  }

  return (
    <section
      className={`window xp-frame xp-applet${active ? ' is-active' : ''}`}
      style={{
        left: `${win.frame.x}px`,
        top: `${win.frame.y}px`,
        width: `${win.frame.w}px`,
        height: `${win.frame.h}px`,
        zIndex: 20 + (win.z || 0),
      }}
      role="region"
      aria-label={`${panel.title} preview`}
      onPointerDown={() => focusWindow(win.id)}
    >
      <div
        className="title-bar xp-applet-bar"
        onPointerDown={startDrag}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => onOpenPage?.(panel)}
      >
        <div className="title-bar-text">
          <XpIcon name={panel.icon} size={16} />
          {panel.title}
        </div>
        <div className="title-bar-controls">
          <button
            type="button"
            aria-label="Maximize"
            title={`Open ${panel.pageLabel}`}
            onClick={() => onOpenPage?.(panel)}
          />
          <button
            type="button"
            aria-label="Close"
            title="Close preview"
            onClick={() => closeWindow(win.id)}
          />
        </div>
      </div>
      <div className="window-body xp-applet-body">
        <Preview />
      </div>
      <footer className="xp-applet-foot">
        <span>Most recent only</span>
        <button type="button" className="xp-applet-open" onClick={() => onOpenPage?.(panel)}>
          Open {panel.pageLabel} →
        </button>
      </footer>
      <span
        className="xp-applet-resize"
        role="separator"
        aria-label="Resize preview"
        onPointerDown={startResize}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </section>
  )
}
