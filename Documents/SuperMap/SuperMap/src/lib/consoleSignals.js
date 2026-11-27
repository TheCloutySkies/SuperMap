/**
 * Signals for the strategic console, built only from what the collector publishes.
 *
 * Every function here is pure: the same manifest version produces the same
 * signals, convergence and posture in every browser, because nothing is random
 * and nothing is invented. A signal exists only if a published row produced it,
 * and every number on screen is traceable to a field in the snapshot.
 */
export const HOUR = 60 * 60 * 1000
export const DAY = 24 * HOUR

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const clamp01 = (n) => clamp(n, 0, 1)
const numberOr = (value, fallback = null) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Milliseconds from a snapshot field: epoch ms, ISO string or YYYY-MM-DD. */
function toMs(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const direct = Number(value)
  if (Number.isFinite(direct) && direct > 1e11) return direct
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function text(value, max = 200) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max)
}

/* ------------------------------------------------------------------ domains */

export const DOMAINS = {
  conflict: { label: 'Conflict', short: 'Conflict', hex: '#ff3b5c', icon: '⚔', source: 'GDELT · ACLED · UCDP', weight: 1.4 },
  losses: { label: 'Equipment losses', short: 'Losses', hex: '#ffb020', icon: '🛡', source: 'WarSpotting', weight: 1.1 },
  hazards: { label: 'Hazards', short: 'Hazards', hex: '#f97316', icon: '⚠', source: 'USGS · EMSC · NWS · volcanoes', weight: 1.15 },
  infrastructure: { label: 'Infrastructure', short: 'Infra', hex: '#4f7cff', icon: '⌁', source: 'Utility outages', weight: 1 },
  cyber: { label: 'Cyber', short: 'Cyber', hex: '#ff4fd8', icon: '🖧', source: 'CISA KEV · ransomware.live', weight: 1.2 },
  censorship: { label: 'Censorship', short: 'Censor', hex: '#a78bfa', icon: '🚫', source: 'OONI', weight: 0.9 },
  radiation: { label: 'Radiation', short: 'Radiation', hex: '#57e389', icon: '☢', source: 'Safecast', weight: 1.5 },
  orbital: { label: 'Orbital', short: 'Orbital', hex: '#22d3ee', icon: '🛰', source: 'CelesTrak · Launch Library', weight: 0.35 },
  balloons: { label: 'Radiosondes', short: 'Sondes', hex: '#2dd4bf', icon: '🎈', source: 'SondeHub', weight: 0.15 },
  assessments: { label: 'Assessments', short: 'Briefs', hex: '#8b9bb4', icon: '📋', source: 'ISW · Critical Threats', weight: 0.5 },
}

export const DOMAIN_ORDER = [
  'conflict', 'losses', 'hazards', 'infrastructure', 'cyber',
  'censorship', 'radiation', 'orbital', 'balloons', 'assessments',
]

/** Domains that can carry coordinates onto the map. */
export const GEO_DOMAINS = ['conflict', 'losses', 'hazards', 'infrastructure', 'radiation', 'orbital', 'balloons']

/* ------------------------------------------------------------------ regions */

export const REGIONS = {
  global: { label: 'Global', center: [10, 20], zoom: 1.1 },
  ukraine: { label: 'Ukraine / Russia', bbox: [22, 44, 42, 54], center: [37.5, 48.5], zoom: 4 },
  baltic: { label: 'Baltic / North Sea', bbox: [4, 52, 32, 66], center: [20, 57], zoom: 4 },
  mideast: { label: 'Middle East', bbox: [25, 12, 63, 42], center: [35.5, 31.5], zoom: 3.8 },
  europe: { label: 'Europe', bbox: [-12, 35, 25, 60], center: [8, 47], zoom: 3.8 },
  pacific: { label: 'Pacific / China', bbox: [95, 5, 155, 46], center: [122, 25], zoom: 3.6 },
  southAsia: { label: 'South Asia', bbox: [60, 4, 95, 38], center: [78, 22], zoom: 3.8 },
  africa: { label: 'Africa', bbox: [-20, -36, 52, 34], center: [20, 4], zoom: 3 },
  oceania: { label: 'Oceania', bbox: [110, -50, 180, 1], center: [150, -25], zoom: 3 },
  americas: { label: 'Americas', bbox: [-170, -58, -25, 73], center: [-95, 25], zoom: 2.4 },
  cyber: { label: 'Cyberspace', center: [-97, 38], zoom: 3, virtual: true },
  orbital: { label: 'Orbital', center: [0, 8], zoom: 1.2, virtual: true },
}

/** Specific before broad, so a point lands in the tightest theater. */
const REGION_ORDER = ['ukraine', 'baltic', 'mideast', 'europe', 'pacific', 'southAsia', 'africa', 'oceania', 'americas']

export const REGION_OPTIONS = [
  { id: 'global', label: 'Global' },
  { id: 'ukraine', label: 'Ukraine / Russia' },
  { id: 'mideast', label: 'Middle East' },
  { id: 'baltic', label: 'Baltic / North Sea' },
  { id: 'pacific', label: 'Pacific / China' },
  { id: 'europe', label: 'Europe' },
  { id: 'southAsia', label: 'South Asia' },
  { id: 'africa', label: 'Africa' },
  { id: 'americas', label: 'Americas' },
  { id: 'oceania', label: 'Oceania' },
  { id: 'cyber', label: 'Cyberspace' },
  { id: 'orbital', label: 'Orbital' },
]

export function regionForPoint(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return 'global'
  for (const id of REGION_ORDER) {
    const bbox = REGIONS[id]?.bbox
    if (!bbox) continue
    if (lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]) return id
  }
  return 'global'
}

