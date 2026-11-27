/**
 * One place that decides whether the server may fetch a URL a visitor supplied.
 *
 * The allowlists in the routes stop the obvious cases, but a redirect, a
 * single-label host name or an address written as a number all slip past a
 * hostname string check. Everything that fetches a caller's URL uses this:
 * the parse, the private-address test, and a redirect hook so hop two is
 * checked exactly like hop one.
 */

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.google.com',
  'instance-data',
])

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.lan', '.corp']

/** "2130706433", "0x7f000001" and "127.1" all mean a private address. */
function toDotted(address) {
  const text = String(address || '').trim()
  if (!text) return null
  if (/^\d+$/.test(text)) {
    const value = Number(text)
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) return null
    return [
      (value >>> 24) & 255,
      (value >>> 16) & 255,
      (value >>> 8) & 255,
      value & 255,
    ].join('.')
  }
  if (/^0x[0-9a-f]+$/i.test(text)) {
    const value = Number.parseInt(text, 16)
    if (!Number.isSafeInteger(value) || value > 0xffffffff) return null
    return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.')
  }
  const parts = text.split('.')
  if (parts.length > 1 && parts.length < 4 && parts.every((part) => /^\d+$/.test(part))) {
    // 127.1 and 10.0.1 are shorthand for a full address.
    const filled = [...parts]
    while (filled.length < 4) filled.push('0')
    return filled.join('.')
  }
  return text
}

/** True for anything that is not a public unicast address. */
function isPrivateHost(hostname) {
  const dotted = toDotted(String(hostname || '').toLowerCase().replace(/\.+$/, ''))
  if (!dotted) return true
  const host = dotted.toLowerCase()
  if (!host) return true
  if (BLOCKED_HOSTS.has(host)) return true
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true
  // An IPv6 literal is never a public web host here, and a bare name is a
  // machine on the internal network rather than a site.
  if (host.includes(':') || host.startsWith('[')) return true
  if (!host.includes('.')) return true
  const parts = host.split('.').map((part) => Number(part))
  if (!(parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255))) {
    return false
  }
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

/** Parse and vet a caller's URL. Returns `{ ok, url }` or `{ ok: false, error }`. */
function safeUrl(raw, { protocols = ['http:', 'https:'] } = {}) {
  let target
  try {
    target = new URL(String(raw || '').trim())
  } catch {
    return { ok: false, error: 'That URL is not usable.' }
  }
  if (!protocols.includes(target.protocol)) {
    return { ok: false, error: 'Only http and https URLs can be loaded.' }
  }
  if (target.username || target.password) {
    return { ok: false, error: 'A URL with credentials is not fetched.' }
  }
  if (isPrivateHost(target.hostname)) {
    return { ok: false, error: 'That host is not allowed.' }
  }
  return { ok: true, url: target.toString() }
}

/**
 * axios `beforeRedirect` hook: every hop is checked, so an allowed host cannot
 * hand the request to an internal one.
 */
function redirectGuard(isAllowed) {
  return (options) => {
    const proto = options.protocol || 'https:'
    const host = options.hostname || options.host || ''
    const path = options.pathname || options.path || '/'
    const next = `${proto}//${host}${path}`
    if (isPrivateHost(host)) {
      const error = new Error('Redirect target is a private address')
      error.code = 'REDIRECT_BLOCKED'
      throw error
    }
    if (isAllowed && !isAllowed(next)) {
      const error = new Error('Redirect target is not on the allowlist')
      error.code = 'REDIRECT_BLOCKED'
      throw error
    }
  }
}

module.exports = { safeUrl, isPrivateHost, redirectGuard }
