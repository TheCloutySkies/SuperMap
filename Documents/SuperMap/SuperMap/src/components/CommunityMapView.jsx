import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { fetchMilitaryAircraft, fetchUkraineFrontline, frontlinePopupHtml } from '../services/newLayerFetchers'
import { fetchAcledEvents, fetchGdeltReports, fetchMajorHazards, nearestCorroboration, stampHazardIcons } from '../services/situationLayers'
import { ensurePinEmoji, pinIconImageId } from '../lib/mapEmoji'
import { installCommunitySituation, setGeoSource, situationPopupHtml, CLUSTER_LAYERS, SITUATION_POINT_LAYERS } from './communitySituation'
import {
  aircraftPopupHtml,
  detailIconSize,
  fetchAircraftPhoto,
  fetchAircraftRoute,
  fetchAircraftTrace,
  fetchShipDetail,
  fetchShipPhoto,
  fetchShipRoute,
  fetchShipTrack,
  mountMovementPhoto,
  refreshVectorTiles,
  setRouteData,
  shipDetailRows,
  shipPopupHtml,
  shipTrackFeature,
} from '../lib/movementIcons'
import { stampPinIcons } from '../lib/mapEmoji'
import { categorySidc } from '../lib/milSymbols'
import { clearDraftMarker, syncDraftMarker } from '../lib/draftMarker'
import { useSuperMapAccount } from '../features/accounts/SuperMapAccounts'
import { createCommunityPin, deleteCommunityPin, isSiteAdmin, subscribeCommunityPins, updateCommunityPin } from '../features/accounts/communityPins'
import DraftPinSheet from './DraftPinSheet'
import './CommunityMapView.css'
import './DraftPinSheet.css'

const MAP_GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'

const HAZARD_MENU = [
  ['earthquake', 'Earthquakes'],
  ['wildfire', 'Wildfires'],
  ['cyclone', 'Tropical cyclones'],
  ['flood', 'Floods'],
  ['volcano', 'Volcanoes'],
  ['drought', 'Droughts'],
  ['tsunami', 'Tsunamis'],
  ['other', 'Other hazards'],
]

const LAYER_ROWS = [
  ['x', 'X posts'],
  ['news', 'News'],
  ['images', 'Images'],
  ['shapes', 'Shapes'],
  ['frontline', 'Ukraine frontline'],
  ['conflicts', 'Major conflicts'],
  ['reports', 'Major reports'],
  ['hazards', 'Hazards'],
  ['aircraft', 'Military aircraft'],
  ['ships', 'Military ships'],
]

function hazardCatalog(collection) {
  const grouped = {}
  ;(collection?.features || []).forEach((feature) => {
    const props = feature.properties || {}
    const group = props.hazardGroup || 'other'
    if (!grouped[group]) grouped[group] = []
    const title = props.title || 'Hazard'
    const place = props.place && !title.includes(props.place) ? props.place : ''
    const extra = place || props.date || ''
    grouped[group].push({ id: props.hazardId, title: extra ? `${title} · ${extra}` : title })
  })
  Object.values(grouped).forEach((rows) => rows.sort((a, b) => a.title.localeCompare(b.title)))
  return grouped
}

function visibleHazards(collection, hidden) {
  return {
    type: 'FeatureCollection',
    features: (collection?.features || []).filter((feature) => !hidden[feature.properties?.hazardId]),
  }
}

const DARK_STYLE = {
  version: 8,
  glyphs: MAP_GLYPHS,
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

/**
 * Frame the whole planet in the card. Calibrated on MapLibre 5.19's globe: a 460px-tall card sits
 * at zoom 1.4 with the disc filling ~76% of the height and space left around the atmosphere limb.
 */
function globeZoomFor(el) {
  const height = el?.clientHeight || 460
  const zoom = 1.4 - (460 - height) * (0.25 / 140)
  return Math.min(1.6, Math.max(0.6, zoom))
}

// Atmosphere limb and space tint, borrowed from the watched.earth look. `atmosphere-blend`
// is faded out with zoom so the halo hugs the horizon instead of greasing the map close in.
const GLOBE_SKY = {
  'sky-color': '#01040c',
  'sky-horizon-blend': 0.15,
  'horizon-color': '#0e3552',
  'horizon-fog-blend': 0.35,
  'fog-color': '#060b16',
  'fog-ground-blend': 0,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 8, 0.15],
}

