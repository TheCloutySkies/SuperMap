import { useCallback, useEffect, useRef, useState } from 'react'
import Draggable from 'react-draggable'
import { getToolsForView } from '../lib/mapModeTools'
import { GEOLOCATE_PRESETS } from '../lib/geolocatePresets'
import { runOverpassQuery } from '../services/layerServices'
import {
  saveChromePrefs,
  loadFabPosition,
  saveFabPosition,
  loadOpenPanels,
  saveOpenPanels,
  loadPanelPositions,
  savePanelPosition,
  loadPanelCollapsed,
  savePanelCollapsed,
} from '../lib/mapToolsPrefs'
import './MapToolsRadial.css'

const DRAG_THRESHOLD_PX = 10
const PLACE_DRAG_THRESHOLD_PX = 14

function ToolPanel({ id, title, children, onClose, defaultPos }) {
  const nodeRef = useRef(null)
  const saved = loadPanelPositions()[id]
  const [collapsed, setCollapsed] = useState(() => loadPanelCollapsed(id))
  const startPos = (() => {
    const fallback = defaultPos || { x: 16, y: 72 }
    if (!saved || typeof saved.x !== 'number' || typeof saved.y !== 'number') return fallback
    if (saved.x < -40 || saved.y < -40 || saved.x > 900 || saved.y > 700) return fallback
    return saved
  })()
  const [pos] = useState(() => startPos)

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev
      savePanelCollapsed(id, next)
      return next
    })
  }

  return (
    <Draggable
      nodeRef={nodeRef}
      bounds="parent"
      handle=".map-tools-panel-head"
      defaultPosition={pos}
      onStop={(_e, data) => savePanelPosition(id, { x: data.x, y: data.y })}
    >
      <div ref={nodeRef} className={`map-tools-panel${collapsed ? ' is-collapsed' : ''}`}>
        <div className="map-tools-panel-head">
          <span className="map-tools-panel-title">{title}</span>
          <div className="map-tools-panel-actions">
            <button type="button" className="map-tools-panel-btn" onClick={toggleCollapse} title={collapsed ? 'Expand' : 'Collapse'} aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}>
              {collapsed ? '+' : '−'}
            </button>
            <button type="button" className="map-tools-panel-btn" onClick={onClose} title="Close" aria-label="Close panel">
              ×
            </button>
          </div>
        </div>
        {!collapsed && <div className="map-tools-panel-body">{children}</div>}
      </div>
    </Draggable>
  )
}

function GeolocatePresetsPanel({ onResults, onLoading, onClose }) {
  const [running, setRunning] = useState(null)

  const runPreset = async (preset) => {
    const bbox = window.__supermapOverpassBbox
    const fallbackBbox = [-180, -90, 180, 90]
    const [w, s, e, n] = (bbox && Array.isArray(bbox) && bbox.length === 4) ? bbox : fallbackBbox
    let q = preset.query
    if (q.includes('{{bbox}}')) {
      q = q.replace(/\{\{bbox\}\}/g, `${s},${w},${n},${e}`)
    }
    setRunning(preset.name)
    onLoading?.(true)
    try {
      const geojson = await runOverpassQuery(q)
      onResults?.(geojson)
    } catch (err) {
      console.warn('[Geolocate]', err?.message || err)
    } finally {
      setRunning(null)
      onLoading?.(false)
    }
  }

  return (
    <ToolPanel id="geolocatePresets" title="Overpass presets" onClose={onClose} defaultPos={{ x: 16, y: 64 }}>
      <p className="map-tools-panel-hint">Queries run against the visible map area. Drag the header to move.</p>
      <div className="map-tools-preset-list">
        {GEOLOCATE_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="map-tools-preset-btn"
            disabled={!!running}
            onClick={() => runPreset(preset)}
            title={preset.name}
          >
            {running === preset.name ? '…' : preset.name}
          </button>
        ))}
      </div>
    </ToolPanel>
  )
}

function DrawHintPanel({ onClose, onEnableDraw }) {
  return (
    <ToolPanel id="draw" title="Draw & AOI" onClose={onClose} defaultPos={{ x: 16, y: 64 }}>
      <p className="map-tools-panel-hint">Enable the AOI draw layer to use polygon / line tools on the map.</p>
      <button type="button" className="map-tools-preset-btn" onClick={onEnableDraw}>
        Enable draw layer
      </button>
    </ToolPanel>
  )
}

