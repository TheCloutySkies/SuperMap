import { useRef, useEffect, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { BASEMAPS, STORAGE_KEYS } from '../constants'
import { getAoiFeatures, setAoiFeatures, getSavedPoints, setSavedPoints } from '../constants'
import {
  fetchOverpassPower,
  fetchOverpassCellTowers,
  fetchNasaFirmsArea,
  fetchGdacsEvents,
  fetchGeoconfirmed,
  fetchUsgsEarthquakes,
  fetchAcled,
  fetchAdsbRapidApi,
  fetchAdsbPlaceholder,
  fetchUtilityOutages,
} from '../services/layerServices'
import MapControls from './MapControls'
import DrawHUD from './DrawHUD'
import { useAuth } from '../contexts/AuthContext'
import { useSavedPlaces } from '../contexts/SavedPlacesContext'
import './MapView.css'

// Improve @mapbox/mapbox-gl-draw compatibility on MapLibre.
MapboxDraw.constants.classes.CANVAS = 'maplibregl-canvas'
MapboxDraw.constants.classes.CONTROL_BASE = 'maplibregl-ctrl'
MapboxDraw.constants.classes.CONTROL_PREFIX = 'maplibregl-ctrl-'
MapboxDraw.constants.classes.CONTROL_GROUP = 'maplibregl-ctrl-group'
MapboxDraw.constants.classes.ATTRIBUTION = 'maplibregl-ctrl-attrib'

const MIN_POWER_ZOOM = 14

const CLICKABLE_POINT_LAYERS = [
  'intel-power-points',
  'intel-firms-layer',
  'intel-gdacs-layer',
  'intel-geoconfirmed-layer',
  'intel-usgs-layer',
  'intel-acled-layer',
  'intel-outages-layer',
  'intel-comms-layer',
  'mapped-news-layer',
  'mapped-osint-layer',
  'mapped-conflict-events-layer',
  'search-results-layer',
  'intel-saved-points-layer',
]

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 }],
}

function buildRasterStyle(basemap) {
  const layers = [
    { id: 'basemap', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 22 },
  ]
  const sources = {
    basemap: {
      type: 'raster',
      tiles: basemap.tiles,
      tileSize: basemap.tileSize || 256,
      attribution: basemap.attribution,
    },
  }
  return { version: 8, sources, layers }
}

function buildHybridStyle(basemap) {
  const sources = {
    imagery: {
      type: 'raster',
      tiles: basemap.imagery,
      tileSize: basemap.tileSize || 256,
      attribution: basemap.attribution,
    },
    labels: {
      type: 'raster',
      tiles: basemap.labels,
      tileSize: basemap.tileSize || 256,
    },
  }
  const layers = [
    { id: 'imagery', type: 'raster', source: 'imagery', minzoom: 0, maxzoom: 22 },
    { id: 'labels', type: 'raster', source: 'labels', minzoom: 0, maxzoom: 22 },
  ]
  return { version: 8, sources, layers }
}

const RAILWAY_TILES = [
  'https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
  'https://b.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
  'https://c.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
]

const RAINVIEWER_API = 'https://api.rainviewer.com/public/weather-maps.json'

function sentinelDailyWmsUrl(timeIso) {
  // NASA GIBS daily true-color imagery with explicit TIME parameter.
  const date = timeIso || new Date().toISOString().slice(0, 10)
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
}

