/**
 * The taskbar: start button, the open window, the tray.
 *
 * One window at a time (v1), so the task list is the current window plus any
 * minimised ones; clicking an active task minimises it, a minimised task
 * restores it.
 */
import { useEffect, useState } from 'react'
import { Grid2X2 } from 'lucide-react'
import { HOME_STATE, getHomeState, subscribeHome } from '../../lib/homeStore'

function useUtcClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export default function Taskbar({
  title,
  minimized = [],
  startOpen,
  onToggleStart,
  onMinimize,
  onRestore,
  onSettings,
}) {
  const now = useUtcClock()
  const [homeState, setHomeState] = useState(() => getHomeState()?.state || HOME_STATE.SEED)
  useEffect(() => subscribeHome((next) => setHomeState(next?.state || HOME_STATE.SEED)), [])
  const dot = homeState === HOME_STATE.FAILED ? 'is-error' : homeState === HOME_STATE.SEED ? 'is-stale' : ''

  return (
    <footer className="xp-taskbar">
      <button
        type="button"
        className="xp-start-btn"
        aria-haspopup="menu"
        aria-expanded={startOpen}
        onClick={onToggleStart}
      >
        <Grid2X2 size={14} strokeWidth={2} aria-hidden />
        start
      </button>
      <div className="xp-tasks">
        {title ? (
          <button type="button" className="xp-task is-active" aria-pressed="true" onClick={onMinimize}>
            <span>{title}</span>
          </button>
        ) : null}
        {minimized.map((entry) => (
          <button key={entry.route} type="button" className="xp-task" aria-pressed="false" onClick={() => onRestore(entry)}>
            <span>{entry.title}</span>
          </button>
        ))}
      </div>
      <div className="xp-tray">
        <span className={`xp-tray-dot ${dot}`} aria-hidden />
        <time className="xp-tray-clock" dateTime={now.toISOString()} title={now.toLocaleString()}>
          {now.toISOString().slice(11, 16)}
        </time>
        <button type="button" className="xp-tray-btn" onClick={onSettings} aria-label="Account and settings">
          <Grid2X2 size={13} strokeWidth={1.6} aria-hidden />
        </button>
      </div>
    </footer>
  )
}
