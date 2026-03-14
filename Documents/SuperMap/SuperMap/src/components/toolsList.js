// Only tools that work in iframes (no X-Frame-Options block). Non-embeddable sites (Flightradar24, Liveuamap, ADS-B Exchange, MarineTraffic, Open Infrastructure Map, Zoom.Earth, NASA FIRMS, USGS Earthquakes) are in Resources only.
export const TOOLS_LIST = [
  {
    id: 'adsb',
    title: 'ADSB.lol',
    desc: 'Live aircraft tracking (adsb.lol). Data via api.adsb.lol.',
    embedUrl: 'https://adsb.lol',
    apiDocsUrl: 'https://api.adsb.lol/docs',
  },
  {
    id: 'malfrat-map',
    title: "Malfrat's OSINT Map",
    desc: 'Curated OSINT tool map (from osintframework.com).',
    embedUrl: 'https://map.malfrats.industries',
  },
  {
    id: 'nukemap',
    title: 'NUKEMAP',
    desc: 'Nuclear weapon effects map by Alex Wellerstein — blast, fallout, casualties.',
    embedUrl: 'https://nuclearsecrecy.com/nukemap/',
  },
  {
    id: 'missilemap',
    title: 'MISSILEMAP',
    desc: 'Missile range, accuracy, and warhead effects by Alex Wellerstein.',
    embedUrl: 'https://nuclearsecrecy.com/missilemap/',
  },
  {
    id: 'dorksearch',
    title: 'Dorksearch',
    desc: 'Google dork builder and search.',
    embedUrl: 'https://dorksearch.com',
  },
  {
    id: 'arcgis-crisis',
    title: 'FRA Railway Map',
    desc: 'Federal Railroad Administration railway map (Esri).',
    embedUrl: 'https://experience.arcgis.com/experience/b6c12fd0a4774f38a303e3d034775854/',
  },
]
