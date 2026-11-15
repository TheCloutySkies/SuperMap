/** Stable public identity for an account. Derived from the uid so it never changes. */

export function accountHandle(uid) {
  const clean = String(uid || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const tail = (clean.slice(-8) || 'account').padStart(8, '0')
  return `@${tail}`
}

export function accountNumber(uid) {
  const clean = String(uid || '')
  let hash = 2166136261
  for (let i = 0; i < clean.length; i += 1) {
    hash ^= clean.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return String((hash >>> 0) % 100000000).padStart(8, '0')
}

export function personHandle(person) {
  const stored = String(person?.handle || '').trim()
  if (stored.startsWith('@') && stored.length > 1) return stored
  return accountHandle(person?.uid)
}

export function personNumber(person) {
  const stored = String(person?.accountNumber || '').replace(/\D/g, '')
  if (stored.length === 8) return stored
  return accountNumber(person?.uid)
}

function genericName(name) {
  const n = String(name || '').trim().toLowerCase()
  return !n || n === 'anonymous' || n === 'operator' || n === 'person'
}

/** Name to show in a list. Generic names fall back to the @username. */
export function personTitle(person) {
  const name = String(person?.displayName || '').trim()
  if (genericName(name)) return personHandle(person)
  return name
}
