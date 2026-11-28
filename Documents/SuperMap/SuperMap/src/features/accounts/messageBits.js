/**
 * Presence words and timestamps written once, shared by the account workspace,
 * the public profile and the messenger.
 */

export const PRESENCE_VALUES = ['online', 'away', 'busy', 'offline', 'incognito']

/** Anything unknown reads as offline, so a stray value never paints a green dot. */
export function presenceValue(value) {
  return PRESENCE_VALUES.includes(value) ? value : 'offline'
}

export function presenceLabel(presence) {
  const value = presenceValue(presence)
  if (value === 'online') return 'Online'
  if (value === 'away') return 'Away'
  if (value === 'busy') return 'Busy'
  if (value === 'incognito') return 'Invisible'
  return 'Offline'
}

export function when(ms) {
  if (!ms) return ''
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function ago(ms) {
  if (!ms) return ''
  const sec = Math.max(0, Math.floor((Date.now() - Number(ms)) / 1000))
  if (sec < 60) return 'now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** "0:28" under an hour, "1h 04m" under a day, "2d 3h" above it. */
export function countdownText(msLeft) {
  const left = Math.max(0, Number(msLeft) || 0)
  const seconds = Math.ceil(left / 1000)
  if (seconds < 3600) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const hours = Math.floor(seconds / 3600)
  if (hours < 24) return `${hours}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}