function addOrUpdateLayer(map, layerToggles, onLoading, getRadarWanted) {
  const addPower = (geoJson) => {
    if (map.getSource('intel-power')) {
      map.getSource('intel-power').setData(geoJson)
      return
    }
    map.addSource('intel-power', { type: 'geojson', data: geoJson })
    map.addLayer({
      id: 'intel-power-lines',
      type: 'line',
      source: 'intel-power',
      filter: ['in', ['get', 'power'], ['literal', ['line', 'cable']]],
      paint: { 'line-color': '#f59e0b', 'line-width': 2 },
    })
    map.addLayer({
      id: 'intel-power-points',
      type: 'circle',
      source: 'intel-power',
      filter: ['in', ['get', 'power'], ['literal', ['substation', 'plant']]],
      paint: { 'circle-radius': 8, 'circle-color': '#eab308', 'circle-stroke-width': 1, 'circle-stroke-color': '#ca8a04' },
    })
  }

  const removePower = () => {
    if (map.getLayer('intel-power-lines')) map.removeLayer('intel-power-lines')
    if (map.getLayer('intel-power-points')) map.removeLayer('intel-power-points')
    if (map.getSource('intel-power')) map.removeSource('intel-power')
  }

  const addFirms = (geoJson) => {
    if (map.getSource('intel-firms')) {
      map.getSource('intel-firms').setData(geoJson)
      return
    }
    map.addSource('intel-firms', { type: 'geojson', data: geoJson })
    map.addLayer({
      id: 'intel-firms-layer',
      type: 'circle',
      source: 'intel-firms',
      paint: { 'circle-radius': 6, 'circle-color': '#ef4444', 'circle-opacity': 0.9 },
    })
  }

  const removeFirms = () => {
    if (map.getLayer('intel-firms-layer')) map.removeLayer('intel-firms-layer')
    if (map.getSource('intel-firms')) map.removeSource('intel-firms')
  }

  const addGdacs = (geoJson) => {
    if (map.getSource('intel-gdacs')) {
      map.getSource('intel-gdacs').setData(geoJson)
      return
    }
    map.addSource('intel-gdacs', { type: 'geojson', data: geoJson })
    map.addLayer({
      id: 'intel-gdacs-layer',
      type: 'circle',
      source: 'intel-gdacs',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 4, 10, 14],
        'circle-color': '#f97316',
        'circle-opacity': 0.85,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    })
  }

  const removeGdacs = () => {
    if (map.getLayer('intel-gdacs-layer')) map.removeLayer('intel-gdacs-layer')
    if (map.getSource('intel-gdacs')) map.removeSource('intel-gdacs')
  }

  const addGeoconfirmed = (geoJson) => {
    if (map.getSource('intel-geoconfirmed')) {
      map.getSource('intel-geoconfirmed').setData(geoJson)
      return
    }
    map.addSource('intel-geoconfirmed', { type: 'geojson', data: geoJson })
    map.addLayer({
      id: 'intel-geoconfirmed-layer',
      type: 'circle',
      source: 'intel-geoconfirmed',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 10, 12],
        'circle-color': '#8b5cf6',
        'circle-opacity': 0.9,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#c4b5fd',
      },
    })
  }

  const removeGeoconfirmed = () => {
    if (map.getLayer('intel-geoconfirmed-layer')) map.removeLayer('intel-geoconfirmed-layer')
    if (map.getSource('intel-geoconfirmed')) map.removeSource('intel-geoconfirmed')
  }

  const addUsgs = (geoJson) => {
    if (map.getSource('intel-usgs')) {
      map.getSource('intel-usgs').setData(geoJson)
      return
    }
    map.addSource('intel-usgs', { type: 'geojson', data: geoJson })
    map.addLayer({
      id: 'intel-usgs-layer',
      type: 'circle',
      source: 'intel-usgs',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 0, 4, 7, 16],
        'circle-color': '#a855f7',
        'circle-opacity': 0.9,
      },
    })
  }

  const removeUsgs = () => {
    if (map.getLayer('intel-usgs-layer')) map.removeLayer('intel-usgs-layer')
    if (map.getSource('intel-usgs')) map.removeSource('intel-usgs')
  }

  const addAcled = (geoJson) => {
    if (map.getSource('intel-acled')) {
      map.getSource('intel-acled').setData(geoJson)
      return
    }
    map.addSource('intel-acled', { type: 'geojson', data: geoJson })
    map.addLayer({
      id: 'intel-acled-layer',
      type: 'circle',
      source: 'intel-acled',
      paint: { 'circle-radius': 6, 'circle-color': '#dc2626', 'circle-opacity': 0.9 },
    })
  }

  const removeAcled = () => {
    if (map.getLayer('intel-acled-layer')) map.removeLayer('intel-acled-layer')
    if (map.getSource('intel-acled')) map.removeSource('intel-acled')
  }

  const addRailway = () => {
    if (map.getSource('intel-railway')) return
    map.addSource('intel-railway', {
      type: 'raster',
      tiles: RAILWAY_TILES,
      tileSize: 256,
      attribution: '© OpenRailwayMap',
    })
    map.addLayer({ id: 'intel-railway-layer', type: 'raster', source: 'intel-railway' })
  }

  const removeRailway = () => {
    if (map.getLayer('intel-railway-layer')) map.removeLayer('intel-railway-layer')
    if (map.getSource('intel-railway')) map.removeSource('intel-railway')
  }

  const addAdsb = () => {
    if (map.getSource('intel-adsb')) return
    map.addSource('intel-adsb', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer({
      id: 'intel-adsb-layer',
      type: 'circle',
      source: 'intel-adsb',
      paint: { 'circle-radius': 5, 'circle-color': '#3b82f6' },
    })
  }

  const removeAdsb = () => {
    if (map.getLayer('intel-adsb-layer')) map.removeLayer('intel-adsb-layer')
    if (map.getSource('intel-adsb')) map.removeSource('intel-adsb')
  }

  const addNoaaRadar = () => {
    if (map.getSource('intel-noaa-radar')) return
    fetch(RAINVIEWER_API, { method: 'GET' })
      .then((r) => r.json())
      .then((data) => {
        if (map.getSource('intel-noaa-radar')) return
        if (typeof getRadarWanted === 'function' && !getRadarWanted()) return
        const host = (data.host || 'https://tilecache.rainviewer.com').replace(/\/$/, '')
        const past = data.radar?.past
        const path = Array.isArray(past) && past.length > 0 ? past[past.length - 1].path : '/v2/radar/0'
        const tileUrl = `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`
        map.addSource('intel-noaa-radar', {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256,
          // Prevent unsupported tile requests that render "Zoom Level Not Supported".
          maxzoom: 10,
          attribution: '© RainViewer',
        })
        if (!map.getLayer('intel-noaa-radar-layer')) {
          map.addLayer({
            id: 'intel-noaa-radar-layer',
            type: 'raster',
            source: 'intel-noaa-radar',
            maxzoom: 10.5,
            paint: { 'raster-opacity': 0.7 },
          })
        }
      })
      .catch(() => {})
  }

  const removeNoaaRadar = () => {
    if (map.getLayer('intel-noaa-radar-layer')) map.removeLayer('intel-noaa-radar-layer')
    if (map.getSource('intel-noaa-radar')) map.removeSource('intel-noaa-radar')
  }

  const removeSentinel2BurnScars = () => {
    if (map.getLayer('intel-sentinel2-layer')) map.removeLayer('intel-sentinel2-layer')
    if (map.getSource('intel-sentinel2')) map.removeSource('intel-sentinel2')
  }

  const addSentinel2BurnScars = (_instanceId, timeIso) => {
    removeSentinel2BurnScars()
    const url = sentinelDailyWmsUrl(timeIso)
    map.addSource('intel-sentinel2', {
      type: 'raster',
      tiles: [url],
      tileSize: 256,
    })
    map.addLayer({
      id: 'intel-sentinel2-layer',
      type: 'raster',
      source: 'intel-sentinel2',
      paint: { 'raster-opacity': 0.8 },
    })
  }

  const updateSentinel2Time = (_instanceId, timeIso) => {
    const url = sentinelDailyWmsUrl(timeIso)
    if (!map.getSource('intel-sentinel2')) return
    removeSentinel2BurnScars()
    map.addSource('intel-sentinel2', { type: 'raster', tiles: [url], tileSize: 256 })
    map.addLayer({
      id: 'intel-sentinel2-layer',
      type: 'raster',
      source: 'intel-sentinel2',
      paint: { 'raster-opacity': 0.8 },
    })
  }

  const addComms = (geoJson) => {
    const fc = geoJson || { type: 'FeatureCollection', features: [] }
    const withLabel = {
      ...fc,
      features: (fc.features || []).map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          label: f.properties?.label || f.properties?.operator || f.properties?.towerId || 'Tower',
        },
      })),
    }
    if (map.getSource('intel-comms')) {
      map.getSource('intel-comms').setData(withLabel)
      return
    }
    map.addSource('intel-comms', { type: 'geojson', data: withLabel })
    map.addLayer({
      id: 'intel-comms-layer',
      type: 'circle',
      source: 'intel-comms',
      paint: {
        'circle-radius': 8,
        'circle-color': '#06b6d4',
        'circle-opacity': 0.9,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    })
    map.addLayer({
      id: 'intel-comms-labels',
      type: 'symbol',
      source: 'intel-comms',
      layout: {
        'text-field': ['coalesce', ['get', 'label'], ['get', 'operator'], 'Tower'],
        'text-size': 10,
        'text-anchor': 'top',
        'text-offset': [0, 0.6],
      },
      paint: { 'text-color': '#e6edf3', 'text-halo-color': '#0d1117', 'text-halo-width': 2 },
    })
  }

  const removeComms = () => {
    if (map.getLayer('intel-comms-labels')) map.removeLayer('intel-comms-labels')
    if (map.getLayer('intel-comms-layer')) map.removeLayer('intel-comms-layer')
    if (map.getSource('intel-comms')) map.removeSource('intel-comms')
  }

  const addFlockCameras = (geoJson) => {
    if (map.getSource('intel-flock')) {
      map.getSource('intel-flock').setData(geoJson)
      return
    }
    map.addSource('intel-flock', {
      type: 'geojson',
      data: geoJson,
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 12,
    })
    map.addLayer({
      id: 'intel-flock-clusters',
      type: 'circle',
      source: 'intel-flock',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#2563eb',
        'circle-opacity': 0.85,
        'circle-radius': ['step', ['get', 'point_count'], 14, 20, 18, 100, 24],
      },
    })
    map.addLayer({
      id: 'intel-flock-cluster-count',
      type: 'symbol',
      source: 'intel-flock',
      filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11 },
      paint: { 'text-color': '#ffffff' },
    })
    map.addLayer({
      id: 'intel-flock-layer',
      type: 'circle',
      source: 'intel-flock',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': 8,
        'circle-color': '#3b82f6',
        'circle-opacity': 0.9,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    })
    map.addLayer({
      id: 'intel-flock-icons',
      type: 'symbol',
      source: 'intel-flock',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': '📷',
        'text-size': 13,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    })
  }

  const removeFlockCameras = () => {
    if (map.getLayer('intel-flock-cluster-count')) map.removeLayer('intel-flock-cluster-count')
    if (map.getLayer('intel-flock-clusters')) map.removeLayer('intel-flock-clusters')
    if (map.getLayer('intel-flock-icons')) map.removeLayer('intel-flock-icons')
    if (map.getLayer('intel-flock-layer')) map.removeLayer('intel-flock-layer')
    if (map.getSource('intel-flock')) map.removeSource('intel-flock')
  }

  const addUtilityOutages = (geoJson) => {
    if (map.getSource('intel-outages')) {
      map.getSource('intel-outages').setData(geoJson)
      return
    }
    map.addSource('intel-outages', { type: 'geojson', data: geoJson })
    map.addLayer({
      id: 'intel-outages-layer',
      type: 'circle',
      source: 'intel-outages',
      paint: { 'circle-radius': 6, 'circle-color': '#ef4444', 'circle-opacity': 0.9 },
    })
  }

  const removeUtilityOutages = () => {
    if (map.getLayer('intel-outages-layer')) map.removeLayer('intel-outages-layer')
    if (map.getSource('intel-outages')) map.removeSource('intel-outages')
  }

  const addAoiSaved = (fc) => {
    if (map.getSource('intel-aoi-saved')) {
      map.getSource('intel-aoi-saved').setData(fc)
      return
    }
    map.addSource('intel-aoi-saved', { type: 'geojson', data: fc })
    map.addLayer({
      id: 'intel-aoi-saved-layer',
      type: 'fill',
      source: 'intel-aoi-saved',
      paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.25 },
    })
    map.addLayer({
      id: 'intel-aoi-saved-outline',
      type: 'line',
      source: 'intel-aoi-saved',
      paint: { 'line-color': '#22c55e', 'line-width': 2 },
    })
  }

  const removeAoiSaved = () => {
    if (map.getLayer('intel-aoi-saved-outline')) map.removeLayer('intel-aoi-saved-outline')
    if (map.getLayer('intel-aoi-saved-layer')) map.removeLayer('intel-aoi-saved-layer')
    if (map.getSource('intel-aoi-saved')) map.removeSource('intel-aoi-saved')
  }

  const addOverpassTemp = (geoJson) => {
    if (map.getSource('overpass-temp')) {
      map.getSource('overpass-temp').setData(geoJson)
      return
    }
    map.addSource('overpass-temp', { type: 'geojson', data: geoJson })
    map.addLayer({
      id: 'overpass-temp-fill',
      type: 'fill',
      source: 'overpass-temp',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#06b6d4', 'fill-opacity': 0.3 },
    })
    map.addLayer({
      id: 'overpass-temp-line',
      type: 'line',
      source: 'overpass-temp',
      filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
      paint: { 'line-color': '#06b6d4', 'line-width': 2 },
    })
    map.addLayer({
      id: 'overpass-temp-points',
      type: 'circle',
      source: 'overpass-temp',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 8, 'circle-color': '#06b6d4', 'circle-opacity': 0.8 },
    })
  }

  const removeOverpassTemp = () => {
    if (map.getLayer('overpass-temp-points')) map.removeLayer('overpass-temp-points')
    if (map.getLayer('overpass-temp-line')) map.removeLayer('overpass-temp-line')
    if (map.getLayer('overpass-temp-fill')) map.removeLayer('overpass-temp-fill')
    if (map.getSource('overpass-temp')) map.removeSource('overpass-temp')
  }

  const addMappedNews = (geoJson) => {
    if (map.getSource('mapped-news')) {
      map.getSource('mapped-news').setData(geoJson)
      return
    }
    map.addSource('mapped-news', { type: 'geojson', data: geoJson })
    map.addLayer({
      id: 'mapped-news-layer',
      type: 'circle',
      source: 'mapped-news',
      paint: {
        'circle-radius': 10,
        'circle-color': '#3b82f6',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    })
    map.addLayer({
      id: 'mapped-news-labels',
      type: 'symbol',
      source: 'mapped-news',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
      },
      paint: { 'text-color': '#e6edf3', 'text-halo-color': '#0d1117', 'text-halo-width': 2 },
    })
  }

  const removeMappedNews = () => {
    if (map.getLayer('mapped-news-labels')) map.removeLayer('mapped-news-labels')
    if (map.getLayer('mapped-news-layer')) map.removeLayer('mapped-news-layer')
    if (map.getSource('mapped-news')) map.removeSource('mapped-news')
  }

  const addMappedOsint = (geoJson) => {
    if (map.getSource('mapped-osint')) {
      map.getSource('mapped-osint').setData(geoJson)
      return
    }
    map.addSource('mapped-osint', { type: 'geojson', data: geoJson })
    map.addLayer({
      id: 'mapped-osint-layer',
      type: 'circle',
      source: 'mapped-osint',
      paint: {
        'circle-radius': 10,
        'circle-color': '#dc2626',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fbbf24',
      },
    })
    map.addLayer({
      id: 'mapped-osint-labels',
      type: 'symbol',
      source: 'mapped-osint',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
      },
      paint: { 'text-color': '#fef3c7', 'text-halo-color': '#0d1117', 'text-halo-width': 2 },
    })
  }

  const removeMappedOsint = () => {
    if (map.getLayer('mapped-osint-labels')) map.removeLayer('mapped-osint-labels')
    if (map.getLayer('mapped-osint-layer')) map.removeLayer('mapped-osint-layer')
    if (map.getSource('mapped-osint')) map.removeSource('mapped-osint')
  }

  const addMappedConflictEvents = (geoJson) => {
    if (map.getSource('mapped-conflict-events')) {
      map.getSource('mapped-conflict-events').setData(geoJson)
      return
    }
    map.addSource('mapped-conflict-events', { type: 'geojson', data: geoJson })
    map.addLayer({
      id: 'mapped-conflict-events-layer',
      type: 'circle',
      source: 'mapped-conflict-events',
      paint: {
        'circle-radius': 10,
        'circle-color': '#b91c1c',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fcd34d',
      },
    })
    map.addLayer({
      id: 'mapped-conflict-events-labels',
      type: 'symbol',
      source: 'mapped-conflict-events',
      layout: {
        'text-field': ['coalesce', ['get', 'label'], ['get', 'title'], 'Event'],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
      },
      paint: { 'text-color': '#fef3c7', 'text-halo-color': '#0d1117', 'text-halo-width': 2 },
    })
  }

  const removeMappedConflictEvents = () => {
    if (map.getLayer('mapped-conflict-events-labels')) map.removeLayer('mapped-conflict-events-labels')
    if (map.getLayer('mapped-conflict-events-layer')) map.removeLayer('mapped-conflict-events-layer')
    if (map.getSource('mapped-conflict-events')) map.removeSource('mapped-conflict-events')
  }

  const addSearchResults = (geoJson) => {
    const fc = geoJson && geoJson.features?.length ? geoJson : { type: 'FeatureCollection', features: [] }
    if (map.getSource('search-results')) {
      map.getSource('search-results').setData(fc)
      return
    }
    map.addSource('search-results', { type: 'geojson', data: fc })
    map.addLayer({
      id: 'search-results-layer',
      type: 'circle',
      source: 'search-results',
      paint: {
        'circle-radius': 10,
        'circle-color': '#22c55e',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    })
    map.addLayer({
      id: 'search-results-labels',
      type: 'symbol',
      source: 'search-results',
      layout: {
        'text-field': ['get', 'title'],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
      },
      paint: { 'text-color': '#e6edf3', 'text-halo-color': '#0d1117', 'text-halo-width': 2 },
    })
  }

  const removeSearchResults = () => {
    if (map.getLayer('search-results-labels')) map.removeLayer('search-results-labels')
    if (map.getLayer('search-results-layer')) map.removeLayer('search-results-layer')
    if (map.getSource('search-results')) map.removeSource('search-results')
  }

  return {
    addRailway,
    removeRailway,
    addPower,
    removePower,
    addFirms,
    removeFirms,
    addGdacs,
    removeGdacs,
    addGeoconfirmed,
    removeGeoconfirmed,
    addUsgs,
    removeUsgs,
    addAcled,
    removeAcled,
    addAdsb,
    removeAdsb,
    addNoaaRadar,
    removeNoaaRadar,
    addSentinel2BurnScars,
    removeSentinel2BurnScars,
    updateSentinel2Time,
    addComms,
    removeComms,
    addFlockCameras,
    removeFlockCameras,
    addUtilityOutages,
    removeUtilityOutages,
    addAoiSaved,
    removeAoiSaved,
    addOverpassTemp,
    removeOverpassTemp,
    addMappedNews,
    removeMappedNews,
    addMappedOsint,
    removeMappedOsint,
    addMappedConflictEvents,
    removeMappedConflictEvents,
    addSearchResults,
    removeSearchResults,
  }
}