const COUNTRY_REGION = {
  UA: 'ukraine', RU: 'ukraine', BY: 'ukraine', MD: 'ukraine',
  PL: 'baltic', LT: 'baltic', LV: 'baltic', EE: 'baltic', SE: 'baltic', FI: 'baltic', DK: 'baltic', NO: 'baltic',
  IL: 'mideast', PS: 'mideast', IR: 'mideast', IQ: 'mideast', SY: 'mideast', LB: 'mideast', YE: 'mideast',
  SA: 'mideast', AE: 'mideast', QA: 'mideast', KW: 'mideast', BH: 'mideast', OM: 'mideast', JO: 'mideast', TR: 'mideast',
  CN: 'pacific', TW: 'pacific', JP: 'pacific', KR: 'pacific', KP: 'pacific', PH: 'pacific', VN: 'pacific',
  IN: 'southAsia', PK: 'southAsia', BD: 'southAsia', AF: 'southAsia', NP: 'southAsia', LK: 'southAsia',
  EG: 'africa', LY: 'africa', SD: 'africa', SS: 'africa', ET: 'africa', SO: 'africa', NG: 'africa',
  CD: 'africa', CG: 'africa', KE: 'africa', ML: 'africa', BF: 'africa', NE: 'africa', TD: 'africa',
  ZA: 'africa', ZW: 'africa', MZ: 'africa', CM: 'africa', GH: 'africa', MA: 'africa', DZ: 'africa', TN: 'africa',
  US: 'americas', CA: 'americas', MX: 'americas', BR: 'americas', AR: 'americas', CL: 'americas',
  CO: 'americas', VE: 'americas', PE: 'americas', HT: 'americas', CU: 'americas', EC: 'americas',
  GB: 'europe', IE: 'europe', FR: 'europe', DE: 'europe', NL: 'europe', BE: 'europe', ES: 'europe',
  PT: 'europe', IT: 'europe', CH: 'europe', AT: 'europe', CZ: 'europe', SK: 'europe', HU: 'europe',
  RO: 'europe', BG: 'europe', GR: 'europe', RS: 'europe', HR: 'europe', SI: 'europe', BA: 'europe',
  AL: 'europe', MK: 'europe', XK: 'europe', LU: 'europe', IS: 'europe', CY: 'europe', MT: 'europe',
  AU: 'oceania', NZ: 'oceania', ID: 'oceania', MY: 'oceania', SG: 'oceania', TH: 'oceania', MM: 'oceania',
  KH: 'oceania', LA: 'oceania', PG: 'oceania', FJ: 'oceania',
}

export function regionForCountry(code) {
  const key = String(code || '').trim().toUpperCase()
  return COUNTRY_REGION[key] || 'global'
}

const PLACE_HINTS = [
  [/ukrain|russia|moscow|kyiv|kiev|donetsk|luhansk|zaporizh|kherson|crimea|kursk|belgorod|kharkiv|odesa|sevastopol|kaliningrad|north korea|putin/i, 'ukraine'],
  [/poland|baltic|estonia|latvia|lithuania|stockholm|sweden|finland|helsinki|nato|baltic sea|bornholm|aland/i, 'baltic'],
  [/israel|gaza|iran|lebanon|syria|yemen|hezbollah|hamas|hormuz|kuwait|saudi|red sea|suez/i, 'mideast'],
  [/taiwan|china|beijing|japan|tokyo|korea|pyongyang|philippines|south china sea|okinawa|senkaku/i, 'pacific'],
  [/india|pakistan|kashmir|bangladesh|afghan|kabul|islamabad/i, 'southAsia'],
  [/congo|sudan|nigeria|sahel|ethiopia|somalia|mali|niger|chad|libya|kenya|rwanda|burkina/i, 'africa'],
  [/united states|u\.s\.|washington|pentagon|mexico|brazil|venezuela|colombia|haiti|argentina|chile|peru/i, 'americas'],
]

export function regionForText(value) {
  const hay = String(value || '')
  if (!hay) return 'global'
  for (const [pattern, region] of PLACE_HINTS) if (pattern.test(hay)) return region
  return 'global'
}

const CYBER_HINT = /cyber|ransomware|malware|hack|breach|exploit|cve-|zero-day|ddos|phishing|backdoor/i

function domainFromText(value) {
  const hay = String(value || '').toLowerCase()
  if (CYBER_HINT.test(hay)) return 'cyber'
  if (/earthquake|quake|volcano|flood|wildfire|hurricane|typhoon|cyclone|tsunami|storm|eruption/.test(hay)) return 'hazards'
  if (/pipeline|power grid|blackout|outage|refinery|substation|rail network|port closure|cable/.test(hay)) return 'infrastructure'
  if (/missile|drone|artillery|offensive|troops|military|war\b|conflict|attack|frontline|ceasefire|mobilis|strike/.test(hay)) return 'conflict'
  return null
}

function domainFromTags(tags) {
  const set = new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag).toLowerCase()))
  if (set.has('cyber') || set.has('cyberattack')) return 'cyber'
  if (set.has('earthquake') || set.has('flood') || set.has('wildfire') || set.has('disaster') || set.has('tsunami') || set.has('volcano')) return 'hazards'
  if (set.has('infrastructure') || set.has('energy') || set.has('outage')) return 'infrastructure'
  if (set.has('conflict') || set.has('war') || set.has('military') || set.has('attack') || set.has('strike') || set.has('missile') || set.has('drone') || set.has('explosion')) return 'conflict'
  return null
}

function riskFromTags(tags) {
  for (const tag of Array.isArray(tags) ? tags : []) {
    const match = /^risk-(\d)$/i.exec(String(tag))
    if (match) return Number(match[1])
  }
  return null
}

/** Tier 1 institutional, 2 curated aggregation, 3 press, 4 social. */
function tierForSource(source) {
  const name = String(source || '').toLowerCase()
  if (/usgs|emsc|nws|noaa|nhc|cisa|ooni|safecast|celestrak|ucdp|acled|thespacedevs|launch library|gdacs/.test(name)) return 1
  if (/gdelt|warspotting|ransomware|sondehub|arcgis|utility/.test(name)) return 2
  if (/google news|reuters|bbc|guardian|nyt|al jazeera|euronews|france 24|un news|cnn|ap\b/.test(name)) return 3
  if (/^x$|twitter|telegram/.test(name)) return 4
  return 3
}

/* ------------------------------------------------------------ construction */

function mk(partial) {
  const domain = DOMAINS[partial.domain] ? partial.domain : 'conflict'
  const lat = numberOr(partial.lat)
  const lon = numberOr(partial.lon)
  const geo = lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  const at = numberOr(partial.at) || Date.now()
  const fallbackRegion = domain === 'cyber' ? 'cyber' : domain === 'orbital' ? 'orbital' : 'global'
  return {
    id: String(partial.id || `sig:${domain}:${at}`),
    domain,
    region: partial.region || (geo ? regionForPoint(lon, lat) : fallbackRegion),
    at,
    lat: geo ? lat : null,
    lon: geo ? lon : null,
    tier: partial.tier ?? 3,
    magnitude: clamp01(partial.magnitude ?? 0.4),
    weight: DOMAINS[domain].weight,
    title: text(partial.title, 170) || 'Signal',
    detail: text(partial.detail, 340),
    raw: text(partial.raw, 340),
    source: text(partial.source, 80),
    link: partial.link || null,
    tags: Array.isArray(partial.tags) ? partial.tags.slice(0, 12) : [],
    meta: partial.meta && typeof partial.meta === 'object' ? partial.meta : {},
    corroboration: 1,
    confidence: 0,
    sources: [],
  }
}

