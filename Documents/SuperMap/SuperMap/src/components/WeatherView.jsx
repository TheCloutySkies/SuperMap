import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CloudRain, Droplets, Gauge, Wind } from 'lucide-react'
import { geocodePlaceQuery } from '../lib/placeGeocoding'
import WeatherHourlyChart from './WeatherHourlyChart'
import WmoIcon from './WmoIcon'
import { compassFromDeg, wmoKind } from './weatherWmo'
import ItemMenu from '../features/accounts/ItemMenu'
import './WeatherView.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : (import.meta.env.DEV ? '' : 'http://localhost:3001')

const SPANS = [
  { id: 'now', label: 'Now', hours: 0 },
  { id: '24h', label: '24h', hours: 24 },
  { id: '48h', label: '48h', hours: 48 },
  { id: '7d', label: '7-day', hours: 168 },
]

const PANEL_TABS = [
  { id: 'air', label: 'Air quality' },
  { id: 'marine', label: 'Marine' },
  { id: 'flood', label: 'Flood' },
  { id: 'satellite', label: 'Satellite radiation' },
  { id: 'historical', label: 'Historical' },
]

const RADAR_LAYERS = [
  { id: 'precip', label: 'Precipitation' },
  { id: 'wind', label: 'Wind' },
  { id: 'temp', label: 'Temperature' },
  { id: 'severe', label: 'Severe' },
  { id: 'tropical', label: 'Tropical' },
]

const BASEMAP_STYLE = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri, OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'basemap', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 19 }],
}

const WMO_LABELS = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Violent showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm + hail',
  99: 'Severe thunderstorm',
}

const LOCATION_STORAGE_KEY = 'supermap-weather-location'

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `${path} → ${res.status}`)
  }
  return res.json()
}

function wmoLabel(code) {
  if (code == null) return '—'
  return WMO_LABELS[code] || `WMO ${code}`
}

function fmtTempC(c, unit = 'F') {
  if (c == null || Number.isNaN(Number(c))) return '—'
  const n = Number(c)
  return unit === 'F' ? `${Math.round((n * 9) / 5 + 32)}°F` : `${Math.round(n)}°C`
}

function fmtWind(kmh, unit = 'mph') {
  if (kmh == null || Number.isNaN(Number(kmh))) return '—'
  const n = Number(kmh)
  return unit === 'mph' ? `${(n * 0.621371).toFixed(0)} mph` : `${n.toFixed(0)} km/h`
}

function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${Math.round(Number(n))}%`
}

function fmtMm(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${Number(n).toFixed(1)} mm`
}

function fmtHpa(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${Math.round(Number(n))} hPa`
}

function fmtWindWithDir(speed, deg) {
  const speedLabel = fmtWind(speed)
  const dir = compassFromDeg(deg)
  if (speedLabel === '—') return dir || '—'
  return dir ? `${speedLabel} ${dir}` : speedLabel
}

function hourTick(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric' })
  } catch {
    return String(iso)
  }
}

function toDisplayTemp(c, unit = 'F') {
  if (c == null || Number.isNaN(Number(c))) return null
  const n = Number(c)
  return unit === 'F' ? (n * 9) / 5 + 32 : n
}

function buildHourlyChartData({ span, hourly, daily, tempUnit }) {
  if (span === '7d') {
    const days = daily?.time || []
    return days.slice(0, 7).map((iso, i) => ({
      hour: formatDay(iso),
      temp: toDisplayTemp(daily.temperature_2m_max?.[i], tempUnit),
      precip: Number(daily.precipitation_probability_max?.[i]) || 0,
    }))
  }
  const times = hourly?.time || []
  if (!times.length) return []
  const hours = span === 'now' ? 8 : span === '48h' ? 48 : 24
  return times.slice(0, hours).map((iso, i) => ({
    hour: hourTick(iso),
    temp: toDisplayTemp(hourly.temperature_2m?.[i], tempUnit),
    precip: Number(hourly.precipitation_probability?.[i]) || 0,
  }))
}

function buildDailyStrip(daily, tempUnit) {
  const days = daily?.time || []
  return days.slice(0, 7).map((day, i) => ({
    id: `d-${day}`,
    title: formatDay(day),
    code: daily.weather_code?.[i],
    hi: fmtTempC(daily.temperature_2m_max?.[i], tempUnit),
    lo: fmtTempC(daily.temperature_2m_min?.[i], tempUnit),
    precip: fmtPct(daily.precipitation_probability_max?.[i]),
  }))
}

function shortPlace(label) {
  if (!label) return 'Selected location'
  const parts = String(label).split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`
  return parts[0] || 'Selected location'
}

