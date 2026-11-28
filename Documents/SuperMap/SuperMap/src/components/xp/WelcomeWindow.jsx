/** The one-time welcome dialog: what the desktop is, and a checkbox to mute it. */
import { useState } from 'react'
import XpDialog from './XpDialog'
import { rememberWelcome, welcomeOnStartup } from '../../lib/welcomePrefs'

export default function WelcomeWindow({ onClose }) {
  const [always, setAlways] = useState(() => welcomeOnStartup())

  const close = () => {
    rememberWelcome({ always })
    onClose?.()
  }

  return (
    <XpDialog
      title="Welcome to Good Palantir"
      onClose={close}
      actions={(
        <button type="button" className="default" onClick={close}>
          OK
        </button>
      )}
    >
      <p><strong>This is a desktop, not a landing page.</strong> Two ways in:</p>
      <ul className="xp-welcome-list">
        <li><strong>Dashboard</strong> — every desk as one live operations board.</li>
        <li><strong>The icons</strong> — Maps, Crime, Weather, Batman Mode, News, Bulletin, Tools, Resources and Reports, each opening in its own window.</li>
      </ul>
      <p>The taskbar keeps the window you have open; Start lists everything. Minimising or closing a window brings you back here.</p>
      <label className="xp-welcome-check">
        <input
          type="checkbox"
          checked={always}
          onChange={(event) => setAlways(event.target.checked)}
        />
        Show this at startup
      </label>
    </XpDialog>
  )
}
