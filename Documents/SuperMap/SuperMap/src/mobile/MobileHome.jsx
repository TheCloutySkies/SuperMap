/**
 * The phone's home: one column of cards, each a door.
 * It reads the same snapshot the desktop dashboard reads.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { readHomeSnapshot, HOME_STATE } from '../lib/homeBootstrap'
import { subscribeHome, startHomePolling } from '../lib/homeStore'
import DataFreshness from '../components/DataFreshness'

function ago(ms) {
  if (!ms) return '—'
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}

function headlinesOf(home) {
  const news = home?.news?.features || []
  return news.slice(0, 5).map((feature) => ({
    id: feature.properties?.id || feature.id,
    title: feature.properties?.title || 'Untitled',
    source: feature.properties?.source || 'News',
    time: Number(feature.properties?.timestamp) || null,
    url: feature.properties?.link || '',
  }))
}

export default function MobileHome() {
  const navigate = useNavigate()
  const [home, setHome] = useState(() => readHomeSnapshot() || null)
  const [state, setState] = useState(HOME_STATE.SEED)

  useEffect(() => {
    startHomePolling()
    return subscribeHome((store) => {
      if (store.payload) setHome(store.payload)
      if (store.state) setState(store.state)
    })
  }, [])

  const threat = home?.threatSummary || null
  const headlines = headlinesOf(home)
  const quakes = home?.earthquakes?.events || []

  return (
    <div className="mob-stack">
      <section className="mob-card">
        <p className="mob-card-kicker">Situation</p>
        <h2 className="mob-card-title">{threat?.threat_level || 'Waiting for the wire'}</h2>
        {threat ? (
          <>
            <p className="mob-card-text">{threat.narrative || threat.summary || ''}</p>
            <p className="mob-card-meta">
              {Number(threat.average_score || 0).toFixed(1)}/5 average · {threat.high_risk_count ?? 0} high risk · {ago(Number(threat.timestamp) || 0)}
            </p>
          </>
        ) : (
          <p className="mob-card-text">{state === HOME_STATE.WAKING ? 'The desk is waking up.' : 'No summary yet. Pull to refresh shortly.'}</p>
        )}
        <button type="button" className="mob-action" onClick={() => navigate('/news')}>Read the news</button>
      </section>

      <section className="mob-card">
        <p className="mob-card-kicker">Headlines</p>
        {headlines.length ? (
          <ul className="mob-list">
            {headlines.map((row) => (
              <li key={row.id}>
                <a href={row.url || '#'} target="_blank" rel="noopener noreferrer">{row.title}</a>
                <span>{row.source}{row.time ? ` · ${ago(row.time)}` : ''}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mob-card-text">No headlines yet.</p>}
        <button type="button" className="mob-action" onClick={() => navigate('/news')}>All of GPN</button>
      </section>

      <section className="mob-card">
        <p className="mob-card-kicker">Hazards</p>
        <p className="mob-card-text">
          {quakes.length ? `${quakes.length} events on the wire, the strongest near ${quakes[0]?.place || 'the region'}.` : 'No quakes on the wire.'}
        </p>
        <button type="button" className="mob-action" onClick={() => navigate('/maps')}>Open the map</button>
      </section>

      <section className="mob-card">
        <p className="mob-card-kicker">Cases</p>
        <p className="mob-card-text">Gather what matters into a case, then read it as a board, a timeline or a report.</p>
        <button type="button" className="mob-action" onClick={() => navigate('/batman/cases')}>Open cases</button>
      </section>

      <p className="mob-foot"><DataFreshness /></p>
    </div>
  )
}
