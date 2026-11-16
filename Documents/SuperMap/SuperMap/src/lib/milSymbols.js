import milsymbol from 'milsymbol'

const SymbolCtor = milsymbol.Symbol

export const PIN_CATEGORIES = [
  ['x', 'X'],
  ['news', 'News'],
  ['conflict', 'Conflict'],
  ['attack', 'Attack'],
  ['planes', 'Planes'],
  ['cars', 'Cars'],
  ['drones', 'Drones'],
  ['ships', 'Ships'],
  ['explosion', 'Explosion'],
  ['outage', 'Power outage'],
]

export const CATEGORY_SIDC = {
  x: 'SFGPU------',
  news: 'SFGPU------',
  conflict: 'SHGPUCI----',
  attack: 'SHAPMFA----',
  planes: 'SFAPMF-----',
  cars: 'SFGPEVCA---',
  drones: 'SHAPMFQ----',
  ships: 'SFSPCL-----',
  explosion: 'EHIPBA----',
  outage: 'SFGPIUE----',
}

/** MIL-STD-2525C symbols drawn by milsymbol, the same standard ATAK uses. */
export const MIL_SYMBOLS = [
  { group: 'Air', label: 'Fixed wing', sidc: 'SFAPMF-----' },
  { group: 'Air', label: 'Fighter', sidc: 'SFAPMFF----' },
  { group: 'Air', label: 'Attack aircraft', sidc: 'SFAPMFA----' },
  { group: 'Air', label: 'Hostile attack aircraft', sidc: 'SHAPMFA----' },
  { group: 'Air', label: 'Rotary wing', sidc: 'SFAPMH-----' },
  { group: 'Air', label: 'Drone', sidc: 'SFAPMFQ----' },
  { group: 'Air', label: 'Hostile drone', sidc: 'SHAPMFQ----' },
  { group: 'Air', label: 'Missile', sidc: 'SFAPW------' },
  { group: 'Air', label: 'Civilian aircraft', sidc: 'SFAPCF-----' },
  { group: 'Ground', label: 'Infantry', sidc: 'SFGPUCI----' },
  { group: 'Ground', label: 'Hostile infantry', sidc: 'SHGPUCI----' },
  { group: 'Ground', label: 'Armor', sidc: 'SFGPUCA----' },
  { group: 'Ground', label: 'Hostile armor', sidc: 'SHGPUCA----' },
  { group: 'Ground', label: 'Artillery', sidc: 'SFGPUCF----' },
  { group: 'Ground', label: 'Missile launcher', sidc: 'SFGPEWM----' },
  { group: 'Ground', label: 'Car', sidc: 'SFGPEVCA---' },
  { group: 'Ground', label: 'Jeep', sidc: 'SFGPEVCJ---' },
  { group: 'Ground', label: 'Truck', sidc: 'SFGPEVCO---' },
  { group: 'Sea', label: 'Warship', sidc: 'SFSPCL-----' },
  { group: 'Sea', label: 'Hostile warship', sidc: 'SHSPCL-----' },
  { group: 'Sea', label: 'Carrier', sidc: 'SFSPCLCV---' },
  { group: 'Sea', label: 'Destroyer', sidc: 'SFSPCLDD---' },
  { group: 'Sea', label: 'Merchant', sidc: 'SFSPXM-----' },
  { group: 'Incident', label: 'Bomb', sidc: 'EHIPBA----' },
  { group: 'Incident', label: 'Shooting', sidc: 'EHIPBF----' },
  { group: 'Incident', label: 'Fire', sidc: 'EHIPC-----' },
  { group: 'Incident', label: 'Electric power', sidc: 'SFGPIUE----' },
  { group: 'Incident', label: 'Nuclear power', sidc: 'SFGPIUEN--' },
]

const thumbs = new Map()

export function categoryLabel(id) {
  return PIN_CATEGORIES.find(([key]) => key === id)?.[1] || 'News'
}

export function categorySidc(id) {
  return CATEGORY_SIDC[id] || CATEGORY_SIDC.news
}

export function drawSymbol(sidc, size = 36) {
  const code = String(sidc || '').trim()
  if (!code || !SymbolCtor) return null
  try {
    const symbol = new SymbolCtor(code, { size })
    if (!symbol.isValid()) return null
    return symbol
  } catch {
    return null
  }
}

export function sidcDataUrl(sidc, size = 36) {
  const key = `${sidc}:${size}`
  if (thumbs.has(key)) return thumbs.get(key)
  const symbol = drawSymbol(sidc, size)
  const url = symbol ? symbol.toDataURL() : ''
  thumbs.set(key, url)
  return url
}

export function sidcIconId(sidc) {
  return `pin-sidc-${String(sidc || '').replace(/[^A-Za-z0-9]/g, '') || 'mark'}`
}

export function ensureSidcIcon(map, sidc) {
  const id = sidcIconId(sidc)
  if (!map || typeof map.hasImage !== 'function') return id
  if (map.hasImage(id)) return id
  const symbol = drawSymbol(sidc, 40)
  const canvas = symbol?.asCanvas?.()
  const ctx = canvas?.getContext?.('2d')
  if (!ctx) return id
  try {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    map.addImage(id, data, { pixelRatio: 2 })
  } catch {
    /* already added during a style rebuild */
  }
  return id
}
