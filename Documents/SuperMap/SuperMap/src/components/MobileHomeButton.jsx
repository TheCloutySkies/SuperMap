import { useState } from 'react'
import { Home, Map, Newspaper, Shield, MoreHorizontal, X } from 'lucide-react'
import { APP_MODES, pathFromMode } from '../lib/appRoutes'
import './MobileHomeButton.css'

const TABS = [
  { mode: APP_MODES.HOME, label: 'Home', icon: Home },
  { mode: APP_MODES.MAPS, label: 'Maps', icon: Map },
  { mode: APP_MODES.FEEDS, label: 'News', icon: Newspaper },
  { mode: APP_MODES.BATMAN, label: 'Batman', icon: Shield },
]

const MORE = [
  { mode: APP_MODES.CRIME, label: 'Crime' },
  { mode: APP_MODES.WEATHER, label: 'Weather' },
  { mode: APP_MODES.STRATEGIC, label: 'Strategic signals' },
  { mode: APP_MODES.BULLETIN, label: 'Bulletin' },
  { mode: APP_MODES.TOOLS, label: 'Tools' },
  { mode: APP_MODES.RESOURCES, label: 'Resources' },
  { mode: APP_MODES.REPORTS, label: 'Reports' },
  { mode: APP_MODES.SETTINGS, label: 'Settings' },
]

/** The only global nav on mobile: four tabs plus a More sheet. */
export default function MobileHomeButton({ onClick, onModeSelect, activeMode }) {
  const [more, setMore] = useState(false)
  const go = (mode) => {
    setMore(false)
    if (mode === APP_MODES.HOME) { onClick?.(); return }
    if (onModeSelect) onModeSelect(mode)
    else onClick?.(mode)
  }

  return (
    <>
      <nav className="mobile-tabs" aria-label="Primary navigation">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeMode === tab.mode || (!activeMode && tab.mode === APP_MODES.HOME)
          return (
            <button key={tab.mode} type="button" className={active ? 'is-on' : ''} onClick={() => go(tab.mode)} aria-label={tab.label} aria-current={active ? 'page' : undefined}>
              <Icon size={17} strokeWidth={1.5} aria-hidden />
              <span>{tab.label}</span>
            </button>
          )
        })}
        <button type="button" className={more ? 'is-on' : ''} onClick={() => setMore(!more)} aria-label="More modes" aria-expanded={more}>
          <MoreHorizontal size={17} strokeWidth={1.5} aria-hidden />
          <span>More</span>
        </button>
      </nav>

      {more ? <div className="mobile-more-backdrop" onClick={() => setMore(false)} aria-hidden /> : null}
      {more ? (
        <div className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="More modes">
          <header>
            <h2>All modes</h2>
            <button type="button" onClick={() => setMore(false)} aria-label="Close"><X size={16} strokeWidth={1.5} /></button>
          </header>
          <ul>
            {MORE.map((entry) => (
              <li key={entry.mode}>
                <button type="button" onClick={() => go(entry.mode)}>
                  <span>{entry.label}</span>
                  <code>{pathFromMode(entry.mode)}</code>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}
