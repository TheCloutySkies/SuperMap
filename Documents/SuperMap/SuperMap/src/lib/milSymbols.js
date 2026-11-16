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
  { group: 'Planes', label: 'Plane', sidc: 'SFAPMF-----' },
  { group: 'Planes', label: 'Fighter', sidc: 'SFAPMFF----' },
  { group: 'Planes', label: 'Bomber', sidc: 'SFAPMFB----' },
  { group: 'Planes', label: 'Attack jet', sidc: 'SFAPMFA----' },
  { group: 'Planes', label: 'Enemy plane', sidc: 'SHAPMFA----' },
  { group: 'Planes', label: 'Cargo plane', sidc: 'SFAPMFC----' },
  { group: 'Planes', label: 'Tanker', sidc: 'SFAPMFK----' },
  { group: 'Planes', label: 'Recon plane', sidc: 'SFAPMFR----' },
  { group: 'Planes', label: 'Radar plane', sidc: 'SFAPMFRW---' },
  { group: 'Planes', label: 'Helicopter', sidc: 'SFAPMH-----' },
  { group: 'Planes', label: 'Attack helicopter', sidc: 'SFAPMHA----' },
  { group: 'Planes', label: 'Drone', sidc: 'SFAPMFQ----' },
  { group: 'Planes', label: 'Attack drone', sidc: 'SFAPMFQA---' },
  { group: 'Planes', label: 'Enemy drone', sidc: 'SHAPMFQ----' },
  { group: 'Planes', label: 'Civilian plane', sidc: 'SFAPCF-----' },
  { group: 'Planes', label: 'Missile', sidc: 'SFAPW------' },
  { group: 'Planes', label: 'Air ambulance', sidc: 'SFAPMFO----' },
  { group: 'Vehicles', label: 'Troops', sidc: 'SFGPUCI----' },
  { group: 'Vehicles', label: 'Enemy troops', sidc: 'SHGPUCI----' },
  { group: 'Vehicles', label: 'Tank', sidc: 'SFGPUCA----' },
  { group: 'Vehicles', label: 'Enemy tank', sidc: 'SHGPUCA----' },
  { group: 'Vehicles', label: 'Artillery', sidc: 'SFGPUCF----' },
  { group: 'Vehicles', label: 'Air defense', sidc: 'SFGPUCD----' },
  { group: 'Vehicles', label: 'Rockets', sidc: 'SFGPEWM----' },
  { group: 'Vehicles', label: 'Troop carrier', sidc: 'SFGPEVAA---' },
  { group: 'Vehicles', label: 'Military truck', sidc: 'SFGPEVU----' },
  { group: 'Vehicles', label: 'Ambulance', sidc: 'SFGPEVUA---' },
  { group: 'Vehicles', label: 'Police', sidc: 'SFGPUULM---' },
  { group: 'Vehicles', label: 'Car', sidc: 'SFGPEVCA---' },
  { group: 'Vehicles', label: 'Jeep', sidc: 'SFGPEVCJ---' },
  { group: 'Vehicles', label: 'Truck', sidc: 'SFGPEVCO---' },
  { group: 'Vehicles', label: 'Bus', sidc: 'SFGPEVUB---' },
  { group: 'Vehicles', label: 'Semi', sidc: 'SFGPEVUS---' },
  { group: 'Vehicles', label: 'Train', sidc: 'SFGPEVT----' },
  { group: 'Ships', label: 'Warship', sidc: 'SFSPCL-----' },
  { group: 'Ships', label: 'Enemy ship', sidc: 'SHSPCL-----' },
  { group: 'Ships', label: 'Carrier', sidc: 'SFSPCLCV---' },
  { group: 'Ships', label: 'Battleship', sidc: 'SFSPCLBB---' },
  { group: 'Ships', label: 'Cruiser', sidc: 'SFSPCLCC---' },
  { group: 'Ships', label: 'Destroyer', sidc: 'SFSPCLDD---' },
  { group: 'Ships', label: 'Frigate', sidc: 'SFSPCLFF---' },
  { group: 'Ships', label: 'Patrol boat', sidc: 'SFSPCPSB---' },
  { group: 'Ships', label: 'Submarine', sidc: 'SFUPS------' },
  { group: 'Ships', label: 'Nuclear sub', sidc: 'SFUPSN-----' },
  { group: 'Ships', label: 'Landing ship', sidc: 'SFSPCALS---' },
  { group: 'Ships', label: 'Cargo ship', sidc: 'SFSPXM-----' },
  { group: 'Ships', label: 'Hospital ship', sidc: 'SFSPNM-----' },
  { group: 'Events', label: 'Bomb', sidc: 'EHIPBA----' },
  { group: 'Events', label: 'Unexploded bomb', sidc: 'EHIPDO----' },
  { group: 'Events', label: 'Shooting', sidc: 'EHIPBF----' },
  { group: 'Events', label: 'Fire', sidc: 'EHIPC-----' },
  { group: 'Events', label: 'House fire', sidc: 'EHIPCD----' },
  { group: 'Events', label: 'Wildfire', sidc: 'EHIPCH----' },
  { group: 'Events', label: 'Smoke', sidc: 'EHIPCF----' },
  { group: 'Events', label: 'Hazmat', sidc: 'EHIPD-----' },
  { group: 'Events', label: 'Chemical', sidc: 'EHIPDA----' },
  { group: 'Events', label: 'Riot', sidc: 'EHIPAC----' },
  { group: 'Events', label: 'Looting', sidc: 'EHIPBD----' },
  { group: 'Events', label: 'Hijacking', sidc: 'EHIPF-----' },
  { group: 'Events', label: 'Train crash', sidc: 'EHIPGA----' },
  { group: 'Events', label: 'Earthquake', sidc: 'EHNPAC----' },
  { group: 'Events', label: 'Aftershock', sidc: 'EHNPAA----' },
  { group: 'Events', label: 'Landslide', sidc: 'EHNPAD----' },
  { group: 'Events', label: 'Volcano', sidc: 'EHNPAG----' },
  { group: 'Events', label: 'Flood', sidc: 'EHNPBC----' },
  { group: 'Events', label: 'Drought', sidc: 'EHNPBB----' },
  { group: 'Events', label: 'Tsunami', sidc: 'EHNPBM----' },
  { group: 'Events', label: 'Power', sidc: 'SFGPIUE----' },
  { group: 'Events', label: 'Nuclear', sidc: 'SFGPIUEN--' },
]

/** MIL-STD-2525C emergency incident: wild fire (E-I-CH). */
export const WILDFIRE_SIDC = 'EHIPCH----'

/** MIL-STD-2525C natural event: earthquake epicenter (E-N-AC). */
export const EARTHQUAKE_SIDC = 'EHNPAC----'

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
