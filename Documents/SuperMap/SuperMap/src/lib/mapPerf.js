/**
 * Caps for MapLibre / canvas work on Firefox and LibreWolf
 * (Resist Fingerprinting makes large canvas reads extremely expensive).
 */

export function isGeckoEngine() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /firefox|librewolf/i.test(ua) || typeof window.InstallTrigger !== 'undefined'
}

/** Clamp MapLibre pixelRatio so hidpi canvases stay modest. */
export function capMapPixelRatio(max = 1.5) {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
  return Math.min(Math.max(1, dpr), max)
}
