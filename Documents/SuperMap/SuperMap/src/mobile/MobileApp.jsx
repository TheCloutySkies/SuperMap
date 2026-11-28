/**
 * The phone app: five tabs, a stack that follows the route, and sheets for
 * anything that used to be a window. It reads the same stores as the desktop.
 */
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { viewFromPath, pathFromView } from '../lib/appRoutes'
import { visibleModes } from '../features/accounts/menuCatalog'
import { setLayoutPref } from '../lib/layoutPref'
import MobileHome from './MobileHome'
import MobileMaps from './MobileMaps'
import MobileNews from './MobileNews'
import MobileCases from './MobileCases'
import MobileAccount from './MobileAccount'
import './mobile.css'

const TABS = [
  { id: 'home', label: 'Home', path: '/dashboard', views: ['home', 'desktop'] },
  { id: 'maps', label: 'Maps', path: '/maps', views: ['community-map', 'osint-map', 'conflict-map', 'explore-map', 'geolocate-map', 'flock-map', 'live-webcams', 'print-map'] },
  { id: 'news', label: 'News', path: '/news', views: ['news-feeds', 'recent-videos', 'osint-x', 'broadcasts'] },
  { id: 'cases', label: 'Cases', path: '/batman/cases', views: ['batman-cases', 'batman-overview', 'batman'] },
  { id: 'account', label: 'Account', path: '/accounts', views: ['accounts', 'settings', 'resources', 'tools', 'reports', 'bulletin', 'crime', 'weather', 'forensics', 'search-results'] },
]

function tabFor(viewId) {
  return TABS.find((tab) => tab.views.includes(viewId)) || TABS[0]
}

export default function MobileApp() {
  const location = useLocation()
  const navigate = useNavigate()
  const route = useMemo(() => viewFromPath(location.pathname), [location.pathname])
  const viewId = route.viewId === 'desktop' ? 'home' : route.viewId
  const tab = tabFor(viewId)
  const [menu, setMenu] = useState(false)

  const title = useMemo(() => {
    if (viewId === 'home') return 'Good Palantir'
    const mode = visibleModes().find((row) => row.id.toLowerCase() === viewId)
    return mode?.label || {
      'community-map': 'Maps',
      'osint-map': 'Maps',
      'news-feeds': 'GPN',
      'batman-cases': 'Cases',
      'batman-overview': 'Batman Mode',
      accounts: 'Account',
    }[viewId] || 'Good Palantir'
  }, [viewId])

  const atTabRoot = TABS.some((row) => row.id === tab.id && row.path === location.pathname)

  function screen() {
    if (viewId === 'news-feeds' || viewId === 'recent-videos') return <MobileNews />
    if (tab.id === 'maps') return <MobileMaps />
    if (tab.id === 'cases') return <MobileCases />
    if (tab.id === 'account') return <MobileAccount />
    return <MobileHome onOpen={(path) => navigate(path)} />
  }

  return (
    <div className="mob-app">
      <header className="mob-head">
        {atTabRoot ? (
          <span className="mob-head-mark" aria-hidden="true">
            <span className="mob-head-blocks" />
          </span>
        ) : (
          <button type="button" className="mob-back" aria-label="Back" onClick={() => navigate(-1)}>‹</button>
        )}
        <h1 className="mob-title">{title}</h1>
        <button type="button" className="mob-menu-btn" aria-label="All screens" aria-expanded={menu} onClick={() => setMenu((open) => !open)}>⋯</button>
      </header>

      <main className="mob-body" key={viewId}>{screen()}</main>

      <nav className="mob-tabs" aria-label="Sections">
        {TABS.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`mob-tab${row.id === tab.id ? ' is-on' : ''}`}
            aria-current={row.id === tab.id ? 'page' : undefined}
            onClick={() => navigate(row.path)}
          >
            <span>{row.label}</span>
          </button>
        ))}
      </nav>

      {menu ? (
        <div className="mob-sheet-backdrop" role="presentation" onClick={() => setMenu(false)}>
          <div className="mob-sheet" role="dialog" aria-label="All screens" onClick={(event) => event.stopPropagation()}>
            <p className="mob-sheet-title">All screens</p>
            <div className="mob-sheet-list">
              {visibleModes().map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className="mob-row"
                  onClick={() => { setMenu(false); navigate(pathFromView(mode.id.toLowerCase())) || navigate(tabFor(mode.id.toLowerCase()).path) }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <button type="button" className="mob-row" onClick={() => { setLayoutPref('desktop'); setMenu(false) }}>
              Use the desktop layout
            </button>
            <button type="button" className="mob-row mob-row--quiet" onClick={() => setMenu(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
