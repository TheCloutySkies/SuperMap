import { useCallback, useEffect, useRef, useState } from 'react'
import Draggable from 'react-draggable'
import { getToolsForView } from '../lib/mapModeTools'
import { GEOLOCATE_PRESETS } from '../lib/geolocatePresets'
import { runOverpassQuery } from '../services/layerServices'
import {
  loadChromePrefs,
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

function ToolPanel({ id, title, children, onClose, defaultPos }) {
  const nodeRef = useRef(null)
  const saved = loadPanelPositions()[id]
  const [collapsed, setCollapsed] = useState(() => loadPanelCollapsed(id))
  const [pos] = useState(() => saved || defaultPos || { x: 16, y: 72 })

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

/**
 * Draggable FAB → radial map tools menu. Per-mode tools open collapsible panels
 * or toggle chrome visibility (persisted via supermap_map_tools_* keys).
 */
export default function MapToolsRadial({
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
  const draggedRef = useRef(false)
  const [fabPos] = useState(() => loadFabPosition() || { x: 0, y: 0 })

  const tools = getToolsForView(activeView)

  useEffect(() => {
    // Close radial when switching map modes; keep open panels that still apply
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

  const handleTool = (tool) => {
    if (tool.action === 'toggleChrome' && tool.chromeKey) {
      const nextVal = !chromePrefs[tool.chromeKey]
      setChrome(tool.chromeKey, nextVal)
      if (tool.chromeKey === 'weather' && nextVal) {
        try { localStorage.setItem('supermap_weather_hidden', '0') } catch { /* ignore */ }
      }
    } else if (tool.action === 'panel' && tool.panel) {
      openPanel(tool.panel)
    } else if (tool.action === 'event' && tool.event) {
      if (tool.event === 'supermap-toggle-tap-pin-request') {
        window.dispatchEvent(new CustomEvent('supermap-toggle-tap-pin-request'))
      } else {
        window.dispatchEvent(new CustomEvent(tool.event))
      }
    } else if (tool.action === 'callback') {
      if (tool.callback === 'toggleLayers') onToggleLayers?.()
      if (tool.callback === 'openOverpass') onOpenOverpass?.()
    }
    setOpen(false)
  }

  const isToolActive = (tool) => {
    if (tool.action === 'toggleChrome' && tool.chromeKey) return !!chromePrefs[tool.chromeKey]
    if (tool.action === 'panel' && tool.panel) return !!panels[tool.panel]
    return false
  }

  const n = tools.length

  return (
    <>
      <div className="map-tools-radial-root" aria-label="Map tools">
        <Draggable
          nodeRef={fabRef}
          bounds="parent"
          defaultPosition={fabPos}
          onStart={() => { draggedRef.current = false }}
          onDrag={() => { draggedRef.current = true }}
          onStop={(_e, data) => {
            saveFabPosition({ x: data.x, y: data.y })
            setTimeout(() => { draggedRef.current = false }, 0)
          }}
        >
          <div ref={fabRef} className={`map-tools-fab-wrap${open ? ' is-open' : ''}`}>
            <button
              type="button"
              className={`map-tools-fab${open ? ' is-open' : ''}`}
              aria-expanded={open}
              aria-label={open ? 'Close map tools' : 'Open map tools'}
              title="Map tools (drag to move)"
              onClick={() => {
                if (draggedRef.current) return
                setOpen((v) => !v)
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
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      role="menuitem"
                      className={`map-tools-radial-item${active ? ' is-active' : ''}`}
                      style={{
                        '--radial-angle': `${angle}deg`,
                        '--radial-delay': `${0.03 + i * 0.03}s`,
                      }}
                      onClick={() => handleTool(tool)}
                      title={tool.label}
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
    </>
  )
}
