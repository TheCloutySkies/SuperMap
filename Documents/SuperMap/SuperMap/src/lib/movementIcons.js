/**
 * Nose-up silhouettes for military aircraft and ships, plus the click popups
 * that list every field the live feed actually sent.
 */

const AIR_LABELS = [
  ['flight', 'Callsign'],
  ['r', 'Registration'],
  ['hex', 'Hex'],
  ['t', 'Type'],
  ['category', 'Category'],
  ['type', 'Source'],
  ['dbFlags', 'Military flag'],
  ['lat', 'Latitude'],
  ['lon', 'Longitude'],
  ['track', 'Track'],
  ['true_heading', 'True heading'],
  ['mag_heading', 'Magnetic heading'],
  ['calc_track', 'Calculated track'],
  ['gs', 'Ground speed'],
  ['ias', 'Indicated airspeed'],
  ['tas', 'True airspeed'],
  ['mach', 'Mach'],
  ['roll', 'Roll'],
  ['track_rate', 'Track rate'],
  ['alt_baro', 'Barometric altitude'],
  ['alt_geom', 'Geometric altitude'],
  ['baro_rate', 'Barometric rate'],
  ['geom_rate', 'Geometric rate'],
  ['squawk', 'Squawk'],
  ['emergency', 'Emergency'],
  ['alert', 'Alert'],
  ['spi', 'Ident'],
  ['nav_altitude_mcp', 'Selected altitude'],
  ['nav_altitude_fms', 'FMS altitude'],
  ['nav_heading', 'Selected heading'],
  ['nav_modes', 'Autopilot modes'],
  ['nav_qnh', 'Altimeter setting'],
  ['wd', 'Wind direction'],
  ['ws', 'Wind speed'],
  ['oat', 'Outside air temperature'],
  ['tat', 'Total air temperature'],
  ['nic', 'NIC'],
  ['rc', 'Containment radius'],
  ['nac_p', 'Position accuracy'],
  ['nac_v', 'Velocity accuracy'],
  ['sil', 'SIL'],
  ['sil_type', 'SIL type'],
  ['sda', 'SDA'],
  ['seen', 'Seconds since message'],
  ['seen_pos', 'Seconds since position'],
  ['messages', 'Messages'],
  ['rssi', 'Signal'],
  ['version', 'ADS-B version'],
  ['nic_baro', 'Baro NIC'],
  ['gva', 'GVA'],
  ['mlat', 'MLAT fields'],
  ['tisb', 'TIS-B fields'],
]

const EXACT_FAMILY = {
  H60: 'heli', H47: 'heli', H64: 'heli', H53: 'heli',
  EC30: 'heli', EC35: 'heli', EC45: 'heli', EC55: 'heli', EC75: 'heli',
  AS32: 'heli', AS50: 'heli', AS65: 'heli', A139: 'heli', A109: 'heli',
  B06: 'heli', B212: 'heli', B412: 'heli', S70: 'heli', NH90: 'heli',
  MI8: 'heli', MI17: 'heli', MI24: 'heli', R44: 'heli', EXPL: 'heli',
  V22: 'tilt',
  C17: 'transport', C5: 'transport', C5M: 'transport', C130: 'transport',
  A400: 'transport', K35R: 'transport', K35E: 'transport', KC2: 'transport', KC46: 'transport',
  A310: 'transport', A319: 'transport', A320: 'transport', A21N: 'transport', A20N: 'transport',
  A332: 'transport', A333: 'transport', A345: 'transport', A359: 'transport',
  B762: 'transport', B763: 'transport', B744: 'transport', B752: 'transport', B772: 'transport',
  IL76: 'transport', R135: 'transport', P8: 'transport', E3CF: 'transport', E3TF: 'transport',
  GLF4: 'bizjet', GLF5: 'bizjet', GLF6: 'bizjet', GLEX: 'bizjet', GL5T: 'bizjet', GL7T: 'bizjet',
  F900: 'bizjet', F2TH: 'bizjet', C560: 'bizjet', C56X: 'bizjet', C680: 'bizjet',
  LJ35: 'bizjet', LJ45: 'bizjet', LJ60: 'bizjet', CL30: 'bizjet', CL35: 'bizjet', CL60: 'bizjet',
  E55P: 'bizjet', E550: 'bizjet',
  B350: 'prop', BE20: 'prop', BE40: 'prop', PC12: 'prop',
  TBM7: 'prop', TBM8: 'prop', TBM9: 'prop', C295: 'prop', AT8T: 'prop', AT72: 'prop', AT76: 'prop',
  SF34: 'prop', M28: 'prop', DHC8: 'prop', CN35: 'prop', TEX2: 'prop',
  PC21: 'fighter', PC9: 'fighter', T38: 'fighter', M346: 'fighter',
  F16: 'fighter', F18: 'fighter', F15: 'fighter', F22: 'fighter', F35: 'fighter',
  F14: 'fighter', F5: 'fighter', FA50: 'fighter', A10: 'fighter',
  EUFI: 'fighter', RAFAL: 'fighter', GRIPN: 'fighter', TORN: 'fighter', HAWK: 'fighter', L39: 'fighter',
}

