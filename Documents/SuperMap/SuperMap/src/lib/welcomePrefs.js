/** Where the welcome dialog's preference lives. */
const KEY = 'supermap.xp.welcome.v1'

export function welcomeOnStartup() {
  try {
    return localStorage.getItem(KEY) !== 'never'
  } catch {
    return true
  }
}

export function shouldShowWelcome() {
  try {
    return localStorage.getItem(KEY) !== 'never' && !localStorage.getItem('supermap.xp.welcomed')
  } catch {
    return false
  }
}

export function rememberWelcome({ always, seen = true }) {
  try {
    if (seen) localStorage.setItem('supermap.xp.welcomed', '1')
    localStorage.setItem(KEY, always ? 'always' : 'once')
  } catch { /* private mode */ }
}