function ZoomPanel({ map, onClose, panelKey = 'zoom' }) {
  const [zoom, setZoom] = useState(() => (map ? map.getZoom() : 2))
  const [bearing, setBearing] = useState(() => (map ? map.getBearing() : 0))

  useEffect(() => {
    if (!map) return undefined
    const onMove = () => {
      setZoom(map.getZoom())
      setBearing(map.getBearing())
    }
    map.on('move', onMove)
    onMove()
    return () => map.off('move', onMove)
  }, [map])

  if (!map) {
    return (
      <ToolPanel id={panelKey} title="Zoom" onClose={onClose} defaultPos={{ x: 16, y: 64 }}>
        <p className="map-tools-panel-hint">Map is still loading…</p>
      </ToolPanel>
    )
  }

  return (
    <ToolPanel id={panelKey} title="Zoom & compass" onClose={onClose} defaultPos={{ x: 16, y: 64 }}>
      <div className="map-tools-zoom-panel">
        <div className="map-tools-zoom-row">
          <button type="button" className="map-tools-preset-btn map-tools-zoom-btn" onClick={() => map.zoomIn()} aria-label="Zoom in">+</button>
          <button type="button" className="map-tools-preset-btn map-tools-zoom-btn" onClick={() => map.zoomOut()} aria-label="Zoom out">−</button>
          <button
            type="button"
            className="map-tools-preset-btn map-tools-zoom-btn"
            onClick={() => map.easeTo({ bearing: 0, pitch: 0 })}
            aria-label="Reset north"
            title="Reset north"
          >
            N
          </button>
        </div>
        <label className="map-tools-zoom-slider-label">
          Level {zoom.toFixed(1)}
          <input
            type="range"
            min={0}
            max={22}
            step={0.5}
            value={zoom}
            onChange={(e) => map.setZoom(parseFloat(e.target.value))}
            className="map-tools-zoom-range"
          />
        </label>
        <p className="map-tools-panel-hint">Bearing {bearing.toFixed(0)}°. Drag the header to move this panel.</p>
      </div>
    </ToolPanel>
  )
}

function clientToMapWrapperPos(clientX, clientY) {
  const root = document.querySelector('.map-view-wrapper')
  if (!root) return { x: Math.max(8, clientX - 40), y: Math.max(8, clientY - 40) }
  const rect = root.getBoundingClientRect()
  return {
    x: Math.max(8, Math.min(rect.width - 120, clientX - rect.left - 20)),
    y: Math.max(8, Math.min(rect.height - 80, clientY - rect.top - 20)),
  }
}

/**
 * Draggable FAB → radial map tools menu. Touch-safe open/expand on mobile + desktop.
 * Pin / Zoom items support drag-to-place onto the map.
 */