const CATEGORY_FAMILY = {
  A7: 'heli',
  A6: 'fighter',
  A5: 'transport',
  A4: 'transport',
  A3: 'transport',
  A2: 'bizjet',
  A1: 'prop',
  A0: 'prop',
}

const NAV_STATUS = {
  0: 'Under way using engine',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted manoeuvrability',
  4: 'Constrained by draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Engaged in fishing',
  8: 'Under way sailing',
  15: 'Not defined',
}

const SHIP_TYPE = {
  35: 'Military operations',
  55: 'Law enforcement',
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function aircraftFamily(typeCode, category) {
  const code = String(typeCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (EXACT_FAMILY[code]) return EXACT_FAMILY[code]
  if (/^(H\d|EC|AS|MI|NH)/.test(code)) return 'heli'
  if (/^(F1|F2|F3|FA|SU|MIG|EUF)/.test(code)) return 'fighter'
  if (/^(C17|C5|C130|A4|K35|KC|B7|A3|IL7)/.test(code)) return 'transport'
  if (/^(GL|LJ|CL|C56|C68|F9|F2T)/.test(code)) return 'bizjet'
  if (/^(PC1|TBM|BE|B350|AT|SF3|C295)/.test(code)) return 'prop'
  if (code.startsWith('PC2')) return 'fighter'
  return CATEGORY_FAMILY[category] || 'jet'
}

export function aircraftHeading(record) {
  for (const key of ['track', 'true_heading', 'mag_heading', 'calc_track']) {
    const number = finite(record?.[key])
    if (number != null) return number
  }
  return null
}

export function aircraftIsEmergency(record) {
  const emergency = String(record?.emergency || '').trim().toLowerCase()
  if (emergency && emergency !== 'none') return true
  return ['7500', '7600', '7700'].includes(String(record?.squawk || '').trim())
}

function fillShape(ctx, fill, stroke) {
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2
  ctx.fill()
  ctx.stroke()
}

function drawFighter(ctx, fill, stroke) {
  ctx.beginPath()
  ctx.moveTo(0, -26)
  ctx.lineTo(5, -4)
  ctx.lineTo(20, 6)
  ctx.lineTo(5, 4)
  ctx.lineTo(4, 22)
  ctx.lineTo(0, 16)
  ctx.lineTo(-4, 22)
  ctx.lineTo(-5, 4)
  ctx.lineTo(-20, 6)
  ctx.lineTo(-5, -4)
  ctx.closePath()
  fillShape(ctx, fill, stroke)
}

function drawJet(ctx, fill, stroke) {
  ctx.beginPath()
  ctx.moveTo(0, -24)
  ctx.lineTo(4, -6)
  ctx.lineTo(18, 4)
  ctx.lineTo(5, 6)
  ctx.lineTo(3, 20)
  ctx.lineTo(-3, 20)
  ctx.lineTo(-5, 6)
  ctx.lineTo(-18, 4)
  ctx.lineTo(-4, -6)
  ctx.closePath()
  fillShape(ctx, fill, stroke)
}

function drawTransport(ctx, fill, stroke) {
  ctx.beginPath()
  ctx.moveTo(0, -24)
  ctx.lineTo(5, -16)
  ctx.lineTo(5, -2)
  ctx.lineTo(22, 6)
  ctx.lineTo(22, 10)
  ctx.lineTo(5, 6)
  ctx.lineTo(4, 20)
  ctx.lineTo(-4, 20)
  ctx.lineTo(-5, 6)
  ctx.lineTo(-22, 10)
  ctx.lineTo(-22, 6)
  ctx.lineTo(-5, -2)
  ctx.lineTo(-5, -16)
  ctx.closePath()
  fillShape(ctx, fill, stroke)
  ctx.fillStyle = stroke
  ;[-14, -6, 6, 14].forEach((x) => {
    ctx.beginPath()
    ctx.arc(x, 8, 2.2, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawBizjet(ctx, fill, stroke) {
  ctx.beginPath()
  ctx.moveTo(0, -24)
  ctx.lineTo(3, -8)
  ctx.lineTo(16, 2)
  ctx.lineTo(3, 4)
  ctx.lineTo(5, 14)
  ctx.lineTo(2, 18)
  ctx.lineTo(-2, 18)
  ctx.lineTo(-5, 14)
  ctx.lineTo(-3, 4)
  ctx.lineTo(-16, 2)
  ctx.lineTo(-3, -8)
  ctx.closePath()
  fillShape(ctx, fill, stroke)
}

function drawProp(ctx, fill, stroke) {
  ctx.beginPath()
  ctx.moveTo(0, -22)
  ctx.lineTo(4, -8)
  ctx.lineTo(20, 2)
  ctx.lineTo(4, 4)
  ctx.lineTo(3, 18)
  ctx.lineTo(-3, 18)
  ctx.lineTo(-4, 4)
  ctx.lineTo(-20, 2)
  ctx.lineTo(-4, -8)
  ctx.closePath()
  fillShape(ctx, fill, stroke)
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.5
  ;[-12, 12].forEach((x) => {
    ctx.beginPath()
    ctx.moveTo(x, -2)
    ctx.lineTo(x, 6)
    ctx.stroke()
  })
}

function drawHeli(ctx, fill, stroke) {
  ctx.beginPath()
  ctx.ellipse(0, 2, 6, 12, 0, 0, Math.PI * 2)
  fillShape(ctx, fill, stroke)
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, 10)
  ctx.lineTo(0, 22)
  ctx.lineTo(8, 22)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-18, -12)
  ctx.lineTo(18, -12)
  ctx.stroke()
}

function drawTilt(ctx, fill, stroke) {
  drawTransport(ctx, fill, stroke)
  ctx.fillStyle = stroke
  ;[-16, 16].forEach((x) => {
    ctx.beginPath()
    ctx.arc(x, -4, 3, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawWarship(ctx, fill, stroke) {
  ctx.beginPath()
  ctx.moveTo(0, -24)
  ctx.lineTo(7, -8)
  ctx.lineTo(8, 16)
  ctx.lineTo(4, 22)
  ctx.lineTo(-4, 22)
  ctx.lineTo(-8, 16)
  ctx.lineTo(-7, -8)
  ctx.closePath()
  fillShape(ctx, fill, stroke)
  ctx.fillStyle = stroke
  ctx.fillRect(-3, -6, 6, 10)
}

function drawPatrol(ctx, fill, stroke) {
  ctx.beginPath()
  ctx.moveTo(0, -22)
  ctx.lineTo(5, -6)
  ctx.lineTo(5, 18)
  ctx.lineTo(0, 22)
  ctx.lineTo(-5, 18)
  ctx.lineTo(-5, -6)
  ctx.closePath()
  fillShape(ctx, fill, stroke)
  ctx.fillStyle = stroke
  ctx.fillRect(-2, -2, 4, 8)
}

const DRAW = {
  'ac-fighter': drawFighter,
  'ac-jet': drawJet,
  'ac-transport': drawTransport,
  'ac-bizjet': drawBizjet,
  'ac-prop': drawProp,
  'ac-heli': drawHeli,
  'ac-tilt': drawTilt,
  'ship-war': drawWarship,
  'ship-patrol': drawPatrol,
}

function paintIcon(draw, alert) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, 64, 64)
  ctx.translate(32, 32)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  draw(ctx, alert ? '#fecaca' : '#e8eef7', alert ? '#ef4444' : '#0b1220')
  return ctx.getImageData(0, 0, 64, 64)
}

export function ensureMovementIcons(map) {
  if (!map || typeof map.hasImage !== 'function') return
  Object.entries(DRAW).forEach(([id, draw]) => {
    ;[false, true].forEach((alert) => {
      const imageId = alert ? `${id}-alert` : id
      if (map.hasImage(imageId)) return
      const data = paintIcon(draw, alert)
      if (!data) return
      try { map.addImage(imageId, data, { pixelRatio: 2 }) } catch { /* already added */ }
    })
  })
}

function present(value) {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  const text = String(value).trim()
  return text !== '' && text !== 'null'
}

function prettySource(value) {
  const text = String(value || '')
  if (text.startsWith('adsb')) return 'ADS-B'
  if (text === 'mlat') return 'MLAT'
  if (text === 'mode_s' || text === 'modes') return 'Mode S'
  if (text.startsWith('tisb')) return 'TIS-B'
  return text
}

function prettyAirValue(key, value) {
  if (key === 'type') return prettySource(value)
  if (key === 'dbFlags') return (Number(value) & 1) === 1 ? 'Yes' : String(value)
  if (key === 'spi' || key === 'alert') return Number(value) === 1 ? 'On' : 'Off'
  if (Array.isArray(value)) return value.join(', ')
  return value
}

function row(label, value) {
  return `<div><strong>${esc(label)}</strong>: ${esc(value)}</div>`
}

export function aircraftPopupHtml(props = {}) {
  const used = new Set(['icon', 'heading', 'alertMark', 'title'])
  const lines = []
  AIR_LABELS.forEach(([key, label]) => {
    if (!present(props[key])) return
    used.add(key)
    lines.push(row(label, prettyAirValue(key, props[key])))
  })
  Object.entries(props).forEach(([key, value]) => {
    if (used.has(key) || !present(value) || typeof value === 'object') return
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    lines.push(row(label, value))
  })
  const hex = String(props.hex || '').trim()
  const link = hex
    ? `<a href="https://adsb.lol/?icao=${esc(hex)}" target="_blank" rel="noopener noreferrer">Open on adsb.lol</a>`
    : ''
  const title = String(props.flight || props.r || props.hex || 'Military aircraft').trim() || 'Military aircraft'
  return `<div class="movement-popup"><strong>${esc(title)}</strong>${lines.join('')}${link}<div class="map-popup-source">adsb.lol</div></div>`
}

export function aircraftProperties(record) {
  const props = {}
  Object.entries(record || {}).forEach(([key, value]) => {
    if (value == null) return
    if (Array.isArray(value)) {
      if (value.length) props[key] = value.join(', ')
      return
    }
    if (typeof value === 'object') return
    props[key] = value
  })
  const family = aircraftFamily(record?.t, record?.category)
  props.icon = `ac-${family}`
  props.alertMark = aircraftIsEmergency(record) ? 1 : 0
  const heading = aircraftHeading(record)
  if (heading != null) props.heading = heading
  const callsign = String(record?.flight || '').trim()
  props.title = callsign || record?.r || record?.hex || 'MIL'
  return props
}

function shipTypeName(type) {
  const code = Number(type)
  return SHIP_TYPE[code] || (Number.isFinite(code) ? `Type ${code}` : '')
}

export function shipTileRows(props = {}) {
  const rows = []
  const add = (label, value) => {
    if (!present(value)) return
    rows.push([label, value])
  }
  add('Name', props.name)
  add('MMSI', props.mmsi)
  add('Flag', props.flag)
  add('Type', shipTypeName(props.type))
  add('Class', props.class)
  add('Length', present(props.length) ? `${props.length} m` : '')
  add('Beam', present(props.beam) ? `${props.beam} m` : '')
  add('Speed', present(props.sog) ? `${props.sog} kt` : '')
  add('Course', present(props.cog) ? `${props.cog}°` : '')
  const heading = present(props.heading) ? props.heading : props.hdg
  add('Heading', present(heading) ? `${heading}°` : '')
  const status = NAV_STATUS[Number(props.nav_status)]
  add('Status', status || (present(props.nav_status) ? props.nav_status : ''))
  add('Heard', present(props.age_s) ? `${props.age_s} s ago` : '')
  return rows
}

function walkValues(value, prefix, into, depth) {
  if (!present(value) || depth > 2) return
  if (Array.isArray(value)) {
    const text = value.map((item) => (item && typeof item === 'object' ? '' : item)).filter(present).join(', ')
    if (text) into.push([prefix, text])
    return
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
      const label = prefix ? `${prefix} ${key.replace(/_/g, ' ')}` : key.replace(/_/g, ' ')
      walkValues(child, label, into, depth + 1)
    })
    return
  }
  into.push([prefix, value])
}

export function shipDetailRows(detail) {
  const props = detail?.properties || detail || {}
  const rows = []
  const add = (label, value) => {
    if (!present(value) || typeof value === 'object') return
    rows.push([label, value])
  }
  add('Callsign', props.callsign)
  add('IMO', props.imo)
  add('Destination', props.destination)
  add('ETA', props.eta)
  add('Draught', present(props.draught) ? `${props.draught} m` : (present(props.draft) ? `${props.draft} m` : ''))
  walkValues(props.particulars, '', rows, 0)
  const credit = detail?.attribution || props.attribution
  if (typeof credit === 'string') add('Credit', credit)
  else if (credit && typeof credit === 'object') {
    Object.values(credit).forEach((item) => {
      if (typeof item === 'string') add('Credit', item.replace(/<[^>]+>/g, ''))
    })
  }
  return rows
}

export function shipPopupHtml(tileProps = {}, extraRows = []) {
  const seen = new Set()
  const lines = []
  ;[...shipTileRows(tileProps), ...extraRows].forEach(([label, value]) => {
    const key = String(label).toLowerCase()
    if (seen.has(key) || !present(value)) return
    seen.add(key)
    lines.push(row(label, value))
  })
  const title = tileProps.name || (tileProps.mmsi ? `MMSI ${tileProps.mmsi}` : 'Military ship')
  return `<div class="movement-popup"><strong>${esc(title)}</strong>${lines.join('')}<div class="map-popup-source">Open Waters AIS</div></div>`
}

export async function fetchShipDetail(mmsi) {
  const id = String(mmsi || '').trim()
  if (!id) return null
  const response = await fetch(`https://ais.openwaters.io/v1/vessels/${encodeURIComponent(id)}`)
  if (!response.ok) return null
  return response.json()
}

export async function fetchShipTrack(mmsi) {
  const id = String(mmsi || '').trim()
  if (!id) return null
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const response = await fetch(`https://ais.openwaters.io/v1/vessels/${encodeURIComponent(id)}/track?from=${encodeURIComponent(from)}`)
  if (!response.ok) return null
  const data = await response.json()
  if (data?.type === 'Feature' && data.geometry) return data
  if (data?.type === 'FeatureCollection') return data.features?.find((feature) => feature?.geometry) || null
  return null
}

export function refreshVectorTiles(map, sourceId) {
  if (!map) return
  try {
    if (typeof map.refreshTiles === 'function') {
      map.refreshTiles(sourceId)
      return
    }
  } catch { /* fall through */ }
  const cache = map.style?.sourceCaches?.[sourceId]
  if (cache?.clearTiles) {
    cache.clearTiles()
    cache.update(map.transform)
    map.triggerRepaint()
  }
}

export const SHIP_TILES = 'https://ais.openwaters.io/v1/vessels/tiles.json?kind=vessel&type=35,55'

const AIR_FAMILIES = ['heli', 'tilt', 'fighter', 'transport', 'bizjet', 'prop', 'jet']

/** Screen size grows as you zoom in. Pitch stays on the viewport so the icon does not shrink. */
export function detailIconSize(factor = null) {
  const stops = [[4, 1.05], [8, 1.5], [12, 1.95], [16, 2.25]]
  const expression = ['interpolate', ['linear'], ['zoom']]
  stops.forEach(([zoom, size]) => {
    expression.push(zoom, factor ? ['*', size, factor] : size)
  })
  return expression
}

export function clusterIconSize() {
  return 1.15
}

export function aircraftClusterProperties() {
  return Object.fromEntries(AIR_FAMILIES.map((family) => [
    `n_${family}`,
    ['+', ['case', ['==', ['get', 'icon'], `ac-${family}`], 1, 0]],
  ]))
}

function argmaxIcon(pairs, fallback) {
  let expr = fallback
  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    const [prop, image] = pairs[index]
    const checks = pairs
      .filter(([other]) => other !== prop)
      .map(([other]) => ['>=', ['to-number', ['get', prop]], ['to-number', ['get', other]]])
    expr = ['case', checks.length ? ['all', ...checks] : ['literal', true], image, expr]
  }
  return expr
}

export function aircraftClusterIcon() {
  return argmaxIcon(
    AIR_FAMILIES.map((family) => [`n_${family}`, `ac-${family}`]),
    'ac-jet',
  )
}

export function clusterCountLayout(iconImage) {
  return {
    'icon-image': iconImage,
    'icon-size': clusterIconSize(),
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'text-field': ['get', 'point_count_abbreviated'],
    'text-font': ['Open Sans Regular'],
    'text-size': 13,
    'text-offset': [0, 1.35],
    'text-anchor': 'top',
    'text-allow-overlap': true,
  }
}

export function shipIconLayout() {
  const lengthFactor = ['step', ['coalesce', ['to-number', ['get', 'length']], 40], 0.82, 40, 0.95, 90, 1.05, 220, 1.18]
  return {
    'icon-image': ['case', ['==', ['to-number', ['get', 'type']], 55], 'ship-patrol', 'ship-war'],
    'icon-size': detailIconSize(lengthFactor),
    'icon-rotate': ['coalesce', ['to-number', ['get', 'hdg']], 0],
    'icon-rotation-alignment': 'map',
    'icon-pitch-alignment': 'viewport',
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  }
}

export function aircraftIconLayout() {
  return {
    'icon-image': ['concat', ['get', 'icon'], ['case', ['==', ['get', 'alertMark'], 1], '-alert', '']],
    'icon-size': detailIconSize(),
    'icon-rotate': ['coalesce', ['to-number', ['get', 'heading']], 0],
    'icon-rotation-alignment': 'map',
    'icon-pitch-alignment': 'viewport',
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  }
}
