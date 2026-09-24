import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { wakeApiEarly } from './lib/homeBootstrap.js'
import './index.css'
import './theme-y2k.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Overlap Render cold start with JS parse / React mount
wakeApiEarly()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Analytics />
    </ErrorBoundary>
  </StrictMode>,
)