export default function MapToolsRadial({
  map = null,
  activeView,
  chromePrefs,
  onChromeChange,
  onToggleLayers,
  onOpenOverpass,
  onOverpassResults,
  onOverpassLoading,
  onEnableDraw,
}) {
  const fabRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [panels, setPanels] = useState(() => loadOpenPanels())
  const [zoomPanelKey, setZoomPanelKey] = useState(0)
  const [dragGhost, setDragGhost] = useState(null)
  const dragDistanceRef = useRef(0)
  const dragOriginRef = useRef({ x: 0, y: 0 })
  const touchToggledRef = useRef(false)
  const placeDragRef = useRef(null)
  const [fabPos] = useState(() => loadFabPosition() || { x: 0, y: 0 })

  const tools = getToolsForView(activeView)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onOutside = (e) => {
      if (placeDragRef.current) return
      const root = e.target?.closest?.('.map-tools-fab-wrap')
      const panel = e.target?.closest?.('.map-tools-panel')
      const chip = e.target?.closest?.('.map-tools-presets-chip')
      const ghost = e.target?.closest?.('.map-tools-drag-ghost')
      if (!root && !panel && !chip && !ghost) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerup', onOutside)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerup', onOutside)
    }
  }, [open])

  useEffect(() => {
    setOpen(false)
    setPanels((prev) => {
      const next = { ...prev }
      if (activeView !== 'geolocate-map') delete next.geolocatePresets
      if (activeView !== 'explore-map') delete next.draw
      saveOpenPanels(next)
      return next
    })
  }, [activeView])

  const setChrome = useCallback((key, value) => {
    const next = { ...chromePrefs, [key]: value }
    onChromeChange?.(next)
    saveChromePrefs(next)
  }, [chromePrefs, onChromeChange])

  const openPanel = (panelId) => {
    setPanels((prev) => {
      const next = { ...prev, [panelId]: true }
      saveOpenPanels(next)
      return next
    })
  }

  const closePanel = (panelId) => {
    setPanels((prev) => {
      const next = { ...prev }
      delete next[panelId]
      saveOpenPanels(next)
      return next
    })
  }

  const placeZoomAt = useCallback((clientX, clientY) => {
    const pos = clientToMapWrapperPos(clientX, clientY)
    savePanelPosition('zoom', pos)
    setZoomPanelKey((k) => k + 1)
    openPanel('zoom')
  }, [])

  const placePinAt = useCallback((clientX, clientY) => {
    if (!map || typeof map.unproject !== 'function') return
    const canvas = map.getCanvas?.()
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return
    const lngLat = map.unproject([x, y])
    window.dispatchEvent(new CustomEvent('supermap-drop-pin', {
      detail: { lng: lngLat.lng, lat: lngLat.lat },
    }))
  }, [map])

  const endPlaceDrag = useCallback((clientX, clientY) => {
    const drag = placeDragRef.current
    placeDragRef.current = null
    setDragGhost(null)
    if (!drag) return
    const dist = Math.hypot(clientX - drag.startX, clientY - drag.startY)
    if (dist < PLACE_DRAG_THRESHOLD_PX) {
      // Short press: zoom still opens panel; pin falls back to tap-to-place mode
      if (drag.place === 'zoom') placeZoomAt(clientX, clientY)
      else if (drag.place === 'pin') {
        window.dispatchEvent(new CustomEvent('supermap-toggle-tap-pin-request'))
      }
      return
    }
    if (drag.place === 'zoom') placeZoomAt(clientX, clientY)
    else if (drag.place === 'pin') placePinAt(clientX, clientY)
  }, [placePinAt, placeZoomAt])

  useEffect(() => {
    if (!dragGhost) return undefined
    const onMove = (e) => {
      setDragGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g))
      if (placeDragRef.current) {
        placeDragRef.current.lastX = e.clientX
        placeDragRef.current.lastY = e.clientY
      }
    }
    const onUp = (e) => {
      endPlaceDrag(e.clientX, e.clientY)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragGhost, endPlaceDrag])

  const startPlaceDrag = (tool, e) => {
    e.preventDefault()
    e.stopPropagation()
    const clientX = e.clientX
    const clientY = e.clientY
    placeDragRef.current = {
      place: tool.place,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
    }
    setDragGhost({
      icon: tool.icon,
      label: tool.label,
      x: clientX,
      y: clientY,
    })
    setOpen(false)
  }

  const handleTool = (tool) => {
    if (tool.action === 'dragPlace') {
      // Click without drag is handled in startPlaceDrag / endPlaceDrag
      return
    }
    if (tool.action === 'toggleChrome' && tool.chromeKey) {
      const nextVal = !chromePrefs[tool.chromeKey]
      setChrome(tool.chromeKey, nextVal)
      if (tool.chromeKey === 'weather' && nextVal) {
        try { localStorage.setItem('supermap_weather_hidden', '0') } catch { /* ignore */ }
      }
    } else if (tool.action === 'panel' && tool.panel) {
      openPanel(tool.panel)
    } else if (tool.action === 'event' && tool.event) {
      window.dispatchEvent(new CustomEvent(tool.event))
    } else if (tool.action === 'callback') {
      if (tool.callback === 'toggleLayers') onToggleLayers?.()
      if (tool.callback === 'openOverpass') onOpenOverpass?.()
    }
    setOpen(false)
  }

  const isToolActive = (tool) => {
    if (tool.action === 'toggleChrome' && tool.chromeKey) {
      return tool.chromeKey === 'locateStack' ? !!chromePrefs.locateStack : chromePrefs[tool.chromeKey] !== false
    }
    if (tool.action === 'panel' && tool.panel) return !!panels[tool.panel]
    if (tool.action === 'dragPlace' && tool.place === 'zoom') return !!panels.zoom
    return false
  }

  const n = tools.length

  const toggleOpen = () => {
    if (dragDistanceRef.current > DRAG_THRESHOLD_PX) return
    setOpen((v) => !v)
  }

  return (
    <>
      <div className={`map-tools-radial-root${open ? ' is-open' : ''}`} aria-label="Map tools">
        <Draggable
          nodeRef={fabRef}
          bounds="parent"
          defaultPosition={fabPos}
          cancel=".map-tools-radial-item"
          onStart={(_e, data) => {
            dragDistanceRef.current = 0
            dragOriginRef.current = { x: data.x, y: data.y }
          }}
          onDrag={(_e, data) => {
            dragDistanceRef.current = Math.hypot(
              data.x - dragOriginRef.current.x,
              data.y - dragOriginRef.current.y,
            )
          }}
          onStop={(_e, data) => {
            saveFabPosition({ x: data.x, y: data.y })
          }}
        >
          <div ref={fabRef} className={`map-tools-fab-wrap${open ? ' is-open' : ''}`}>
            <button
              type="button"
              className={`map-tools-fab${open ? ' is-open' : ''}`}
              aria-expanded={open}
              aria-label={open ? 'Close map tools' : 'Open map tools'}
              title="Map tools (drag to move)"
              onPointerUp={(e) => {
                if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return
                touchToggledRef.current = true
                toggleOpen()
              }}
              onClick={() => {
                if (touchToggledRef.current) {
                  touchToggledRef.current = false
                  return
                }
                toggleOpen()
              }}
            >
              <span className="map-tools-fab-icon" aria-hidden>{open ? '×' : '⚒'}</span>
            </button>

            {open && (
              <div className="map-tools-radial" role="menu">
                <div className="map-tools-radial-ring" aria-hidden />
                {tools.map((tool, i) => {
                  const angle = (360 / n) * i - 90
                  const active = isToolActive(tool)
                  const isDragPlace = tool.action === 'dragPlace'
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      role="menuitem"
                      className={`map-tools-radial-item${active ? ' is-active' : ''}${isDragPlace ? ' is-drag-place' : ''}`}
                      style={{
                        '--radial-angle': `${angle}deg`,
                        '--radial-delay': `${0.03 + i * 0.03}s`,
                      }}
                      onPointerDown={(e) => {
                        if (!isDragPlace) return
                        if (e.button != null && e.button !== 0) return
                        startPlaceDrag(tool, e)
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isDragPlace) return
                        handleTool(tool)
                      }}
                      title={isDragPlace ? `Drag ${tool.label} onto the map` : tool.label}
                    >
                      <span className="map-tools-radial-item-icon" aria-hidden>{tool.icon}</span>
                      <span className="map-tools-radial-item-label">{tool.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </Draggable>
      </div>

      {dragGhost && (
        <div
          className="map-tools-drag-ghost"
          style={{ left: dragGhost.x, top: dragGhost.y }}
          aria-hidden
        >
          <span className="map-tools-drag-ghost-icon">{dragGhost.icon}</span>
          <span className="map-tools-drag-ghost-label">{dragGhost.label}</span>
        </div>
      )}

      {panels.geolocatePresets && activeView === 'geolocate-map' && (
        <GeolocatePresetsPanel
          onResults={onOverpassResults}
          onLoading={onOverpassLoading}
          onClose={() => closePanel('geolocatePresets')}
        />
      )}
      {panels.draw && activeView === 'explore-map' && (
        <DrawHintPanel
          onClose={() => closePanel('draw')}
          onEnableDraw={() => {
            onEnableDraw?.()
            closePanel('draw')
          }}
        />
      )}
      {panels.zoom && (
        <ZoomPanel
          key={`zoom-${zoomPanelKey}`}
          map={map}
          onClose={() => closePanel('zoom')}
        />
      )}

      {activeView === 'geolocate-map' && !panels.geolocatePresets && (
        <button
          type="button"
          className="map-tools-presets-chip"
          onClick={() => openPanel('geolocatePresets')}
        >
          Open presets
        </button>
      )}
    </>
  )
}