function alertItemsFromFc(fc) {
  return (fc?.features || []).slice(0, 5).map((f, i) => ({
    id: f.id || `alert-${i}`,
    title: f.properties?.event || f.properties?.headline || 'Weather alert',
    detail: f.properties?.headline || f.properties?.description || '',
  }))
}

function emptyFC() {
  return { type: 'FeatureCollection', features: [] }
}

function readStoredLocation() {
  try {
    const raw = sessionStorage.getItem(LOCATION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Number.isFinite(parsed?.lat) || !Number.isFinite(parsed?.lon)) return null
    return parsed
  } catch {
    return null
  }
}

function storeLocation(lat, lon, label) {
  try {
    sessionStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ lat, lon, label }))
  } catch {
    /* ignore */
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-wx-src="${src}"]`)
    if (existing) {
      if (existing.dataset.loaded === '1') resolve()
      else existing.addEventListener('load', () => resolve(), { once: true })
      return
    }
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.dataset.wxSrc = src
    el.onload = () => {
      el.dataset.loaded = '1'
      resolve()
    }
    el.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(el)
  })
}

function loadStylesheet(href) {
  if (document.querySelector(`link[data-wx-href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.wxHref = href
  document.head.appendChild(link)
}

function setRasterVisible(map, sourceId, layerId, visible, tileUrl, attribution) {
  if (!map) return
  if (!visible) {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
    return
  }
  if (!tileUrl) return
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'raster',
      tiles: [tileUrl],
      tileSize: 256,
      maxzoom: 12,
      attribution: attribution || '',
    })
  }
  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: { 'raster-opacity': 0.65 },
    })
  }
}

function setGeoJsonLayer(map, sourceId, layerId, geojson, paint, type = 'fill') {
  if (!map) return
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: 'geojson', data: geojson || emptyFC() })
  } else {
    map.getSource(sourceId).setData(geojson || emptyFC())
  }
  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type,
      source: sourceId,
      paint,
    })
  }
}

