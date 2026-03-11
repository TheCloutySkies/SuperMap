const RAD = Math.PI / 180
const DEG = 180 / Math.PI

function sunPosition(date) {
  const jd = date.getTime() / 86400000 + 2440587.5
  const n = jd - 2451545.0
  const L = (280.46 + 0.9856474 * n) % 360
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const epsilon = 23.439 * RAD - 3.56e-7 * RAD * n
  const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda))
  const eqTime = (L - DEG * Math.atan2(Math.sin(lambda) * Math.cos(epsilon), Math.cos(lambda))) % 360
  const ha = (date.getUTCHours() * 15 + date.getUTCMinutes() * 0.25 + eqTime + 180) % 360 - 180
  return { lat: dec * DEG, lng: -ha }
}

export function buildTerminatorGeoJSON(date = new Date(), steps = 180) {
  const { lat: sunLat, lng: sunLng } = sunPosition(date)
  const coords = []
  for (let i = 0; i <= steps; i++) {
    const lng = -180 + (360 * i) / steps
    const hourAngle = (lng - sunLng) * RAD
    const tanLat = -Math.cos(hourAngle) / Math.tan(sunLat * RAD)
    let lat = Math.atan(tanLat) * DEG
    lat = Math.max(-85, Math.min(85, lat))
    coords.push([lng, lat])
  }
  const nightSide = sunLat > 0 ? -90 : 90
  const ring = [
    [-180, nightSide],
    ...coords,
    [180, nightSide],
    [-180, nightSide],
  ]
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { name: 'Night' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    }],
  }
}
