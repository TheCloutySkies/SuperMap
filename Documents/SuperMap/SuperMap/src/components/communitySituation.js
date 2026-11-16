import { ensurePinEmoji, pinIconImageId } from '../lib/mapEmoji'
import { EARTHQUAKE_SIDC, ensureSidcIcon, sidcIconId, WILDFIRE_SIDC } from '../lib/milSymbols'
import {
  aircraftClusterIcon,
  aircraftClusterProperties,
  aircraftIconLayout,
  clusterCountLayout,
  detailIconSize,
  ensureMovementIcons,
  installRouteLayers,
  SHIP_TILES,
  shipIconLayout,
} from '../lib/movementIcons'

const QUAKE_ICON = sidcIconId(EARTHQUAKE_SIDC)
const VOLCANO_ICON = pinIconImageId('🌋')

const EMPTY = { type: 'FeatureCollection', features: [] }

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function paintMark(map, id, color) {
  if (!map || map.hasImage?.(id)) return
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, 64, 64)
  ctx.beginPath()
  ctx.arc(32, 32, 20, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = '#0b1220'
  ctx.stroke()
  try { map.addImage(id, ctx.getImageData(0, 0, 64, 64), { pixelRatio: 2 }) } catch { /* already added */ }
}

function addMarkedLayer(map, id, icon, clusterProperties) {
  if (map.getSource(id)) return
  const source = {
    type: 'geojson',
    data: EMPTY,
    cluster: true,
    clusterRadius: 52,
    clusterMaxZoom: 6,
  }
  if (clusterProperties && Object.keys(clusterProperties).length) source.clusterProperties = clusterProperties
  map.addSource(id, source)
  map.addLayer({
    id: `${id}-points`,
    type: 'symbol',
    source: id,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': icon,
      'icon-size': detailIconSize(),
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
  map.addLayer({
    id: `${id}-clusters`,
    type: 'symbol',
    source: id,
    filter: ['has', 'point_count'],
    layout: clusterCountLayout(icon),
    paint: { 'text-color': '#f8fafc', 'text-halo-color': '#0d1117', 'text-halo-width': 1.4 },
  })
}

export function installCommunitySituation(map) {
  ensureMovementIcons(map)
  paintMark(map, 'mark-conflict', '#7f1d1d')
  paintMark(map, 'mark-report', '#f59e0b')
  paintMark(map, 'hazard-orange', '#f97316')
  paintMark(map, 'hazard-red', '#ef4444')
  ensureSidcIcon(map, EARTHQUAKE_SIDC)
  ensurePinEmoji(map, '🌋')
  ensurePinEmoji(map, '📍')
  ensureSidcIcon(map, WILDFIRE_SIDC)
  addMarkedLayer(map, 'community-conflicts', 'mark-conflict', {})
  addMarkedLayer(map, 'community-reports', 'mark-report', {})
  if (!map.getSource('community-hazards')) {
    map.addSource('community-hazards', {
      type: 'geojson',
      data: EMPTY,
      cluster: true,
      clusterRadius: 52,
      clusterMaxZoom: 6,
      clusterProperties: {
        n_quake: ['+', ['case', ['==', ['get', 'kind'], 'quake'], 1, 0]],
        n_volcano: ['+', ['case', ['==', ['get', 'kind'], 'volcano'], 1, 0]],
        n_red: ['+', ['case', ['==', ['get', 'icon'], 'hazard-red'], 1, 0]],
        n_fire: ['+', ['case', ['==', ['get', 'sidc'], WILDFIRE_SIDC], 1, 0]],
        n_orange: ['+', ['case', ['==', ['get', 'icon'], 'hazard-orange'], 1, 0]],
      },
    })
    map.addLayer({
      id: 'community-hazards-points',
      type: 'symbol',
      source: 'community-hazards',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['get', 'iconImage'],
        'icon-size': detailIconSize(),
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
    map.addLayer({
      id: 'community-hazards-clusters',
      type: 'symbol',
      source: 'community-hazards',
      filter: ['has', 'point_count'],
      layout: clusterCountLayout([
        'case',
        ['all',
          ['>=', ['to-number', ['get', 'n_volcano']], ['to-number', ['get', 'n_quake']]],
          ['>=', ['to-number', ['get', 'n_volcano']], ['to-number', ['get', 'n_red']]],
          ['>=', ['to-number', ['get', 'n_volcano']], ['to-number', ['get', 'n_fire']]],
          ['>=', ['to-number', ['get', 'n_volcano']], ['to-number', ['get', 'n_orange']]],
        ], VOLCANO_ICON,
        ['all',
          ['>=', ['to-number', ['get', 'n_quake']], ['to-number', ['get', 'n_red']]],
          ['>=', ['to-number', ['get', 'n_quake']], ['to-number', ['get', 'n_fire']]],
          ['>=', ['to-number', ['get', 'n_quake']], ['to-number', ['get', 'n_orange']]],
        ], QUAKE_ICON,
        ['all',
          ['>=', ['to-number', ['get', 'n_fire']], ['to-number', ['get', 'n_red']]],
          ['>=', ['to-number', ['get', 'n_fire']], ['to-number', ['get', 'n_orange']]],
        ], sidcIconId(WILDFIRE_SIDC),
        ['>=', ['to-number', ['get', 'n_red']], ['to-number', ['get', 'n_orange']]], 'hazard-red',
        'hazard-orange',
      ]),
      paint: { 'text-color': '#f8fafc', 'text-halo-color': '#0d1117', 'text-halo-width': 1.4 },
    })
  }
  installRouteLayers(map, 'community-movement-route')
  if (!map.getSource('community-aircraft')) {
    map.addSource('community-aircraft', {
      type: 'geojson',
      data: EMPTY,
      cluster: true,
      clusterRadius: 56,
      clusterMaxZoom: 6,
      clusterProperties: aircraftClusterProperties(),
    })
    map.addLayer({
      id: 'community-aircraft-icon',
      type: 'symbol',
      source: 'community-aircraft',
      filter: ['!', ['has', 'point_count']],
      layout: {
        ...aircraftIconLayout(),
        'text-field': ['step', ['zoom'], '', 8, ['get', 'title']],
        'text-font': ['Open Sans Regular'],
        'text-size': 12,
        'text-offset': [0, 1.35],
        'text-anchor': 'top',
      },
      paint: { 'text-color': '#fbbf24', 'text-halo-color': '#0d1117', 'text-halo-width': 1.4 },
    })
    map.addLayer({
      id: 'community-aircraft-clusters',
      type: 'symbol',
      source: 'community-aircraft',
      filter: ['has', 'point_count'],
      layout: clusterCountLayout(aircraftClusterIcon()),
      paint: { 'text-color': '#f8fafc', 'text-halo-color': '#0d1117', 'text-halo-width': 1.4 },
    })
  }
  if (!map.getSource('community-ships')) {
    map.addSource('community-ships', {
      type: 'vector',
      url: SHIP_TILES,
      attribution: 'Open Waters AIS',
    })
    map.addLayer({
      id: 'community-ships-icon',
      type: 'symbol',
      source: 'community-ships',
      'source-layer': 'vessels',
      layout: shipIconLayout(),
    })
  }
}

export function setGeoSource(map, id, collection) {
  const source = map?.getSource?.(id)
  if (source?.setData) source.setData(collection || EMPTY)
}

export function situationPopupHtml(props = {}) {
  const bits = [
    props.type ? `<div>${esc(props.type)}</div>` : '',
    props.place ? `<div>${esc(props.place)}</div>` : '',
    props.date ? `<div>${esc(props.date)}</div>` : '',
    props.fatalities != null && props.fatalities !== '' ? `<div><strong>Fatalities</strong>: ${esc(props.fatalities)}</div>` : '',
    props.actor ? `<div>${esc(props.actor)}</div>` : '',
    props.notes ? `<p>${esc(props.notes)}</p>` : '',
    props.alert ? `<div>${esc(String(props.alert).charAt(0).toUpperCase() + String(props.alert).slice(1))} alert</div>` : '',
    props.link ? `<a href="${esc(props.link)}" target="_blank" rel="noopener noreferrer">Open source</a>` : '',
    props.source ? `<div class="map-popup-source">${esc(props.source)}</div>` : '',
  ].filter(Boolean).join('')
  return `<div class="community-popup"><strong>${esc(props.title || 'Event')}</strong>${bits}</div>`
}

export const CLUSTER_LAYERS = [
  'community-conflicts-clusters',
  'community-reports-clusters',
  'community-hazards-clusters',
  'community-aircraft-clusters',
  'community-pins-clusters',
]

export const SITUATION_POINT_LAYERS = [
  'community-conflicts-points',
  'community-reports-points',
  'community-hazards-points',
  'community-aircraft-icon',
  'community-ships-icon',
]