export default function WeatherView({ initialLat, initialLon, onLocationChange }) {
  const stored = typeof window !== 'undefined' ? readStoredLocation() : null
  const hasPropLocation = Number.isFinite(initialLat) && Number.isFinite(initialLon)

  const [locationReady, setLocationReady] = useState(Boolean(hasPropLocation || stored))
  const [locationPrompt, setLocationPrompt] = useState(!hasPropLocation && !stored)
  const [geoStatus, setGeoStatus] = useState(hasPropLocation || stored ? 'ready' : 'pending')
  const [lat, setLat] = useState(
    hasPropLocation ? initialLat : (stored?.lat ?? null),
  )
  const [lon, setLon] = useState(
    hasPropLocation ? initialLon : (stored?.lon ?? null),
  )
  const [placeLabel, setPlaceLabel] = useState(
    hasPropLocation ? 'Selected location' : (stored?.label || ''),
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [searchError, setSearchError] = useState(null)
  const [span, setSpan] = useState('24h')
  const [forecast, setForecast] = useState(null)
  const [forecastError, setForecastError] = useState(null)
  const [loadingForecast, setLoadingForecast] = useState(false)
  const [panel, setPanel] = useState(null)
  const [panelData, setPanelData] = useState(null)
  const [panelError, setPanelError] = useState(null)
  const [loadingPanel, setLoadingPanel] = useState(false)
  const [radarMeta, setRadarMeta] = useState(null)
  const [radarToggles, setRadarToggles] = useState({
    precip: true,
    wind: false,
    temp: false,
    severe: false,
    tropical: false,
  })
  const [alertsFc, setAlertsFc] = useState(emptyFC())
  const [tropicalFc, setTropicalFc] = useState(emptyFC())
  const [tempUnit, setTempUnit] = useState('F')
  const [mapFullscreen, setMapFullscreen] = useState(false)
  const [windyStatus, setWindyStatus] = useState(null)
  const [windyError, setWindyError] = useState(null)

  const mapContainerRef = useRef(null)
  const mapShellRef = useRef(null)
  const windyContainerRef = useRef(null)
  const mapRef = useRef(null)
  const readyRef = useRef(false)
  const windyMapRef = useRef(null)
  const windyApiRef = useRef(null)
  const radarTogglesRef = useRef(radarToggles)
  const radarMetaRef = useRef(radarMeta)
  const alertsRef = useRef(alertsFc)
  const tropicalRef = useRef(tropicalFc)
  const latLonRef = useRef({ lat, lon })

  radarTogglesRef.current = radarToggles
  radarMetaRef.current = radarMeta
  alertsRef.current = alertsFc
  tropicalRef.current = tropicalFc
  latLonRef.current = { lat, lon }

  const applyLocation = useCallback((nextLat, nextLon, label) => {
    setLat(nextLat)
    setLon(nextLon)
    setLocationReady(true)
    setLocationPrompt(false)
    setGeoStatus('ready')
    setSearchError(null)
    const nextLabel = label || 'Selected location'
    setPlaceLabel(nextLabel)
    storeLocation(nextLat, nextLon, nextLabel)
    onLocationChange?.(nextLat, nextLon)
    const map = mapRef.current
    if (map && readyRef.current) {
      map.easeTo({ center: [nextLon, nextLat], zoom: Math.max(map.getZoom(), 6) })
    }
    const windyMap = windyMapRef.current
    if (windyMap?.setView) {
      windyMap.setView([nextLat, nextLon], Math.max(windyMap.getZoom?.() || 5, 6))
    }
  }, [onLocationChange])

  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus('unsupported')
      setLocationPrompt(true)
      return
    }
    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyLocation(pos.coords.latitude, pos.coords.longitude, 'Current location')
      },
      () => {
        setGeoStatus('denied')
        setLocationPrompt(true)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }, [applyLocation])

  // On open: use props / session, else try geolocation, else prompt.
  useEffect(() => {
    if (hasPropLocation) {
      applyLocation(initialLat, initialLon, 'Selected location')
      return
    }
    if (stored) {
      setLocationReady(true)
      setLocationPrompt(false)
      setGeoStatus('ready')
      return
    }
    requestGeolocation()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!Number.isFinite(initialLat) || !Number.isFinite(initialLon)) return
    if (initialLat === lat && initialLon === lon) return
    applyLocation(initialLat, initialLon, 'Selected location')
  }, [initialLat, initialLon]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!locationReady || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined
    let cancelled = false
    setLoadingForecast(true)
    setForecastError(null)
    getJson(`/api/weather/forecast?lat=${lat}&lon=${lon}&days=7`)
      .then((data) => {
        if (!cancelled) setForecast(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setForecast(null)
          setForecastError(err.message || 'Forecast failed')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingForecast(false)
      })
    return () => { cancelled = true }
  }, [lat, lon, locationReady])

  useEffect(() => {
    if (!panel || !locationReady || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined
    let cancelled = false
    setLoadingPanel(true)
    setPanelError(null)
    setPanelData(null)
    const paths = {
      air: `/api/weather/air-quality?lat=${lat}&lon=${lon}`,
      marine: `/api/weather/marine?lat=${lat}&lon=${lon}`,
      flood: `/api/weather/flood?lat=${lat}&lon=${lon}`,
      satellite: `/api/weather/satellite-radiation?lat=${lat}&lon=${lon}`,
      historical: `/api/weather/historical?lat=${lat}&lon=${lon}`,
    }
    getJson(paths[panel])
      .then((data) => {
        if (!cancelled) setPanelData(data)
      })
      .catch((err) => {
        if (!cancelled) setPanelError(err.message || 'Panel failed')
      })
      .finally(() => {
        if (!cancelled) setLoadingPanel(false)
      })
    return () => { cancelled = true }
  }, [lat, lon, panel, locationReady])

  useEffect(() => {
    let cancelled = false
    getJson('/api/weather/radar/meta')
      .then((data) => { if (!cancelled) setRadarMeta(data) })
      .catch(() => { if (!cancelled) setRadarMeta(null) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!locationReady || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined
    let cancelled = false
    Promise.all([
      getJson(`/api/weather/alerts?lat=${lat}&lon=${lon}`).catch(() => null),
      getJson('/api/hazards/nhc').catch(() => null),
    ]).then(([alerts, nhc]) => {
      if (cancelled) return
      const alertFeatures = Array.isArray(alerts?.alerts?.features)
        ? alerts.alerts.features
        : []
      setAlertsFc({ type: 'FeatureCollection', features: alertFeatures.filter((f) => f?.geometry) })
      const tropFeatures = Array.isArray(nhc?.features) ? nhc.features : []
      setTropicalFc({ type: 'FeatureCollection', features: tropFeatures.filter((f) => f?.geometry) })
    })
    return () => { cancelled = true }
  }, [lat, lon, locationReady])

  const syncRadarLayers = useCallback(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const toggles = radarTogglesRef.current
    const meta = radarMetaRef.current
    const precipUrl = meta?.rainviewer?.precipTiles || meta?.openWeatherMapTiles?.precipitation
    const tempUrl = meta?.openWeatherMapTiles?.temperature
    // Wind uses Windy Map Forecast (separate canvas). OWM wind tiles only if Windy unavailable.
    const useOwmWind = Boolean(toggles.wind && !meta?.windyConfigured && meta?.openWeatherMapTiles?.wind)
    const windUrl = useOwmWind ? meta.openWeatherMapTiles.wind : null

    setRasterVisible(
      map,
      'wx-precip',
      'wx-precip-layer',
      toggles.precip,
      precipUrl,
      meta?.rainviewer?.attribution || meta?.openWeatherMapTiles?.attribution,
    )
    setRasterVisible(
      map,
      'wx-wind',
      'wx-wind-layer',
      useOwmWind,
      windUrl,
      meta?.openWeatherMapTiles?.attribution,
    )
    setRasterVisible(
      map,
      'wx-temp',
      'wx-temp-layer',
      toggles.temp,
      tempUrl,
      meta?.openWeatherMapTiles?.attribution,
    )

    if (toggles.severe) {
      setGeoJsonLayer(map, 'wx-severe', 'wx-severe-fill', alertsRef.current, {
        'fill-color': '#e04545',
        'fill-opacity': 0.28,
        'fill-outline-color': '#ff8a8a',
      })
      if (!map.getLayer('wx-severe-line')) {
        map.addLayer({
          id: 'wx-severe-line',
          type: 'line',
          source: 'wx-severe',
          paint: { 'line-color': '#ff6b6b', 'line-width': 1.5 },
        })
      }
    } else {
      if (map.getLayer('wx-severe-line')) map.removeLayer('wx-severe-line')
      if (map.getLayer('wx-severe-fill')) map.removeLayer('wx-severe-fill')
      if (map.getSource('wx-severe')) map.removeSource('wx-severe')
    }

    if (toggles.tropical) {
      setGeoJsonLayer(map, 'wx-tropical', 'wx-tropical-circle', tropicalRef.current, {
        'circle-radius': 8,
        'circle-color': '#f0a030',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff3d0',
      }, 'circle')
    } else {
      if (map.getLayer('wx-tropical-circle')) map.removeLayer('wx-tropical-circle')
      if (map.getSource('wx-tropical')) map.removeSource('wx-tropical')
    }
  }, [])

  const resizeMaps = useCallback(() => {
    mapRef.current?.resize?.()
    try {
      windyMapRef.current?.invalidateSize?.()
    } catch {
      /* ignore */
    }
  }, [])

  // MapLibre radar map — create once when location is ready; pan on later moves.
  useEffect(() => {
    if (!locationReady || !mapContainerRef.current || mapRef.current) return undefined
    const startLat = Number.isFinite(latLonRef.current.lat) ? latLonRef.current.lat : 39.5
    const startLon = Number.isFinite(latLonRef.current.lon) ? latLonRef.current.lon : -98.5

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: BASEMAP_STYLE,
      center: [startLon, startLat],
      zoom: 5.5,
      minZoom: 2,
      maxZoom: 12,
      attributionControl: true,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), 'bottom-left')

    map.on('load', () => {
      readyRef.current = true
      syncRadarLayers()
      const bump = () => { try { map.resize() } catch { /* ignore */ } }
      requestAnimationFrame(() => {
        bump()
        requestAnimationFrame(bump)
      })
      setTimeout(bump, 120)
      setTimeout(bump, 400)
    })

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        map.resize()
      })
      : null
    if (ro && mapShellRef.current) ro.observe(mapShellRef.current)

    return () => {
      readyRef.current = false
      ro?.disconnect?.()
      map.remove()
      mapRef.current = null
    }
  }, [locationReady, syncRadarLayers])

  useEffect(() => {
    syncRadarLayers()
  }, [radarToggles, radarMeta, alertsFc, tropicalFc, syncRadarLayers])

  const toggleMapFullscreen = useCallback(async () => {
    const shell = mapShellRef.current
    if (!shell) return
    try {
      if (document.fullscreenElement === shell) {
        await document.exitFullscreen()
        setMapFullscreen(false)
      } else if (document.fullscreenElement) {
        await document.exitFullscreen()
        await shell.requestFullscreen()
        setMapFullscreen(true)
      } else if (typeof shell.requestFullscreen === 'function') {
        await shell.requestFullscreen()
        setMapFullscreen(true)
      } else {
        setMapFullscreen((v) => !v)
      }
    } catch {
      setMapFullscreen((v) => !v)
    }
  }, [])

  useEffect(() => {
    const onFs = () => {
      const shell = mapShellRef.current
      const inFs = Boolean(shell && document.fullscreenElement === shell)
      setMapFullscreen(inFs)
      requestAnimationFrame(() => resizeMaps())
      setTimeout(() => resizeMaps(), 100)
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [resizeMaps])

  useEffect(() => {
    resizeMaps()
  }, [mapFullscreen, resizeMaps])

  useEffect(() => {
    if (!mapFullscreen) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => setMapFullscreen(false))
      } else {
        setMapFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    if (!document.fullscreenElement) document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [mapFullscreen])

  // Windy Map Forecast wind layer (WINDY_API → /api/weather/windy/config → windyInit)
  useEffect(() => {
    const wantWind = Boolean(radarToggles.wind && locationReady)
    if (!wantWind) {
      setWindyStatus(null)
      setWindyError(null)
      windyApiRef.current = null
      windyMapRef.current = null
      if (windyContainerRef.current) windyContainerRef.current.innerHTML = ''
      return undefined
    }

    let cancelled = false

    async function mountWindy() {
      setWindyError(null)
      setWindyStatus('loading')
      try {
        // Wait a frame so the windy container is in the DOM.
        await new Promise((r) => requestAnimationFrame(() => r()))
        if (cancelled) return

        const cfg = await getJson('/api/weather/windy/config')
        if (cancelled) return
        if (!cfg?.configured || !cfg.key) {
          setWindyStatus('missing')
          setWindyError('WINDY_API is not set on the API. Wind needs a Windy Map Forecast key.')
          return
        }
        if (!windyContainerRef.current) {
          setWindyStatus('error')
          setWindyError('Wind map container missing')
          return
        }

        loadStylesheet(cfg.leafletCss || 'https://unpkg.com/leaflet@1.4.0/dist/leaflet.css')
        await loadScript(cfg.leafletJs || 'https://unpkg.com/leaflet@1.4.0/dist/leaflet.js')
        await loadScript(cfg.libBootUrl || 'https://api.windy.com/assets/map-forecast/libBoot.js')
        if (cancelled || typeof window.windyInit !== 'function') {
          throw new Error('Windy Map Forecast library failed to load')
        }

        const { lat: cLat, lon: cLon } = latLonRef.current
        const options = {
          key: cfg.key,
          lat: Number.isFinite(cLat) ? cLat : 39.5,
          lon: Number.isFinite(cLon) ? cLon : -98.5,
          zoom: 5,
          overlay: cfg.defaultOverlay || 'wind',
          level: 'surface',
          particlesAnim: cfg.particlesAnim || 'on',
        }

        // windyInit mounts into #windy by default.
        windyContainerRef.current.id = 'windy'
        windyContainerRef.current.innerHTML = ''

        await new Promise((resolve, reject) => {
          try {
            window.windyInit(options, (windyAPI) => {
              if (cancelled) return
              windyApiRef.current = windyAPI
              windyMapRef.current = windyAPI.map
              try {
                windyAPI.store?.set?.('overlay', 'wind')
                windyAPI.store?.set?.('particlesAnim', 'on')
              } catch {
                /* ignore */
              }
              setWindyStatus('ready')
              requestAnimationFrame(() => {
                try { windyAPI.map?.invalidateSize?.() } catch { /* ignore */ }
              })
              resolve()
            })
          } catch (err) {
            reject(err)
          }
        })
      } catch (err) {
        if (!cancelled) {
          setWindyStatus('error')
          setWindyError(err.message || 'Windy wind layer failed')
        }
      }
    }

    mountWindy()

    return () => {
      cancelled = true
      windyApiRef.current = null
      windyMapRef.current = null
      if (windyContainerRef.current) {
        windyContainerRef.current.innerHTML = ''
      }
    }
  }, [radarToggles.wind, locationReady, mapFullscreen])

  const handleSearch = (e) => {
    e?.preventDefault?.()
    const q = searchQuery.trim()
    if (!q) {
      setSearchError('Enter a city or place name.')
      return
    }
    setSearchError(null)
    geocodePlaceQuery(q, { count: 1 }).then((results) => {
      const first = results?.[0]
      if (first?.lat != null && first?.lon != null) {
        applyLocation(first.lat, first.lon, first.display_name || first.name)
      } else {
        setSearchError('No matches. Try another place name.')
      }
    }).catch(() => {
      setSearchError('Location search failed. Try again.')
    })
  }

  const om = forecast?.openMeteo
  const current = om?.current
  const hourly = om?.hourly
  const daily = om?.daily
  const chartData = useMemo(
    () => (locationReady ? buildHourlyChartData({ span, hourly, daily, tempUnit }) : []),
    [locationReady, span, hourly, daily, tempUnit],
  )
  const dailyStrip = useMemo(
    () => (locationReady ? buildDailyStrip(daily, tempUnit) : []),
    [locationReady, daily, tempUnit],
  )
  const alertItems = useMemo(() => alertItemsFromFc(alertsFc), [alertsFc])
  const heroKind = wmoKind(current?.weather_code)

  const windLayerOn = Boolean(radarToggles.wind)
  const windyReady = windyStatus === 'ready'
  const windUsesWindy = Boolean(windLayerOn && (radarMeta?.windyConfigured || windyReady || windyStatus === 'loading'))

  return (
    <div className={`weather-desk${mapFullscreen ? ' weather-desk--map-fs' : ''}`}>
      <header className="weather-desk-topbar">
        <div className="weather-desk-brand">
          <h1>Weather</h1>
          <p>Forecast desk + radar · Open-Meteo · NWS · Windy wind</p>
        </div>
        <form className="weather-desk-locate" onSubmit={handleSearch}>
          <label className="weather-desk-sr" htmlFor="weather-place-search">Location</label>
          <input
            id="weather-place-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search city or place…"
            autoComplete="off"
          />
          <button type="submit">Go</button>
          <button type="button" onClick={requestGeolocation} title="Use my location">
            {geoStatus === 'locating' ? 'Locating…' : 'Locate'}
          </button>
        </form>
      </header>

      {locationPrompt && !locationReady && (
        <div className="weather-desk-gate" role="status">
          <div className="weather-desk-gate-card">
            <h2>Choose a forecast location</h2>
            <p>
              {geoStatus === 'locating' && 'Requesting your location…'}
              {geoStatus === 'denied' && 'Location permission was denied. Search for a city or place to load the forecast.'}
              {geoStatus === 'unsupported' && 'Geolocation is unavailable here. Search for a city or place to continue.'}
              {geoStatus === 'pending' && 'Allow location access, or search for a place before the forecast loads.'}
            </p>
            <form className="weather-desk-locate weather-desk-locate--gate" onSubmit={handleSearch}>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. Chicago, Denver, Miami…"
                autoComplete="off"
                autoFocus
              />
              <button type="submit">Show forecast</button>
              <button type="button" onClick={requestGeolocation}>Use my location</button>
            </form>
            {searchError && <p className="weather-desk-status weather-desk-status--err">{searchError}</p>}
          </div>
        </div>
      )}

      {locationReady && (
        <>
          <div className="weather-desk-chrome">
            <span className="weather-desk-place">{placeLabel || 'Selected location'}</span>
            <span className="weather-desk-coords">{Number(lat).toFixed(3)}, {Number(lon).toFixed(3)}</span>
            <div className="weather-desk-unit" role="group" aria-label="Temperature unit">
              <button type="button" className={tempUnit === 'F' ? 'active' : ''} onClick={() => setTempUnit('F')}>°F</button>
              <button type="button" className={tempUnit === 'C' ? 'active' : ''} onClick={() => setTempUnit('C')}>°C</button>
            </div>
          </div>

          <div className="weather-main">
            {loadingForecast && <p className="weather-desk-status">Loading forecast…</p>}
            {forecastError && <p className="weather-desk-status weather-desk-status--err">{forecastError}</p>}

            {!loadingForecast && !forecastError && current && (
              <section className={`weather-hero weather-hero--${heroKind} has-item-menu`} aria-label="Current conditions">
                <ItemMenu item={{
                  type: 'article',
                  title: `Weather at ${shortPlace(placeLabel) || 'selected location'}`,
                  summary: `${fmtTempC(current.temperature_2m, tempUnit)} ${wmoLabel(current.weather_code)}`,
                  lat,
                  lon,
                }} />
                <div className="weather-hero-main">
                  <WmoIcon code={current.weather_code} size={72} className="weather-hero-icon" />
                  <div>
                    <p className="weather-hero-place">{shortPlace(placeLabel)}</p>
                    <p className="weather-hero-temp">{fmtTempC(current.temperature_2m, tempUnit)}</p>
                    <p className="weather-hero-cond">{wmoLabel(current.weather_code)}</p>
                  </div>
                </div>
                <div className="weather-hero-side">
                  <span><em>Feels like</em>{fmtTempC(current.apparent_temperature, tempUnit)}</span>
                  <span>
                    <em>Today</em>
                    {fmtTempC(daily?.temperature_2m_max?.[0], tempUnit)}
                    {' / '}
                    {fmtTempC(daily?.temperature_2m_min?.[0], tempUnit)}
                  </span>
                  {forecast?.openWeatherMap?.current && (
                    <span>
                      <em>OWM</em>
                      {forecast.openWeatherMap.current.weather?.[0]?.description || '—'}
                      {' · '}
                      {fmtTempC(forecast.openWeatherMap.current.main?.temp, tempUnit)}
                    </span>
                  )}
                </div>
              </section>
            )}

            {alertItems.length > 0 && (
              <div className="weather-alerts" aria-label="Active alerts">
                {alertItems.map((alert) => (
                  <div key={alert.id} className="weather-alert">
                    <strong>{alert.title}</strong>
                    {alert.detail ? ` · ${alert.detail.slice(0, 140)}` : ''}
                  </div>
                ))}
              </div>
            )}

            <section className="weather-section" aria-label="Hourly trend">
              <div className="weather-section-head">
                <h2>Hourly trend</h2>
                <div className="weather-desk-span" role="tablist" aria-label="Forecast span">
                  {SPANS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={span === s.id ? 'active' : ''}
                      onClick={() => setSpan(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              {!loadingForecast && !forecastError && (
                <WeatherHourlyChart data={chartData} tempUnit={tempUnit} />
              )}
            </section>

            {!loadingForecast && !forecastError && current && (
              <section className="weather-details" aria-label="Current details">
                <article className="weather-detail">
                  <div className="weather-detail-label"><Wind size={16} /> Wind</div>
                  <div className="weather-detail-value">{fmtWindWithDir(current.wind_speed_10m, current.wind_direction_10m)}</div>
                </article>
                <article className="weather-detail">
                  <div className="weather-detail-label"><Droplets size={16} /> Humidity</div>
                  <div className="weather-detail-value">{fmtPct(current.relative_humidity_2m)}</div>
                </article>
                <article className="weather-detail">
                  <div className="weather-detail-label"><Gauge size={16} /> Pressure</div>
                  <div className="weather-detail-value">{fmtHpa(current.pressure_msl)}</div>
                </article>
                <article className="weather-detail">
                  <div className="weather-detail-label"><CloudRain size={16} /> Precipitation</div>
                  <div className="weather-detail-value">{fmtMm(current.precipitation)}</div>
                </article>
              </section>
            )}

            {!loadingForecast && !forecastError && dailyStrip.length > 0 && (
              <section className="weather-section" aria-label="Seven-day forecast">
                <div className="weather-section-head">
                  <h2>7-day</h2>
                </div>
                <div className="weather-daily">
                  {dailyStrip.map((day) => (
                    <article key={day.id} className="weather-day">
                      <strong>{day.title}</strong>
                      <WmoIcon code={day.code} size={22} />
                      <span className="weather-day-temps">{day.hi} / {day.lo}</span>
                      <span>{day.precip}</span>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <div className="weather-desk-zones">
              <section className="weather-desk-zone weather-desk-zone--radar" aria-label="Radar">
                <div className="weather-desk-zone-head">
                  <h2>Radar</h2>
                  <div className="weather-desk-radar-actions">
                    <div className="weather-desk-radar-toggles" role="group" aria-label="Radar layer toggles">
                      {RADAR_LAYERS.map((layer) => (
                        <button
                          key={layer.id}
                          type="button"
                          className={radarToggles[layer.id] ? 'active' : ''}
                          onClick={() => setRadarToggles((prev) => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                        >
                          {layer.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="weather-desk-fs-btn"
                      onClick={toggleMapFullscreen}
                      aria-pressed={mapFullscreen}
                    >
                      {mapFullscreen ? 'Exit full screen' : 'Full screen'}
                    </button>
                  </div>
                </div>

                <div
                  className={`weather-desk-map-shell${mapFullscreen ? ' is-fullscreen' : ''}`}
                  ref={mapShellRef}
                >
                  <div
                    className={`weather-desk-map${windyReady ? ' is-dimmed' : ''}`}
                    ref={mapContainerRef}
                  />
                  {windLayerOn && windyStatus !== 'missing' && (
                    <div
                      className={`weather-desk-map-windy${windyReady ? ' is-visible' : ''}`}
                      ref={windyContainerRef}
                      aria-label="Windy wind layer"
                      aria-hidden={!windyReady}
                    />
                  )}
                  {mapFullscreen && (
                    <button
                      type="button"
                      className="weather-desk-fs-exit"
                      onClick={toggleMapFullscreen}
                    >
                      Exit full screen
                    </button>
                  )}
                </div>

                {radarToggles.wind && windyStatus === 'missing' && (
                  <p className="weather-desk-status weather-desk-status--err">
                    {windyError || 'Set WINDY_API (Windy Map Forecast key) on the API for wind.'}
                    {!radarMeta?.owmConfigured && ' OWM wind tiles are also unavailable.'}
                  </p>
                )}
                {radarToggles.wind && windyError && windyStatus === 'error' && (
                  <p className="weather-desk-status weather-desk-status--err">{windyError}</p>
                )}
                {radarToggles.wind && windUsesWindy && windyStatus === 'loading' && (
                  <p className="weather-desk-status">Loading Windy wind particles…</p>
                )}
                {radarToggles.wind && windUsesWindy && windyStatus === 'ready' && (
                  <p className="weather-desk-status">Wind: Windy Map Forecast particles</p>
                )}
              </section>

              <section className="weather-desk-zone" aria-label="Advanced conditions">
                <div className="weather-desk-zone-head">
                  <h2>Advanced</h2>
                </div>
                <div className="weather-advanced">
                  {PANEL_TABS.map((t) => (
                    <details
                      key={t.id}
                      className="weather-acc"
                      open={panel === t.id}
                      onToggle={(e) => {
                        if (e.currentTarget.open) setPanel(t.id)
                      }}
                    >
                      <summary>{t.label}</summary>
                      <div className="weather-acc-body">
                        {panel === t.id && loadingPanel && <p className="weather-desk-status">Loading…</p>}
                        {panel === t.id && panelError && (
                          <p className="weather-desk-status weather-desk-status--err">{panelError}</p>
                        )}
                        {panel === t.id && !loadingPanel && !panelError && panelData && (
                          <PanelBody panel={t.id} data={panelData} tempUnit={tempUnit} />
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function formatDay(iso) {
  if (!iso) return '—'
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return String(iso)
  }
}

function PanelBody({ panel, data, tempUnit }) {
  const om = data?.openMeteo

  if (panel === 'air') {
    const c = om?.current || {}
    return (
      <dl className="weather-desk-kv">
        <div><dt>US AQI</dt><dd>{c.us_aqi ?? '—'}</dd></div>
        <div><dt>EU AQI</dt><dd>{c.european_aqi ?? '—'}</dd></div>
        <div><dt>PM2.5</dt><dd>{c.pm2_5 != null ? `${c.pm2_5} µg/m³` : '—'}</dd></div>
        <div><dt>PM10</dt><dd>{c.pm10 != null ? `${c.pm10} µg/m³` : '—'}</dd></div>
        <div><dt>O₃</dt><dd>{c.ozone ?? '—'}</dd></div>
        <div><dt>NO₂</dt><dd>{c.nitrogen_dioxide ?? '—'}</dd></div>
      </dl>
    )
  }

  if (panel === 'marine') {
    const c = om?.current || {}
    return (
      <dl className="weather-desk-kv">
        <div><dt>Wave height</dt><dd>{c.wave_height != null ? `${c.wave_height} m` : '—'}</dd></div>
        <div><dt>Wave period</dt><dd>{c.wave_period != null ? `${c.wave_period} s` : '—'}</dd></div>
        <div><dt>Wave dir</dt><dd>{c.wave_direction != null ? `${c.wave_direction}°` : '—'}</dd></div>
        <div><dt>Current</dt><dd>{c.ocean_current_velocity != null ? `${c.ocean_current_velocity} m/s` : '—'}</dd></div>
      </dl>
    )
  }

  if (panel === 'flood') {
    const times = om?.daily?.time || []
    const discharge = om?.daily?.river_discharge || []
    if (!times.length) return <p className="weather-desk-status">No flood discharge series for this point.</p>
    return (
      <table className="weather-table">
        <thead>
          <tr><th>Day</th><th>River discharge</th></tr>
        </thead>
        <tbody>
          {times.slice(0, 7).map((t, i) => (
            <tr key={t}>
              <td>{formatDay(t)}</td>
              <td>{discharge[i] != null ? `${Number(discharge[i]).toFixed(1)} m³/s` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (panel === 'satellite') {
    const times = om?.hourly?.time || []
    const sw = om?.hourly?.shortwave_radiation || []
    if (!times.length) return <p className="weather-desk-status">No satellite radiation samples.</p>
    const last = times.length - 1
    return (
      <>
        <dl className="weather-desk-kv">
          <div><dt>Range</dt><dd>{data.startDate} → {data.endDate}</dd></div>
          <div><dt>Latest shortwave</dt><dd>{sw[last] != null ? `${sw[last]} W/m²` : '—'}</dd></div>
          <div><dt>Samples</dt><dd>{times.length}</dd></div>
        </dl>
        <table className="weather-table">
          <thead>
            <tr><th>Hour</th><th>Shortwave</th></tr>
          </thead>
          <tbody>
            {times.slice(-6).map((t, i, arr) => {
              const idx = times.length - arr.length + i
              return (
                <tr key={t}>
                  <td>{hourTick(t)}</td>
                  <td>{sw[idx] != null ? `${sw[idx]} W/m²` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </>
    )
  }

  if (panel === 'historical') {
    const times = om?.daily?.time || []
    const tmax = om?.daily?.temperature_2m_max || []
    const tmin = om?.daily?.temperature_2m_min || []
    const precip = om?.daily?.precipitation_sum || []
    if (!times.length) return <p className="weather-desk-status">No historical forecast data.</p>
    return (
      <table className="weather-table">
        <thead>
          <tr><th>Day</th><th>Low / High</th><th>Precip</th></tr>
        </thead>
        <tbody>
          {times.slice(0, 7).map((t, i) => (
            <tr key={t}>
              <td>{formatDay(t)}</td>
              <td>{fmtTempC(tmin[i], tempUnit)} – {fmtTempC(tmax[i], tempUnit)}</td>
              <td>{fmtMm(precip[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return <p className="weather-desk-status">No data.</p>
}