function linkFromRaw(rawData) {
  if (!rawData) return null
  try {
    const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
    const link = parsed?.link || parsed?.url || parsed?.guid || null
    return typeof link === 'string' && /^https?:\/\//i.test(link) ? link : null
  } catch {
    return null
  }
}

function centroidOf(geometry) {
  if (!geometry || !geometry.type) return null
  if (geometry.type === 'Point') {
    const lon = numberOr(geometry.coordinates?.[0])
    const lat = numberOr(geometry.coordinates?.[1])
    return lon != null && lat != null ? [lon, lat] : null
  }
  const ring = geometry.type === 'Polygon'
    ? geometry.coordinates?.[0]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates?.[0]?.[0] : null
  if (!Array.isArray(ring) || ring.length === 0) return null
  let sumLon = 0
  let sumLat = 0
  let count = 0
  for (const point of ring) {
    const lon = numberOr(point?.[0])
    const lat = numberOr(point?.[1])
    if (lon == null || lat == null) continue
    sumLon += lon
    sumLat += lat
    count += 1
  }
  return count ? [sumLon / count, sumLat / count] : null
}

function featureRows(payload) {
  if (!payload) return []
  if (Array.isArray(payload.features)) return payload.features
  if (Array.isArray(payload.events)) return payload.events
  // Some cached payloads arrive wrapped ({ payload: {...}, fetchedAt }).
  if (Array.isArray(payload.payload?.features)) return payload.payload.features
  if (Array.isArray(payload.payload?.events)) return payload.payload.events
  return []
}

/** Context feeds are capped so 500 radiosondes cannot drown the board. */
function capByRecency(list, max) {
  if (list.length <= max) return list
  return list.slice().sort((a, b) => b.at - a.at).slice(0, max)
}

/* ------------------------------------------------------------- normalizers */

