import { useRef, useState } from 'react'
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
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [dialogTitle, setDialogTitle] = useState('')
  const [dialogList, setDialogList] = useState('General')
  const [dialogIcon, setDialogIcon] = useState(pointIcon)
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
    <Draggable nodeRef={nodeRef} bounds="parent" defaultPosition={{ x: 12, y: 12 }}>
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
            <button
              type="button"
              onClick={() => {
                setDialogIcon(pointIcon)
                setShowAddDialog(true)
              }}
            >
              Add Point
            </button>
            <button type="button" onClick={() => onClearPoints?.()}>
              Clear Points
            </button>
          </div>
        </div>
        {showAddDialog && (
          <div className="draw-hud-dialog">
            <label>
              Title
              <input value={dialogTitle} onChange={(e) => setDialogTitle(e.target.value)} placeholder="Pinned place" />
            </label>
            <label>
              List
              <input value={dialogList} onChange={(e) => setDialogList(e.target.value)} placeholder="General" />
            </label>
            <label>
              Icon
              <select value={dialogIcon} onChange={(e) => setDialogIcon(e.target.value)}>
                {ICON_OPTIONS.map((icon) => (
                  <option key={icon} value={icon}>{icon}</option>
                ))}
              </select>
            </label>
            <div className="draw-hud-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  onPointIconChange?.(dialogIcon)
                  onAddPoint?.({
                    title: dialogTitle.trim() || 'Pinned place',
                    listName: dialogList.trim() || 'General',
                    icon: dialogIcon,
                  })
                  setDialogTitle('')
                  setDialogList('General')
                  setShowAddDialog(false)
                }}
              >
                Save
              </button>
              <button type="button" onClick={() => setShowAddDialog(false)}>Cancel</button>
            </div>
          </div>
        )}
        <p className="draw-hud-hint">
          Drawings auto-save. Use Add Point to bookmark exact coordinates.
        </p>
      </div>
    </Draggable>
  )
}
