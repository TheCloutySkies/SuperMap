import {
  aircraftIconLayout,
  ensureMovementIcons,
  SHIP_TILES,
  shipIconLayout,
} from '../lib/movementIcons'

const EMPTY = { type: 'FeatureCollection', features: [] }

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function addClusterCircles(map, id, color) {
  if (map.getSource(id)) return
  map.addSource(id, {
    type: 'geojson',
    data: EMPTY,
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: 8,
  })
  map.addLayer({
    id: `${id}-clusters`,
    type: 'circle',
    source: id,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': color,
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 40, 24],
      'circle-stroke-width': 1,
      'circle-stroke-color': '#0b1220',
    },
  })
  map.addLayer({
    id: `${id}-count`,
    type: 'symbol',
    source: id,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Open Sans Regular'],
      'text-size': 11,
    },
    paint: { 'text-color': '#f8fafc' },
  })
  map.addLayer({
    id: `${id}-points`,
    type: 'circle',
    source: id,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': color,
      'circle-radius': 6,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#0b1220',
    },
  })
}

export function installCommunitySituation(map) {
  ensureMovementIcons(map)
  addClusterCircles(map, 'community-conflicts', '#7f1d1d')
  addClusterCircles(map, 'community-reports', '#f59e0b')
  if (!map.getSource('community-hazards')) {
    map.addSource('community-hazards', {
      type: 'geojson',
      data: EMPTY,
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 8,
    })
    map.addLayer({
      id: 'community-hazards-clusters',
      type: 'circle',
      source: 'community-hazards',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#334155',
        'circle-radius': ['step', ['get', 'point_count'], 14, 8, 18, 24, 24],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#0b1220',
      },
    })
    map.addLayer({
      id: 'community-hazards-count',
      type: 'symbol',
      source: 'community-hazards',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Open Sans Regular'],
        'text-size': 11,
      },
      paint: { 'text-color': '#f8fafc' },
    })
    map.addLayer({
      id: 'community-hazards-points',
      type: 'symbol',
      source: 'community-hazards',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['get', 'iconImage'],
        'icon-size': 0.72,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
  }
  if (!map.getSource('community-aircraft')) {
    map.addSource('community-aircraft', { type: 'geojson', data: EMPTY })
    map.addLayer({
      id: 'community-aircraft-icon',
      type: 'symbol',
      source: 'community-aircraft',
      layout: {
        ...aircraftIconLayout(),
        'text-field': ['get', 'title'],
        'text-font': ['Open Sans Regular'],
        'text-size': 10,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
      },
      paint: { 'text-color': '#fbbf24', 'text-halo-color': '#0d1117', 'text-halo-width': 1.4 },
    })
  }
  if (!map.getSource('community-ship-track')) {
    map.addSource('community-ship-track', { type: 'geojson', data: EMPTY })
    map.addLayer({
      id: 'community-ship-track-line',
      type: 'line',
      source: 'community-ship-track',
      paint: { 'line-color': '#7dd3fc', 'line-width': 2 },
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
    props.alert ? `<div>${esc(props.alert)} alert</div>` : '',
    props.link ? `<a href="${esc(props.link)}" target="_blank" rel="noopener noreferrer">Open source</a>` : '',
    props.source ? `<div class="map-popup-source">${esc(props.source)}</div>` : '',
  ].filter(Boolean).join('')
  return `<div class="community-popup"><strong>${esc(props.title || 'Event')}</strong>${bits}</div>`
}

export const CLUSTER_LAYERS = [
  'community-conflicts-clusters',
  'community-reports-clusters',
  'community-hazards-clusters',
]

export const SITUATION_POINT_LAYERS = [
  'community-conflicts-points',
  'community-reports-points',
  'community-hazards-points',
  'community-aircraft-icon',
  'community-ships-icon',
]
