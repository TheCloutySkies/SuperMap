/**
 * Shared helpers for the free, keyless console sources.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function num(value) {
  if (value == null || value === '') return null
  const n = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** "lat,lon lat,lon …" (CAP polygon) → centroid, or null. */
function centroidOfPolygon(text) {
  const pairs = String(text || '').trim().split(/\s+/)
  let sumLat = 0
  let sumLon = 0
  let count = 0
  for (const pair of pairs) {
    const [latText, lonText] = pair.split(',')
    const lat = Number(latText)
    const lon = Number(lonText)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue
    sumLat += lat
    sumLon += lon
    count += 1
  }
  return count ? [sumLon / count, sumLat / count] : null
}

/** ISO-3166 alpha-3 → alpha-2, for the sources that publish three-letter codes. */
const ISO3_TO_ISO2 = {
  AFG: 'AF', ALB: 'AL', DZA: 'DZ', AGO: 'AO', ARG: 'AR', ARM: 'AM', AZE: 'AZ', BGD: 'BD',
  BLR: 'BY', BEL: 'BE', BLZ: 'BZ', BEN: 'BJ', BOL: 'BO', BIH: 'BA', BRA: 'BR', BGR: 'BG',
  BFA: 'BF', BDI: 'BI', KHM: 'KH', CMR: 'CM', CAN: 'CA', CAF: 'CF', TCD: 'TD', CHL: 'CL',
  CHN: 'CN', COL: 'CO', COD: 'CD', COG: 'CG', CRI: 'CR', CIV: 'CI', HRV: 'HR', CUB: 'CU',
  CYP: 'CY', CZE: 'CZ', DNK: 'DK', DJI: 'DJ', DOM: 'DO', ECU: 'EC', EGY: 'EG', SLV: 'SV',
  ERI: 'ER', EST: 'EE', ETH: 'ET', FIN: 'FI', FRA: 'FR', GAB: 'GA', GEO: 'GE', DEU: 'DE',
  GHA: 'GH', GRC: 'GR', GTM: 'GT', GIN: 'GN', GNB: 'GW', GUY: 'GY', HTI: 'HT', HND: 'HN',
  HUN: 'HU', IND: 'IN', IDN: 'ID', IRN: 'IR', IRQ: 'IQ', IRL: 'IE', ISR: 'IL', ITA: 'IT',
  JAM: 'JM', JPN: 'JP', JOR: 'JO', KAZ: 'KZ', KEN: 'KE', PRK: 'KP', KOR: 'KR', KWT: 'KW',
  KGZ: 'KG', LAO: 'LA', LVA: 'LV', LBN: 'LB', LBR: 'LR', LBY: 'LY', LTU: 'LT', LUX: 'LU',
  MDG: 'MG', MWI: 'MW', MYS: 'MY', MLI: 'ML', MLT: 'MT', MRT: 'MR', MEX: 'MX', MDA: 'MD',
  MNG: 'MN', MNE: 'ME', MAR: 'MA', MOZ: 'MZ', MMR: 'MM', NAM: 'NA', NPL: 'NP', NLD: 'NL',
  NZL: 'NZ', NIC: 'NI', NER: 'NE', NGA: 'NG', MKD: 'MK', NOR: 'NO', OMN: 'OM', PAK: 'PK',
  PAN: 'PA', PNG: 'PG', PRY: 'PY', PER: 'PE', PHL: 'PH', POL: 'PL', PRT: 'PT', QAT: 'QA',
  ROU: 'RO', RUS: 'RU', RWA: 'RW', SAU: 'SA', SEN: 'SN', SRB: 'RS', SLE: 'SL', SVK: 'SK',
  SVN: 'SI', SOM: 'SO', ZAF: 'ZA', SSD: 'SS', ESP: 'ES', LKA: 'LK', SDN: 'SD', SUR: 'SR',
  SWE: 'SE', CHE: 'CH', SYR: 'SY', TWN: 'TW', TJK: 'TJ', TZA: 'TZ', THA: 'TH', TLS: 'TL',
  TGO: 'TG', TTO: 'TT', TUN: 'TN', TUR: 'TR', TKM: 'TM', UGA: 'UG', UKR: 'UA', ARE: 'AE',
  GBR: 'GB', USA: 'US', URY: 'UY', UZB: 'UZ', VEN: 'VE', VNM: 'VN', YEM: 'YE', ZMB: 'ZM',
  ZWE: 'ZW', PSE: 'PS', XKX: 'XK', KOS: 'XK', WBG: 'PS', ESH: 'EH', CIV2: 'CI',
}

function iso2Of(iso3) {
  const key = String(iso3 || '').trim().toUpperCase()
  return ISO3_TO_ISO2[key] || (key.length === 2 ? key : null)
}

/** 1st, 2nd, 3rd, 4th … for percentile copy. */
function ordinal(value) {
  const n = Math.round(Number(value) || 0)
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = n % 10
  const suffix = mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}

module.exports = { sleep, num, centroidOfPolygon, iso2Of, ordinal, ISO3_TO_ISO2 }
