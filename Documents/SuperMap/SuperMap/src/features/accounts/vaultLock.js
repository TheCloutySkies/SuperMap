const ITERATIONS = 120000

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function passcodeDigitsOk(code, digits) {
  const length = Number(digits)
  if (length !== 4 && length !== 6) return false
  return new RegExp(`^\\d{${length}}$`).test(String(code || ''))
}

export function readVaultLock(stored) {
  const lock = stored?.vaultLock
  const digits = Number(lock?.digits)
  const hash = typeof lock?.hash === 'string' ? lock.hash : ''
  if ((digits === 4 || digits === 6) && /^[a-f0-9]{64}$/.test(hash)) return { digits, hash }
  return null
}

export async function hashVaultPasscode(passcode, uid) {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot store a vault passcode.')
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(String(passcode)), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: enc.encode(`supermap.vault.v1.${uid}`),
    iterations: ITERATIONS,
    hash: 'SHA-256',
  }, key, 256)
  return bytesToHex(bits)
}

export async function vaultPasscodeMatches(passcode, lock, uid) {
  if (!lock?.hash || !uid) return false
  const hash = await hashVaultPasscode(passcode, uid)
  if (hash.length !== lock.hash.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i += 1) diff |= hash.charCodeAt(i) ^ lock.hash.charCodeAt(i)
  return diff === 0
}

function unlockKey(uid) {
  return `supermap.vault.unlocked.${uid}`
}

export function vaultUnlocked(uid) {
  if (!uid) return false
  try { return sessionStorage.getItem(unlockKey(uid)) === '1' } catch { return false }
}

export function setVaultUnlocked(uid, on) {
  if (!uid) return
  try {
    if (on) sessionStorage.setItem(unlockKey(uid), '1')
    else sessionStorage.removeItem(unlockKey(uid))
  } catch { /* private mode */ }
}
