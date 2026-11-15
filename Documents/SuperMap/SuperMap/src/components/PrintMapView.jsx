import { useCallback, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { BASEMAPS } from '../constants'
import PrintControlPanel from './PrintControlPanel'
import { buildPrintStyle, applyRasterVisibility } from '../lib/printMapStyle'
import {
  DEFAULT_SCALE_ID,
  fillAreaWithPages,
  getScale,
  hitTestPage,
  makePage,
  movePageToLngLat,
  nudgePage,
  pageToFeature,
  pagesToFeatureCollection,
  pagesToLabelCollection,
} from '../lib/printScale'
import {
  latLongGridFeatures,
  mgrsLabelFeatures,
  utmGridFeatures,
} from '../lib/utmMgrs'
import {
  defaultMoreToggles,
  defaultOptionalToggles,
  fetchPrintOverpass,
} from '../lib/printLayers'
import { createHistory, pushHistory, redoHistory, undoHistory } from '../lib/printHistory'
import { copyShareUrl, loadSavedPrintState, writePrintHash } from '../lib/printShare'
import {
  downloadBlob,
  printSheets,
  renderPrintPages,
  sheetsToPdfBlob,
} from '../lib/printRender'
import './PrintMapView.css'

const OVERPASS_MIN_ZOOM = {
  powerLines: 11,
  pipelines: 11,
  buildings: 14,
  waterways: 11,
}

function emptyFc() {
  return { type: 'FeatureCollection', features: [] }
}

export default function PrintMapView({
  basemapId = 'arcgis-topo',
  onBasemapChange,
  flyToTarget,
  onFlyToComplete,
  onMapCenterChange,
}) {
  const mapRef = useRef(null)
  const mapObjRef = useRef(null)
  const pagesRef = useRef([])
  const placingRef = useRef(false)
  const draggingRef = useRef(null)
  const shiftBoxRef = useRef(null)
  const lastTouchedRef = useRef(null)
  const historyRef = useRef(createHistory([]))
  const optsRef = useRef({})

  const restored = useRef(null)
  if (restored.current === null && typeof window !== 'undefined') {
    restored.current = loadSavedPrintState() || {}
  }
  const saved = restored.current || {}

  const [pages, setPages] = useState(() => saved.pages || [])
  const [scaleId, setScaleId] = useState(saved.scaleId || DEFAULT_SCALE_ID)
  const [orientation, setOrientation] = useState(saved.orientation || 'portrait')
  const [units, setUnits] = useState(saved.units || 'metric')
  const [labels, setLabels] = useState(saved.labels || 'sparse')
  const [ink, setInk] = useState(saved.ink || 'colour')
  const [hillshade, setHillshade] = useState(saved.hillshade || 'soft')
  const [contours, setContours] = useState(saved.contours || 'sparse')
  const [secondary, setSecondary] = useState(saved.secondary || 'utm')
  const [layerToggles, setLayerToggles] = useState(() => ({
    ...defaultOptionalToggles(),
    ...(saved.layerToggles || {}),
  }))
  const [moreLayers, setMoreLayers] = useState(() => ({
    ...defaultMoreToggles(),
    ...(saved.moreLayers || {}),
  }))
  const [moreOpen, setMoreOpen] = useState(false)
  const [history, setHistory] = useState(() => historyRef.current)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [placing, setPlacing] = useState(false)

  pagesRef.current = pages
  placingRef.current = placing
  optsRef.current = {
    scaleId,
    orientation,
    units,
    labels,
    ink,
    hillshade,
    contours,
    secondary,
    layerToggles,
    moreLayers,
    basemapId,
  }

  const commitPages = useCallback((next, { record = true } = {}) => {
    setPages(next)
    pagesRef.current = next
    if (record) {
      const h = pushHistory(historyRef.current, next)
      historyRef.current = h
      setHistory(h)
    }
  }, [])

  const setGeojson = (id, data) => {
    const map = mapObjRef.current
    const src = map?.getSource?.(id)
    if (src && src.setData) src.setData(data || emptyFc())
  }

  const refreshPagesLayer = useCallback((list) => {
    const rows = list || pagesRef.current
    setGeojson('print-pages', pagesToFeatureCollection(rows))
    setGeojson('print-page-labels', pagesToLabelCollection(rows))
  }, [])

  const refreshGrid = useCallback(() => {
    const map = mapObjRef.current
    if (!map) return
    const b = map.getBounds()
    const west = b.getWest()
    const south = b.getSouth()
    const east = b.getEast()
    const north = b.getNorth()
    const sec = optsRef.current.secondary
    const wantMgrs = !!optsRef.current.moreLayers.mgrs
    if (sec === 'utm') {
      setGeojson('print-grid', utmGridFeatures(west, south, east, north, 1000))
    } else if (sec === 'latlong') {
      const span = Math.max(east - west, north - south)
      const step = span > 2 ? 0.5 : span > 0.5 ? 0.1 : 0.05
      setGeojson('print-grid', latLongGridFeatures(west, south, east, north, step))
    } else {
      setGeojson('print-grid', emptyFc())
    }
    if (wantMgrs) {
      setGeojson('print-mgrs', mgrsLabelFeatures(west, south, east, north, 1000))
    } else {
      setGeojson('print-mgrs', emptyFc())
    }
  }, [])

  const applyStyleToggles = useCallback(() => {
    const map = mapObjRef.current
    if (!map?.getStyle?.()) return
    const o = optsRef.current
    const hillOp = o.hillshade === 'sharp' ? 0.58 : o.hillshade === 'soft' ? 0.34 : 0
    const contOp = o.contours === 'full' ? 0.75 : o.contours === 'sparse' ? 0.4 : 0
    applyRasterVisibility(map, 'print-hillshade', hillOp > 0, hillOp)
    applyRasterVisibility(map, 'print-contours', contOp > 0, contOp)
    applyRasterVisibility(map, 'print-labels', o.labels === 'full', 0.9)
    if (map.getLayer('basemap_labels')) {
      map.setLayoutProperty('basemap_labels', 'visibility', o.labels === 'full' ? 'visible' : 'none')
    }
    applyRasterVisibility(map, 'print-treeCover', !!o.layerToggles.treeCover, 0.55)
    applyRasterVisibility(map, 'print-floodZones', !!o.layerToggles.floodZones, 0.5)
    applyRasterVisibility(map, 'print-marineChart', !!o.layerToggles.marineChart, 0.85)
    applyRasterVisibility(map, 'print-railways', !!o.moreLayers.railways, 0.85)
    applyRasterVisibility(map, 'print-roads', !!o.moreLayers.roads, 0.75)
    applyRasterVisibility(map, 'print-hydroRef', !!o.moreLayers.hydroRef, 0.4)
    applyRasterVisibility(map, 'print-usgs3dep', !!o.moreLayers.usgs3dep, 0.5)
    applyRasterVisibility(map, 'print-placeNames', !!o.moreLayers.placeNames || o.labels === 'full', 0.9)
    const canvas = map.getCanvas()
    if (canvas) canvas.style.filter = o.ink === 'bw' ? 'grayscale(1) contrast(1.12)' : ''
    refreshGrid()
  }, [refreshGrid])

  const loadOverpass = useCallback(async () => {
    const map = mapObjRef.current
    if (!map) return
    const zoom = map.getZoom()
    const o = optsRef.current
    const jobs = [
      ['powerLines', 'print-power'],
      ['pipelines', 'print-pipelines'],
      ['buildings', 'print-buildings'],
      ['waterways', 'print-waterways'],
    ]
    for (const [key, source] of jobs) {
      const want = key === 'waterways' ? o.moreLayers.waterways : o.layerToggles[key]
      if (!want) {
        setGeojson(source, emptyFc())
        continue
      }
      const minZ = OVERPASS_MIN_ZOOM[key] || 12
      if (zoom < minZ) {
        setGeojson(source, emptyFc())
        continue
      }
      try {
        const fc = await fetchPrintOverpass(key, map)
        if (mapObjRef.current === map) setGeojson(source, fc)
      } catch {
        /* keep last */
      }
    }
  }, [])

  useEffect(() => {
    const el = mapRef.current
    if (!el) return undefined
    const startCenter = Array.isArray(saved.center) ? saved.center : [-98.35, 39.5]
    const startZoom = Number.isFinite(saved.zoom) ? saved.zoom : 6
    const map = new maplibregl.Map({
      container: el,
      style: buildPrintStyle(basemapId),
      center: startCenter,
      zoom: startZoom,
      maxPitch: 0,
      attributionControl: true,
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 140, unit: 'metric' }), 'bottom-left')
    mapObjRef.current = map

    const onLoad = () => {
      applyStyleToggles()
      refreshPagesLayer(pagesRef.current)
      refreshGrid()
      loadOverpass()
      const hasSavedView = Array.isArray(saved.center) || (pagesRef.current && pagesRef.current.length)
      if (!hasSavedView && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (p) => map.easeTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 11, duration: 800 }),
          () => {},
          { maximumAge: 600000, timeout: 4000 },
        )
      }
    }
    map.on('load', onLoad)
    map.on('moveend', () => {
      const c = map.getCenter()
      onMapCenterChange?.({ lat: c.lat, lon: c.lng })
      refreshGrid()
      loadOverpass()
      const o = optsRef.current
      writePrintHash({
        ...o,
        pages: pagesRef.current,
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
      })
    })

    const canvas = map.getCanvas()
    canvas.tabIndex = 0

    const lngLatFromEvent = (e) => e.lngLat

    map.on('mousemove', (e) => {
      const ll = lngLatFromEvent(e)
      if (shiftBoxRef.current?.start) {
        shiftBoxRef.current.end = ll
        setGeojson('print-box', {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [shiftBoxRef.current.start.lng, shiftBoxRef.current.start.lat],
                  [ll.lng, shiftBoxRef.current.start.lat],
                  [ll.lng, ll.lat],
                  [shiftBoxRef.current.start.lng, ll.lat],
                  [shiftBoxRef.current.start.lng, shiftBoxRef.current.start.lat],
                ]],
              },
            },
          ],
        })
        return
      }
      if (draggingRef.current) {
        const next = { ...draggingRef.current.page, lng: ll.lng, lat: ll.lat }
        draggingRef.current.page = next
        draggingRef.current.moved = true
        const live = pagesRef.current.map((p) => (p.id === next.id ? next : p))
        pagesRef.current = live
        refreshPagesLayer(live)
        return
      }
      if (placingRef.current) {
        const ghost = makePage({
          lng: ll.lng,
          lat: ll.lat,
          scaleId: optsRef.current.scaleId,
          orientation: optsRef.current.orientation,
          id: 'ghost',
        })
        setGeojson('print-ghost', { type: 'FeatureCollection', features: [pageToFeature(ghost)] })
      }
    })

    map.on('mousedown', (e) => {
      if (e.originalEvent.shiftKey) {
        map.dragPan.disable()
        shiftBoxRef.current = { start: e.lngLat, end: e.lngLat }
        return
      }
      const hit = hitTestPage(e.lngLat.lng, e.lngLat.lat, pagesRef.current)
      if (hit && !placingRef.current) {
        map.dragPan.disable()
        draggingRef.current = { page: hit, moved: false, sx: e.point.x, sy: e.point.y }
        lastTouchedRef.current = hit.id
      }
    })

    map.on('mouseup', (e) => {
      if (shiftBoxRef.current?.start) {
        const a = shiftBoxRef.current.start
        const b = shiftBoxRef.current.end || e.lngLat
        shiftBoxRef.current = null
        setGeojson('print-box', emptyFc())
        map.dragPan.enable()
        const west = Math.min(a.lng, b.lng)
        const east = Math.max(a.lng, b.lng)
        const south = Math.min(a.lat, b.lat)
        const north = Math.max(a.lat, b.lat)
        if (Math.abs(east - west) < 1e-6 || Math.abs(north - south) < 1e-6) return
        const filled = fillAreaWithPages(
          west,
          south,
          east,
          north,
          optsRef.current.scaleId,
          optsRef.current.orientation,
        )
        commitPages([...pagesRef.current, ...filled])
        refreshPagesLayer([...pagesRef.current])
        return
      }
      if (draggingRef.current) {
        const drag = draggingRef.current
        draggingRef.current = null
        map.dragPan.enable()
        const dx = Math.abs(e.point.x - drag.sx)
        const dy = Math.abs(e.point.y - drag.sy)
        if (dx > 3 || dy > 3 || drag.moved) {
          const snapped = movePageToLngLat(drag.page, drag.page.lng, drag.page.lat, pagesRef.current)
          const live = pagesRef.current.map((p) => (p.id === snapped.id ? snapped : p))
          commitPages(live)
        }
      }
    })

    map.on('click', (e) => {
      if (e.originalEvent.shiftKey) return
      const hit = hitTestPage(e.lngLat.lng, e.lngLat.lat, pagesRef.current)
      if (placingRef.current) {
        const dropped = makePage({
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
          scaleId: optsRef.current.scaleId,
          orientation: optsRef.current.orientation,
        })
        const next = [...pagesRef.current, dropped]
        lastTouchedRef.current = dropped.id
        commitPages(next)
        refreshPagesLayer(next)
        setGeojson('print-ghost', emptyFc())
        placingRef.current = false
        setPlacing(false)
        map.getCanvas().style.cursor = ''
        return
      }
      if (hit) {
        lastTouchedRef.current = hit.id
        return
      }
      placingRef.current = true
      setPlacing(true)
      map.getCanvas().style.cursor = 'crosshair'
      const ghost = makePage({
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        scaleId: optsRef.current.scaleId,
        orientation: optsRef.current.orientation,
        id: 'ghost',
      })
      setGeojson('print-ghost', { type: 'FeatureCollection', features: [pageToFeature(ghost)] })
    })

    map.on('dblclick', (e) => {
      if (placingRef.current) e.preventDefault()
    })

    return () => {
      map.remove()
      mapObjRef.current = null
    }
    // Mount once; basemap swaps via setStyle below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapObjRef.current
    if (!map) return
    const center = map.getCenter()
    const zoom = map.getZoom()
    map.setStyle(buildPrintStyle(basemapId))
    map.once('style.load', () => {
      map.setCenter(center)
      map.setZoom(zoom)
      applyStyleToggles()
      refreshPagesLayer(pagesRef.current)
      refreshGrid()
      loadOverpass()
    })
  }, [basemapId, applyStyleToggles, refreshPagesLayer, refreshGrid, loadOverpass])

  useEffect(() => {
    applyStyleToggles()
  }, [labels, ink, hillshade, contours, secondary, layerToggles, moreLayers, applyStyleToggles])

  useEffect(() => {
    loadOverpass()
  }, [layerToggles, moreLayers, loadOverpass])

  useEffect(() => {
    refreshPagesLayer(pages)
  }, [pages, refreshPagesLayer])

  useEffect(() => {
    const map = mapObjRef.current
    const center = map ? [map.getCenter().lng, map.getCenter().lat] : saved.center
    const zoom = map ? map.getZoom() : saved.zoom
    writePrintHash({
      basemapId,
      scaleId,
      orientation,
      units,
      labels,
      ink,
      hillshade,
      contours,
      secondary,
      layerToggles,
      moreLayers,
      pages,
      center,
      zoom,
    })
  }, [basemapId, scaleId, orientation, units, labels, ink, hillshade, contours, secondary, layerToggles, moreLayers, pages, saved.center, saved.zoom])

  useEffect(() => {
    if (!flyToTarget?.lng || !flyToTarget?.lat) return
    mapObjRef.current?.flyTo({
      center: [flyToTarget.lng, flyToTarget.lat],
      zoom: flyToTarget.zoom ?? 12,
      duration: 900,
    })
    onFlyToComplete?.()
  }, [flyToTarget, onFlyToComplete])

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        const res = e.shiftKey ? redoHistory(historyRef.current) : undoHistory(historyRef.current)
        if (res) {
          historyRef.current = res.history
          setHistory(res.history)
          commitPages(res.pages, { record: false })
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        const res = redoHistory(historyRef.current)
        if (res) {
          historyRef.current = res.history
          setHistory(res.history)
          commitPages(res.pages, { record: false })
        }
        return
      }
      if (e.key === 'Escape') {
        placingRef.current = false
        setPlacing(false)
        setGeojson('print-ghost', emptyFc())
        mapObjRef.current?.getCanvas && (mapObjRef.current.getCanvas().style.cursor = '')
        return
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && lastTouchedRef.current) {
        e.preventDefault()
        commitPages(pagesRef.current.filter((p) => p.id !== lastTouchedRef.current))
        lastTouchedRef.current = null
        return
      }
      const arrows = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
      if (arrows[e.key] && lastTouchedRef.current) {
        e.preventDefault()
        const step = e.shiftKey ? 1000 : 100
        const [de, dn] = arrows[e.key]
        const target = pagesRef.current.find((p) => p.id === lastTouchedRef.current)
        if (!target) return
        const moved = nudgePage(target, de * step, dn * step)
        commitPages(pagesRef.current.map((p) => (p.id === moved.id ? moved : p)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commitPages])

  const extraVisibilityFromToggles = () => {
    const o = optsRef.current
    return {
      'print-treeCover': !!o.layerToggles.treeCover,
      'print-floodZones': !!o.layerToggles.floodZones,
      'print-marineChart': !!o.layerToggles.marineChart,
      'print-railways': !!o.moreLayers.railways,
      'print-roads': !!o.moreLayers.roads,
      'print-hydroRef': !!o.moreLayers.hydroRef,
      'print-usgs3dep': !!o.moreLayers.usgs3dep,
      'print-placeNames': !!o.moreLayers.placeNames || o.labels === 'full',
      'print-hillshade': o.hillshade !== 'off',
      'print-contours': o.contours !== 'off',
      'print-labels': o.labels === 'full',
    }
  }

  const runRender = async (mode) => {
    if (!pagesRef.current.length) {
      setStatus('Pick at least one page on the map.')
      return
    }
    setBusy(true)
    setStatus('Keep this tab open while it renders…')
    try {
      const basemap = BASEMAPS.find((b) => b.id === basemapId)
      const sheets = await renderPrintPages(
        pagesRef.current,
        {
          basemapId,
          ink,
          hillshade,
          contours,
          labels,
          extraVisibility: extraVisibilityFromToggles(),
          attribution: basemap?.attribution,
        },
        ({ message }) => setStatus(message),
      )
      if (mode === 'print') {
        printSheets(sheets)
        setStatus('Print dialog opened. Choose Actual size / 100%.')
      } else {
        const blob = sheetsToPdfBlob(sheets)
        downloadBlob(blob, `supermap-print-${getScale(scaleId).id}.pdf`)
        setStatus(`Downloaded ${sheets.length} page PDF.`)
      }
    } catch (err) {
      setStatus(err?.message || 'Render failed.')
    } finally {
      setBusy(false)
    }
  }

  const onShare = async () => {
    try {
      const url = await copyShareUrl({
        basemapId,
        scaleId,
        orientation,
        units,
        labels,
        ink,
        hillshade,
        contours,
        secondary,
        layerToggles,
        moreLayers,
        pages,
      })
      setStatus('Share URL copied.')
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Good Palantir print map', url })
        } catch {
          /* user cancelled share sheet */
        }
      }
    } catch {
      setStatus('Could not copy share URL.')
    }
  }

  return (
    <div className={`print-map-view ${placing ? 'is-placing' : ''} ${busy ? 'is-busy' : ''}`}>
      <PrintControlPanel
        scaleId={scaleId}
        onScaleId={setScaleId}
        orientation={orientation}
        onOrientation={setOrientation}
        units={units}
        onUnits={setUnits}
        labels={labels}
        onLabels={setLabels}
        ink={ink}
        onInk={setInk}
        hillshade={hillshade}
        onHillshade={setHillshade}
        contours={contours}
        onContours={setContours}
        secondary={secondary}
        onSecondary={setSecondary}
        layerToggles={layerToggles}
        onToggleLayer={(key, on) => setLayerToggles((prev) => ({ ...prev, [key]: on }))}
        moreLayers={moreLayers}
        onToggleMore={(key, on) => setMoreLayers((prev) => ({ ...prev, [key]: on }))}
        moreOpen={moreOpen}
        onMoreOpen={setMoreOpen}
        basemapId={basemapId}
        onBasemapId={(id) => onBasemapChange?.(id)}
        pageCount={pages.length}
        history={history}
        onUndo={() => {
          const res = undoHistory(historyRef.current)
          if (!res) return
          historyRef.current = res.history
          setHistory(res.history)
          commitPages(res.pages, { record: false })
        }}
        onRedo={() => {
          const res = redoHistory(historyRef.current)
          if (!res) return
          historyRef.current = res.history
          setHistory(res.history)
          commitPages(res.pages, { record: false })
        }}
        onDownload={() => runRender('download')}
        onPrint={() => runRender('print')}
        onShare={onShare}
        busy={busy}
        status={status}
      />
      <div className="print-map-stage">
        <div ref={mapRef} className="print-map-canvas" role="application" aria-label="Print page picker map" />
        {busy && (
          <div className="print-busy" role="status">
            <div className="print-busy-card">
              <span className="print-busy-pulse" />
              <p>{status || 'Rendering… keep this tab open.'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