function fromEvents(payload, now) {
  const rows = Array.isArray(payload?.events) ? payload.events : []
  const out = []
  for (const row of rows) {
    const at = toMs(row.timestamp)
    const lat = numberOr(row.lat)
    const lon = numberOr(row.lon)
    if (at == null || lat == null || lon == null) continue
    if (now - at > 14 * DAY) continue
    const tags = Array.isArray(row.tags) ? row.tags : []
    const domain = domainFromTags(tags) || domainFromText(row.title)
    if (!domain) continue
    const risk = riskFromTags(tags)
    const source = text(row.source, 60) || 'event feed'
    out.push(mk({
      id: `ev:${row.id || `${lat.toFixed(2)},${lon.toFixed(2)}`}`,
      domain,
      lat,
      lon,
      at,
      tier: tierForSource(source),
      magnitude: risk ? clamp(0.28 + risk * 0.14, 0.3, 0.95) : 0.45,
      title: row.title,
      detail: row.description,
      raw: `${row.type || 'event'} · ${source} · ${lat.toFixed(2)}, ${lon.toFixed(2)}${tags.length ? ` · ${tags.join(' ')}` : ''}`,
      source,
      link: linkFromRaw(row.raw_data),
      tags,
      meta: {
        type: row.type || '—',
        source,
        coords: `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
        ...(risk ? { risk: `${risk}/5` } : {}),
      },
    }))
  }
  return out
}

function fromConflictFeatures(payload, { source, tier, now }) {
  const out = []
  for (const feature of featureRows(payload)) {
    const props = feature?.properties || {}
    const point = centroidOf(feature.geometry)
    if (!point) continue
    const [lon, lat] = point
    const at = toMs(props.date) ?? now
    if (now - at > 30 * DAY) continue
    const fatalities = numberOr(props.fatalities, 0) || 0
    const articles = numberOr(String(props.notes || '').match(/covered by (\d+) article/i)?.[1], 0)
    out.push(mk({
      id: `${source}:${feature.id || `${lat.toFixed(2)},${lon.toFixed(2)}`}`,
      domain: 'conflict',
      lat,
      lon,
      at,
      tier,
      magnitude: props.fatalities != null
        ? clamp(0.45 + Math.log10(1 + fatalities) * 0.28, 0.45, 1)
        : clamp(0.4 + Math.min(articles, 40) / 120, 0.4, 0.7),
      title: props.title || props.type || 'Conflict event',
      detail: props.notes || [props.place, props.actor].filter(Boolean).join(' · '),
      raw: `${props.source || source} · ${props.type || 'event'}${fatalities ? ` · ${fatalities} fatalities` : ''} · ${props.date || 'date n/a'}`,
      source: props.source || source,
      link: props.link || null,
      meta: {
        type: props.type || '—',
        place: props.place || '—',
        ...(fatalities ? { fatalities: String(fatalities) } : {}),
        ...(props.actor ? { actor: props.actor } : {}),
        date: props.date || '—',
      },
    }))
  }
  return out
}

const QUAKE_MAG = /\bM\s?(\d(?:\.\d)?)\b/i

function fromMajorHazards(payload, now) {
  const out = []
  for (const feature of featureRows(payload)) {
    const props = feature?.properties || {}
    const point = centroidOf(feature.geometry)
    if (!point) continue
    const [lon, lat] = point
    const at = toMs(props.timestamp) ?? now
    if (now - at > 30 * DAY) continue
    const quake = QUAKE_MAG.exec(String(props.title || ''))
    const risk = numberOr(props.risk_score)
    const source = props.source || 'hazard feed'
    out.push(mk({
      id: `haz:${feature.id || `${lat.toFixed(2)},${lon.toFixed(2)}`}`,
      domain: 'hazards',
      lat,
      lon,
      at,
      tier: tierForSource(source),
      magnitude: quake ? clamp(Number(quake[1]) / 9 + 0.15, 0.25, 0.95) : risk ? clamp(risk / 6, 0.2, 0.8) : 0.35,
      title: props.title || props.description || 'Hazard',
      detail: props.description || '',
      raw: `${source} · ${props.type || 'hazard'}${quake ? ` · M${quake[1]}` : ''}`,
      source,
      link: props.link || null,
      meta: {
        kind: source,
        type: props.type || '—',
        ...(quake ? { magnitude: `M${quake[1]}` } : {}),
        ...(props.alertLevel ? { alert: props.alertLevel } : {}),
      },
    }))
  }
  return out
}

const NWS_SEVERITY = { extreme: 1, severe: 0.8, moderate: 0.6, minor: 0.4, unknown: 0.35 }

function fromNws(payload, now) {
  const out = []
  for (const feature of featureRows(payload)) {
    const props = feature?.properties || {}
    const point = centroidOf(feature.geometry)
    if (!point) continue
    const [lon, lat] = point
    const at = toMs(props.onset) ?? toMs(props.effective) ?? now
    const severity = String(props.severity || '').toLowerCase()
    out.push(mk({
      id: `nws:${props.link || `${lat.toFixed(2)},${lon.toFixed(2)}:${props.event || ''}`}`,
      domain: 'hazards',
      lat,
      lon,
      at,
      tier: 1,
      magnitude: NWS_SEVERITY[severity] ?? 0.4,
      title: props.headline || props.event || 'NWS alert',
      detail: props.areaDesc || '',
      raw: `NWS · ${props.event || 'alert'} · severity ${props.severity || 'n/a'} · urgency ${props.urgency || 'n/a'}`,
      source: 'NWS',
      link: props.link || null,
      meta: {
        kind: 'NWS',
        event: props.event || '—',
        severity: props.severity || '—',
        area: props.areaDesc || '—',
        ends: props.ends || '—',
      },
    }))
  }
  return out
}

function fromEmsc(payload, now) {
  const out = []
  for (const feature of featureRows(payload)) {
    const props = feature?.properties || {}
    const point = centroidOf(feature.geometry)
    if (!point) continue
    const [lon, lat] = point
    const at = toMs(props.time) ?? now
    const mag = numberOr(props.mag)
    if (mag != null && mag < 3) continue
    out.push(mk({
      id: `emsc:${props.link || `${lat.toFixed(2)},${lon.toFixed(2)}`}`,
      domain: 'hazards',
      lat,
      lon,
      at,
      tier: 1,
      magnitude: mag != null ? clamp(mag / 8 + 0.2, 0.25, 0.95) : 0.35,
      title: props.title || `M${mag ?? '?'} earthquake`,
      detail: props.place || '',
      raw: `EMSC · M${mag ?? '?'} · depth ${props.depth ?? '?'} km`,
      source: 'EMSC',
      link: props.link || null,
      meta: { kind: 'EMSC', magnitude: mag != null ? `M${mag}` : '—', depth: `${props.depth ?? '—'} km`, place: props.place || '—' },
    }))
  }
  return out
}

function fromVolcanoes(payload, now) {
  const out = []
  for (const feature of featureRows(payload)) {
    const props = feature?.properties || {}
    const point = centroidOf(feature.geometry)
    if (!point) continue
    const [lon, lat] = point
    const level = String(props.alertLevel || '').toUpperCase()
    out.push(mk({
      id: `volcano:${props.link || props.title || `${lat.toFixed(2)},${lon.toFixed(2)}`}`,
      domain: 'hazards',
      lat,
      lon,
      at: now,
      tier: 1,
      magnitude: level === 'WARNING' ? 0.85 : level === 'WATCH' ? 0.7 : level === 'ADVISORY' ? 0.5 : 0.35,
      title: props.title || props.name || 'Volcano notice',
      detail: props.synopsis || '',
      raw: `USGS volcanoes · ${props.alertLevel || '—'} / ${props.colorCode || '—'} · threat ${props.threat || '—'}`,
      source: 'USGS',
      link: props.link || null,
      meta: { kind: 'Volcano', alert: props.alertLevel || '—', colour: props.colorCode || '—', threat: props.threat || '—' },
    }))
  }
  return out
}

function fromUtilityOutages(payload, now) {
  const out = []
  for (const feature of featureRows(payload)) {
    const props = feature?.properties || {}
    const point = centroidOf(feature.geometry)
    if (!point) continue
    const [lon, lat] = point
    const at = toMs(props.StartDate) ?? now
    if (now - at > 7 * DAY) continue
    const customers = numberOr(props.ImpactedCustomers, 0) || 0
    out.push(mk({
      id: `outage:${props.IncidentId || feature.id || `${lat.toFixed(2)},${lon.toFixed(2)}`}`,
      domain: 'infrastructure',
      lat,
      lon,
      at,
      tier: 2,
      magnitude: clamp(0.25 + Math.log10(1 + customers) * 0.22, 0.25, 0.85),
      title: `${props.UtilityCompany || 'Utility'} outage · ${customers} customer${customers === 1 ? '' : 's'}`,
      detail: [props.County, props.Cause].filter(Boolean).join(' · '),
      raw: `ArcGIS outage feed · ${props.OutageType || '—'} · ${props.OutageStatus || '—'} · ${customers} customers`,
      source: 'Utility outages',
      link: null,
      meta: {
        utility: props.UtilityCompany || '—',
        county: props.County || '—',
        customers: String(customers),
        cause: props.Cause || '—',
        status: props.OutageStatus || '—',
      },
    }))
  }
  return out
}

function fromWarspotting(payload, now) {
  const out = []
  for (const feature of featureRows(payload)) {
    const props = feature?.properties || {}
    const point = centroidOf(feature.geometry)
    if (!point) continue
    const [lon, lat] = point
    const at = toMs(props.date) ?? now
    if (now - at > 30 * DAY) continue
    const status = String(props.status || 'destroyed').toLowerCase()
    out.push(mk({
      id: `loss:${props.id ?? `${lat.toFixed(3)},${lon.toFixed(3)}:${props.date || ''}`}`,
      domain: 'losses',
      lat,
      lon,
      at,
      tier: 2,
      magnitude: status === 'destroyed' ? 0.8 : status === 'captured' ? 0.7 : status === 'damaged' ? 0.6 : 0.5,
      title: `${props.model || props.type || 'Equipment'} — ${status}`,
      detail: [props.place, props.unit].filter(Boolean).join(' · '),
      raw: `WarSpotting · ${props.type || '—'} ${props.model || ''} · ${status} · lost by ${props.lost_by || '—'}`,
      source: 'WarSpotting',
      link: null,
      meta: {
        equipment: props.type || '—',
        model: props.model || '—',
        status,
        place: props.place || '—',
        unit: props.unit || '—',
        date: props.date || '—',
      },
    }))
  }
  return out
}

function fromUcdp(payload, now) {
  const out = []
  for (const feature of featureRows(payload)) {
    const props = feature?.properties || {}
    const point = centroidOf(feature.geometry)
    if (!point) continue
    const [lon, lat] = point
    const at = toMs(props.dateEnd) ?? toMs(props.dateStart) ?? now
    const deaths = numberOr(props.deaths, 0) || 0
    out.push(mk({
      id: `ucdp:${feature.id || `${lat.toFixed(3)},${lon.toFixed(3)}`}`,
      domain: 'conflict',
      lat,
      lon,
      at,
      tier: 1,
      magnitude: clamp(0.45 + Math.log10(1 + deaths) * 0.3, 0.45, 1),
      title: `${props.sideA || 'Actor A'} vs ${props.sideB || 'Actor B'}`,
      detail: [props.country, props.place].filter(Boolean).join(' · '),
      raw: `UCDP GED · ${props.country || '—'} · ${deaths} deaths · ${props.dateStart || '—'} to ${props.dateEnd || '—'}`,
      source: 'UCDP',
      link: null,
      meta: {
        country: props.country || '—',
        dyad: props.dyad || '—',
        deaths: String(deaths),
        place: props.place || '—',
      },
    }))
  }
  return out
}

function fromKev(payload, now) {
  const rows = Array.isArray(payload?.recent) ? payload.recent : []
  const out = []
  for (const row of rows) {
    const at = toMs(row.added) ?? now
    const ransomware = !!row.ransomware
    out.push(mk({
      id: `kev:${row.cve || row.product || row.name}`,
      domain: 'cyber',
      region: 'cyber',
      at,
      tier: 1,
      magnitude: ransomware ? 0.85 : 0.6,
      title: `${row.cve || 'CVE'} · ${row.product || row.vendor || 'product'}`,
      detail: row.name || '',
      raw: `CISA KEV · ${row.vendor || '—'} ${row.product || ''} · added ${row.added || '—'} · ransomware ${ransomware ? 'known' : 'unknown'}`,
      source: 'CISA KEV',
      link: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
      meta: {
        cve: row.cve || '—',
        vendor: row.vendor || '—',
        product: row.product || '—',
        added: row.added || '—',
        ransomware: ransomware ? 'known' : 'unknown',
      },
    }))
  }
  return out
}

function fromRansomware(payload, now) {
  const rows = Array.isArray(payload?.recent) ? payload.recent : []
  const out = []
  for (const row of rows) {
    const at = toMs(row.date) ?? now
    out.push(mk({
      id: `rw:${row.url || `${row.victim}:${row.date}`}`,
      domain: 'cyber',
      region: regionForCountry(row.country) === 'global' ? 'cyber' : regionForCountry(row.country),
      at,
      tier: 2,
      magnitude: 0.55,
      title: `${row.group || 'Group'} listed ${row.victim || 'a victim'}`,
      detail: `Claimed victim${row.country ? ` in ${row.country}` : ''}. Not independently verified.`,
      raw: `ransomware.live · ${row.group || '—'} · ${row.country || '—'} · ${row.date || '—'}`,
      source: 'ransomware.live',
      link: row.url || null,
      meta: { group: row.group || '—', victim: row.victim || '—', country: row.country || '—', date: row.date || '—' },
    }))
  }
  return out
}

function fromCensorship(payload, now) {
  const rows = Array.isArray(payload?.countries) ? payload.countries : []
  const out = []
  for (const row of rows) {
    if (!row || !row.suspect) continue
    const region = regionForCountry(row.country)
    out.push(mk({
      id: `ooni:${row.country}`,
      domain: 'censorship',
      region: region === 'global' ? 'cyber' : region,
      at: now,
      tier: 1,
      magnitude: clamp(row.suspect / Math.max(4, row.total || 1) + 0.2, 0.2, 0.85),
      title: `${row.country}: ${row.suspect} suspect measurement${row.suspect === 1 ? '' : 's'}`,
      detail: `OONI flagged ${row.suspect} of ${row.total} web-connectivity measurements in ${row.country} in the published window.`,
      raw: `OONI · ${row.country} · suspect ${row.suspect}/${row.total}`,
      source: 'OONI',
      link: 'https://explorer.ooni.org/',
      meta: { country: row.country, suspect: String(row.suspect), total: String(row.total) },
    }))
  }
  return out
}

function fromRadiation(payload, now) {
  const features = featureRows(payload)
  const out = []
  for (const feature of features) {
    const props = feature?.properties || {}
    const point = centroidOf(feature.geometry)
    if (!point) continue
    const [lon, lat] = point
    const value = numberOr(props.value)
    if (value == null) continue
    const unit = String(props.unit || 'cpm').toLowerCase()
    // Safecast also publishes device telemetry (temperature, status). Only dose
    // rate readings belong on a radiation layer.
    const isCpm = /cpm|counts? per minute/.test(unit)
    const isDose = /(µ|u)sv|microsievert|msv|gy\/h|ngy/.test(unit)
    if (!isCpm && !isDose) continue
    const baseline = isCpm ? 32 : 0.12
    const ratio = baseline ? value / baseline : 1
    if (ratio < 1.6) continue
    const at = toMs(props.at) ?? now
    out.push(mk({
      id: `rad:${feature.id || `${lat.toFixed(3)},${lon.toFixed(3)}`}`,
      domain: 'radiation',
      lat,
      lon,
      at,
      tier: 1,
      magnitude: clamp(ratio / 6, 0.25, 0.95),
      title: `${value} ${unit} — ${ratio.toFixed(1)}× background`,
      detail: `Safecast sensor reading, ${ratio.toFixed(1)}× the ${baseline} ${isCpm ? 'cpm' : 'µSv/h'} reference. A single sensor is not a release; check neighbours.`,
      raw: `Safecast · ${value} ${unit} · ${props.device || 'device n/a'} · ${props.at || 'time n/a'}`,
      source: 'Safecast',
      link: 'https://map.safecast.org/',
      meta: {
        reading: `${value} ${unit}`,
        ratio: `${ratio.toFixed(1)}× background`,
        device: String(props.device ?? '—'),
        height: `${props.height ?? '—'} m`,
      },
    }))
  }
  return out
}

function fromBalloons(payload, now) {
  const rows = featureRows(payload)
  const out = []
  for (const feature of rows) {
    const props = feature?.properties || {}
    const point = centroidOf(feature.geometry)
    if (!point) continue
    const [lon, lat] = point
    const altitude = numberOr(props.altitude)
    out.push(mk({
      id: `sonde:${props.serial || feature.id || `${lat.toFixed(2)},${lon.toFixed(2)}`}`,
      domain: 'balloons',
      lat,
      lon,
      at: toMs(props.at) ?? now,
      tier: 2,
      magnitude: clamp((altitude || 0) / 40000 + 0.1, 0.1, 0.4),
      title: `${props.type || 'Radiosonde'} at ${altitude != null ? `${Math.round(altitude / 100) / 10} km` : 'unknown altitude'}`,
      detail: 'Weather balloon telemetry, published by SondeHub. Context for upper-air conditions, not a threat.',
      raw: `SondeHub · ${props.type || '—'} · ${altitude ?? '—'} m · ${props.frequency ?? '—'} MHz`,
      source: 'SondeHub',
      link: 'https://sondehub.org/',
      meta: { type: props.type || '—', altitude: `${altitude ?? '—'} m`, frequency: `${props.frequency ?? '—'} MHz` },
    }))
  }
  return capByRecency(out, 60)
}

function fromSatellites(payload, now) {
  const rows = featureRows(payload)
  const out = []
  for (const feature of rows) {
    const props = feature?.properties || {}
    const point = centroidOf(feature.geometry)
    const group = String(props.group || 'active')
    const magnitude = group === 'military' ? 0.5 : group === 'stations' ? 0.35 : 0.3
    out.push(mk({
      id: `sat:${props.norad || props.name}`,
      domain: 'orbital',
      region: 'orbital',
      lat: point ? point[1] : null,
      lon: point ? point[0] : null,
      at: now,
      tier: 1,
      magnitude,
      title: `${props.name || 'Satellite'} · ${group}`,
      detail: `Subpoint from CelesTrak mean elements (${payload?.approximation || 'circular approximation'}), propagated server-side.`,
      raw: `CelesTrak · NORAD ${props.norad || '—'} · incl ${props.inclination ?? '—'}° · ${props.periodMinutes ?? '—'} min · ${props.altitudeKm ?? '—'} km`,
      source: 'CelesTrak',
      link: 'https://celestrak.org/',
      meta: {
        group,
        norad: String(props.norad || '—'),
        inclination: `${props.inclination ?? '—'}°`,
        period: `${props.periodMinutes ?? '—'} min`,
        altitude: `${props.altitudeKm ?? '—'} km`,
      },
    }))
  }
  return out.slice(0, 120)
}

function fromLaunches(payload) {
  const rows = Array.isArray(payload?.launches) ? payload.launches : []
  const out = []
  for (const row of rows) {
    const at = numberOr(row.netMs) ?? toMs(row.net)
    if (at == null) continue
    out.push(mk({
      id: `launch:${row.id || row.name}`,
      domain: 'orbital',
      region: 'orbital',
      at,
      tier: 1,
      magnitude: 0.35,
      title: `${row.name || 'Launch'} · ${row.status || 'scheduled'}`,
      detail: [row.rocket, row.padLocation || row.pad, row.orbit].filter(Boolean).join(' · '),
      raw: `Launch Library 2 · ${row.provider || '—'} · NET ${row.net || '—'} · ${row.status || '—'}`,
      source: 'Launch Library 2',
      link: 'https://thespacedevs.com/llapi',
      meta: {
        provider: row.provider || '—',
        rocket: row.rocket || '—',
        pad: row.padLocation || row.pad || '—',
        orbit: row.orbit || '—',
        status: row.status || '—',
      },
    }))
  }
  return out
}

function fromBriefs(payload, now) {
  const rows = Array.isArray(payload?.items) ? payload.items : []
  const out = []
  for (const row of rows) {
    const at = numberOr(row.publishedMs) ?? toMs(row.published) ?? now
    if (now - at > 7 * DAY) continue
    out.push(mk({
      id: `brief:${row.link || row.title}`,
      domain: 'assessments',
      region: regionForText(`${row.title} ${row.summary}`),
      at,
      tier: 2,
      magnitude: 0.5,
      title: row.title,
      detail: row.summary || '',
      raw: `${row.source || 'news.google.com'} · published ${row.published || '—'}`,
      source: row.source || 'Google News',
      link: row.link || null,
      meta: { publisher: row.source || '—', published: row.published || '—' },
    }))
  }
  return out
}

function fromSpaceWeather(payload, now) {
  if (!payload) return []
  const kp = numberOr(payload.kp)
  if (kp == null) return []
  return [mk({
    id: 'space-weather:kp',
    domain: 'orbital',
    region: 'orbital',
    at: toMs(payload.fetchedAt) ?? now,
    tier: 1,
    magnitude: clamp(kp / 9, 0.05, 0.9),
    title: `Kp ${kp} — ${payload.label || 'geomagnetic activity'}`,
    detail: 'Planetary K-index from SWPC. Kp 5 or higher is a geomagnetic storm.',
    raw: `SWPC · Kp ${kp} · ${payload.label || '—'}`,
    source: 'SWPC',
    link: 'https://www.swpc.noaa.gov/',
    meta: { kp: String(kp), label: payload.label || '—' },
  })]
}

function fromNews(payload, now) {
  const features = featureRows(payload)
  const out = []
  for (const feature of features) {
    const props = feature?.properties || {}
    const risk = numberOr(props.risk_score)
    if (risk == null || risk < 3) continue
    const at = toMs(props.timestamp)
    if (at == null || now - at > 7 * DAY) continue
    const domain = domainFromText(`${props.title} ${props.description}`)
    if (!domain) continue
    out.push(mk({
      id: `news:${props.id || props.link || props.title}`,
      domain,
      region: regionForText(`${props.title} ${props.description}`),
      at,
      tier: tierForSource(props.source),
      magnitude: clamp(risk / 5, 0.4, 0.9),
      title: props.title,
      detail: props.description || '',
      raw: `${props.source || 'press'} · risk ${risk}/5 · ${props.category || 'general'}`,
      source: props.source || 'press',
      link: props.link || null,
      meta: {
        risk: `${risk}/5`,
        outlet: props.source || '—',
        category: props.category || '—',
        region: `inferred from the headline`,
      },
    }))
  }
  return out
}

function fromOsintX(payload, now) {
  const rows = Array.isArray(payload) ? payload : []
  const out = []
  for (const post of rows) {
    const risk = numberOr(post.risk_score)
    if (risk == null || risk < 3) continue
    const at = toMs(post.timestamp)
    if (at == null || now - at > 7 * DAY) continue
    const tags = Array.isArray(post.tags) ? post.tags : []
    const domain = domainFromTags(tags) || domainFromText(`${post.title} ${post.content}`)
    if (!domain) continue
    out.push(mk({
      id: `x:${post.id || post.tweetId || post.url}`,
      domain,
      region: regionForText(`${post.title} ${post.content}`),
      at,
      tier: 4,
      magnitude: clamp(risk / 5 - 0.05, 0.35, 0.85),
      title: post.title || post.content,
      detail: post.content || '',
      raw: `@${post.account || '—'} · risk ${risk}/5 · ${tags.join(' ')}`,
      source: 'X',
      link: post.url || null,
      tags,
      meta: {
        account: post.account ? `@${post.account}` : '—',
        risk: `${risk}/5`,
        engagement: post.metrics?.likes != null ? `${post.metrics.likes} likes` : '—',
        region: 'inferred from the post',
      },
    }))
  }
  return out
}

/* --------------------------------------------------------------- assembly */

function dedupe(signals) {
  const keep = new Map()
  for (const signal of signals) {
    // Geo rows merge when two feeds describe the same place and hour. Text rows
    // never merge: two headlines in one hour are two different stories.
    const key = signal.lat == null
      ? `text|${signal.domain}|${signal.id}`
      : `${signal.domain}|${Math.round(signal.lat * 4)}|${Math.round(signal.lon * 4)}|${Math.floor(signal.at / HOUR)}`
    const previous = keep.get(key)
    if (!previous) {
      keep.set(key, { ...signal, sources: [{ name: signal.source || 'source', tier: signal.tier }] })
      continue
    }
    if (!previous.sources.some((entry) => entry.name === (signal.source || 'source'))) {
      previous.sources.push({ name: signal.source || 'source', tier: signal.tier })
    }
    if (signal.tier < previous.tier || (signal.tier === previous.tier && signal.magnitude > previous.magnitude)) {
      keep.set(key, { ...signal, sources: previous.sources })
    }
  }
  return [...keep.values()]
}

function confidenceFor(signal, now) {
  const tierBonus = { 1: 0.16, 2: 0.09, 3: 0.02, 4: -0.06 }[signal.tier] ?? 0
  const ageHours = Math.max(0, now - signal.at) / HOUR
  const freshness = ageHours <= 6 ? 0.06 : ageHours <= 24 ? 0.02 : ageHours <= 72 ? -0.04 : -0.1
  const severity = (signal.magnitude - 0.5) * 0.1
  return clamp(0.4 + signal.corroboration * 0.06 + tierBonus + freshness + severity, 0.18, 0.98)
}

/** Build every signal the published snapshot can support. Deterministic. */
export function buildSignals(payloads = {}, now = Date.now()) {
  const raw = [
    ...fromEvents(payloads.events, now),
    ...fromConflictFeatures(payloads.gdelt, { source: 'GDELT', tier: 2, now }),
    ...fromConflictFeatures(payloads.acled, { source: 'ACLED', tier: 2, now }),
    ...fromUcdp(payloads.ucdp, now),
    ...fromWarspotting(payloads.warspotting, now),
    ...fromMajorHazards(payloads.majorHazards, now),
    ...fromNws(payloads.nws, now),
    ...fromEmsc(payloads.emsc, now),
    ...fromVolcanoes(payloads.volcanoes, now),
    ...fromUtilityOutages(payloads.utility, now),
    ...fromKev(payloads.kev, now),
    ...fromRansomware(payloads.ransomware, now),
    ...fromCensorship(payloads.censorship, now),
    ...fromRadiation(payloads.radiation, now),
    ...fromBalloons(payloads.balloons, now),
    ...fromSatellites(payloads.satellites, now),
    ...fromLaunches(payloads.launches),
    ...fromBriefs(payloads.briefs, now),
    ...fromSpaceWeather(payloads.spaceWeather, now),
    ...fromNews(payloads.news, now),
    ...fromOsintX(payloads.osintX, now),
  ]

  const signals = dedupe(raw).slice(0, 2000)

  // Corroboration is per item: how many published feeds described this exact
  // place and hour. A theater full of unrelated stories is not corroboration.
  for (const signal of signals) {
    signal.corroboration = Math.max(1, Math.min(5, signal.sources.length))
    signal.confidence = confidenceFor(signal, now)
  }

  signals.sort((a, b) => b.at - a.at)
  return signals
}

/* ------------------------------------------------------------- derivations */

export function computeConvergence(signals, { windowHours = 6, minDomains = 3, now = Date.now() } = {}) {
  const since = now - windowHours * HOUR
  const byRegion = new Map()
  for (const signal of signals) {
    if (signal.at < since) continue
    // "Global" is a leftover bucket, not a theater; orbital is context.
    if (signal.region === 'orbital' || signal.region === 'global') continue
    const list = byRegion.get(signal.region) || []
    list.push(signal)
    byRegion.set(signal.region, list)
  }
  const clusters = []
  for (const [region, list] of byRegion) {
    const domains = [...new Set(list.map((signal) => signal.domain))]
    // Three domains from three unrelated headlines is not a convergence: the
    // theater also needs enough published activity to mean anything.
    if (domains.length < minDomains || list.length < 5) continue
    const meanMagnitude = list.reduce((sum, signal) => sum + signal.magnitude, 0) / list.length
    const volume = Math.min(1, Math.log1p(list.length) / Math.log(40))
    const score = Math.round(100 * clamp01((domains.length / 6) * 0.45 + meanMagnitude * 0.3 + volume * 0.25))
    clusters.push({
      region,
      score,
      domains,
      count: list.length,
      signals: list.slice().sort((a, b) => b.magnitude - a.magnitude).slice(0, 4),
      why: `${domains.length} domains active in ${REGIONS[region]?.label || region} within ${windowHours} h (${list.length} signals).`,
    })
  }
  return clusters.sort((a, b) => b.score - a.score)
}

export function computePosture({ signals = [], convergence = [], threat = null, defcon = null, now = Date.now() }) {
  const recent = signals.filter((signal) => now - signal.at <= DAY)
  const totalWeight = recent.reduce((sum, signal) => sum + signal.weight * signal.confidence, 0)
  const severity = totalWeight
    ? recent.reduce((sum, signal) => sum + signal.magnitude * signal.weight * signal.confidence, 0) / totalWeight
    : 0
  const volume = 1 - Math.exp(-recent.length / 90)
  const activity = severity * volume

  const threatValue = clamp01((numberOr(threat?.average_score) ?? numberOr(threat?.threat_score) ?? 0) / 5)
  const level = numberOr(defcon?.level)
  const tension = level != null && level >= 1 && level <= 5 ? (6 - level) / 5 : 0
  const convNorm = convergence.length ? clamp01(convergence[0].score / 100) : 0

  const score = Math.round(100 * clamp(activity * 0.42 + threatValue * 0.25 + tension * 0.15 + convNorm * 0.18, 0.02, 0.99))
  const band = score >= 82 ? 'CRITICAL' : score >= 66 ? 'HIGH' : score >= 48 ? 'ELEVATED' : score >= 28 ? 'GUARDED' : 'CALM'
  const color = score >= 82 ? '#ff3b5c' : score >= 66 ? '#ff4fd8' : score >= 48 ? '#ffb020' : score >= 28 ? '#22d3ee' : '#57e389'
  return {
    score,
    band,
    color,
    inputs: {
      activity,
      volume,
      severity,
      sample: recent.length,
      threat: threatValue,
      threatLevel: threat?.threat_level || null,
      tension,
      defcon: level,
      convergence: convNorm,
    },
  }
}

export function computeDomainSeries(signals, now = Date.now(), days = 14) {
  const series = {}
  for (const id of DOMAIN_ORDER) series[id] = Array.from({ length: days }, () => 0)
  for (const signal of signals) {
    const daysAgo = Math.floor((now - signal.at) / DAY)
    if (daysAgo < 0 || daysAgo >= days) continue
    series[signal.domain][days - 1 - daysAgo] += 1
  }
  return series
}

export function computeDomainDeltas(signals, now = Date.now()) {
  const deltas = {}
  for (const id of DOMAIN_ORDER) {
    const recent = signals.filter((signal) => signal.domain === id && now - signal.at <= DAY && signal.at <= now).length
    const prior = signals.filter((signal) => signal.domain === id && now - signal.at > DAY && now - signal.at <= 2 * DAY).length
    if (!prior) {
      // No prior volume to compare with: "new", never a fabricated percentage.
      deltas[id] = recent ? null : 0
    } else {
      deltas[id] = Math.round(((recent - prior) / prior) * 100)
    }
  }
  return deltas
}

const HAZARD_FEEDS = {
  emsc: 'EMSC',
  usgs: 'USGS',
  'usgs-volcano': 'USGS volcanoes',
  volcano: 'Volcanoes',
  nws: 'NWS',
  'nws-wwa': 'NWS',
  nhc: 'NHC',
  gdacs: 'GDACS',
}

/** One label per feed, so "emsc" and "EMSC" never split a bar in two. */
function hazardFeed(kind) {
  const key = String(kind || '').trim().toLowerCase()
  if (HAZARD_FEEDS[key]) return HAZARD_FEEDS[key]
  if (!key || key === 'hazard') return 'Other feeds'
  return key.charAt(0).toUpperCase() + key.slice(1)
}

function barChart(id, title, sub, entries, color) {
  const bars = entries
    .filter(([key, value]) => key && Number(value) > 0)
    .map(([key, value]) => ({ k: String(key), v: Number(value) }))
    .slice(0, 8)
  return bars.length ? { id, title, sub, color, bars } : null
}

export function computeCharts(payloads = {}, signals = []) {
  const charts = []

  const losses = featureRows(payloads.warspotting)
  if (losses.length) {
    const counts = new Map()
    for (const feature of losses) {
      const type = String(feature?.properties?.type || 'Unknown').trim()
      counts.set(type, (counts.get(type) || 0) + 1)
    }
    const chart = barChart('losses', 'Equipment losses by type', 'WarSpotting · published snapshot',
      [...counts.entries()].sort((a, b) => b[1] - a[1]), '#ffb020')
    if (chart) charts.push(chart)
  }

  const byYear = Array.isArray(payloads.kev?.byYear) ? payloads.kev.byYear : []
  if (byYear.length) {
    const chart = barChart('kev', 'Exploited CVEs by year added', 'CISA KEV · published snapshot',
      [...byYear].sort((a, b) => String(a.year).localeCompare(String(b.year))).map((row) => [row.year, row.count]), '#ff4fd8')
    if (chart) charts.push(chart)
  }

  const groups = Array.isArray(payloads.ransomware?.byGroup) ? payloads.ransomware.byGroup : []
  if (groups.length) {
    const chart = barChart('ransomware', 'Ransomware victims by group', 'ransomware.live · published snapshot',
      groups.map((row) => [row.group, row.count]), '#ff4fd8')
    if (chart) charts.push(chart)
  }

  const countries = Array.isArray(payloads.censorship?.countries) ? payloads.censorship.countries : []
  if (countries.length) {
    const chart = barChart('censorship', 'Suspect measurements by country', 'OONI · published snapshot',
      countries.map((row) => [row.country, row.suspect]), '#a78bfa')
    if (chart) charts.push(chart)
  }

  const hazardKinds = new Map()
  for (const signal of signals) {
    if (signal.domain !== 'hazards') continue
    const kind = hazardFeed(signal.meta.kind)
    hazardKinds.set(kind, (hazardKinds.get(kind) || 0) + 1)
  }
  if (hazardKinds.size) {
    const chart = barChart('hazards', 'Hazards by feed', 'USGS · EMSC · NWS · volcanoes',
      [...hazardKinds.entries()].sort((a, b) => b[1] - a[1]), '#f97316')
    if (chart) charts.push(chart)
  }

  const CHART_ORDER = ['hazards', 'losses', 'kev', 'ransomware', 'censorship']
  return charts
    .sort((a, b) => CHART_ORDER.indexOf(a.id) - CHART_ORDER.indexOf(b.id))
    .slice(0, 5)
}

/* ------------------------------------------------------------------ display */

export function confidenceBand(confidence) {
  if (confidence >= 0.75) return { label: 'HIGH', color: '#57e389' }
  if (confidence >= 0.55) return { label: 'GOOD', color: '#22d3ee' }
  if (confidence >= 0.4) return { label: 'FAIR', color: '#ffb020' }
  return { label: 'LOW', color: '#8494b3' }
}

export function relTime(at, now = Date.now()) {
  if (!Number.isFinite(at)) return '—'
  const minutes = Math.round((now - at) / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d` : `${Math.floor(days / 30)}mo`
}

export function formatNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString()
}

/** How many tiles the board renders, and how many one domain may take. */
export const BOARD_LIMIT = 60
export const DOMAIN_TILE_CAP = 8

/** Sort order used by the board. */
export const SORTS = [
  { id: 'significance', label: 'Significance' },
  { id: 'recency', label: 'Recency' },
  { id: 'confidence', label: 'Confidence' },
  { id: 'severity', label: 'Severity' },
]

export function sortSignals(signals, sort) {
  const list = signals.slice()
  if (sort === 'recency') return list.sort((a, b) => b.at - a.at)
  if (sort === 'confidence') return list.sort((a, b) => b.confidence - a.confidence)
  if (sort === 'severity') return list.sort((a, b) => b.magnitude - a.magnitude)
  return list.sort((a, b) => (b.magnitude * b.confidence) - (a.magnitude * a.confidence))
}

/**
 * Board composition: round-robin across domains so one noisy feed cannot take
 * every tile, then fill by significance. Shared by the board and its counter.
 */
export function buildBoardTiles(signals, sort = 'significance') {
  const ordered = sortSignals(signals, sort)
  const queues = new Map()
  for (const signal of ordered) {
    const queue = queues.get(signal.domain) || []
    if (queue.length >= DOMAIN_TILE_CAP) continue
    queue.push(signal)
    queues.set(signal.domain, queue)
  }
  const lists = [...queues.values()]
  const tiles = []
  let index = 0
  while (tiles.length < BOARD_LIMIT && lists.some((list) => list.length)) {
    const list = lists[index % lists.length]
    index += 1
    if (!list.length) continue
    tiles.push(list.shift())
  }
  return tiles
}
