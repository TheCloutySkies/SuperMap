import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { wakeApiEarly } from './lib/homeBootstrap.js'
import 'xp.css/dist/XP.css'
// Base and legacy sheets first, XP last: the shell must win the cascade.
import './index.css'
import './theme-y2k.css'
import './styles/xp-overrides.css'
import './styles/xp-content.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { AccountsOverlay, AccountsProvider } from './features/accounts/SuperMapAccounts.jsx'

// Overlap Render cold start with JS parse / React mount
wakeApiEarly()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AccountsProvider>
        <BrowserRouter>
          <App />
          {/* Inside the router: the accounts overlay and the messenger use router hooks. */}
          <AccountsOverlay />
        </BrowserRouter>
      </AccountsProvider>
      <Analytics />
    </ErrorBoundary>
  </StrictMode>,
)
