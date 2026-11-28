/**
 * The taskbar: start button, the open windows, and the tray.
 *
 * The tray carries the freshness dot, four quick-launch icons and the clock.
 * The account lives at the top of the start menu, so there is no tray chip.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid2X2, House, CloudSun, Vault, Settings } from 'lucide-react'
import { useSuperMapAccount } from '../../features/accounts/SuperMapAccounts'
import { HOME_STATE, getHomeState, subscribeHome } from '../../lib/homeStore'

function useClock() {
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
  onQuickLaunch,
}) {
  const now = useClock()
  const navigate = useNavigate()
  const { user, unread, vault, setOverlay, setWorkspaceTab } = useSuperMapAccount()
  const badge = unread > 0 ? unread : vault.length > 0 ? vault.length : 0
  const [homeState, setHomeState] = useState(() => getHomeState()?.state || HOME_STATE.SEED)
  useEffect(() => subscribeHome((next) => setHomeState(next?.state || HOME_STATE.SEED)), [])
  const dot = homeState === HOME_STATE.FAILED ? 'is-error' : homeState === HOME_STATE.SEED ? 'is-stale' : ''

  function openVault() {
    if (!user) {
      setOverlay('auth')
      return
    }
    setWorkspaceTab('vault')
    navigate('/accounts')
  }

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
        <div className="xp-tray-quick" role="toolbar" aria-label="Quick launch">
          <button
            type="button"
            className="xp-tray-quick-btn"
            title="Dashboard"
            aria-label="Dashboard"
            onClick={() => onQuickLaunch?.('home')}
          >
            <House size={14} strokeWidth={1.9} aria-hidden />
          </button>
          <button
            type="button"
            className="xp-tray-quick-btn"
            title="Weather"
            aria-label="Weather"
            onClick={() => onQuickLaunch?.('weather')}
          >
            <CloudSun size={14} strokeWidth={1.9} aria-hidden />
          </button>
          <button
            type="button"
            className="xp-tray-quick-btn"
            title="My Vault"
            aria-label="My Vault"
            onClick={openVault}
          >
            <Vault size={14} strokeWidth={1.9} aria-hidden />
            {badge ? <b className="xp-tray-badge">{badge}</b> : null}
          </button>
          <button
            type="button"
            className="xp-tray-quick-btn"
            title="Settings"
            aria-label="Settings"
            onClick={() => onSettings?.()}
          >
            <Settings size={14} strokeWidth={1.9} aria-hidden />
          </button>
        </div>
        <time className="xp-tray-clock" dateTime={now.toISOString()} title={now.toLocaleString()}>
          {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </time>
      </div>
    </footer>
  )
}
