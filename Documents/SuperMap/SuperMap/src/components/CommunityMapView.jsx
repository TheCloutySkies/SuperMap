import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { fetchUkraineFrontline } from '../services/newLayerFetchers'
import { stampPinIcons } from '../lib/mapEmoji'
import { useSuperMapAccount } from '../features/accounts/SuperMapAccounts'
import { createCommunityPin, deleteCommunityPin, isSiteAdmin, subscribeCommunityPins } from '../features/accounts/communityPins'
import './CommunityMapView.css'

const DARK_STYLE = {
  version: 8,
  sources: {
    'dark-base': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Esri, OpenStreetMap contributors',
    },
    'dark-labels': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
    },
  },
  layers: [
    { id: 'dark-base', type: 'raster', source: 'dark-base' },
    { id: 'dark-labels', type: 'raster', source: 'dark-labels' },
  ],
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function centroidOf(geometry) {
  const coords = []
  const walk = (node) => {
    if (!Array.isArray(node)) return
    if (typeof node[0] === 'number' && typeof node[1] === 'number') coords.push(node)
    else node.forEach(walk)
  }
  walk(geometry?.coordinates)
  if (!coords.length) return null
  const lon = coords.reduce((sum, pair) => sum + pair[0], 0) / coords.length
  const lat = coords.reduce((sum, pair) => sum + pair[1], 0) / coords.length
  return { lon, lat }
}

function pinToFeature(pin) {
  if (!pin?.geometry) return null
  return {
    type: 'Feature',
    id: pin.id,
    properties: {
      id: pin.id,
      title: pin.title || pin.label || 'Community pin',
      summary: pin.summary || '',
      kind: pin.kind || 'pin',
      icon: pin.icon || '📍',
      url: pin.url || '',
      image: pin.image || '',
      label: pin.label || '',
      ownerUid: pin.ownerUid || '',
      ownerName: pin.ownerName || '',
    },
    geometry: pin.geometry,
  }
}

function passesFilters(feature, filters) {
  const geom = feature?.geometry?.type
  if (geom === 'LineString' || geom === 'Polygon' || geom === 'MultiLineString' || geom === 'MultiPolygon') {
    return filters.shapes
  }
  const kind = feature?.properties?.kind
  if (kind === 'x') return filters.x
  if (kind === 'news') return filters.news
  if (kind === 'image') return filters.images
  return filters.x || filters.news || filters.images
}

function readJson(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    sessionStorage.removeItem(key)
    return JSON.parse(raw)
  } catch {
    sessionStorage.removeItem(key)
    return null
  }
}

