import { useState } from 'react'
import { setConfigured, setConfigProfile, BRAND_LOGO_SRC, BRAND_LOGO_ALT } from '../constants'
import './ConfigProfileSetup.css'

export default function ConfigProfileSetup({ onComplete }) {
  const [profileName, setProfileName] = useState('')
  const [complete, setComplete] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!profileName.trim()) return
    setConfigProfile({ name: profileName.trim() })
    setConfigured(true)
    setComplete(true)
    setTimeout(() => onComplete(), 300)
  }

  return (
    <div className="config-profile">
      <div className="config-profile-card">
        <div className="config-profile-brand">
          <img
            className="config-profile-logo"
            src={BRAND_LOGO_SRC}
            alt={BRAND_LOGO_ALT}
            width={96}
            height={96}
          />
          <h1 className="config-profile-title">SuperMap</h1>
        </div>
        <p className="config-profile-subtitle">Configuration Profile</p>
        <p className="config-profile-desc">
          Create a profile to personalize your OSINT & tactical workspace.
        </p>
        {!complete ? (
          <form onSubmit={handleSubmit} className="config-profile-form">
            <label htmlFor="profile-name">Profile name</label>
            <input
              id="profile-name"
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="e.g. Operations"
              autoFocus
            />
            <button type="submit" disabled={!profileName.trim()}>
              Continue
            </button>
          </form>
        ) : (
          <p className="config-profile-done">Profile saved. Redirecting…</p>
        )}
      </div>
    </div>
  )
}
