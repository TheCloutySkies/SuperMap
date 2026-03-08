import { useState } from 'react'
import './QuickTutorialModal.css'

const STEPS = [
  {
    title: 'Home & Footer Modes',
    text: 'Use the footer to switch HOME, MAPS, FEEDS, RESOURCES, REPORT MAKER, and SETTINGS.',
  },
  {
    title: 'Maps & Layers',
    text: 'In MAPS, use the right sidebar to enable intelligence layers like earthquakes, cameras, ADS-B, and infrastructure.',
  },
  {
    title: 'Search Tools',
    text: 'Top search bar scans map/events/feeds. Place search flies the map. Weather search updates weather by location.',
  },
  {
    title: 'Draw & Save',
    text: 'Enable Draw Tool to create polygons/lines and save center points with custom icons. Drawings and points persist.',
  },
  {
    title: 'Report Maker',
    text: 'Build reports with narrative text, article links, locations, screenshot attachments, and X links. Export as MD/TXT/JSON.',
  },
]

export default function QuickTutorialModal({ onClose }) {
  const [profileName, setProfileName] = useState('')

  return (
    <div className="quick-tutorial-overlay" role="dialog" aria-modal="true" aria-label="Quick tutorial">
      <div className="quick-tutorial-modal">
        <h2>Welcome to SuperMap</h2>
        <p className="quick-tutorial-intro">Quick setup + tour of your tools:</p>
        <div className="quick-tutorial-profile">
          <label htmlFor="tutorial-profile-name">Profile name (optional)</label>
          <input
            id="tutorial-profile-name"
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="e.g. Operations"
          />
        </div>
        <ul className="quick-tutorial-steps">
          {STEPS.map((s) => (
            <li key={s.title}>
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
        <div className="quick-tutorial-actions">
          <button type="button" onClick={() => onClose?.(profileName.trim())}>Start</button>
        </div>
      </div>
    </div>
  )
}

