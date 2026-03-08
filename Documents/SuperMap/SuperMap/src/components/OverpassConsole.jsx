import { useState, useRef } from 'react'
import { runOverpassQuery } from '../services/layerServices'
import './OverpassConsole.css'

const QUICK_TEMPLATES = [
  {
    name: 'Custom',
    query: `[out:json][timeout:30];
( node["amenity"="cafe"]({{bbox}}); way["amenity"="restaurant"]({{bbox}}); );
out body geom;`,
  },
  {
    name: 'Emergency Services',
    query: `[out:json][timeout:30];
( node["amenity"~"fire_station|police|hospital"]({{bbox}}); way["amenity"~"fire_station|police|hospital"]({{bbox}}); );
out body geom;`,
  },
  {
    name: 'Hospitals & Clinics',
    query: `[out:json][timeout:30];
( node["amenity"~"hospital|clinic|doctors"]({{bbox}}); way["amenity"~"hospital|clinic"]({{bbox}}); );
out body geom;`,
  },
  {
    name: 'Schools & Universities',
    query: `[out:json][timeout:30];
( node["amenity"~"school|university|college"]({{bbox}}); way["amenity"~"school|university|college"]({{bbox}}); );
out body geom;`,
  },
  {
    name: 'Gas Stations & Fuel',
    query: `[out:json][timeout:30];
( node["amenity"="fuel"]({{bbox}}); way["amenity"="fuel"]({{bbox}}); );
out body geom;`,
  },
  {
    name: 'Pharmacies',
    query: `[out:json][timeout:30];
( node["amenity"="pharmacy"]({{bbox}}); way["amenity"="pharmacy"]({{bbox}}); );
out body geom;`,
  },
  {
    name: 'Supermarkets & Shops',
    query: `[out:json][timeout:30];
( node["shop"="supermarket"]({{bbox}}); way["shop"="supermarket"]({{bbox}}); node["shop"~"convenience|mall"]({{bbox}}); );
out body geom;`,
  },
  {
    name: 'Water (rivers, lakes)',
    query: `[out:json][timeout:30];
( way["natural"="water"]({{bbox}}); way["waterway"~"river|stream|canal"]({{bbox}}); );
out body geom;`,
  },
  {
    name: 'Major Roads',
    query: `[out:json][timeout:30];
( way["highway"~"motorway|trunk|primary"]({{bbox}}); );
out body geom;`,
  },
  {
    name: 'Airports & Aerodromes',
    query: `[out:json][timeout:30];
( node["aeroway"="aerodrome"]({{bbox}}); way["aeroway"~"aerodrome|runway|taxiway"]({{bbox}}); );
out body geom;`,
  },
  {
    name: 'Abandoned/Disused Rail',
    query: `[out:json][timeout:30];
( way["railway"~"disused|abandoned"]({{bbox}}); way["railway"="rail"]["usage"~"disused|abandoned"]({{bbox}}); );
out body geom;`,
  },
  {
    name: 'Power & Utilities',
    query: `[out:json][timeout:30];
( way["power"~"line|tower"]({{bbox}}); node["power"="tower"]({{bbox}}); node["power"="substation"]({{bbox}}); );
out body geom;`,
  },
]

const DEFAULT_QUERY = QUICK_TEMPLATES[0].query

export default function OverpassConsole({ onClose, onResults, onLoading }) {
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [template, setTemplate] = useState('Custom')
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const fileInputRef = useRef(null)

  const handleTemplateChange = (e) => {
    const name = e.target.value
    setTemplate(name)
    const t = QUICK_TEMPLATES.find((x) => x.name === name)
    if (t) setQuery(t.query)
  }

  const handleRun = async () => {
    setError(null)
    setRunning(true)
    onLoading?.(true)
    try {
      const bbox = window.__supermapOverpassBbox
      let q = query
      if (bbox && Array.isArray(bbox) && bbox.length === 4 && q.includes('{{bbox}}')) {
        const [w, s, e, n] = bbox
        q = q.replace(/\{\{bbox\}\}/g, `${s},${w},${n},${e}`)
      }
      const geojson = await runOverpassQuery(q)
      onResults?.(geojson)
      onClose?.()
    } catch (err) {
      setError(err.message || 'Query failed')
    } finally {
      setRunning(false)
      onLoading?.(false)
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.name.endsWith('.geojson')) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const geojson = JSON.parse(reader.result)
        if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
          onResults?.(geojson)
          onClose?.()
        } else {
          setError('Invalid GeoJSON: expected FeatureCollection')
        }
      } catch {
        setError('Invalid GeoJSON file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="overpass-console-overlay" onClick={onClose}>
      <div className="overpass-console" onClick={(e) => e.stopPropagation()}>
        <div className="overpass-console-header">
          <h2>Overpass Console</h2>
          <button type="button" className="overpass-console-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="overpass-console-body">
          <p className="overpass-console-instructions">
            Use <code>{'{{bbox}}'}</code> for current view. Queries are limited to 30s.
          </p>
          <div className="overpass-console-templates">
            <label>Quick Templates</label>
            <select value={template} onChange={handleTemplateChange}>
              {QUICK_TEMPLATES.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Overpass QL query..."
            spellCheck={false}
          />
          {error && <p className="overpass-console-error">{error}</p>}
        </div>
        <div className="overpass-console-footer">
          <input
            ref={fileInputRef}
            type="file"
            accept=".geojson,.json"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="overpass-console-btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload Local Data
          </button>
          <button type="button" onClick={handleRun} disabled={running}>
            {running ? 'Running…' : 'Run Query'}
          </button>
        </div>
      </div>
    </div>
  )
}
