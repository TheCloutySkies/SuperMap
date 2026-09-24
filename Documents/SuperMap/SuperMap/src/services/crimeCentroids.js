/** Approximate lat/lon for map city markers (no coords in crime pack). */
export const CITY_COORDS = {
  'memphis-tennessee': [35.1495, -90.049],
  'oakland-california': [37.8044, -122.2712],
  'detroit-michigan': [42.3314, -83.0458],
  'little-rock-arkansas': [34.7465, -92.2896],
  'baltimore-maryland': [39.2904, -76.6122],
  'cleveland-ohio': [41.4993, -81.6944],
  'kansas-city-missouri': [39.0997, -94.5786],
  'milwaukee-wisconsin': [43.0389, -87.9065],
  'pueblo-colorado': [38.2544, -104.6091],
  'st-louis-missouri': [38.627, -90.1994],
  'new-orleans-louisiana': [29.9511, -90.0715],
  'lansing-michigan': [42.7325, -84.5555],
  'peoria-illinois': [40.6936, -89.589],
  'dayton-ohio': [39.7589, -84.1916],
  'birmingham-alabama': [33.5186, -86.8104],
  'carmel-indiana': [39.9784, -86.118],
  'cary-north-carolina': [35.7915, -78.7811],
  'fishers-indiana': [39.9568, -86.0133],
  'sugar-land-texas': [29.6197, -95.6349],
  'naperville-illinois': [41.7508, -88.1535],
  'irvine-california': [33.6846, -117.8265],
  'virginia-beach-virginia': [36.8529, -75.978],
  'new-york-new-york': [40.7128, -74.006],
  'los-angeles-california': [34.0522, -118.2437],
  'chicago-illinois': [41.8781, -87.6298],
  'houston-texas': [29.7604, -95.3698],
  'phoenix-arizona': [33.4484, -112.074],
  'philadelphia-pennsylvania': [39.9526, -75.1652],
  'san-antonio-texas': [29.4241, -98.4936],
  'san-diego-california': [32.7157, -117.1611],
  'dallas-texas': [32.7767, -96.797],
  'san-jose-california': [37.3382, -121.8863],
  'austin-texas': [30.2672, -97.7431],
  'jacksonville-florida': [30.3322, -81.6557],
  'fort-worth-texas': [32.7555, -97.3308],
  'columbus-ohio': [39.9612, -82.9988],
  'charlotte-north-carolina': [35.2271, -80.8431],
  'indianapolis-indiana': [39.7684, -86.1581],
  'seattle-washington': [47.6062, -122.3321],
  'denver-colorado': [39.7392, -104.9903],
  'washington-district-of-columbia': [38.9072, -77.0369],
  'boston-massachusetts': [42.3601, -71.0589],
  'nashville-tennessee': [36.1627, -86.7816],
  'atlanta-georgia': [33.749, -84.388],
  'miami-florida': [25.7617, -80.1918],
  'minneapolis-minnesota': [44.9778, -93.265],
  'portland-oregon': [45.5152, -122.6784],
  'las-vegas-nevada': [36.1699, -115.1398],
}

/** State geographic centroids for fallback city placement. */
export const STATE_CENTROIDS = {
  AL: [32.806671, -86.79113],
  AK: [61.370716, -152.404419],
  AZ: [33.729759, -111.431221],
  AR: [34.969704, -92.373123],
  CA: [36.116203, -119.681564],
  CO: [39.059811, -105.311104],
  CT: [41.597782, -72.755371],
  DE: [39.318523, -75.507141],
  DC: [38.897438, -77.026817],
  FL: [27.766279, -81.686783],
  GA: [33.040619, -83.643074],
  HI: [21.094318, -157.498337],
  ID: [44.240459, -114.478828],
  IL: [40.349457, -88.986137],
  IN: [39.849426, -86.258278],
  IA: [42.011539, -93.210526],
  KS: [38.5266, -96.726486],
  KY: [37.66814, -84.670067],
  LA: [31.169546, -91.867805],
  ME: [44.693947, -69.381927],
  MD: [39.063946, -76.802101],
  MA: [42.230171, -71.530106],
  MI: [43.326618, -84.536095],
  MN: [45.694454, -93.900192],
  MS: [32.741646, -89.678696],
  MO: [38.456085, -92.288368],
  MT: [46.921925, -110.454353],
  NE: [41.12537, -98.268082],
  NV: [38.313515, -117.055374],
  NH: [43.452492, -71.563896],
  NJ: [40.298904, -74.521011],
  NM: [34.840515, -106.248482],
  NY: [42.165726, -74.948051],
  NC: [35.630066, -79.806419],
  ND: [47.528912, -99.784012],
  OH: [40.388783, -82.764915],
  OK: [35.565342, -96.928917],
  OR: [44.572021, -122.070938],
  PA: [40.590752, -77.209755],
  RI: [41.680893, -71.51178],
  SC: [33.856892, -80.945007],
  SD: [44.299782, -99.438828],
  TN: [35.747845, -86.692345],
  TX: [31.054487, -97.563461],
  UT: [40.150032, -111.862434],
  VT: [44.045876, -72.710686],
  VA: [37.769337, -78.169968],
  WA: [47.400902, -121.490494],
  WV: [38.491226, -80.954453],
  WI: [44.268543, -89.616508],
  WY: [42.755966, -107.30249],
}

const STATE_NAME_TO_ABBR = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
}

export function stateAbbrFromName(name) {
  if (!name) return null
  const s = String(name).trim()
  if (s.length === 2) return s.toUpperCase()
  return STATE_NAME_TO_ABBR[s.toLowerCase()] || null
}

/** Stable tiny offset so state-centroid fallbacks don't stack. */
function hashOffset(slug) {
  let h = 0
  const str = String(slug || '')
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  const lat = ((h % 100) / 100 - 0.5) * 1.4
  const lon = (((h >> 8) % 100) / 100 - 0.5) * 1.4
  return [lat, lon]
}

export function coordsForCity(city) {
  if (!city) return null
  const slug = String(city.slug || '').toLowerCase()
  if (CITY_COORDS[slug]) return CITY_COORDS[slug]
  const abbr = city.abbr || stateAbbrFromName(city.state)
  const base = abbr ? STATE_CENTROIDS[String(abbr).toUpperCase()] : null
  if (!base) return null
  const [dLat, dLon] = hashOffset(slug)
  return [base[0] + dLat, base[1] + dLon]
}