function sentinelTimeToIso(sentinelTime) {
  const d = new Date()
  if (sentinelTime === '24h') d.setDate(d.getDate() - 1)
  else if (sentinelTime === '1w') d.setDate(d.getDate() - 7)
  else if (sentinelTime === '1m') d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
}

const API_BASE = (import.meta.env?.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env?.DEV ? '' : 'http://localhost:3001')

export default function MapView({
  basemapId,
  layerToggles,
  isMapLoading,
  onLoadingChange,
  overpassResults,
  onOverpassResultsClear,
  sentinelTime = '24h',
  flyToTarget,
  onFlyToComplete,
  onSearchDataUpdate,
  layerFilterKeyword = '',
  searchResultsGeoJson = null,
  activeView = 'osint-map',
  eventCountry = null,
  eventFilterByView = false,
}) {
  const { user } = useAuth()
  const { places, addPlace, clearPlaces } = useSavedPlaces()
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const drawRef = useRef(null)
  const drawHandlerRef = useRef(null)
  const mapReadyRef = useRef(false)
  const layerTogglesRef = useRef(layerToggles)
  const sentinelTimeRef = useRef(sentinelTime)
  const activeViewRef = useRef(activeView)
  const eventFilterByViewRef = useRef(eventFilterByView)
  const moveendPendingRef = useRef(null)
  const tapPinModeRef = useRef(false)
  const lastCenterRef = useRef([0, 20])
  const lastZoomRef = useRef(2)
  const [mapBoundsKey, setMapBoundsKey] = useState(0)
  const [pointIcon, setPointIcon] = useState('📍')
  layerTogglesRef.current = layerToggles
  sentinelTimeRef.current = sentinelTime
  activeViewRef.current = activeView
  eventFilterByViewRef.current = eventFilterByView

  const [powerZoomWarning, setPowerZoomWarning] = useState(false)
  const [mapInstance, setMapInstance] = useState(null)
  const searchDataByLayerRef = useRef({})
  const onSearchDataUpdateRef = useRef(onSearchDataUpdate)
  onSearchDataUpdateRef.current = onSearchDataUpdate

  const buildSearchEntries = useCallback(() => {
    const entries = []
    Object.entries(searchDataByLayerRef.current).forEach(([layer, fc]) => {
      ;(fc.features || []).forEach((f, i) => {
        const c = f.geometry?.coordinates
        const lng = c?.[0]
        const lat = c?.[1]
        if (lng == null || lat == null) return
        const title =
          f.properties?.name ||
          f.properties?.title ||
          f.properties?.place ||
          f.properties?.eventname ||
          `${layer} ${i + 1}`
        entries.push({
          type: 'point',
          id: `${layer}-${i}`,
          title: String(title).slice(0, 80),
          searchText: String(title),
          lng,
          lat,
          layer,
          properties: f.properties,
        })
      })
    })
    return entries
  }, [])

  const pushSearchLayerRef = useRef(() => {})
  pushSearchLayerRef.current = (layer, geoJson) => {
    searchDataByLayerRef.current[layer] = geoJson || { type: 'FeatureCollection', features: [] }
    onSearchDataUpdateRef.current?.(buildSearchEntries())
  }

  const upsertSavedPointsLayer = useCallback((fc) => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return
    if (map.getSource('intel-saved-points')) {
      map.getSource('intel-saved-points').setData(fc)
      return
    }
    map.addSource('intel-saved-points', { type: 'geojson', data: fc })
    map.addLayer({
      id: 'intel-saved-points-base',
      type: 'circle',
      source: 'intel-saved-points',
      paint: {
        'circle-radius': 9,
        'circle-color': '#0d1117',
        'circle-stroke-color': '#30363d',
        'circle-stroke-width': 1.5,
      },
    })
    map.addLayer({
      id: 'intel-saved-points-layer',
      type: 'symbol',
      source: 'intel-saved-points',
      layout: {
        'text-field': ['coalesce', ['get', 'icon'], '📍'],
        'text-size': 14,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#e6edf3' },
    })
  }, [])

  const refreshSavedPointsLayer = useCallback(() => {
    if (user?.id) {
      const features = (places || []).map((p) => ({
        type: 'Feature',
        id: p.id,
        properties: { title: p.title || 'Saved point', icon: p.icon || '📍', source: p.list_name || 'My Places' },
        geometry: { type: 'Point', coordinates: [Number(p.lon), Number(p.lat)] },
      }))
      upsertSavedPointsLayer({ type: 'FeatureCollection', features })
      return
    }
    upsertSavedPointsLayer(getSavedPoints())
  }, [upsertSavedPointsLayer, user?.id, places])

  const addSavedPointAtCenter = useCallback(async () => {
    const map = mapRef.current
    if (!map) return
    const center = map.getCenter()
    const name = window.prompt('Point label (optional):', '') || ''
    const listName = window.prompt('List name (optional):', 'General') || 'General'
    if (user?.id) {
      await addPlace({
        title: name.trim() || 'Pinned place',
        lat: center.lat,
        lon: center.lng,
        icon: pointIcon || '📍',
        listName: listName.trim() || 'General',
      })
      return
    }
    const current = getSavedPoints()
    const feature = {
      type: 'Feature',
      id: `pt-${Date.now()}`,
      properties: {
        title: name.trim() || 'Saved point',
        icon: pointIcon || '📍',
        source: 'Saved Points',
      },
      geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
    }
    const next = { type: 'FeatureCollection', features: [...(current.features || []), feature] }
    setSavedPoints(next)
    upsertSavedPointsLayer(next)
  }, [pointIcon, upsertSavedPointsLayer, user?.id, addPlace])

  const clearSavedPoints = useCallback(async () => {
    if (user?.id) {
      await clearPlaces()
      return
    }
    const empty = { type: 'FeatureCollection', features: [] }
    setSavedPoints(empty)
    upsertSavedPointsLayer(empty)
  }, [upsertSavedPointsLayer, user?.id, clearPlaces])

  const doFetch = useCallback(
    (map, toggles, onLoading) => {
      if (!map || !map.getStyle) return
      const getRadarWanted = () => layerTogglesRef.current?.noaaRadar === true
      const helpers = addOrUpdateLayer(map, toggles, onLoading, getRadarWanted)
      const bbox = () => {
        const b = map.getBounds()
        return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
      }

      if (toggles.openRailwayMap) helpers.addRailway()
      else helpers.removeRailway()

      if (toggles.powerGrid) {
        const zoom = map.getZoom()
        if (zoom >= MIN_POWER_ZOOM) {
          setPowerZoomWarning(false)
          onLoading?.(true)
          fetchOverpassPower(bbox())
            .then((geoJson) => {
              helpers.addPower(geoJson)
              pushSearchLayerRef.current('power', geoJson)
            })
            .catch(() => {
              helpers.addPower({ type: 'FeatureCollection', features: [] })
              pushSearchLayerRef.current('power', { type: 'FeatureCollection', features: [] })
            })
            .finally(() => onLoading?.(false))
        } else {
          helpers.removePower()
          setPowerZoomWarning(true)
        }
      } else {
        helpers.removePower()
        setPowerZoomWarning(false)
      }

      if (toggles.liveWildfires) {
        onLoading?.(true)
        fetchNasaFirmsArea(bbox())
          .then((geoJson) => {
            helpers.addFirms(geoJson)
            pushSearchLayerRef.current('firms', geoJson)
          })
          .catch(() => {
            helpers.addFirms({ type: 'FeatureCollection', features: [] })
            pushSearchLayerRef.current('firms', { type: 'FeatureCollection', features: [] })
          })
          .finally(() => onLoading?.(false))
      } else helpers.removeFirms()

      if (toggles.gdacs) {
        onLoading?.(true)
        fetchGdacsEvents(bbox())
          .then((geoJson) => {
            helpers.addGdacs(geoJson)
            pushSearchLayerRef.current('gdacs', geoJson)
          })
          .catch(() => {
            helpers.addGdacs({ type: 'FeatureCollection', features: [] })
            pushSearchLayerRef.current('gdacs', { type: 'FeatureCollection', features: [] })
          })
          .finally(() => onLoading?.(false))
      } else helpers.removeGdacs()

      if (toggles.geoconfirmed) {
        onLoading?.(true)
        fetchGeoconfirmed(bbox())
          .then((geoJson) => {
            helpers.addGeoconfirmed(geoJson)
            pushSearchLayerRef.current('geoconfirmed', geoJson)
          })
          .catch(() => {
            helpers.addGeoconfirmed({ type: 'FeatureCollection', features: [] })
            pushSearchLayerRef.current('geoconfirmed', { type: 'FeatureCollection', features: [] })
          })
          .finally(() => onLoading?.(false))
      } else helpers.removeGeoconfirmed()

      if (toggles.usgsEarthquakes) {
        onLoading?.(true)
        fetchUsgsEarthquakes(bbox())
          .then((geoJson) => {
            helpers.addUsgs(geoJson)
            pushSearchLayerRef.current('usgs', geoJson)
          })
          .catch(() => {
            helpers.addUsgs({ type: 'FeatureCollection', features: [] })
            pushSearchLayerRef.current('usgs', { type: 'FeatureCollection', features: [] })
          })
          .finally(() => onLoading?.(false))
      } else helpers.removeUsgs()

      if (toggles.acled) {
        onLoading?.(true)
        fetchAcled(bbox())
          .then((geoJson) => {
            helpers.addAcled(geoJson)
            pushSearchLayerRef.current('acled', geoJson)
          })
          .catch(() => {
            helpers.addAcled({ type: 'FeatureCollection', features: [] })
            pushSearchLayerRef.current('acled', { type: 'FeatureCollection', features: [] })
          })
          .finally(() => onLoading?.(false))
      } else helpers.removeAcled()

      if (toggles.adsbAircraft) {
        helpers.addAdsb()
        const center = map.getCenter()
        onLoading?.(true)
        fetchAdsbRapidApi(center.lat, center.lng)
          .then((fc) => {
            if (map.getSource('intel-adsb')) map.getSource('intel-adsb').setData(fc)
          })
          .catch(() => {})
          .finally(() => onLoading?.(false))
      } else helpers.removeAdsb()

      if (toggles.noaaRadar) helpers.addNoaaRadar()
      else helpers.removeNoaaRadar()

      if (toggles.sentinel2BurnScars) {
        const timeIso = sentinelTimeToIso(sentinelTimeRef.current || '24h')
        helpers.addSentinel2BurnScars(null, timeIso)
      } else helpers.removeSentinel2BurnScars()

      if (toggles.commsInfrastructure) {
        onLoading?.(true)
        fetchOverpassCellTowers(bbox())
          .then((geoJson) => {
            helpers.addComms(geoJson)
            pushSearchLayerRef.current('comms', geoJson)
          })
          .catch(() => {
            helpers.addComms({ type: 'FeatureCollection', features: [] })
            pushSearchLayerRef.current('comms', { type: 'FeatureCollection', features: [] })
          })
          .finally(() => onLoading?.(false))
      } else helpers.removeComms()

      if (toggles.utilityOutages) {
        onLoading?.(true)
        fetchUtilityOutages()
          .then((geoJson) => {
            helpers.addUtilityOutages(geoJson)
            pushSearchLayerRef.current('outages', geoJson)
          })
          .catch(() => {
            helpers.addUtilityOutages({ type: 'FeatureCollection', features: [] })
            pushSearchLayerRef.current('outages', { type: 'FeatureCollection', features: [] })
          })
          .finally(() => onLoading?.(false))
      } else helpers.removeUtilityOutages()

      if (toggles.aoiDraw) {
        const aoi = getAoiFeatures()
        helpers.addAoiSaved(aoi)
        if (!drawRef.current) {
          const draw = new MapboxDraw({
            displayControlsDefault: false,
            controls: { polygon: true, trash: true, line_string: true, point: false },
          })
          map.addControl(draw)
          drawRef.current = draw
          const saved = getAoiFeatures()
          if (saved.features?.length) draw.set(saved)

          const onDrawChange = () => {
            const data = draw.getAll()
            setAoiFeatures(data)
            if (map.getSource('intel-aoi-saved')) map.getSource('intel-aoi-saved').setData(data)
          }
          map.on('draw.create', onDrawChange)
          map.on('draw.update', onDrawChange)
          map.on('draw.delete', onDrawChange)
          drawHandlerRef.current = onDrawChange
        }
      } else {
        if (drawRef.current) {
          const h = drawHandlerRef.current
          if (h) {
            map.off('draw.create', h)
            map.off('draw.update', h)
            map.off('draw.delete', h)
            drawHandlerRef.current = null
          }
          map.removeControl(drawRef.current)
          drawRef.current = null
        }
        helpers.removeAoiSaved()
      }
    },
    []
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const basemap = BASEMAPS.find((b) => b.id === basemapId)
    if (!basemap || basemap.type === 'placeholder') return

    const style =
      basemap.type === 'raster'
        ? buildRasterStyle(basemap)
        : basemap.type === 'hybrid'
          ? buildHybridStyle(basemap)
          : OSM_STYLE

    const center = lastCenterRef.current
    const zoom = lastZoomRef.current
    const map = new maplibregl.Map({
      container,
      style,
      center: Array.isArray(center) && center.length >= 2 ? center : [0, 20],
      zoom: typeof zoom === 'number' && zoom >= 0 ? zoom : 2,
      transformRequest: (url, resourceType) => {
        if (resourceType === 'Source' && url && url.includes('openstreetmap')) {
          return { url, headers: { 'User-Agent': 'SuperMap/1.0 (https://github.com/supermap)' } }
        }
      },
    })

    mapRef.current = map
    mapReadyRef.current = false

    const locationRequested = localStorage.getItem(STORAGE_KEYS.LOCATION_REQUESTED) === 'true'
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      className: 'maplibre-popup-dark',
    })

    const handleMapClick = (e) => {
      if (tapPinModeRef.current) {
        const lng = Number(e?.lngLat?.lng)
        const lat = Number(e?.lngLat?.lat)
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          const name = window.prompt('Pin title (optional):', '') || ''
          const listName = window.prompt('List name:', 'General') || 'General'
          if (user?.id) {
            addPlace({
              title: name.trim() || 'Pinned place',
              lat,
              lon: lng,
              icon: pointIcon || '📍',
              listName: listName.trim() || 'General',
            }).catch(() => {})
          } else {
            const current = getSavedPoints()
            const feature = {
              type: 'Feature',
              id: `pt-${Date.now()}`,
              properties: { title: name.trim() || 'Saved point', icon: pointIcon || '📍', source: listName.trim() || 'General' },
              geometry: { type: 'Point', coordinates: [lng, lat] },
            }
            const next = { type: 'FeatureCollection', features: [...(current.features || []), feature] }
            setSavedPoints(next)
            upsertSavedPointsLayer(next)
          }
        }
        return
      }
      const features = map.queryRenderedFeatures(e.point, { layers: CLICKABLE_POINT_LAYERS })
      const feat = features[0]
      if (!feat) return
      const coords = feat.geometry?.type === 'Point' ? feat.geometry.coordinates.slice() : null
      if (!coords) return
      const props = feat.properties || {}
      let html
      if (feat.layer.id === 'search-results-layer' || feat.layer.id === 'mapped-news-layer' || feat.layer.id === 'mapped-osint-layer' || feat.layer.id === 'mapped-conflict-events-layer' || feat.layer.id === 'intel-geoconfirmed-layer') {
        const title = props.title || 'Untitled'
        const link = props.link ? `<a href="${props.link}" target="_blank" rel="noopener noreferrer" class="map-popup-read-more">Read More</a>` : ''
        html = `<div class="map-popup-content"><div class="map-popup-title">${title}</div><div class="map-popup-source">${props.source || ''}</div>${link}</div>`
      } else {
        const entries = Object.entries(props).filter(([, v]) => v != null && String(v).trim() !== '')
        html = entries.length
          ? `<div class="map-popup-content">${entries.map(([k, v]) => `<div><strong>${k}</strong>: ${String(v)}</div>`).join('')}</div>`
          : '<div class="map-popup-content">No properties</div>'
      }
      popup.setLngLat(coords).setHTML(html).addTo(map)
    }

    const handleMapMousemove = (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: CLICKABLE_POINT_LAYERS })
      map.getCanvas().style.cursor = features.length ? 'pointer' : ''
    }

    map.on('load', () => {
      map.resize()
      requestAnimationFrame(() => {
        map.resize()
      })
      mapReadyRef.current = true
      setMapInstance(map)
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), 'bottom-left')
      const b = map.getBounds()
      window.__supermapOverpassBbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
      doFetch(map, layerTogglesRef.current || {}, onLoadingChange)
      refreshSavedPointsLayer()
      map.on('click', handleMapClick)
      map.on('mousemove', handleMapMousemove)

      if (!locationRequested) {
        localStorage.setItem(STORAGE_KEYS.LOCATION_REQUESTED, 'true')
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              map.flyTo({
                center: [pos.coords.longitude, pos.coords.latitude],
                zoom: 10,
                duration: 1500,
              })
            },
            () => {
              map.flyTo({ center: [0, 20], zoom: 2 })
            }
          )
        }
      }
    })

    const onMoveend = () => {
      try {
        const c = map.getCenter()
        lastCenterRef.current = [c.lng, c.lat]
        lastZoomRef.current = map.getZoom()
      } catch (_) {}
      if (activeViewRef.current === 'conflict-map' && eventFilterByViewRef.current) {
        setMapBoundsKey((k) => k + 1)
      }
      window.__supermapOverpassBbox = (() => {
        const b = map.getBounds()
        return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
      })()
      const toggles = layerTogglesRef.current || {}
      const needsRefresh =
        toggles.liveWildfires ||
        toggles.gdacs ||
        toggles.geoconfirmed ||
        toggles.usgsEarthquakes ||
        toggles.acled ||
        toggles.adsbAircraft ||
        toggles.commsInfrastructure ||
        (toggles.powerGrid && map.getZoom() >= MIN_POWER_ZOOM)
      if (needsRefresh) doFetch(map, toggles, onLoadingChange)
    }

    map.on('moveend', onMoveend)
    const onTapPinToggle = (ev) => {
      tapPinModeRef.current = !!ev?.detail?.enabled
      map.getCanvas().style.cursor = tapPinModeRef.current ? 'crosshair' : ''
    }
    window.addEventListener('supermap-toggle-tap-pin', onTapPinToggle)

    const containerEl = containerRef.current
    const resizeObserver =
      containerEl && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => mapRef.current?.resize?.())
        : null
    if (resizeObserver && containerEl) resizeObserver.observe(containerEl)

    return () => {
      if (resizeObserver && containerEl) resizeObserver.unobserve(containerEl)
      map.off('click', handleMapClick)
      map.off('mousemove', handleMapMousemove)
      popup.remove()
      if (drawRef.current) {
        const h = drawHandlerRef.current
        if (h) {
          map.off('draw.create', h)
          map.off('draw.update', h)
          map.off('draw.delete', h)
        }
        map.removeControl(drawRef.current)
        drawRef.current = null
      }
      if (map.getLayer('intel-saved-points-layer')) map.removeLayer('intel-saved-points-layer')
      if (map.getLayer('intel-saved-points-base')) map.removeLayer('intel-saved-points-base')
      if (map.getSource('intel-saved-points')) map.removeSource('intel-saved-points')
      map.off('moveend', onMoveend)
      window.removeEventListener('supermap-toggle-tap-pin', onTapPinToggle)
      map.remove()
      mapRef.current = null
      mapReadyRef.current = false
      setMapInstance(null)
    }
  }, [basemapId, doFetch, onLoadingChange, refreshSavedPointsLayer, user?.id, addPlace, pointIcon, upsertSavedPointsLayer])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return

    const onStyleData = () => {
      if (!map.isStyleLoaded() || !mapReadyRef.current) return
      doFetch(map, layerToggles || {}, onLoadingChange)
    }

    if (map.isStyleLoaded()) doFetch(map, layerToggles || {}, onLoadingChange)

    map.on('styledata', onStyleData)
    return () => map.off('styledata', onStyleData)
  }, [layerToggles, doFetch, onLoadingChange])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getStyle) return

    const zoom = map.getZoom()
    if (layerToggles.powerGrid && zoom < MIN_POWER_ZOOM) {
      setPowerZoomWarning(true)
    } else {
      setPowerZoomWarning(false)
    }

    const onZoom = () => {
      const z = map.getZoom()
      if (layerTogglesRef.current?.powerGrid && z < MIN_POWER_ZOOM) {
        setPowerZoomWarning(true)
      } else {
        setPowerZoomWarning(false)
      }
    }
    map.on('zoom', onZoom)
    return () => map.off('zoom', onZoom)
  }, [layerToggles?.powerGrid])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getStyle?.()) return

    const helpers = addOrUpdateLayer(map, layerToggles || {}, onLoadingChange)
    if (overpassResults) {
      helpers.addOverpassTemp(overpassResults)
    } else {
      helpers.removeOverpassTemp()
    }
  }, [overpassResults])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current || !map.getStyle()?.layers?.length) return
    const helpers = addOrUpdateLayer(map, layerToggles || {}, onLoadingChange)
    if (searchResultsGeoJson?.features?.length) {
      helpers.addSearchResults(searchResultsGeoJson)
    } else {
      helpers.removeSearchResults()
    }
  }, [searchResultsGeoJson])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current || !flyToTarget) return
    const { lng, lat, zoom = 12, properties } = flyToTarget
    if (typeof lng !== 'number' || typeof lat !== 'number') return
    map.flyTo({ center: [lng, lat], zoom, duration: 1500 })
    const onMoveend = () => {
      onFlyToComplete?.()
    }
    map.once('moveend', onMoveend)
    if (properties && Object.keys(properties).length > 0) {
      const html = `<div class="map-popup-content">${Object.entries(properties)
        .map(([k, v]) => `<div><strong>${k}</strong>: ${String(v)}</div>`)
        .join('')}</div>`
      const popup = new maplibregl.Popup({ closeButton: true, className: 'maplibre-popup-dark' })
        .setLngLat([lng, lat])
        .setHTML(html)
        .addTo(map)
      setTimeout(() => popup.remove(), 8000)
    }
  }, [flyToTarget, mapInstance, onFlyToComplete])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current || !layerToggles.sentinel2BurnScars) return
    const helpers = addOrUpdateLayer(map, layerToggles || {}, onLoadingChange)
    const timeIso = sentinelTimeToIso(sentinelTime)
    helpers.updateSentinel2Time(null, timeIso)
  }, [sentinelTime, layerToggles?.sentinel2BurnScars])

  const newsOsintCacheRef = useRef({ news: null, osint: null })

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current || !map.getStyle()?.layers?.length) return

    const keyword = (layerFilterKeyword || '').trim().toLowerCase()
    const filterItem = (item) => {
      if (!keyword) return true
      const t = (item.title || '').toLowerCase()
      const s = (item.source || '').toLowerCase()
      const c = (item.contentSnippet || '').toLowerCase()
      return t.includes(keyword) || s.includes(keyword) || c.includes(keyword)
    }

    const buildGeoJsonFromItems = (items) => {
      const features = items
        .filter((item) => Array.isArray(item.coordinates) && item.coordinates.length >= 2)
        .filter(filterItem)
        .map((item, i) => ({
          type: 'Feature',
          id: i,
          properties: {
            title: item.title || '',
            link: item.link || '',
            source: item.source || '',
            label: (item.source || 'Item') + ': ' + (item.title || '').slice(0, 30),
          },
          geometry: { type: 'Point', coordinates: item.coordinates },
        }))
      return { type: 'FeatureCollection', features }
    }

    const toNewsOsintGeoJson = (data) => {
      if (data?.features && Array.isArray(data.features)) {
        return {
          type: 'FeatureCollection',
          features: data.features
            .filter((f) => f.geometry?.coordinates?.length >= 2)
            .filter((f) => filterItem({ title: f.properties?.title, source: f.properties?.source, contentSnippet: f.properties?.description }))
            .map((f) => ({
              ...f,
              properties: {
                ...f.properties,
                label: (f.properties?.source || '') + ': ' + (f.properties?.title || '').slice(0, 30),
              },
            })),
        }
      }
      return buildGeoJsonFromItems(Array.isArray(data) ? data : [])
    }

    const emptyFC = () => ({ type: 'FeatureCollection', features: [] })
    const helpers = addOrUpdateLayer(map, layerToggles || {}, onLoadingChange)

    if (activeView === 'conflict-map') {
      let url = `${API_BASE}/api/events?highConfidenceOnly=1&limit=200`
      if (eventCountry && eventCountry.trim()) url += `&country=${encodeURIComponent(eventCountry.trim())}`
      if (eventFilterByView && map.getBounds) {
        try {
          const b = map.getBounds()
          const w = b.getWest()
          const s = b.getSouth()
          const e = b.getEast()
          const n = b.getNorth()
          url += `&bbox=${w},${s},${e},${n}`
        } catch (_) {}
      }
      onLoadingChange?.(true)
      fetch(url)
        .then((r) => r.json())
        .then((geo) => {
          if (mapRef.current && mapReadyRef.current) {
            helpers.addMappedConflictEvents(geo && geo.features ? geo : emptyFC())
            helpers.addMappedNews(emptyFC())
            helpers.addMappedOsint(emptyFC())
          }
        })
        .catch(() => {
          if (mapRef.current && mapReadyRef.current) {
            helpers.addMappedConflictEvents(emptyFC())
            helpers.addMappedNews(emptyFC())
            helpers.addMappedOsint(emptyFC())
          }
        })
        .finally(() => onLoadingChange?.(false))
      return
    }

    const applyLayers = (newsData, osintData) => {
      try {
        helpers.addMappedNews(toNewsOsintGeoJson(newsData))
        helpers.addMappedOsint(toNewsOsintGeoJson(osintData))
        helpers.removeMappedConflictEvents()
      } catch (e) {
        console.warn('[MapView] applyLayers (news/osint) failed', e)
      }
    }

    if (newsOsintCacheRef.current.news !== null && newsOsintCacheRef.current.osint !== null) {
      applyLayers(newsOsintCacheRef.current.news, newsOsintCacheRef.current.osint)
      return
    }

    const fetchNews = API_BASE
      ? fetch(`${API_BASE}/api/news`).then((r) => r.json()).catch(emptyFC)
      : Promise.resolve(emptyFC())
    const fetchOsint = API_BASE
      ? fetch(`${API_BASE}/api/osint`).then((r) => r.json()).catch(emptyFC)
      : Promise.resolve(emptyFC())

    Promise.all([fetchNews, fetchOsint]).then(([news, osint]) => {
      newsOsintCacheRef.current = { news: news || emptyFC(), osint: osint || emptyFC() }
      if (mapRef.current && mapReadyRef.current) {
        applyLayers(newsOsintCacheRef.current.news, newsOsintCacheRef.current.osint)
      }
    })
  }, [mapInstance, layerFilterKeyword, layerToggles, activeView, eventCountry, eventFilterByView, mapBoundsKey])

  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current) return
    refreshSavedPointsLayer()
  }, [refreshSavedPointsLayer, user?.id, places])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const handler = (e) => {
      if (map?.getSource?.('intel-adsb') && e.detail?.type === 'FeatureCollection') {
        map.getSource('intel-adsb').setData(e.detail)
      }
    }
    window.addEventListener('supermap-adsb-data', handler)
    return () => window.removeEventListener('supermap-adsb-data', handler)
  }, [])

  const basemap = BASEMAPS.find((b) => b.id === basemapId)
  if (basemap?.type === 'placeholder') {
    return (
      <div className="map-view map-view-placeholder">
        <div className="map-placeholder-message">
          <strong>{basemap.label}</strong>
          <span>{basemap.description}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="map-view-wrapper" style={{ minHeight: 'calc(100vh - 140px)' }}>
      <div
        ref={containerRef}
        className="map-view map-container"
        style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 140px)' }}
      />
      <div className="map-crosshair" aria-hidden="true" />
      <MapControls map={mapInstance} />
      <DrawHUD
        drawRef={drawRef}
        visible={!!layerToggles.aoiDraw}
        onAddPoint={addSavedPointAtCenter}
        onClearPoints={clearSavedPoints}
        pointIcon={pointIcon}
        onPointIconChange={setPointIcon}
      />
      {powerZoomWarning && (
        <div className="map-zoom-warning">
          Zoom in to level 14+ to load infrastructure data
        </div>
      )}
      {isMapLoading && (
        <div className="map-loading-spinner" aria-label="Loading">
          <div className="spinner" />
        </div>
      )}
    </div>
  )
}
