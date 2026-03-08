import { useRef } from 'react'
import Draggable from 'react-draggable'
import './DrawHUD.css'

const ICON_OPTIONS = ['📍', '⭐', '⚠️', '🔥', '🚨', '🛰️', '🛡️', '📡']

export default function DrawHUD({
  drawRef,
  visible,
  onAddPoint,
  onClearPoints,
  pointIcon = '📍',
  onPointIconChange,
}) {
  const nodeRef = useRef(null)
  if (!visible) return null

  const trigger = (action) => {
    if (!drawRef?.current) return
    const draw = drawRef.current
    if (action === 'polygon') draw.changeMode('draw_polygon')
    else if (action === 'line') draw.changeMode('draw_line_string')
    else if (action === 'trash') {
      draw.changeMode('simple_select')
      draw.trash()
    }
  }

  return (
    <Draggable nodeRef={nodeRef} bounds="parent" defaultPosition={{ x: 20, y: 120 }}>
      <div ref={nodeRef} className="draw-hud">
        <div className="draw-hud-title">Drawing &amp; Targeting</div>
        <div className="draw-hud-buttons">
          <button type="button" onClick={() => trigger('polygon')}>
            Polygon
          </button>
          <button type="button" onClick={() => trigger('line')}>
            Line
          </button>
          <button type="button" onClick={() => trigger('trash')}>
            Trash
          </button>
        </div>
        <div className="draw-hud-points">
          <label htmlFor="draw-hud-icon">Point icon</label>
          <select
            id="draw-hud-icon"
            value={pointIcon}
            onChange={(e) => onPointIconChange?.(e.target.value)}
          >
            {ICON_OPTIONS.map((icon) => (
              <option key={icon} value={icon}>{icon}</option>
            ))}
          </select>
          <div className="draw-hud-buttons">
            <button type="button" onClick={() => onAddPoint?.()}>
              Save Center
            </button>
            <button type="button" onClick={() => onClearPoints?.()}>
              Clear Points
            </button>
          </div>
        </div>
        <p className="draw-hud-hint">
          Drawings auto-save. Use Save Center to bookmark map points.
        </p>
      </div>
    </Draggable>
  )
}