export default function CommunityMapView({ variant = 'full', flyToTarget = null, onFlyToComplete }) {
  const compact = variant === 'home'
  const navigate = useNavigate()
  const { user, saveMapPin, showToast, setOverlay } = useSuperMapAccount()
  const userRef = useRef(user)
  const toastRef = useRef(showToast)
  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { toastRef.current = showToast }, [showToast])
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const popupRef = useRef(null)
  const drawRef = useRef(null)
  const pinsRef = useRef([])
  const filtersRef = useRef({ x: true, news: true, images: true, shapes: true, frontline: true })
  const toolRef = useRef(null)
  const pendingRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [filters, setFilters] = useState(filtersRef.current)
  const [tool, setTool] = useState(null)
  const [draft, setDraft] = useState(null)
  const [label, setLabel] = useState('')
  const [destination, setDestination] = useState('community')
  const [saving, setSaving] = useState(false)

  useEffect(() => { filtersRef.current = filters }, [filters])
  useEffect(() => { toolRef.current = tool }, [tool])

  const paintPins = useCallback((rows, nextFilters) => {
    const map = mapRef.current
    if (!map?.getSource?.('community-pins')) return
    const features = (rows || []).map(pinToFeature).filter(Boolean).filter((feature) => passesFilters(feature, nextFilters || filtersRef.current))
    map.getSource('community-pins').setData(stampPinIcons(map, { type: 'FeatureCollection', features }))
  }, [])

  useEffect(() => subscribeCommunityPins((rows) => {
    pinsRef.current = rows
    paintPins(rows)
  }), [paintPins])

  useEffect(() => {
    paintPins(pinsRef.current, filters)
  }, [filters, paintPins, ready])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const map = new maplibregl.Map({
      container: el,
      style: DARK_STYLE,
      center: [31.2, 48.5],
      zoom: compact ? 4.2 : 4.6,
      attributionControl: true,
      dragRotate: false,
      pitchWithRotate: false,
      scrollZoom: !compact,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: 'maplibre-popup-dark', maxWidth: '280px' })
    popupRef.current = popup
    mapRef.current = map

    map.on('load', () => {
      map.addSource('community-pins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'community-pins-fill',
        type: 'fill',
        source: 'community-pins',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#58a6ff', 'fill-opacity': 0.22 },
      })
      map.addLayer({
        id: 'community-pins-line',
        type: 'line',
        source: 'community-pins',
        filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'Polygon']],
        paint: { 'line-color': '#58a6ff', 'line-width': 2.5 },
      })
      map.addLayer({
        id: 'community-pins-icon',
        type: 'symbol',
        source: 'community-pins',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'icon-image': ['get', 'iconImage'],
          'icon-size': 0.72,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      })
      map.addLayer({
        id: 'community-pins-label',
        type: 'symbol',
        source: 'community-pins',
        filter: ['!=', ['coalesce', ['get', 'label'], ''], ''],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-offset': [0, 1.3],
          'text-anchor': 'top',
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#e6edf3', 'text-halo-color': '#0d1117', 'text-halo-width': 1.4 },
      })
      map.addSource('community-frontline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'community-frontline-fill',
        type: 'fill',
        source: 'community-frontline',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.18 },
      })
      map.addLayer({
        id: 'community-frontline-line',
        type: 'line',
        source: 'community-frontline',
        paint: { 'line-color': '#ef4444', 'line-width': 2.4 },
      })
      if (!compact) {
        const draw = new MapboxDraw({ displayControlsDefault: false })
        map.addControl(draw)
        drawRef.current = draw
        map.on('draw.create', (event) => {
          const feature = event.features?.[0]
          if (!feature?.geometry) return
          draw.deleteAll()
          setTool(null)
          setDraft({ geometry: feature.geometry, kind: feature.geometry.type === 'Polygon' ? 'shape' : 'shape', media: null })
        })
      }
      setReady(true)
      paintPins(pinsRef.current)
      const focus = readJson('supermap.community-focus')
      if (focus && Number.isFinite(Number(focus.lng)) && Number.isFinite(Number(focus.lat))) {
        map.flyTo({ center: [Number(focus.lng), Number(focus.lat)], zoom: focus.zoom || 8 })
      }
      const pending = readJson('supermap.pending-community-pin')
      if (pending) {
        pendingRef.current = pending
        setTool('pin')
        setDestination('community')
        setLabel(pending.title || '')
        map.getCanvas().style.cursor = 'crosshair'
      }
    })

    const openPopup = (feature, lngLat) => {
      const props = feature.properties || {}
      const pin = pinsRef.current.find((row) => row.id === (feature.id || props.id)) || props
      const image = pin.image ? `<img class="community-popup-image" src="${esc(pin.image)}" alt="" />` : ''
      const summary = pin.summary ? `<p>${esc(pin.summary)}</p>` : ''
      const original = pin.url ? `<a href="${esc(pin.url)}" target="_blank" rel="noopener noreferrer">Open original</a>` : ''
      const mediaUrl = pin.image || pin.url || ''
      const verify = mediaUrl ? `<a href="/forensics?url=${encodeURIComponent(mediaUrl)}">Verify media</a>` : ''
      const viewer = userRef.current
      const canDelete = viewer && (isSiteAdmin(viewer) || pin.ownerUid === viewer.uid)
      const remove = canDelete ? `<button type="button" class="community-popup-delete" data-id="${esc(pin.id)}">Delete</button>` : ''
      popup.setLngLat(lngLat).setHTML(`
        <div class="community-popup">
          ${image}
          <strong>${esc(pin.title || pin.label || 'Community pin')}</strong>
          ${summary}
          <div class="community-popup-links">${original}${verify}</div>
          ${remove}
        </div>
      `).addTo(map)
      popup.getElement()?.querySelector('.community-popup-delete')?.addEventListener('click', async () => {
        const result = await deleteCommunityPin(pin.id)
        if (result?.ok === false) toastRef.current?.({ tone: 'danger', message: result.error || 'Could not delete that pin.' })
        else popup.remove()
      })
    }

    map.on('click', (event) => {
      if (toolRef.current === 'pin') {
        const media = pendingRef.current
        pendingRef.current = null
        setDraft({
          geometry: { type: 'Point', coordinates: [event.lngLat.lng, event.lngLat.lat] },
          kind: media?.kind || media?.mediaKind || 'pin',
          media,
        })
        setTool(null)
        map.getCanvas().style.cursor = ''
        return
      }
      const hits = map.queryRenderedFeatures(event.point, { layers: ['community-pins-icon', 'community-pins-fill', 'community-pins-line'] })
      if (hits[0]) openPopup(hits[0], event.lngLat)
    })

    const onFocus = (event) => {
      const lng = Number(event.detail?.lng)
      const lat = Number(event.detail?.lat)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
      map.flyTo({ center: [lng, lat], zoom: event.detail?.zoom || 8 })
    }
    window.addEventListener('supermap:community-focus', onFocus)

    const resize = new ResizeObserver(() => map.resize())
    resize.observe(el)
    return () => {
      window.removeEventListener('supermap:community-focus', onFocus)
      resize.disconnect()
      popup.remove()
      map.remove()
      mapRef.current = null
      drawRef.current = null
    }
  }, [compact, paintPins])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !flyToTarget) return
    const lng = Number(flyToTarget.lng)
    const lat = Number(flyToTarget.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    map.flyTo({ center: [lng, lat], zoom: flyToTarget.zoom || 10 })
    onFlyToComplete?.()
  }, [flyToTarget, onFlyToComplete, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource?.('community-frontline')) return undefined
    let cancelled = false
    if (!filters.frontline) {
      map.getSource('community-frontline').setData({ type: 'FeatureCollection', features: [] })
      return undefined
    }
    fetchUkraineFrontline().then((geo) => {
      if (!cancelled) map.getSource('community-frontline')?.setData(geo || { type: 'FeatureCollection', features: [] })
    })
    return () => { cancelled = true }
  }, [filters.frontline, ready])

  function chooseTool(next) {
    const map = mapRef.current
    const draw = drawRef.current
    if (tool === next) {
      setTool(null)
      if (map) map.getCanvas().style.cursor = ''
      draw?.changeMode('simple_select')
      return
    }
    setTool(next)
    setDraft(null)
    if (next === 'pin') {
      draw?.changeMode('simple_select')
      if (map) map.getCanvas().style.cursor = 'crosshair'
      return
    }
    if (map) map.getCanvas().style.cursor = ''
    if (next === 'line') draw?.changeMode('draw_line_string')
    if (next === 'area') draw?.changeMode('draw_polygon')
  }

  async function saveDraft() {
    if (!draft?.geometry) return
    if (!user) {
      setOverlay?.('auth')
      return
    }
    const point = centroidOf(draft.geometry)
    if (!point) return
    const name = label.trim() || draft.media?.title || 'Community pin'
    setSaving(true)
    try {
      if (destination === 'mine') {
        const result = await saveMapPin({
          id: `pt-${Date.now()}`,
          title: name,
          icon: '📍',
          listName: 'General',
          notes: draft.media?.summary || '',
          summary: draft.media?.summary || '',
          url: draft.media?.url || '',
          image: draft.media?.image || '',
          mediaKind: draft.media?.kind || draft.media?.mediaKind || '',
          lat: point.lat,
          lon: point.lon,
          geometry: draft.geometry,
          label: label.trim(),
        })
        if (result?.ok === false) return
      } else {
        const result = await createCommunityPin({
          ownerUid: user.uid,
          ownerName: user.displayName || 'Anonymous',
          ownerEmoji: user.emoji || '📍',
          title: name,
          summary: draft.media?.summary || '',
          kind: draft.geometry.type === 'Point' ? (draft.kind || 'pin') : 'shape',
          icon: '📍',
          url: draft.media?.url || '',
          image: draft.media?.image || '',
          label: label.trim(),
          geometry: draft.geometry,
        })
        if (result?.ok === false) {
          showToast?.({ tone: 'danger', message: result.error || 'Could not share that pin.' })
          return
        }
        showToast?.({ tone: 'success', message: 'Shared on the community map.' })
      }
      setDraft(null)
      setLabel('')
    } catch (error) {
      showToast?.({ tone: 'danger', message: error.message || 'Could not save that.' })
    } finally {
      setSaving(false)
    }
  }

  function toggleFilter(key) {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className={`community-map ${compact ? 'community-map--home' : 'community-map--full'}`}>
      <div ref={containerRef} className="community-map-canvas" />
      <div className="community-map-tools">
        <button
          type="button"
          className={`community-map-layers-btn ${layersOpen ? 'is-open' : ''}`}
          aria-expanded={layersOpen}
          onClick={() => setLayersOpen((open) => !open)}
        >
          <span aria-hidden="true">▣</span> Layers
        </button>
        {layersOpen ? (
          <div className="community-map-layers" role="menu">
            {[
              ['x', 'X posts'],
              ['news', 'News'],
              ['images', 'Images'],
              ['shapes', 'Shapes'],
              ['frontline', 'Ukraine frontline'],
            ].map(([key, name]) => (
              <label key={key}>
                <input type="checkbox" checked={!!filters[key]} onChange={() => toggleFilter(key)} />
                {name}
              </label>
            ))}
          </div>
        ) : null}
        {compact ? (
          <button type="button" className="community-map-open" onClick={() => navigate('/maps')}>Open map</button>
        ) : (
          <div className="community-map-draw" role="toolbar" aria-label="Draw">
            <button type="button" className={tool === 'pin' ? 'is-on' : ''} onClick={() => chooseTool('pin')}>Pin</button>
            <button type="button" className={tool === 'line' ? 'is-on' : ''} onClick={() => chooseTool('line')}>Line</button>
            <button type="button" className={tool === 'area' ? 'is-on' : ''} onClick={() => chooseTool('area')}>Area</button>
          </div>
        )}
      </div>
      {draft ? (
        <form className="community-map-draft" onSubmit={(event) => { event.preventDefault(); saveDraft() }}>
          <label>
            Label
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Name this place" maxLength={80} />
          </label>
          <div className="community-map-destination">
            <span>Save to</span>
            <button type="button" className={destination === 'mine' ? 'is-on' : ''} onClick={() => setDestination('mine')}>My maps</button>
            <button type="button" className={destination === 'community' ? 'is-on' : ''} onClick={() => setDestination('community')}>Community</button>
          </div>
          <div className="community-map-draft-actions">
            <button type="button" onClick={() => setDraft(null)}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
