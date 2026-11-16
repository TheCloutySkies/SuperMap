/**
 * Places a headline can name without asking a geocoder.
 * The geocoder turns "Crimea" into a hamlet in Australia and "Crimea bridge"
 * into a stream in Wales, so a named country, city, or landmark wins first.
 */

const PLACES = []

function add(label, lat, lon, kind, country, zoom, names, weak = []) {
  PLACES.push({
    label,
    lat,
    lon,
    kind,
    country: country || label,
    zoom,
    names: names.map((name) => name.toLowerCase()),
    weak: weak.map((name) => name.toLowerCase()),
    explicit: kind === 'landmark',
  })
}

add('Crimean Bridge', 45.3086, 36.5061, 'landmark', 'Ukraine', 11, ['crimean bridge', 'crimea bridge', 'kerch bridge', 'kerch strait bridge'])
add('Antonivsky Bridge', 46.668, 32.721, 'landmark', 'Ukraine', 12, ['antonivsky bridge', 'antonovsky bridge', 'antonivskyi bridge'])
add('Nova Kakhovka Dam', 46.778, 33.37, 'landmark', 'Ukraine', 11, ['nova kakhovka dam', 'kakhovka dam'])

add('Kyiv', 50.4501, 30.5234, 'city', 'Ukraine', 10, ['kyiv', 'kiev'])
add('Kharkiv', 49.9935, 36.2304, 'city', 'Ukraine', 10, ['kharkiv', 'kharkov'])
add('Odesa', 46.4825, 30.7233, 'city', 'Ukraine', 10, ['odesa', 'odessa'])
add('Dnipro', 48.4647, 35.0462, 'city', 'Ukraine', 10, ['dnipro', 'dnepr', 'dnipropetrovsk'])
add('Kherson', 46.6354, 32.6169, 'city', 'Ukraine', 10, ['kherson'])
add('Zaporizhzhia', 47.8388, 35.1396, 'city', 'Ukraine', 10, ['zaporizhzhia', 'zaporizhia', 'zaporozhye'])
add('Mariupol', 47.0971, 37.5434, 'city', 'Ukraine', 11, ['mariupol'])
add('Lviv', 49.8397, 24.0297, 'city', 'Ukraine', 10, ['lviv', 'lvov'])
add('Sevastopol', 44.6166, 33.5254, 'city', 'Ukraine', 11, ['sevastopol'])
add('Donetsk', 48.0159, 37.8028, 'city', 'Ukraine', 10, ['donetsk'])
add('Luhansk', 48.574, 39.3078, 'city', 'Ukraine', 10, ['luhansk', 'lugansk'])
add('Bakhmut', 48.595, 38.0, 'city', 'Ukraine', 11, ['bakhmut', 'artemivsk'])
add('Melitopol', 46.8489, 35.3653, 'city', 'Ukraine', 11, ['melitopol'])
add('Mykolaiv', 46.975, 31.9946, 'city', 'Ukraine', 10, ['mykolaiv', 'nikolaev'])
add('Kerch', 45.3568, 36.4754, 'city', 'Ukraine', 11, ['kerch'])
add('Belgorod', 50.595, 36.587, 'city', 'Russia', 10, ['belgorod'])
add('Kursk', 51.7304, 36.1926, 'city', 'Russia', 10, ['kursk'])
add('Moscow', 55.7558, 37.6173, 'city', 'Russia', 9, ['moscow'])
add('Saint Petersburg', 59.9311, 30.3609, 'city', 'Russia', 9, ['saint petersburg', 'st petersburg', 'st. petersburg'])
add('Gaza', 31.5017, 34.4668, 'city', 'Palestine', 11, ['gaza', 'gaza city'])
add('Rafah', 31.2969, 34.2455, 'city', 'Palestine', 12, ['rafah'])
add('Khan Younis', 31.346, 34.306, 'city', 'Palestine', 12, ['khan younis', 'khan yunis'])
add('Jerusalem', 31.7683, 35.2137, 'city', 'Israel', 11, ['jerusalem'])
add('Tel Aviv', 32.0853, 34.7818, 'city', 'Israel', 11, ['tel aviv'])
add('Haifa', 32.794, 34.9896, 'city', 'Israel', 11, ['haifa'])
add('Beirut', 33.8938, 35.5018, 'city', 'Lebanon', 11, ['beirut'])
add('Damascus', 33.5138, 36.2765, 'city', 'Syria', 10, ['damascus'])
add('Aleppo', 36.2021, 37.1343, 'city', 'Syria', 10, ['aleppo'])
add('Idlib', 35.9306, 36.6339, 'city', 'Syria', 11, ['idlib'])
add('Tehran', 35.6892, 51.389, 'city', 'Iran', 10, ['tehran', 'teheran'])
add('Isfahan', 32.6546, 51.668, 'city', 'Iran', 10, ['isfahan', 'esfahan'])
add('Baghdad', 33.3152, 44.3661, 'city', 'Iraq', 10, ['baghdad'])
add('Mosul', 36.335, 43.1189, 'city', 'Iraq', 11, ['mosul'])
add('Erbil', 36.1911, 44.0092, 'city', 'Iraq', 11, ['erbil', 'irbil'])
add('Sanaa', 15.3694, 44.191, 'city', 'Yemen', 10, ['sanaa', "sana'a", 'sana’a'])
add('Aden', 12.7855, 45.0187, 'city', 'Yemen', 11, ['aden'])
add('Kabul', 34.5553, 69.2075, 'city', 'Afghanistan', 10, ['kabul'])
add('Khartoum', 15.5007, 32.5599, 'city', 'Sudan', 10, ['khartoum'])
add('Port Sudan', 19.6158, 37.2164, 'city', 'Sudan', 11, ['port sudan'])
add('Cairo', 30.0444, 31.2357, 'city', 'Egypt', 10, ['cairo'])
add('Tripoli', 32.8872, 13.1913, 'city', 'Libya', 10, ['tripoli'])
add('Athens', 37.9838, 23.7275, 'city', 'Greece', 10, ['athens'])
add('Istanbul', 41.0082, 28.9784, 'city', 'Turkey', 10, ['istanbul'])
add('Ankara', 39.9334, 32.8597, 'city', 'Turkey', 10, ['ankara'])
add('London', 51.5074, -0.1278, 'city', 'United Kingdom', 10, ['london'])
add('Paris', 48.8566, 2.3522, 'city', 'France', 10, ['paris'])
add('Berlin', 52.52, 13.405, 'city', 'Germany', 10, ['berlin'])
add('Warsaw', 52.2297, 21.0122, 'city', 'Poland', 10, ['warsaw'])
add('Taipei', 25.033, 121.5654, 'city', 'Taiwan', 11, ['taipei'])
add('Beijing', 39.9042, 116.4074, 'city', 'China', 9, ['beijing', 'peking'])
add('Shanghai', 31.2304, 121.4737, 'city', 'China', 10, ['shanghai'])
add('Hong Kong', 22.3193, 114.1694, 'city', 'China', 11, ['hong kong'])
add('Tokyo', 35.6762, 139.6503, 'city', 'Japan', 10, ['tokyo'])
add('Seoul', 37.5665, 126.978, 'city', 'South Korea', 10, ['seoul'])
add('Pyongyang', 39.0392, 125.7625, 'city', 'North Korea', 10, ['pyongyang'])
add('New Delhi', 28.6139, 77.209, 'city', 'India', 10, ['new delhi', 'delhi'])
add('Mumbai', 19.076, 72.8777, 'city', 'India', 10, ['mumbai', 'bombay'])
add('Karachi', 24.8607, 67.0011, 'city', 'Pakistan', 10, ['karachi'])
add('Islamabad', 33.6844, 73.0479, 'city', 'Pakistan', 10, ['islamabad'])
add('Washington', 38.9072, -77.0369, 'city', 'United States', 10, ['washington', 'washington dc', 'washington d.c.'])
add('New York', 40.7128, -74.006, 'city', 'United States', 10, ['new york', 'new york city'])
add('Los Angeles', 34.0522, -118.2437, 'city', 'United States', 10, ['los angeles'])
add('Miami', 25.7617, -80.1918, 'city', 'United States', 11, ['miami'])

