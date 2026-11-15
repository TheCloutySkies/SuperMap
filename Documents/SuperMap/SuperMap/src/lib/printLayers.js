/**
 * Print-tab overlay catalog.
 * Raster tiles are keyless/free sources already used in SuperMap or public USGS/NASA/OSM.
 * Vector overlays reuse Overpass helpers from layerServices.
 */

import { fetchOverpassPower, runOverpassQuery } from '../services/layerServices'

export const PRINT_OPTIONAL_LAYERS = Object.freeze([
  { key: 'treeCover', label: 'Tree cover', kind: 'raster', status: 'shipped' },
  { key: 'floodZones', label: 'Flood zones', kind: 'raster', status: 'shipped' },
  { key: 'powerLines', label: 'Power lines', kind: 'overpass', status: 'shipped' },
  { key: 'pipelines', label: 'Pipelines', kind: 'overpass', status: 'shipped' },
  { key: 'buildings', label: 'Buildings', kind: 'overpass', status: 'shipped' },
  { key: 'marineChart', label: 'Marine chart', kind: 'raster', status: 'shipped' },
])

export const PRINT_MORE_GROUPS = Object.freeze([
  {
    id: 'terrain',
    label: 'Terrain',
    layers: [
      { key: 'usgs3dep', label: 'USGS 3DEP relief', status: 'shipped', kind: 'raster' },
    ],
  },
  {
    id: 'water',
    label: 'Water',
    layers: [
      { key: 'hydroRef', label: 'Hydro overlay', status: 'shipped', kind: 'raster' },
      { key: 'waterways', label: 'Waterways (OSM)', status: 'shipped', kind: 'overpass' },
    ],
  },
  {
    id: 'transport',
    label: 'Transport',
    layers: [
      { key: 'roads', label: 'Roads overlay', status: 'shipped', kind: 'raster' },
      { key: 'railways', label: 'Railways', status: 'shipped', kind: 'raster' },
    ],
  },
  {
    id: 'places',
    label: 'Places',
    layers: [
      { key: 'placeNames', label: 'Place names', status: 'shipped', kind: 'raster' },
    ],
  },
  {
    id: 'grid',
    label: 'Grid',
    layers: [
      { key: 'mgrs', label: 'MGRS', status: 'shipped', kind: 'grid' },
    ],
  },
])

export const HILLSHADE_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
]
export const CONTOUR_TILES = ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png']
export const LABEL_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
]
export const TREE_COVER_TILES = [
  'https://storage.googleapis.com/earthenginepartners-hansen/tiles/gfc_v1.9/treecover2000/{z}/{x}/{y}.png',
]
export const FLOOD_TILES = [
  'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHLWMS/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&dpi=96&format=png32&transparent=true&layers=show:28&f=image',
]
export const MARINE_TILES = ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png']
export const RAIL_TILES = [
  'https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
  'https://b.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
  'https://c.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
]
export const ROAD_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
]
export const HYDRO_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
]
export const USGS_RELIEF_TILES = [
  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}',
]
export const PLACE_TILES = LABEL_TILES

export const RASTER_LAYER_SOURCES = Object.freeze({
  treeCover: { tiles: TREE_COVER_TILES, opacity: 0.55, attribution: 'Hansen / UMD / Google / USGS / NASA' },
  floodZones: { tiles: FLOOD_TILES, opacity: 0.55, attribution: 'FEMA NFHL' },
  marineChart: { tiles: MARINE_TILES, opacity: 0.85, attribution: 'OpenSeaMap' },
  railways: { tiles: RAIL_TILES, opacity: 0.85, attribution: 'OpenRailwayMap' },
  roads: { tiles: ROAD_TILES, opacity: 0.75, attribution: 'Esri' },
  hydroRef: { tiles: HYDRO_TILES, opacity: 0.45, attribution: 'Esri Ocean' },
  usgs3dep: { tiles: USGS_RELIEF_TILES, opacity: 0.55, attribution: 'USGS' },
  placeNames: { tiles: PLACE_TILES, opacity: 0.9, attribution: 'Esri' },
  hillshade: { tiles: HILLSHADE_TILES, opacity: 0.4, attribution: 'Esri' },
  contours: { tiles: CONTOUR_TILES, opacity: 0.55, attribution: 'OpenTopoMap' },
  labels: { tiles: LABEL_TILES, opacity: 0.9, attribution: 'Esri' },
})

export function defaultOptionalToggles() {
  const o = {}
  PRINT_OPTIONAL_LAYERS.forEach((l) => {
    o[l.key] = false
  })
  return o
}

export function defaultMoreToggles() {
  const o = {}
  PRINT_MORE_GROUPS.forEach((g) => {
    g.layers.forEach((l) => {
      o[l.key] = false
    })
  })
  return o
}

export function shippedVsStubbed() {
  const shipped = []
  const stubbed = []
  PRINT_OPTIONAL_LAYERS.forEach((l) => (l.status === 'stub' ? stubbed : shipped).push(l.label))
  PRINT_MORE_GROUPS.forEach((g) => {
    g.layers.forEach((l) => {
      const name = `${g.label} · ${l.label}`
      ;(l.status === 'stub' ? stubbed : shipped).push(name)
    })
  })
  shipped.push('Hillshade (Esri World Hillshade)', 'Contours (OpenTopoMap overlay)', 'Labels (Esri places)', 'Secondary UTM / LatLong grids')
  return { shipped, stubbed }
}

function bboxFromMap(map) {
  const b = map.getBounds()
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
}

export async function fetchPrintOverpass(kind, map) {
  const bbox = bboxFromMap(map)
  const [w, s, e, n] = bbox
  if (kind === 'powerLines') return fetchOverpassPower(bbox)
  if (kind === 'pipelines') {
    const q = `
      [out:json][timeout:25];
      (
        way["man_made"="pipeline"](${s},${w},${n},${e});
        way["substance"~"oil|gas|petroleum|ng|natural_gas"](${s},${w},${n},${e});
      );
      out body geom;
    `
    return runOverpassQuery(q)
  }
  if (kind === 'buildings') {
    const q = `
      [out:json][timeout:25];
      (
        way["building"](${s},${w},${n},${e});
        relation["building"](${s},${w},${n},${e});
      );
      out body geom;
    `
    return runOverpassQuery(q)
  }
  if (kind === 'waterways') {
    const q = `
      [out:json][timeout:25];
      (
        way["waterway"~"river|canal|stream"](${s},${w},${n},${e});
        way["natural"="water"](${s},${w},${n},${e});
      );
      out body geom;
    `
    return runOverpassQuery(q)
  }
  return { type: 'FeatureCollection', features: [] }
}
