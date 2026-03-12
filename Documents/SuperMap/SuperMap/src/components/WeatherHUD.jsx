import { useState, useEffect } from 'react'
import axios from 'axios'
import { geocodePlaceQuery } from '../lib/placeGeocoding'
import './WeatherHUD.css'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'
const DEFAULT_LAT = 20
const DEFAULT_LON = 0
const OPENMETEO_URL = 'https://api.open-meteo.com/v1/forecast'

let meteostatCooldownUntil = 0

export default function WeatherHUD({ lat, lon, onSearchCoords, compact = false }) {
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState(null)
  const [source, setSource] = useState(null)
  const [tempUnit, setTempUnit] = useState('F')
  const [windUnit, setWindUnit] = useState('kmh')
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('supermap_weather_collapsed') === '1' } catch { return false }
  })
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('supermap_weather_hidden') === '1' } catch { return false }
  })

  const effectiveLat = lat != null && typeof lat === 'number' ? lat : DEFAULT_LAT
  const effectiveLon = lon != null && typeof lon === 'number' ? lon : DEFAULT_LON
  const hasCoords = effectiveLat !== DEFAULT_LAT || effectiveLon !== DEFAULT_LON
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
      setSource(null)
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
      const tryMeteostat = () => {
        if (Date.now() < meteostatCooldownUntil) return Promise.reject(new Error('Meteostat cooldown'))
        if (!API_BASE) return Promise.reject(new Error('No API'))
        return axios
          .get(`${API_BASE}/api/weather/nearby`, { params: { lat: effectiveLat, lon: effectiveLon }, timeout: 8000 })
          .then((nearbyRes) => {
            const stations = nearbyRes.data?.data ?? (Array.isArray(nearbyRes.data) ? nearbyRes.data : [])
            const stationId = stations?.[0]?.id ?? stations?.[0]?.station ?? '10637'
            return axios.get(`${API_BASE}/api/weather/hourly`, {
              params: { station: stationId, start: today, end: today, tz },
              timeout: 8000,
            })
          })
          .then((hourlyRes) => {
            const data = hourlyRes.data?.data ?? (Array.isArray(hourlyRes.data) ? hourlyRes.data : [])
            const arr = Array.isArray(data) ? data : []
            const hour = arr.find((h) => Number(h.hour) === new Date().getHours()) ?? arr[0]
            if (hour && (hour.temperature != null || hour.temp != null)) {
              setSource('Meteostat')
              setWeather({
                temperature: hour.temperature ?? hour.temp,
                windspeed: hour.windspeed ?? hour.wind_speed ?? null,
                weathercode: null,
              })
              return true
            }
            return false
          })
      }
    const setOpenMeteo = () =>
      axios.get(OPENMETEO_URL, {
        params: { latitude: effectiveLat, longitude: effectiveLon, current_weather: true },
        timeout: 10000,
      }).then((res) => {
        setSource('Open-Meteo')
        setWeather(res.data?.current_weather || null)
        setError(null)
      }).catch(() => setWeather(null))

      if (!API_BASE) {
        setOpenMeteo().finally(() => setLoading(false))
        return
      }
      tryMeteostat()
        .then((ok) => {
          if (ok) return
          return setOpenMeteo()
        })
        .catch((err) => {
          const msg = err?.response?.data?.error || err?.message || ''
          if (/not subscribed|too many requests/i.test(String(msg))) {
            meteostatCooldownUntil = Date.now() + 10 * 60 * 1000
          }
          return setOpenMeteo()
        })
        .finally(() => setLoading(false))
    }, 650)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [effectiveLat, effectiveLon])

  const handleSearch = () => {
    const q = searchQuery.trim()
    if (!q) return
    geocodePlaceQuery(q, { count: 1 }).then((results) => {
      const first = results?.[0]
      if (first?.lat != null && first?.lon != null) {
        onSearchCoords?.(first.lon, first.lat)
      }
    })
  }

  const w = weather
  const tempC = w?.temperature != null ? w.temperature : null
  const tempDisplay =
    tempC == null
      ? '—'
      : tempUnit === 'F'
        ? `${Math.round((tempC * 9) / 5 + 32)}°F`
        : `${Math.round(tempC)}°C`
  const windKmh = w?.windspeed != null ? Number(w.windspeed) : null
  const windDisplay = windKmh == null || Number.isNaN(windKmh)
    ? '—'
    : windUnit === 'mph'
      ? `${(windKmh * 0.621371).toFixed(1)} mph`
      : `${windKmh.toFixed(1)} km/h`
  const code = w?.weathercode

  if (compact) {
    return (
      <div className="weather-hud weather-hud--compact">
        <div className="weather-hud-compact-temp">{loading ? '…' : tempDisplay}</div>
        <div className="weather-hud-compact-units" role="group" aria-label="Temperature unit">
          <button type="button" className={tempUnit === 'F' ? 'weather-hud-compact-btn active' : 'weather-hud-compact-btn'} onClick={() => setTempUnit('F')}>°F</button>
          <button type="button" className={tempUnit === 'C' ? 'weather-hud-compact-btn active' : 'weather-hud-compact-btn'} onClick={() => setTempUnit('C')}>°C</button>
        </div>
      </div>
    )
  }

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem('supermap_weather_collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  const toggleHidden = () => {
    setHidden((prev) => {
      const next = !prev
      try { localStorage.setItem('supermap_weather_hidden', next ? '1' : '0') } catch {}
      return next
    })
  }

  if (hidden) {
    return (
      <button type="button" className="weather-hud-show-btn" onClick={toggleHidden}>
        Show Weather
      </button>
    )
  }

  return (
    <div className="weather-hud">
      <div className="weather-hud-head">
        <h3 className="weather-hud-title">Weather</h3>
        <div className="weather-hud-head-actions">
          <button type="button" className="weather-hud-head-btn" onClick={toggleCollapsed} title={collapsed ? 'Expand weather widget' : 'Collapse weather widget'}>
            {collapsed ? '+' : '−'}
          </button>
          <button type="button" className="weather-hud-head-btn" onClick={toggleHidden} title="Hide weather widget">
            ×
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="weather-hud-search">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="City or place…"
          />
          <button type="button" onClick={handleSearch}>Go</button>
        </div>
      )}
      {loading ? (
        <p className="weather-hud-loading">Loading…</p>
      ) : error ? (
        <p className="weather-hud-empty">{error}</p>
      ) : w ? (
        <div className="weather-hud-current">
          <div className="weather-hud-temp-row">
            <div className="weather-hud-temp">{tempDisplay}</div>
            <div className="weather-hud-temp-toggle" role="group" aria-label="Temperature unit">
              <button
                type="button"
                className={tempUnit === 'F' ? 'weather-hud-temp-btn active' : 'weather-hud-temp-btn'}
                onClick={() => setTempUnit('F')}
              >
                °F
              </button>
              <button
                type="button"
                className={tempUnit === 'C' ? 'weather-hud-temp-btn active' : 'weather-hud-temp-btn'}
                onClick={() => setTempUnit('C')}
              >
                °C
              </button>
            </div>
          </div>
          {!collapsed && code != null && (
            <span className="weather-hud-code">WMO {code}</span>
          )}
          <div className="weather-hud-meta">
            <div className="weather-hud-wind-row">
              <span>Wind {windDisplay}</span>
              <div className="weather-hud-temp-toggle" role="group" aria-label="Wind unit">
                <button
                  type="button"
                  className={windUnit === 'kmh' ? 'weather-hud-temp-btn active' : 'weather-hud-temp-btn'}
                  onClick={() => setWindUnit('kmh')}
                >
                  km/h
                </button>
                <button
                  type="button"
                  className={windUnit === 'mph' ? 'weather-hud-temp-btn active' : 'weather-hud-temp-btn'}
                  onClick={() => setWindUnit('mph')}
                >
                  mph
                </button>
              </div>
            </div>
            {!collapsed && source && <span className="weather-hud-source">{source}</span>}
            {!collapsed && !hasCoords && (
              <span className="weather-hud-default-hint">Default location</span>
            )}
          </div>
        </div>
      ) : (
        <p className="weather-hud-empty">No weather data.</p>
      )}
    </div>
  )
}
