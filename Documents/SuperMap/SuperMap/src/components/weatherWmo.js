const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

export function wmoKind(code) {
  const n = Number(code)
  if (!Number.isFinite(n)) return 'overcast'
  if (n === 0 || n === 1) return 'clear'
  if (n === 2) return 'partly'
  if (n === 3) return 'overcast'
  if (n === 45 || n === 48) return 'fog'
  if (n >= 51 && n <= 57) return 'drizzle'
  if ((n >= 61 && n <= 67) || (n >= 80 && n <= 82)) return 'rain'
  if ((n >= 71 && n <= 77) || n === 85 || n === 86) return 'snow'
  if (n >= 95) return 'storm'
  return 'overcast'
}

export function compassFromDeg(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return ''
  const i = Math.round(Number(deg) / 22.5) % 16
  return COMPASS[(i + 16) % 16]
}