add('Crimea', 45.3, 34.1, 'region', 'Ukraine', 7, ['crimea', 'crimean peninsula'], ['crimean'])
add('Donbas', 48.3, 37.8, 'region', 'Ukraine', 7, ['donbas', 'donbass'])
add('West Bank', 31.95, 35.3, 'region', 'Palestine', 8, ['west bank'])
add('Gaza Strip', 31.42, 34.38, 'region', 'Palestine', 10, ['gaza strip'])
add('Golan', 33.0, 35.75, 'region', 'Syria', 8, ['golan', 'golan heights'])
add('Sinai', 29.5, 33.8, 'region', 'Egypt', 7, ['sinai', 'sinai peninsula'])
add('Kashmir', 34.1, 76.5, 'region', 'India', 7, ['kashmir'])
add('Tigray', 14.0, 38.9, 'region', 'Ethiopia', 7, ['tigray'])
add('Darfur', 13.5, 24.0, 'region', 'Sudan', 6, ['darfur'])
add('Taiwan Strait', 24.4, 119.5, 'region', 'Taiwan', 6, ['taiwan strait'])
add('Kerch Strait', 45.3, 36.55, 'region', 'Ukraine', 9, ['kerch strait'])
add('Strait of Hormuz', 26.57, 56.25, 'region', 'Oman', 7, ['strait of hormuz', 'hormuz strait'])
add('Red Sea', 20.0, 38.5, 'region', 'Egypt', 5, ['red sea'])
add('Black Sea', 43.5, 34.0, 'region', 'Ukraine', 5, ['black sea'])
add('South China Sea', 12.0, 114.0, 'region', 'China', 4, ['south china sea'])
add('Sahel', 15.0, 0.0, 'region', 'Mali', 5, ['sahel'])

