/**
 * Batman Mode — the shell with two views.
 *
 * Overview is where you explore published material first; Cases is the existing
 * investigation workbench. The last view is remembered. Both live under the
 * same noir theme, and nothing here touches the emerald theme outside it.
 */
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { useSuperMapAccount } from '../accounts/SuperMapAccounts'
import OverviewView from './overview/OverviewView'
import CasesWorkspace from './CasesWorkspace'
import DraggableTabs from '../../components/operations/DraggableTabs'
import useTabOrder from '../../lib/tabOrder'
import './batman.css'
import './overview/overview.css'

const VIEW_KEY = 'supermap.batman.view.v1'

function savedView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'cases' ? 'cases' : 'overview'
  } catch {
    return 'overview'
  }
}

function initialView(view) {
  if (view === 'batman-cases') return 'cases'
  if (view === 'batman-overview') return 'overview'
  return savedView() // /batman and the legacy /strategic alias honor the last view
}

export default function BatmanView({ view }) {
  const navigate = useNavigate()
  const { user } = useSuperMapAccount()
  const [tab, setTab] = useState(() => initialView(view))
  const [viewOrder, reorderViews] = useTabOrder('batman', ['overview', 'cases'])
  const choose = useCallback((next) => {
    setTab(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* private mode */ }
    navigate(next === 'cases' ? '/batman/cases' : '/batman/overview')
  }, [navigate])

  return (
    <div className="batman-mode xp-dark-island">
      <header className="batman-head bm-shell-head">
        <div className="batman-title">
          <h1><Shield size={16} strokeWidth={1.5} aria-hidden /> Batman Mode</h1>
          <p>Explore what is published, then build the case. {user ? `Signed in as ${user.email || user.uid}.` : 'Sign in to save cases to your account.'}</p>
        </div>
        <DraggableTabs
          tabs={viewOrder}
          active={tab}
          onChange={choose}
          onReorder={reorderViews}
          label="Batman Mode views"
        />
      </header>

      {tab === 'overview' ? (
        <OverviewView onGoCases={() => choose('cases')} />
      ) : (
        <CasesWorkspace />
      )}
    </div>
  )
}
