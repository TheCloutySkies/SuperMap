import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import WidgetCard from './WidgetCard'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : 'http://localhost:3001'
const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?limit=20&status=open'
const EONET_EVENT_URL = (id) => `https://eonet.gsfc.nasa.gov/api/v3/events/${id}`
const PRESCRIBED_FIRE = /prescribed\s*fire|rx\s*pcs|controlled\s*burn/i

/** Extract search name and state from EONET title for NIFC lookup. e.g. "Cabin Creek Wildfire, Gray, Texas Wildfires · 3/9/26" */
function parseTitleForNIFC(title) {
  if (!title || typeof title !== 'string') return { name: '', state: '' }
  const stateNames = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming']
  let state = ''
  for (const s of stateNames) {
    if (title.includes(s)) { state = s; break }
  }
  const beforeComma = title.split(',')[0] || title
  const name = beforeComma.replace(/\s*(Wildfire|Fire)\s*$/i, '').trim().slice(0, 35)
  return { name, state }
}

/** Approximate area of a GeoJSON polygon in km² (shoelace in deg² then scale by latitude). */
function polygonAreaKm2(coords) {
  if (!Array.isArray(coords) || coords.length < 3) return null
  const ring = coords[0]?.length ? coords[0] : coords
  const n = ring.length
  if (n < 3) return null
  let areaDeg2 = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    areaDeg2 += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1]
  }
  areaDeg2 = Math.abs(areaDeg2) * 0.5
  const latMid = ring.reduce((s, p) => s + p[1], 0) / n
  const kmPerDegLat = 111.32
  const kmPerDegLon = 111.32 * Math.cos((latMid * Math.PI) / 180)
  return areaDeg2 * kmPerDegLat * kmPerDegLon
}

function parseEventDetail(ev) {
  const geom = ev.geometry || []
  const firstDate = geom[0]?.date
  const closed = ev.closed ?? null
  const start = firstDate ? new Date(firstDate) : null
  const end = closed ? new Date(closed) : null
  let durationText = null
  if (start && end && end >= start) {
    const days = Math.round((end - start) / (24 * 60 * 60 * 1000))
    durationText = days === 0 ? '< 1 day' : days === 1 ? '1 day' : `${days} days`
  } else if (start && !end) durationText = 'Ongoing'

  let sizeKm2 = null
  for (const g of geom) {
    if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
      const a = polygonAreaKm2(g.coordinates)
      if (a != null && a > 0) { sizeKm2 = Math.round(a); break }
    }
  }
  const src = ev.sources?.[0]
  const reportUrl = src?.url ?? src?.source ?? ev.link ?? null
  const reportTitle = src?.title ?? 'View full report'

  return {
    start: start ? start.toLocaleDateString(undefined, { dateStyle: 'medium' }) : null,
    end: end ? end.toLocaleDateString(undefined, { dateStyle: 'medium' }) : (closed ? null : 'Ongoing'),
    durationText,
    sizeKm2,
    reportUrl,
    reportTitle,
    description: ev.description || null,
  }
}