const GLOBE_SPACE_LAYER = {
  id: 'community-space',
  type: 'background',
  paint: { 'background-color': '#01040c' },
}

/** The community style, dressed as a planet for the home card and left flat everywhere else. */
function communityStyle(globe) {
  if (!globe) return DARK_STYLE
  return {
    ...DARK_STYLE,
    projection: { type: 'globe' },
    sky: GLOBE_SKY,
    layers: [GLOBE_SPACE_LAYER, ...DARK_STYLE.layers],
  }
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
      category: pin.category || '',
      sidc: pin.sidc || '',
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
  const filtersRef = useRef({
    x: true,
    news: true,
    images: true,
    shapes: true,
    frontline: true,
    conflicts: true,
    reports: true,
    hazards: true,
    aircraft: true,
    ships: true,
  })
  const situationRef = useRef({ conflicts: [], reports: [] })
  const shipPopupToken = useRef(0)
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
  const [basemap, setBasemap] = useState('dark')
  const [hazardMenuOpen, setHazardMenuOpen] = useState(false)
  const [openHazardGroups, setOpenHazardGroups] = useState({})
  const [hiddenHazards, setHiddenHazards] = useState({})
  const [hazardGroups, setHazardGroups] = useState({})
  const hazardDataRef = useRef(null)
  const hiddenHazardRef = useRef({})
  hiddenHazardRef.current = hiddenHazards
  const markerRef = useRef(null)
  const awaitingRef = useRef(false)

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
      style: communityStyle(compact),
      center: compact ? [20, 18] : [31.2, 48.5],
      zoom: compact ? globeZoomFor(el) : 4.6,
      attributionControl: true,
      dragRotate: false,
      pitchWithRotate: false,
      scrollZoom: !compact,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      focusAfterOpen: false,
      className: 'maplibre-popup-dark community-map-popup',
      maxWidth: '260px',
      offset: 22,
      padding: { top: 72, bottom: 24, left: 12, right: 56 },
    })
    popupRef.current = popup
    mapRef.current = map

    map.on('load', () => {
      map.addSource('community-pins', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 6,
      })
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
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['geometry-type'], 'Point']],
        layout: {
          'icon-image': ['get', 'iconImage'],
          'icon-size': detailIconSize(),
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      })
      ensurePinEmoji(map, '📍')
      map.addLayer({
        id: 'community-pins-clusters',
        type: 'symbol',
        source: 'community-pins',
        filter: ['has', 'point_count'],
        layout: {
          'icon-image': pinIconImageId('📍'),
          'icon-size': 1.15,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Regular'],
          'text-size': 13,
          'text-offset': [0, 1.35],
          'text-anchor': 'top',
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#f8fafc', 'text-halo-color': '#0d1117', 'text-halo-width': 1.4 },
      })
      map.addLayer({
        id: 'community-pins-label',
        type: 'symbol',
        source: 'community-pins',
        filter: ['all', ['!', ['has', 'point_count']], ['!=', ['coalesce', ['get', 'label'], ''], '']],
        minzoom: 12,
        layout: {
          'text-field': ['coalesce', ['get', 'title'], ['get', 'label'], ''],
          'text-font': ['Open Sans Regular'],
          'text-size': 12,
          'text-max-width': 12,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: { 'text-color': '#e6edf3', 'text-halo-color': '#0d1117', 'text-halo-width': 1.4 },
      })
      installCommunitySituation(map)
      // Whole planet in view on the globe: world-wide AIS would smother it.
      if (compact && map.getLayer('community-ships-icon')) {
        map.setLayerZoomRange('community-ships-icon', 3, 22)
      }
      map.addSource('community-frontline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'community-frontline-fill',
        type: 'fill',
        source: 'community-frontline',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': ['coalesce', ['get', 'fill'], '#ef4444'],
          'fill-opacity': 0.35,
        },
      })
      map.addLayer({
        id: 'community-frontline-line',
        type: 'line',
        source: 'community-frontline',
        paint: {
          'line-color': ['coalesce', ['get', 'stroke'], '#ef4444'],
          'line-width': 2.4,
        },
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
      if (!compact) {
        const stored = readJson('supermap.draft-community-pin')
        if (stored) openLocated(stored)
      }
    })

    const openLocated = (detail) => {
      if (!detail || compact) return
      const lat = detail.lat == null || detail.lat === '' ? null : Number(detail.lat)
      const lon = detail.lon == null || detail.lon === '' ? null : Number(detail.lon)
      const hasPoint = Number.isFinite(lat) && Number.isFinite(lon)
      const locating = Boolean(detail.locating)
      setDestination(detail.destination === 'mine' ? 'mine' : 'community')
      setLabel(detail.label || detail.title || '')
      setDraft({
        geometry: hasPoint ? { type: 'Point', coordinates: [lon, lat] } : null,
        kind: detail.kind || detail.mediaKind || 'news',
        media: detail,
        category: detail.category || (detail.kind === 'x' ? 'x' : 'news'),
        sidc: detail.sidc || '',
        place: detail.place || '',
        reasoning: detail.reasoning || '',
        locating,
      })
      awaitingRef.current = !hasPoint && !locating
      map.getCanvas().style.cursor = awaitingRef.current ? 'crosshair' : ''
      if (hasPoint) {
        const zoom = Number(detail.zoom)
        const go = () => map.flyTo({ center: [lon, lat], zoom: Number.isFinite(zoom) ? zoom : 12 })
        if (map.isStyleLoaded()) go()
        else map.once('load', go)
      }
    }
    const onLocated = (event) => {
      sessionStorage.removeItem('supermap.draft-community-pin')
      openLocated(event.detail)
    }
    if (!compact) window.addEventListener('supermap:draft-community-pin', onLocated)

    const openPopup = (feature, lngLat) => {
      const props = feature.properties || {}
      const pin = pinsRef.current.find((row) => row.id === (feature.id || props.id)) || props
      const image = pin.image ? `<img class="community-popup-image" src="${esc(pin.image)}" alt="" referrerpolicy="no-referrer" />` : ''
      const summary = pin.summary ? `<p>${esc(pin.summary)}</p>` : ''
      const original = pin.url ? `<a href="${esc(pin.url)}" target="_blank" rel="noopener noreferrer">Open original</a>` : ''
      const verify = pin.image ? `<a href="/forensics?url=${encodeURIComponent(pin.image)}">Verify media</a>` : ''
      const viewer = userRef.current
      const canDelete = viewer && (isSiteAdmin(viewer) || pin.ownerUid === viewer.uid)
      const canEdit = viewer && pin.ownerUid === viewer.uid
      const edit = canEdit ? `<button type="button" class="community-popup-edit" data-id="${esc(pin.id)}">Edit pin</button>` : ''
      const remove = canDelete ? `<button type="button" class="community-popup-delete" data-id="${esc(pin.id)}">Remove pin</button>` : ''
      const category = pin.category ? `<em>${esc(pin.category)}</em>` : ''
      const located = pin.geometry?.type === 'Point'
        ? { lon: Number(pin.geometry.coordinates?.[0]), lat: Number(pin.geometry.coordinates?.[1]) }
        : centroidOf(pin.geometry)
      const near = located && Number.isFinite(located.lon) && Number.isFinite(located.lat)
        ? nearestCorroboration(located.lon, located.lat, situationRef.current.conflicts, situationRef.current.reports)
        : null
      const corroboration = near
        ? `<div class="community-popup-corroboration">${esc(near.line)}${near.title ? `: ${esc(near.title)}` : ''}</div>`
        : ''
      popup.setLngLat(lngLat).setHTML(`
        <div class="community-popup">
          ${image}
          <strong>${esc(pin.title || pin.label || 'Community pin')}</strong>
          ${category}
          ${summary}
          ${corroboration}
          <div class="community-popup-links">${original}${verify}</div>
          ${edit}
          ${remove}
        </div>
      `).addTo(map)
      popup.getElement()?.querySelector('.community-popup-edit')?.addEventListener('click', () => {
        const point = pin.geometry?.type === 'Point' ? pin.geometry.coordinates : null
        if (!point) return
        setDestination('community')
        setLabel(pin.label || pin.title || '')
        setDraft({
          id: pin.id,
          geometry: { type: 'Point', coordinates: point },
          kind: pin.kind || 'pin',
          media: pin,
          category: pin.category || 'news',
          sidc: pin.sidc || '',
          place: '',
          reasoning: '',
        })
        popup.remove()
        map.flyTo({ center: point, zoom: Math.max(map.getZoom(), 12) })
      })
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
      if (awaitingRef.current) {
        awaitingRef.current = false
        map.getCanvas().style.cursor = ''
        setDraft((current) => current ? {
          ...current,
          geometry: { type: 'Point', coordinates: [event.lngLat.lng, event.lngLat.lat] },
        } : current)
        return
      }
      const live = (ids) => ids.filter((id) => map.getLayer(id))
      const clusterHit = map.queryRenderedFeatures(event.point, { layers: live(CLUSTER_LAYERS) })[0]
      if (clusterHit) {
        const clusterId = clusterHit.properties?.cluster_id
        const expansion = map.getSource(clusterHit.source)?.getClusterExpansionZoom?.(clusterId)
        Promise.resolve(expansion).then((zoom) => {
          if (Number.isFinite(zoom)) map.easeTo({ center: clusterHit.geometry.coordinates, zoom })
        }).catch(() => {})
        return
      }
      const situationHit = map.queryRenderedFeatures(event.point, { layers: live(SITUATION_POINT_LAYERS) })[0]
      if (situationHit) {
        const layerId = situationHit.layer?.id || ''
        const props = situationHit.properties || {}
        if (layerId === 'community-aircraft-icon') {
          popup.setLngLat(event.lngLat).setHTML(aircraftPopupHtml(props)).addTo(map)
          const [lng, lat] = situationHit.geometry?.coordinates || [event.lngLat.lng, event.lngLat.lat]
          const token = shipPopupToken.current + 1
          shipPopupToken.current = token
          const photoPromise = fetchAircraftPhoto(props.hex)
          const showPhoto = () => {
            photoPromise.then((photo) => {
              if (token !== shipPopupToken.current || !popup.isOpen() || !photo) return
              mountMovementPhoto(popup, { ...photo, alt: props.title || props.flight || 'Aircraft' })
            }).catch(() => {})
          }
          showPhoto()
          setRouteData(map, 'community-movement-route', [])
          Promise.all([
            fetchAircraftTrace(props.hex),
            fetchAircraftRoute(props.flight || props.r, lng, lat),
          ]).then(([traveled, current]) => {
            if (token !== shipPopupToken.current || !popup.isOpen()) return
            setRouteData(map, 'community-movement-route', [traveled, current])
          }).catch(() => {})
          popup.once('close', () => {
            if (token !== shipPopupToken.current) return
            setRouteData(map, 'community-movement-route', [])
          })
          return
        }
        if (layerId === 'community-ships-icon') {
          popup.setLngLat(event.lngLat).setHTML(shipPopupHtml(props)).addTo(map)
          const mmsi = props.mmsi
          const [lng, lat] = situationHit.geometry?.coordinates || [event.lngLat.lng, event.lngLat.lat]
          const token = shipPopupToken.current + 1
          shipPopupToken.current = token
          setRouteData(map, 'community-movement-route', [])
          const detailPromise = fetchShipDetail(mmsi)
          const photoPromise = fetchShipPhoto(props.name)
          const showPhoto = () => {
            photoPromise.then((photo) => {
              if (token !== shipPopupToken.current || !popup.isOpen() || !photo) return
              mountMovementPhoto(popup, { ...photo, alt: props.name || 'Ship' })
            }).catch(() => {})
          }
          detailPromise.then((detail) => {
            if (token !== shipPopupToken.current || !detail || !popup.isOpen()) return
            popup.setHTML(shipPopupHtml(props, shipDetailRows(detail)))
            showPhoto()
          }).catch(() => {})
          showPhoto()
          Promise.all([fetchShipTrack(mmsi), detailPromise.catch(() => null)]).then(async ([track, detail]) => {
            if (token !== shipPopupToken.current || !popup.isOpen()) return
            const current = await fetchShipRoute(detail, lng, lat)
            if (token !== shipPopupToken.current || !popup.isOpen()) return
            setRouteData(map, 'community-movement-route', [shipTrackFeature(track), current])
          }).catch(() => {})
          popup.once('close', () => {
            if (token !== shipPopupToken.current) return
            setRouteData(map, 'community-movement-route', [])
          })
          return
        }
        popup.setLngLat(event.lngLat).setHTML(situationPopupHtml(props)).addTo(map)
        return
      }
      const hits = map.queryRenderedFeatures(event.point, { layers: ['community-pins-icon', 'community-pins-label', 'community-pins-fill', 'community-pins-line'] })
      if (hits[0]) {
        openPopup(hits[0], event.lngLat)
        return
      }
      const frontLayers = ['community-frontline-fill', 'community-frontline-line'].filter((id) => map.getLayer(id))
      const region = frontLayers.length ? map.queryRenderedFeatures(event.point, { layers: frontLayers })[0] : null
      if (region) popup.setLngLat(event.lngLat).setHTML(frontlinePopupHtml(region.properties)).addTo(map)
    })

    const frontlineTip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'maplibre-popup-dark', offset: 12 })
    let lastHover = 0
    const hoverLayers = [
      ...CLUSTER_LAYERS,
      ...SITUATION_POINT_LAYERS,
      'community-pins-icon',
      'community-pins-label',
      'community-pins-fill',
      'community-pins-line',
      'community-frontline-fill',
      'community-frontline-line',
    ]
    map.on('mousemove', (event) => {
      if (toolRef.current || awaitingRef.current) {
        frontlineTip.remove()
        map.getCanvas().style.cursor = 'crosshair'
        return
      }
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (now - lastHover < 40) return
      lastHover = now
      const layers = hoverLayers.filter((id) => map.getLayer(id))
      const hit = layers.length ? map.queryRenderedFeatures(event.point, { layers })[0] : null
      map.getCanvas().style.cursor = hit ? 'pointer' : ''
      const front = hit && String(hit.layer?.id || '').startsWith('community-frontline')
      if (!front) {
        frontlineTip.remove()
        return
      }
      frontlineTip.setLngLat(event.lngLat).setHTML(frontlinePopupHtml(hit.properties)).addTo(map)
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
      if (!compact) window.removeEventListener('supermap:draft-community-pin', onLocated)
      clearDraftMarker(markerRef)
      resize.disconnect()
      popup.remove()
      frontlineTip.remove()
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

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getSource?.('community-conflicts')) return undefined
    let cancelled = false
    if (!filters.conflicts) {
      situationRef.current.conflicts = []
      setGeoSource(map, 'community-conflicts', { type: 'FeatureCollection', features: [] })
      return undefined
    }
    fetchAcledEvents().then((geo) => {
      if (cancelled) return
      situationRef.current.conflicts = geo.features || []
      setGeoSource(map, 'community-conflicts', geo)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [filters.conflicts, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getSource?.('community-reports')) return undefined
    let cancelled = false
    if (!filters.reports) {
      situationRef.current.reports = []
      setGeoSource(map, 'community-reports', { type: 'FeatureCollection', features: [] })
      return undefined
    }
    fetchGdeltReports().then((geo) => {
      if (cancelled) return
      situationRef.current.reports = geo.features || []
      setGeoSource(map, 'community-reports', geo)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [filters.reports, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getSource?.('community-hazards')) return undefined
    let cancelled = false
    const paint = (collection) => {
      if (cancelled || !map.getSource('community-hazards')) return
      setGeoSource(map, 'community-hazards', stampHazardIcons(map, collection))
    }
    if (!filters.hazards) {
      paint({ type: 'FeatureCollection', features: [] })
      return undefined
    }
    fetchMajorHazards().then((geo) => {
      if (cancelled) return
      hazardDataRef.current = geo
      setHazardGroups(hazardCatalog(geo))
      paint(visibleHazards(geo, hiddenHazardRef.current))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [filters.hazards, ready])

  useEffect(() => {
    const map = mapRef.current
    const loaded = hazardDataRef.current
    if (!ready || !filters.hazards || !loaded || !map?.getSource?.('community-hazards')) return
    setGeoSource(map, 'community-hazards', stampHazardIcons(map, visibleHazards(loaded, hiddenHazards)))
  }, [hiddenHazards, filters.hazards, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getSource?.('community-aircraft')) return undefined
    let cancelled = false
    if (!filters.aircraft) {
      setGeoSource(map, 'community-aircraft', { type: 'FeatureCollection', features: [] })
      return undefined
    }
    const pull = () => {
      fetchMilitaryAircraft().then((geo) => {
        if (!cancelled) setGeoSource(map, 'community-aircraft', geo)
      }).catch(() => {})
    }
    pull()
    const timer = setInterval(pull, 45000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [filters.aircraft, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getLayer?.('community-ships-icon')) return undefined
    map.setLayoutProperty('community-ships-icon', 'visibility', filters.ships ? 'visible' : 'none')
    if (!filters.ships) {
      setRouteData(map, 'community-movement-route', [])
      return undefined
    }
    const timer = setInterval(() => refreshVectorTiles(map, 'community-ships'), 15000)
    return () => clearInterval(timer)
  }, [filters.ships, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const coords = draft?.geometry?.type === 'Point' ? draft.geometry.coordinates : null
    if (!coords) {
      clearDraftMarker(markerRef)
      return
    }
    syncDraftMarker(map, markerRef, {
      lng: coords[0],
      lat: coords[1],
      sidc: draft.sidc || categorySidc(draft.category),
      onDrag: (lng, lat) => setDraft((current) => (current ? {
        ...current,
        geometry: { type: 'Point', coordinates: [lng, lat] },
      } : current)),
    })
  }, [draft, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getSource?.('dark-base')) return
    const base = map.getSource('dark-base')
    const labels = map.getSource('dark-labels')
    if (basemap === 'osm') {
      base.setTiles(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'])
      map.setLayoutProperty('dark-labels', 'visibility', 'none')
      return
    }
    if (basemap === 'hybrid') {
      base.setTiles(['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'])
      labels.setTiles(['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'])
      map.setLayoutProperty('dark-labels', 'visibility', 'visible')
      return
    }
    base.setTiles(['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'])
    labels.setTiles(['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'])
    map.setLayoutProperty('dark-labels', 'visibility', 'visible')
  }, [basemap, ready])

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
        const placed = markerRef.current?.getLngLat()
        const result = await saveMapPin({
          id: destination === 'mine' && draft.id ? draft.id : `pt-${Date.now()}`,
          title: name,
          icon: '📍',
          listName: 'General',
          notes: draft.media?.summary || '',
          summary: draft.media?.summary || '',
          url: draft.media?.url || '',
          image: draft.media?.image || '',
          mediaKind: draft.media?.kind || draft.media?.mediaKind || '',
          category: draft.category || 'news',
          sidc: draft.sidc || categorySidc(draft.category || 'news'),
          lat: placed?.lat ?? point.lat,
          lon: placed?.lng ?? point.lon,
          geometry: draft.geometry,
          label: label.trim(),
        })
        if (result?.ok === false) return
      } else {
        const payload = {
          ownerUid: user.uid,
          ownerName: user.displayName || 'Anonymous',
          ownerEmoji: user.emoji || '📍',
          title: name,
          summary: draft.media?.summary || '',
          kind: draft.geometry.type === 'Point' ? (draft.kind || 'pin') : 'shape',
          icon: '📍',
          category: draft.category || 'news',
          sidc: draft.sidc || categorySidc(draft.category || 'news'),
          url: draft.media?.url || '',
          image: draft.media?.image || '',
          label: label.trim(),
          geometry: markerRef.current ? {
            type: 'Point',
            coordinates: [markerRef.current.getLngLat().lng, markerRef.current.getLngLat().lat],
          } : draft.geometry,
        }
        const result = draft.id
          ? await updateCommunityPin(draft.id, payload)
          : await createCommunityPin(payload)
        if (result?.ok === false) {
          showToast?.({ tone: 'danger', message: result.error || 'Could not share that pin.' })
          return
        }
        showToast?.({ tone: 'success', message: draft.id ? 'Pin updated.' : 'Shared on the community map.' })
      }
      clearDraftMarker(markerRef)
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
      {compact ? <div className="community-map-stars" aria-hidden="true" /> : null}
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
            <p>Base map</p>
            {[
              ['dark', 'Dark'],
              ['osm', 'OpenStreetMap'],
              ['hybrid', 'Hybrid'],
            ].map(([id, name]) => (
              <label key={id}>
                <input type="radio" name="community-basemap" checked={basemap === id} onChange={() => setBasemap(id)} />
                {name}
              </label>
            ))}
            {LAYER_ROWS.map(([key, name]) => (
              key === 'hazards' ? (
                <div key={key} className="community-map-hazard-block">
                  <div className="community-map-layer-row">
                    <label>
                      <input type="checkbox" checked={!!filters.hazards} onChange={() => toggleFilter('hazards')} />
                      Hazards
                    </label>
                    <button
                      type="button"
                      className="community-map-layer-disclosure"
                      aria-expanded={hazardMenuOpen}
                      aria-label="Hazard types"
                      onClick={() => setHazardMenuOpen((open) => !open)}
                    >
                      {hazardMenuOpen ? '▾' : '▸'}
                    </button>
                  </div>
                  {hazardMenuOpen ? (
                    <div className="community-map-hazard-list">
                      {HAZARD_MENU.filter(([group]) => hazardGroups[group]?.length).map(([group, label]) => {
                        const rows = hazardGroups[group]
                        const hiddenCount = rows.filter((row) => hiddenHazards[row.id]).length
                        const groupOn = hiddenCount === 0
                        return (
                          <div key={group}>
                            <div className="community-map-layer-row">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={groupOn}
                                  onChange={() => setHiddenHazards((current) => {
                                    const next = { ...current }
                                    if (groupOn) rows.forEach((row) => { next[row.id] = true })
                                    else rows.forEach((row) => { delete next[row.id] })
                                    return next
                                  })}
                                />
                                {label}
                              </label>
                              <button
                                type="button"
                                className="community-map-layer-disclosure"
                                aria-expanded={!!openHazardGroups[group]}
                                aria-label={`${label} events`}
                                onClick={() => setOpenHazardGroups((current) => ({ ...current, [group]: !current[group] }))}
                              >
                                {openHazardGroups[group] ? '▾' : '▸'}
                              </button>
                            </div>
                            {openHazardGroups[group] ? (
                              <div className="community-map-hazard-items">
                                {rows.map((row) => (
                                  <label key={row.id} title={row.title}>
                                    <input
                                      type="checkbox"
                                      checked={!hiddenHazards[row.id]}
                                      onChange={() => setHiddenHazards((current) => {
                                        const next = { ...current }
                                        if (next[row.id]) delete next[row.id]
                                        else next[row.id] = true
                                        return next
                                      })}
                                    />
                                    <span>{row.title}</span>
                                  </label>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : (
                <label key={key}>
                  <input type="checkbox" checked={!!filters[key]} onChange={() => toggleFilter(key)} />
                  {name}
                </label>
              )
            ))}
          </div>
        ) : null}
        {compact ? (
          <>
            <span className="community-map-hint">Drag to spin</span>
            <button type="button" className="community-map-open" onClick={() => navigate('/maps')}>Open map</button>
          </>
        ) : (
          <div className="community-map-draw" role="toolbar" aria-label="Draw">
            <button type="button" className={tool === 'pin' ? 'is-on' : ''} onClick={() => chooseTool('pin')}>Pin</button>
            <button type="button" className={tool === 'line' ? 'is-on' : ''} onClick={() => chooseTool('line')}>Line</button>
            <button type="button" className={tool === 'area' ? 'is-on' : ''} onClick={() => chooseTool('area')}>Area</button>
          </div>
        )}
      </div>
      {draft ? (
        <DraftPinSheet
          draft={{
            ...draft,
            ...draft.media,
            label,
            place: draft.place,
            reasoning: draft.reasoning,
            category: draft.category,
            sidc: draft.sidc,
            image: draft.media?.image || draft.image || '',
            locating: draft.locating,
          }}
          saving={saving}
          showDestination={!draft.id}
          destination={destination}
          onDestination={setDestination}
          onChange={(patch) => {
            if (patch.label != null) setLabel(patch.label)
            setDraft((current) => {
              if (!current) return current
              const next = { ...current, ...patch, label: undefined }
              if (Object.prototype.hasOwnProperty.call(patch, 'image') && current.media) {
                next.media = { ...current.media, image: patch.image }
              }
              return next
            })
          }}
          onSave={saveDraft}
          onRemove={() => {
            awaitingRef.current = false
            clearDraftMarker(markerRef)
            setDraft(null)
            setLabel('')
          }}
        />
      ) : null}
    </div>
  )
}
