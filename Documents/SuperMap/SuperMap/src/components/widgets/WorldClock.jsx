import { useState, useEffect } from 'react'
import moment from 'moment-timezone'
import WidgetCard from './WidgetCard'

const ZONES = [
  { label: 'UTC', zone: 'UTC' },
  { label: 'New York', zone: 'America/New_York' },
  { label: 'London', zone: 'Europe/London' },
  { label: 'Moscow', zone: 'Europe/Moscow' },
  { label: 'Tehran', zone: 'Asia/Tehran' },
  { label: 'Beijing', zone: 'Asia/Shanghai' },
]

export default function WorldClock() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const rows = ZONES.map(({ label, zone }) => ({
    label,
    time: moment(now).tz(zone).format('HH:mm:ss'),
    date: moment(now).tz(zone).format('MMM D'),
  }))

  return (
    <WidgetCard title="World clock">
      <ul className="widget-clock-list">
        {rows.map((r) => (
          <li key={r.label} className="widget-clock-row">
            <span className="widget-clock-label">{r.label}</span>
            <span className="widget-clock-time">{r.time}</span>
            <span className="widget-clock-date">{r.date}</span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  )
}