function country(label, lat, lon, names, weak = [], zoom = 5.5) {
  add(label, lat, lon, 'country', label, zoom, names, weak)
}

country('Ukraine', 49.0, 32.0, ['ukraine'], ['ukrainian'], 6)
country('Russia', 61.5, 90.0, ['russia'], ['russian'], 3.5)
country('United States', 39.8, -98.6, ['united states', 'usa'], ['american'], 4)
country('United Kingdom', 54.0, -2.5, ['united kingdom', 'britain', 'great britain'], ['british'], 6)
country('England', 52.5, -1.5, ['england'], ['english'], 6)
country('France', 46.6, 2.2, ['france'], ['french'], 5.5)
country('Germany', 51.2, 10.4, ['germany'], ['german'], 6)
country('Poland', 52.1, 19.4, ['poland'], ['polish'], 6)
country('Israel', 31.4, 34.9, ['israel'], ['israeli'], 7)
country('Palestine', 31.9, 35.2, ['palestine'], ['palestinian'], 8)
country('Iran', 32.0, 53.0, ['iran'], ['iranian'], 5)
country('Iraq', 33.0, 44.0, ['iraq'], ['iraqi'], 6)
country('Syria', 35.0, 38.0, ['syria'], ['syrian'], 6)
country('Lebanon', 33.9, 35.8, ['lebanon'], ['lebanese'], 8)
country('Yemen', 15.5, 48.0, ['yemen'], ['yemeni', 'houthi', 'houthis'], 6)
country('Saudi Arabia', 24.0, 45.0, ['saudi arabia'], ['saudi'], 5)
country('Turkey', 39.0, 35.0, ['turkey', 'turkiye', 'türkiye'], ['turkish'], 5.5)
country('China', 35.0, 103.0, ['china'], ['chinese'], 4)
country('Taiwan', 23.7, 121.0, ['taiwan'], ['taiwanese'], 7)
country('North Korea', 40.3, 127.0, ['north korea', 'dprk'], ['north korean'], 6)
country('South Korea', 36.5, 127.8, ['south korea'], ['south korean'], 6)
country('Japan', 36.2, 138.3, ['japan'], ['japanese'], 5)
country('India', 22.5, 79.0, ['india'], ['indian'], 4.5)
country('Pakistan', 30.0, 70.0, ['pakistan'], ['pakistani'], 5.5)
country('Afghanistan', 33.9, 67.7, ['afghanistan'], ['afghan'], 6)
country('Egypt', 26.8, 30.8, ['egypt'], ['egyptian'], 5.5)
country('Libya', 27.0, 17.0, ['libya'], ['libyan'], 5)
country('Sudan', 15.5, 30.0, ['sudan'], ['sudanese'], 5)
country('South Sudan', 7.5, 30.0, ['south sudan'], [], 5.5)
country('Ethiopia', 9.1, 40.5, ['ethiopia'], ['ethiopian'], 5.5)
country('Somalia', 6.0, 46.0, ['somalia'], ['somali'], 5.5)
country('Nigeria', 9.1, 8.7, ['nigeria'], ['nigerian'], 5.5)
country('Niger', 17.6, 8.1, ['niger'], [], 5)
country('Mali', 17.6, -2.0, ['mali'], ['malian'], 5)
country('Greece', 39.1, 21.8, ['greece'], ['greek'], 6)
country('Italy', 42.8, 12.5, ['italy'], ['italian'], 5.5)
country('Spain', 40.2, -3.7, ['spain'], ['spanish'], 5.5)
country('Canada', 56.1, -106.3, ['canada'], ['canadian'], 3.5)
country('Mexico', 23.6, -102.5, ['mexico'], ['mexican'], 4.5)
country('Brazil', -10.8, -52.9, ['brazil'], ['brazilian'], 4)
country('Australia', -25.3, 133.8, ['australia'], ['australian'], 4)
country('Belarus', 53.7, 27.9, ['belarus'], ['belarusian'], 6)
country('Moldova', 47.4, 28.4, ['moldova'], ['moldovan'], 7)
country('Romania', 45.9, 24.9, ['romania'], ['romanian'], 6)
country('Georgia', 42.3, 43.4, ['georgia'], ['georgian'], 6)
country('Armenia', 40.1, 45.0, ['armenia'], ['armenian'], 7)
country('Azerbaijan', 40.1, 47.6, ['azerbaijan'], ['azerbaijani'], 6)
country('Kazakhstan', 48.0, 68.0, ['kazakhstan'], ['kazakh'], 4.5)
country('Myanmar', 21.9, 95.9, ['myanmar', 'burma'], ['burmese'], 5.5)
country('Venezuela', 7.0, -66.0, ['venezuela'], ['venezuelan'], 5.5)
country('Colombia', 4.6, -74.3, ['colombia'], ['colombian'], 5.5)
country('Cuba', 21.5, -78.0, ['cuba'], ['cuban'], 6)
country('Haiti', 18.97, -72.29, ['haiti'], ['haitian'], 8)
country('Qatar', 25.3, 51.2, ['qatar'], ['qatari'], 8)
country('United Arab Emirates', 24.0, 54.0, ['united arab emirates', 'uae'], ['emirati'], 7)
country('Kuwait', 29.3, 47.5, ['kuwait'], ['kuwaiti'], 8)
country('Jordan', 31.2, 36.5, ['jordan'], ['jordanian'], 7)
country('Oman', 21.5, 56.0, ['oman'], ['omani'], 6)
country('Bahrain', 26.0, 50.55, ['bahrain'], ['bahraini'], 9)
country('Indonesia', -2.5, 118.0, ['indonesia'], ['indonesian'], 4.5)
country('Philippines', 12.0, 122.0, ['philippines'], ['philippine', 'filipino'], 5.5)
country('Vietnam', 14.0, 108.0, ['vietnam'], ['vietnamese'], 5.5)
country('Thailand', 15.0, 101.0, ['thailand'], ['thai'], 5.5)
country('South Africa', -29.0, 25.0, ['south africa'], [], 5)
country('Kenya', 0.2, 37.9, ['kenya'], ['kenyan'], 6)
country('Democratic Republic of the Congo', -2.8, 23.6, ['democratic republic of the congo', 'dr congo', 'drc'], ['congolese'], 5)
country('Papua New Guinea', -6.3, 143.9, ['papua new guinea'], [], 5.5)
country('Equatorial Guinea', 1.6, 10.3, ['equatorial guinea'], [], 7)
country('Guinea', 10.0, -11.0, ['guinea'], [], 6)
country('Guinea-Bissau', 12.0, -15.0, ['guinea-bissau'], [], 7)
country('New Zealand', -41.0, 174.0, ['new zealand'], [], 5)

