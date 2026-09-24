/** Overpass presets for Geolocate map mode. */

export const GEOLOCATE_PRESETS = [
  { name: 'Fountains, tram, shops', query: `[out:json][timeout:30];( node["amenity"="fountain"]({{bbox}}); node["railway"="tram_stop"]({{bbox}}); node["shop"]({{bbox}}); way["amenity"="fountain"]({{bbox}}); way["shop"]({{bbox}}); );out body geom;` },
  { name: 'Wind turbines + railway', query: `[out:json][timeout:30];( node["man_made"="wind_turbine"]({{bbox}}); way["railway"="rail"]({{bbox}}); way["man_made"="wind_turbine"]({{bbox}}); );out body geom;` },
  { name: 'Emergency (fire, police, hospital)', query: `[out:json][timeout:30];( node["amenity"~"fire_station|police|hospital"]({{bbox}}); way["amenity"~"fire_station|police|hospital"]({{bbox}}); );out body geom;` },
  { name: 'Cafes & restaurants', query: `[out:json][timeout:30];( node["amenity"~"cafe|restaurant"]({{bbox}}); way["amenity"~"cafe|restaurant"]({{bbox}}); );out body geom;` },
  { name: 'Schools & universities', query: `[out:json][timeout:30];( node["amenity"~"school|university|college"]({{bbox}}); way["amenity"~"school|university|college"]({{bbox}}); );out body geom;` },
  { name: 'Fuel stations', query: `[out:json][timeout:30];( node["amenity"="fuel"]({{bbox}}); way["amenity"="fuel"]({{bbox}}); );out body geom;` },
  { name: 'Pharmacies', query: `[out:json][timeout:30];( node["amenity"="pharmacy"]({{bbox}}); way["amenity"="pharmacy"]({{bbox}}); );out body geom;` },
  { name: 'Supermarkets & shops', query: `[out:json][timeout:30];( node["shop"~"supermarket|convenience|mall"]({{bbox}}); way["shop"~"supermarket|convenience"]({{bbox}}); );out body geom;` },
  { name: 'Water (rivers, lakes)', query: `[out:json][timeout:30];( way["natural"="water"]({{bbox}}); way["waterway"~"river|stream|canal"]({{bbox}}); );out body geom;` },
  { name: 'Major roads', query: `[out:json][timeout:30];( way["highway"~"motorway|trunk|primary"]({{bbox}}); );out body geom;` },
  { name: 'Airports & runways', query: `[out:json][timeout:30];( node["aeroway"="aerodrome"]({{bbox}}); way["aeroway"~"aerodrome|runway|taxiway"]({{bbox}}); );out body geom;` },
  { name: 'Power lines & towers', query: `[out:json][timeout:30];( way["power"~"line|tower"]({{bbox}}); node["power"~"tower|substation"]({{bbox}}); );out body geom;` },
  { name: 'Cell towers / masts', query: `[out:json][timeout:30];( node["man_made"="tower"]["tower:type"~"communication|cell"]({{bbox}}); node["communication"~"mobile_phone|cell"]({{bbox}}); );out body geom;` },
  { name: 'Stadiums & monuments', query: `[out:json][timeout:30];( node["leisure"="stadium"]({{bbox}}); node["historic"="monument"]({{bbox}}); way["leisure"="stadium"]({{bbox}}); way["historic"="monument"]({{bbox}}); );out body geom;` },
  { name: 'Abandoned / disused rail', query: `[out:json][timeout:30];( way["railway"~"disused|abandoned"]({{bbox}}); way["railway"="rail"]["usage"~"disused|abandoned"]({{bbox}}); );out body geom;` },
]
