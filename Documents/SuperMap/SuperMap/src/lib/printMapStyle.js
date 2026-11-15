import { BASEMAPS } from '../constants'
import { RASTER_LAYER_SOURCES } from './printLayers'

function rasterSource(id, tiles, attribution) {
  return {
    type: 'raster',
    tiles,
    tileSize: 256,
    attribution: attribution || '',
    maxzoom: 22,
  }
}

export function buildPrintStyle(basemapId) {
  const basemap = BASEMAPS.find((b) => b.id === basemapId) || BASEMAPS[0]
  const sources = {}
  const layers = []

  if (basemap.type === 'hybrid') {
    sources.imagery = rasterSource('imagery', basemap.imagery, basemap.attribution)
    sources.basemap_labels = rasterSource('basemap_labels', basemap.labels, basemap.attribution)
    layers.push(
      { id: 'imagery', type: 'raster', source: 'imagery', minzoom: 0, maxzoom: 22 },
      { id: 'basemap_labels', type: 'raster', source: 'basemap_labels', minzoom: 0, maxzoom: 22 },
    )
  } else {
    sources.basemap = rasterSource('basemap', basemap.tiles, basemap.attribution)
    layers.push({ id: 'basemap', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 22 })
  }

  Object.entries(RASTER_LAYER_SOURCES).forEach(([key, spec]) => {
    const sid = `print-${key}`
    sources[sid] = rasterSource(sid, spec.tiles, spec.attribution)
    layers.push({
      id: sid,
      type: 'raster',
      source: sid,
      minzoom: 0,
      maxzoom: 22,
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': spec.opacity, 'raster-resampling': 'linear' },
    })
  })

  sources['print-pages'] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  sources['print-page-labels'] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  sources['print-ghost'] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  sources['print-grid'] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  sources['print-mgrs'] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  sources['print-power'] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  sources['print-pipelines'] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  sources['print-buildings'] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  sources['print-waterways'] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  sources['print-box'] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }

  layers.push(
    {
      id: 'print-power-line',
      type: 'line',
      source: 'print-power',
      paint: { 'line-color': '#f5c542', 'line-width': 1.6 },
    },
    {
      id: 'print-pipelines-line',
      type: 'line',
      source: 'print-pipelines',
      paint: { 'line-color': '#ff7a59', 'line-width': 1.8, 'line-dasharray': [2, 1] },
    },
    {
      id: 'print-buildings-fill',
      type: 'fill',
      source: 'print-buildings',
      paint: { 'fill-color': '#c4b5a0', 'fill-opacity': 0.45, 'fill-outline-color': '#6b5b4a' },
    },
    {
      id: 'print-waterways-line',
      type: 'line',
      source: 'print-waterways',
      paint: { 'line-color': '#4aa3ff', 'line-width': 1.4 },
    },
    {
      id: 'print-grid-line',
      type: 'line',
      source: 'print-grid',
      paint: { 'line-color': '#3dd68c', 'line-width': 0.7, 'line-opacity': 0.55 },
    },
    {
      id: 'print-mgrs-label',
      type: 'symbol',
      source: 'print-mgrs',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      },
      paint: {
        'text-color': '#9fffd0',
        'text-halo-color': '#050706',
        'text-halo-width': 1.2,
      },
    },
    {
      id: 'print-box-fill',
      type: 'fill',
      source: 'print-box',
      paint: { 'fill-color': '#3dd68c', 'fill-opacity': 0.12 },
    },
    {
      id: 'print-box-line',
      type: 'line',
      source: 'print-box',
      paint: { 'line-color': '#3dd68c', 'line-width': 1, 'line-dasharray': [2, 2] },
    },
    {
      id: 'print-pages-fill',
      type: 'fill',
      source: 'print-pages',
      paint: { 'fill-color': '#3dd68c', 'fill-opacity': 0.1 },
    },
    {
      id: 'print-pages-line',
      type: 'line',
      source: 'print-pages',
      paint: { 'line-color': '#3dd68c', 'line-width': 2 },
    },
    {
      id: 'print-pages-label',
      type: 'symbol',
      source: 'print-page-labels',
      layout: {
        'text-field': ['get', 'caption'],
        'text-size': 13,
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-allow-overlap': true,
        'symbol-placement': 'point',
      },
      paint: {
        'text-color': '#e8f0ea',
        'text-halo-color': '#050706',
        'text-halo-width': 1.6,
      },
    },
    {
      id: 'print-ghost-fill',
      type: 'fill',
      source: 'print-ghost',
      paint: { 'fill-color': '#5ee4a3', 'fill-opacity': 0.16 },
    },
    {
      id: 'print-ghost-line',
      type: 'line',
      source: 'print-ghost',
      paint: { 'line-color': '#5ee4a3', 'line-width': 2, 'line-dasharray': [3, 2] },
    },
  )

  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources,
    layers,
  }
}

export function applyRasterVisibility(map, id, visible, opacity) {
  if (!map?.getLayer?.(id)) return
  map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  if (visible && Number.isFinite(opacity) && map.getPaintProperty) {
    try {
      map.setPaintProperty(id, 'raster-opacity', opacity)
    } catch {
      /* ignore */
    }
  }
}