const WEIGHT = { landmark: 400, city: 220, region: 160, country: 80, adjective: 40 }
const VERB = /\b(strikes|struck|striking|strike|attacks|attacked|attacking|attack|hits|hitting|hit|shells|shelled|shelling|bombs|bombed|bombing|bombarded|targets|targeted|destroys|destroyed|damages|damaged)\b/i
const CUT = /\b(as|while|after|before|when|amid|because)\b/i
const FACILITY = /\b([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,2})\s+(bridge|airport|airbase|airfield|seaport|harbor|harbour|strait|canal|dam|refinery)\b/gu
const FACILITY_WORD = /\b([\p{L}'’.-]+)\s+(bridge|airport|airbase|airfield|seaport|harbor|harbour|strait|canal|dam|refinery)\b/giu

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function objectSpan(text) {
  const verb = VERB.exec(text)
  if (!verb) return { start: 0, end: text.length }
  const start = verb.index + verb[0].length
  const rest = text.slice(start)
  const cut = CUT.exec(rest)
  return { start, end: cut ? start + cut.index : text.length }
}

function lookup(name) {
  const key = String(name || '').toLowerCase().replace(/[’']/g, '')
  return PLACES.find((place) => place.names.includes(key) || place.weak.includes(key)) || null
}

function collect(original) {
  const found = []
  const codes = [['US', 'United States'], ['UK', 'United Kingdom']]
  for (const [code, label] of codes) {
    const place = PLACES.find((row) => row.label === label)
    if (!place) continue
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${code}(?![\\p{L}\\p{N}])`, 'gu')
    for (const match of original.matchAll(pattern)) {
      found.push(hitFrom(place, match.index, match.index + code.length, false))
    }
  }
  for (const place of PLACES) {
    for (const name of [...place.names, ...place.weak]) {
      if (name.length <= 2) continue
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'giu')
      for (const match of original.matchAll(pattern)) {
        found.push(hitFrom(place, match.index, match.index + match[0].length, place.weak.includes(name.toLowerCase()) && !place.names.includes(name.toLowerCase())))
      }
    }
  }
  const seenFacility = new Set()
  const addFacility = (match, known) => {
    const start = match.index
    const end = start + match[0].length
    const key = `${start}:${end}`
    if (seenFacility.has(key)) return
    seenFacility.add(key)
    const named = known && known.kind !== 'country' && known.kind !== 'adjective'
    found.push({
      label: named ? `${known.label} ${match[2]}` : titleCase(match[0]),
      lat: named ? known.lat : null,
      lon: named ? known.lon : null,
      kind: 'landmark',
      country: known?.country || '',
      zoom: 11,
      explicit: false,
      facility: true,
      query: match[0],
      start,
      end,
      weak: false,
    })
  }
  for (const match of original.matchAll(new RegExp(FACILITY.source, 'gu'))) addFacility(match, lookup(match[1]))
  for (const match of original.matchAll(new RegExp(FACILITY_WORD.source, 'giu'))) {
    const known = lookup(match[1])
    if (known && known.kind !== 'country' && known.kind !== 'adjective') addFacility(match, known)
  }
  return found
}

function hitFrom(place, start, end, weak) {
  return {
    label: place.label,
    lat: place.lat,
    lon: place.lon,
    kind: weak ? 'adjective' : place.kind,
    country: place.country,
    zoom: place.zoom,
    explicit: place.explicit && !weak,
    facility: false,
    query: place.label,
    start,
    end,
    weak,
  }
}

function titleCase(value) {
  return String(value).replace(/\p{L}+/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

function dedupe(found) {
  const ranked = [...found].sort((a, b) => (
    (b.end - b.start) - (a.end - a.start)
    || Number(b.explicit) - Number(a.explicit)
    || (WEIGHT[b.kind] || 0) - (WEIGHT[a.kind] || 0)
  ))
  const kept = []
  for (const hit of ranked) {
    const covered = kept.some((other) => hit.start >= other.start && hit.end <= other.end)
    if (!covered) kept.push(hit)
  }
  return kept
}

function pickHeadlinePlace(text) {
  const original = String(text || '').replace(/\s+/g, ' ').trim()
  if (!original) return null
  const found = dedupe(collect(original))
  if (!found.length) return null
  const span = objectSpan(original)
  const scored = found.map((hit) => {
    const inObject = span.start < span.end && hit.start >= span.start && hit.start < span.end
    const score = (WEIGHT[hit.kind] || 50) + (inObject ? 120 : 0) + Math.min(hit.end - hit.start, 48)
    return { ...hit, score }
  })
  scored.sort((a, b) => b.score - a.score)
  const chosen = scored[0]
  const where = chosen.label
  const broad = chosen.kind === 'country' || chosen.kind === 'adjective'
  return {
    label: where,
    query: chosen.query || where,
    lat: chosen.lat,
    lon: chosen.lon,
    zoom: chosen.zoom,
    kind: chosen.kind,
    country: chosen.country,
    explicit: chosen.explicit,
    facility: chosen.facility,
    reasoning: broad
      ? `The headline names ${where}. Drag the pin to the town if you know it.`
      : `The headline names ${where}. Drag the pin if the spot is off.`,
  }
}

function distanceKm(a, b) {
  const lat1 = Number(a?.lat)
  const lon1 = Number(a?.lon)
  const lat2 = Number(b?.lat)
  const lon2 = Number(b?.lon)
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity
  const r = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)))
}

module.exports = { pickHeadlinePlace, distanceKm }