export default function SpaceWidget() {
  const [data, setData] = useState(null)
  const [eonet, setEonet] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [expandedEventId, setExpandedEventId] = useState(null)
  const [eventDetails, setEventDetails] = useState({})
  const [detailsLoadingId, setDetailsLoadingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      axios.get(`${API_BASE}/api/space`, { timeout: 12000 }).then((r) => r.data).catch(() => null),
      axios.get(EONET_URL, { timeout: 10000 }).then((r) => r.data?.events || []).catch(() => []),
    ]).then(([spaceData, eonetEvents]) => {
      if (cancelled) return
      setData(spaceData || {})
      const list = Array.isArray(eonetEvents)
        ? eonetEvents
            .filter((e) => !PRESCRIBED_FIRE.test(e.title || '') && !PRESCRIBED_FIRE.test((e.categories?.[0]?.title || '')))
            .slice(0, 8)
            .map((e) => ({
              id: e.id,
              title: e.title || 'Event',
              category: e.categories?.[0]?.title || 'Natural',
              date: e.geometry?.[0]?.date || e.lastDate,
            }))
        : []
      const fromBackend = (spaceData?.eonet || []).filter((e) => !PRESCRIBED_FIRE.test(e.title || ''))
      setEonet(fromBackend.length ? fromBackend : list)
      setUpdatedAt(spaceData?.updatedAt || new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }))
    }).catch((err) => { if (!cancelled) setError(err.message || 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const fetchEventDetail = useCallback(async (eventId) => {
    if (eventDetails[eventId]) return
    setDetailsLoadingId(eventId)
    try {
      const res = await axios.get(EONET_EVENT_URL(eventId), { timeout: 10000 })
      const ev = res.data
      if (!ev?.id) {
        setEventDetails((prev) => ({ ...prev, [eventId]: null }))
        return
      }
      const detail = parseEventDetail(ev)
      setEventDetails((prev) => ({ ...prev, [eventId]: detail }))

      const { name, state } = parseTitleForNIFC(ev.title)
      if (name) {
        try {
          const nifcRes = await axios.get(`${API_BASE}/api/wildfire-detail`, {
            timeout: 12000,
            params: { name, state: state || undefined },
          })
          const nifc = nifcRes.data?.nifc
          if (nifc) {
            setEventDetails((prev) => ({
              ...prev,
              [eventId]: {
                ...prev[eventId],
                acres: nifc.acres,
                percentContained: nifc.percentContained,
                discoveryDate: nifc.discoveryDate,
                nifcDescription: nifc.description,
              },
            }))
          }
        } catch (_) {
          /* NIFC optional */
        }
      }
    } catch (_) {
      setEventDetails((prev) => ({ ...prev, [eventId]: null }))
    } finally {
      setDetailsLoadingId((id) => (id === eventId ? null : id))
    }
  }, [eventDetails])

  const toggleExpand = useCallback((eventId) => {
    setExpandedEventId((prev) => (prev === eventId ? null : eventId))
    if (eventId && !eventDetails[eventId]) fetchEventDetail(eventId)
  }, [eventDetails, fetchEventDetail])

  const hasUseful = (eonet?.length > 0) || (data?.nasaNews?.length > 0)
  if (!loading && !error && !hasUseful) return null

  return (
    <WidgetCard title="NASA EONET" loading={loading} error={error} updatedAt={updatedAt}>
      {eonet.length > 0 && (
        <div className="widget-space-eonet">
          <ul className="widget-space-eonet-list">
            {eonet.map((e) => {
              const expanded = expandedEventId === e.id
              const detail = eventDetails[e.id]
              const detailLoading = detailsLoadingId === e.id
              return (
                <li key={e.id} className={expanded ? 'widget-space-eonet-item--expanded' : ''}>
                  <button
                    type="button"
                    className="widget-space-eonet-item-btn"
                    onClick={() => toggleExpand(e.id)}
                    aria-expanded={expanded}
                  >
                    <span className="widget-space-eonet-title">{e.title}</span>
                    <span className="widget-space-eonet-meta">{e.category} · {e.date ? new Date(e.date).toLocaleDateString(undefined, { dateStyle: 'short' }) : ''}</span>
                    <span className="widget-space-eonet-expand-icon" aria-hidden>{expanded ? '−' : '+'}</span>
                  </button>
                  {expanded && (
                    <div className="widget-space-eonet-detail">
                      {detailLoading && !detail ? (
                        <p className="widget-space-eonet-detail-loading">Loading details…</p>
                      ) : detail ? (
                        <>
                          {detail.acres != null && <p className="widget-space-eonet-detail-row"><span className="widget-space-eonet-detail-label">Size</span> {detail.acres.toLocaleString()} acres</p>}
                          {detail.percentContained != null && <p className="widget-space-eonet-detail-row"><span className="widget-space-eonet-detail-label">Containment</span> {detail.percentContained}%</p>}
                          {(detail.discoveryDate || detail.start) && <p className="widget-space-eonet-detail-row"><span className="widget-space-eonet-detail-label">Started</span> {detail.discoveryDate ? new Date(detail.discoveryDate).toLocaleDateString(undefined, { dateStyle: 'medium' }) : detail.start}</p>}
                          {detail.end != null && detail.end !== 'Ongoing' && <p className="widget-space-eonet-detail-row"><span className="widget-space-eonet-detail-label">End</span> {detail.end}</p>}
                          {detail.durationText && <p className="widget-space-eonet-detail-row"><span className="widget-space-eonet-detail-label">Duration</span> {detail.durationText}</p>}
                          {detail.acres == null && detail.sizeKm2 != null && <p className="widget-space-eonet-detail-row"><span className="widget-space-eonet-detail-label">Size</span> ~{detail.sizeKm2.toLocaleString()} km²</p>}
                          {(detail.nifcDescription || detail.description) && <p className="widget-space-eonet-detail-desc">{detail.nifcDescription || detail.description}</p>}
                          {detail.reportUrl && (
                            <a href={detail.reportUrl} target="_blank" rel="noopener noreferrer" className="widget-space-eonet-detail-link">
                              {detail.reportTitle}
                            </a>
                          )}
                        </>
                      ) : (
                        <p className="widget-space-eonet-detail-loading">Details unavailable.</p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {data?.nasaNews && data.nasaNews.length > 0 && (
        <div className="widget-space-news">
          <span className="widget-space-asteroids-label">NASA News</span>
          <ul className="widget-headlines-list">
            {data.nasaNews.map((n, i) => (
              <li key={i} className="widget-headlines-item">
                {n.link ? (
                  <a href={n.link} target="_blank" rel="noopener noreferrer" className="widget-headlines-link">{n.title}</a>
                ) : (
                  <span className="widget-headlines-title">{n.title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data?.apod && (eonet.length > 0 || data?.nasaNews?.length > 0) && (
        <div className="widget-space-apod-compact">
          <a href={data.apod.url} target="_blank" rel="noopener noreferrer" className="widget-headlines-link">
            Today’s image: {data.apod.title || 'NASA APOD'}
          </a>
        </div>
      )}
    </WidgetCard>
  )
}
