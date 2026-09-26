import { useState, useMemo, useEffect, useRef } from 'react'
import './ResourcesView.css'

export const RESOURCE_SECTIONS = [
  {
    id: 'interactive',
    title: '🖥 Interactive Web Apps',
    items: [
      { name: 'NUKEMAP', url: 'https://nuclearsecrecy.com/nukemap/', desc: 'Nuclear weapon effects map by Alex Wellerstein — blast, fallout, casualties. Drag marker, set yield, detonate.', embed: true },
      { name: 'MISSILEMAP', url: 'https://nuclearsecrecy.com/missilemap/', desc: 'Missile range, accuracy, and warhead effects by Alex Wellerstein. Launch/target presets, CEP, SSPK.', embed: true },
    ],
  },
  {
    id: 'search',
    title: '🌍 Search & Recon',
    items: [
      { name: 'SearXNG', url: 'https://searx.be', desc: 'Privacy search engine, Google-style dorks' },
      { name: 'Dorksearch', url: 'https://dorksearch.com', desc: 'Google dork builder and search (embed may be blocked by site)', embed: true },
      { name: 'IntelX', url: 'https://intelx.io', desc: 'Searches leaks, domains, files, darknet indexes' },
      { name: 'Shodan', url: 'https://www.shodan.io', desc: 'Search engine for exposed servers, cameras, routers' },
      { name: 'Censys', url: 'https://search.censys.io', desc: 'Internet infrastructure search' },
      { name: 'Hunter', url: 'https://hunter.io', desc: 'Find emails tied to domains' },
      { name: 'Wayback Machine', url: 'https://web.archive.org', desc: 'Historical versions of websites' },
      { name: 'urlscan.io', url: 'https://urlscan.io/', desc: 'Scan and analyze URLs — screenshots, domains, IPs, and related indicators' },
      { name: 'crt.sh', url: 'https://crt.sh/', desc: 'Certificate Transparency search — find subdomains via issued TLS certs' },
      { name: 'DNSDumpster', url: 'https://dnsdumpster.com/', desc: 'DNS recon and domain map — discover related hosts and records' },
      { name: 'Netlas', url: 'https://app.netlas.io/', desc: 'Internet-wide host/domain search (DNS, whois, certs, ports)' },
      { name: 'Pulsedive', url: 'https://pulsedive.com/', desc: 'Threat intel lookup for IPs, domains, URLs — whois, DNS, ports, reports' },
      { name: 'Have I Been Pwned', url: 'https://haveibeenpwned.com/', desc: 'Check emails and domains against known breach corpora' },
      { name: 'WhatsMyName', url: 'https://whatsmyname.app/', desc: 'Username enumeration across hundreds of sites' },
      { name: 'TinEye', url: 'https://tineye.com/', desc: 'Reverse image search — find where a photo appears online' },
      { name: 'Yandex Images', url: 'https://yandex.com/images/', desc: 'Reverse image and visual search (often stronger than Google for faces/places)' },
      { name: 'Metadata2Go', url: 'https://www.metadata2go.com/', desc: 'Online EXIF/metadata viewer for images and documents' },
      { name: 'InVID Verification Plugin', url: 'https://www.invid-project.eu/tools-and-services/invid-verification-plugin/', desc: 'Video verification toolkit — keyframes, reverse search, metadata (browser plugin page)' },
    ],
  },
  {
    id: 'maps',
    title: '🛰 OSINT Maps (Live Global Monitoring)',
    items: [
      { name: "Malfrat's OSINT Map", url: 'https://map.malfrats.industries', desc: 'Curated OSINT tool map (from osintframework.com)', embed: true },
      { name: 'Liveuamap', url: 'https://liveuamap.com', desc: 'Live global conflict events', embed: true },
      { name: 'ISW Maps', url: 'https://www.understandingwar.org/maps', desc: 'Institute for the Study of War maps', embed: true },
      { name: 'ArcGIS Crisis & Conflict', url: 'https://experience.arcgis.com/experience/b6c12fd0a4774f38a303e3d034775854/', desc: 'Esri crisis and conflict situational awareness', embed: true },
      { name: 'Open Infrastructure Map', url: 'https://openinframap.org/', desc: 'Power, telecom, oil & gas', embed: true },
      { name: 'Flightradar24', url: 'https://www.flightradar24.com/', desc: 'Live flight tracking', embed: true },
      { name: 'ADS-B Exchange', url: 'https://globe.adsbexchange.com', desc: 'Military aircraft tracking', embed: true },
      { name: 'MarineTraffic', url: 'https://www.marinetraffic.com', desc: 'Ship positions', embed: true },
      { name: 'VesselFinder', url: 'https://www.vesselfinder.com', desc: 'Ship tracking', embed: true },
      { name: 'NASA FIRMS', url: 'https://firms.modaps.eosdis.nasa.gov/map', desc: 'Fire map', embed: true },
      { name: 'USGS Earthquakes', url: 'https://earthquake.usgs.gov/earthquakes/map', desc: 'Earthquake map', embed: true },
      { name: 'Zoom.Earth', url: 'https://zoom.earth', desc: 'Satellite weather and storm monitoring', embed: true },
      { name: 'YouTube Geofind', url: 'https://mattw.io/youtube-geofind/', desc: 'Geotagged YouTube videos on a map' },
      { name: 'PastVu', url: 'https://pastvu.com/', desc: 'Historical photos pinned to map locations' },
      { name: 'COPERNIX', url: 'https://copernix.io/', desc: 'Geolocated Wikipedia articles on a worldwide map' },
      { name: 'WikiShootMe', url: 'https://wikishootme.toolforge.org/', desc: 'Geotagged Wikimedia Commons images on a map' },
      { name: 'Snap Map', url: 'https://map.snapchat.com/', desc: 'Public Snapchat Story Map — location-based snaps' },
      { name: 'Submarine Cable Map', url: 'https://www.submarinecablemap.com/', desc: 'Global undersea communications cables' },
      { name: 'SondeHub', url: 'https://sondehub.org/', desc: 'Radiosonde tracker with altitude, frequency, and type' },
      { name: 'Safe Airspace', url: 'https://safeairspace.net/', desc: 'Conflict-zone and risk airspace database with incident history' },
      { name: 'Native Land', url: 'https://native-land.ca/', desc: 'Indigenous territories, languages, and treaties' },
      { name: 'LightningMaps', url: 'https://www.lightningmaps.org/', desc: 'Real-time and historical lightning strike map' },
      { name: 'Global Fishing Watch', url: 'https://globalfishingwatch.org/map/', desc: 'Commercial fishing effort and vessel activity map' },
      { name: 'Live Train Tracker', url: 'https://mobility.portal.geops.io/world.geops.transit?baselayer=world.geops.travic&layers=world.geops.traviclive&x=810000&y=5900000&z=5.5', desc: 'Real-time worldwide train movements (geops)' },
      { name: 'Ventusky', url: 'https://www.ventusky.com/', desc: 'Weather visualization — wind, rain, temperature, pressure, waves' },
      { name: 'CFR Global Conflict Tracker', url: 'https://www.cfr.org/global-conflict-tracker/', desc: 'Council on Foreign Relations interactive conflict tracker' },
      { name: 'ACLED', url: 'https://acleddata.com/', desc: 'Armed Conflict Location & Event Data — crisis and protest reporting' },
      { name: 'CrisisWatch', url: 'https://www.crisisgroup.org/crisiswatch', desc: 'International Crisis Group monthly conflict tracker' },
      { name: 'Freedom House Map', url: 'https://freedomhouse.org/explore-the-map', desc: 'Freedom in the World / internet freedom scores on a map' },
      { name: 'SPL Hate Map', url: 'https://www.splcenter.org/hate-map', desc: 'Southern Poverty Law Center hate-group map (US)' },
      { name: 'Citizen Explore', url: 'https://citizen.com/explore', desc: 'Live incident map for major US cities' },
      { name: 'CrimeMapping', url: 'https://www.crimemapping.com/', desc: 'Local crime incidents by agency — last day, week, or month' },
      { name: 'Global Detention Project', url: 'https://www.globaldetentionproject.org/detention-centres/map-view', desc: 'Worldwide immigration detention centres map' },
      { name: 'Track-Trace Containers', url: 'https://www.track-trace.com/container', desc: 'Track shipping containers by number across carriers' },
    ],
  },
  {
    id: 'infra',
    title: '🌐 Infrastructure & Network Intelligence',
    items: [
      { name: 'BGP.he.net', url: 'https://bgp.he.net', desc: 'Internet routing and network data' },
      { name: 'Cloudflare Radar', url: 'https://radar.cloudflare.com', desc: 'Global internet outages and traffic' },
      { name: 'DownDetector', url: 'https://downdetector.com', desc: 'Service outages worldwide' },
      { name: 'PowerOutage.us', url: 'https://poweroutage.us/', desc: 'US real-time power outage map and utility stats' },
      { name: 'AQICN World Map', url: 'https://aqicn.org/map/world/', desc: 'Worldwide real-time air quality index map' },
      { name: 'OSM Buildings', url: 'https://osmbuildings.org/', desc: '3D building footprints — height, type, and purpose from OpenStreetMap' },
    ],
  },
  {
    id: 'toolkits',
    title: '🧠 OSINT Toolkits',
    items: [
      { name: 'OSINT Framework', url: 'https://osintframework.com', desc: 'Massive directory of investigation tools' },
      { name: 'Cyber Detective OSINT collection', url: 'https://github.com/cipher387/osint_stuff_tool_collection', desc: 'Curated from cipher387/osint_stuff_tool_collection — 1000+ OSINT links (source atlas for many entries here)' },
      { name: 'Nixintel OSINT Resource List', url: 'https://start.me/p/rx6Qj8/nixintel-s-osint-resource-list', desc: 'Curated OSINT list' },
      { name: 'Bellingcat Toolkit', url: 'https://bellingcat.gitbook.io/toolkit', desc: 'From Bellingcat' },
      { name: 'Bellingcat OSM Search', url: 'https://osm-search.bellingcat.com/', desc: 'Find places by nearby OSM objects and distances (photo/sat geolocation aid)' },
      { name: 'Sherlock', url: 'https://github.com/sherlock-project/sherlock', desc: 'Username search across social networks' },
      { name: 'SpiderFoot', url: 'https://www.spiderfoot.net/', desc: 'Automated OSINT collection' },
      { name: 'Camopedia', url: 'https://www.camopedia.org/index.php/Main_Page', desc: 'Military & paramilitary camouflage database by country and pattern' },
      { name: 'Cartrology', url: 'http://www.cartrology.com', desc: 'Maps and cartography resources' },
      { name: 'GIJN Military & Conflict Database', url: 'https://docs.google.com/spreadsheets/d/1wiIVKdvn8QSBQ1LGB9kiGrB28SYFblbZ7uM4uKSWFfU/edit?pli=1&gid=0#gid=0', desc: 'GIJN-curated databases: SIPRI, Small Arms Survey, iTRACE, PRIO, UN arms, crisis groups' },
    ],
  },
  {
    id: 'messengers',
    title: '💬 Messengers & Channels',
    items: [
      { name: 'TGStat', url: 'https://tgstat.com/', desc: 'Telegram channel analytics — growth, engagement, and mentions' },
      { name: 'Lyzem', url: 'https://lyzem.com/', desc: 'Public Telegram search across channels and groups' },
    ],
  },
  {
    id: 'news',
    title: '📰 OSINT / Intelligence News Sources',
    items: [
      { name: 'Bellingcat', url: 'https://www.bellingcat.com', desc: 'Investigations and open source verification' },
      { name: 'Institute for the Study of War', url: 'https://understandingwar.org', desc: 'Conflict analysis and maps' },
      { name: 'Defense One', url: 'https://www.defenseone.com', desc: 'Defense and national security' },
      { name: 'War on the Rocks', url: 'https://warontherocks.com', desc: 'National security commentary' },
      { name: 'Defense News', url: 'https://www.defensenews.com', desc: 'Defense politics, business, technology' },
      { name: 'The War Zone', url: 'https://www.thedrive.com/the-war-zone', desc: 'Military, defense, geopolitics' },
    ],
  },
  {
    id: 'global',
    title: '🌍 Current Events & Global News',
    items: [
      { name: 'Reuters', url: 'https://www.reuters.com', desc: 'International news' },
      { name: 'Associated Press', url: 'https://apnews.com', desc: 'AP News' },
      { name: 'BBC News', url: 'https://www.bbc.com/news', desc: 'BBC' },
      { name: 'Deutsche Welle', url: 'https://www.dw.com', desc: 'DW' },
      { name: 'Al Jazeera', url: 'https://www.aljazeera.com', desc: 'Al Jazeera' },
    ],
  },
  {
    id: 'survival',
    title: '🧭 Survival & Preparedness',
    items: [
      { name: 'Ready.gov', url: 'https://www.ready.gov', desc: 'US preparedness' },
      { name: 'The Prepared', url: 'https://theprepared.com', desc: 'Preparedness guides' },
      { name: 'Modern Survival Online', url: 'https://modernsurvivalonline.com', desc: 'Survival resources' },
      { name: 'Army Field Manuals (FAS)', url: 'https://irp.fas.org/doddir/army/', desc: 'FM 3-21.8, FM 21-76, FM 3-05, etc.' },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy & Independent Media',
    items: [
      { name: '404 Media', url: 'https://www.404media.co/', desc: 'Privacy and tech investigations' },
      { name: 'Privacy Guides', url: 'https://www.privacyguides.org/', desc: 'Privacy tools and guides' },
      { name: 'EFF', url: 'https://www.eff.org/', desc: 'Electronic Frontier Foundation' },
    ],
  },
  {
    id: 'dashboards',
    title: '🧰 Live Dashboards',
    items: [
      { name: 'Liveuamap', url: 'https://liveuamap.com', desc: 'Conflict dashboard', embed: true },
      { name: 'ADS-B Exchange Globe', url: 'https://globe.adsbexchange.com', desc: 'Aircraft', embed: true },
      { name: 'NASA FIRMS Map', url: 'https://firms.modaps.eosdis.nasa.gov/map', desc: 'Fires', embed: true },
      { name: 'Zoom.Earth', url: 'https://zoom.earth', desc: 'Weather and storms', embed: true },
      { name: 'Cloudflare Radar', url: 'https://radar.cloudflare.com', desc: 'Internet traffic', embed: true },
    ],
  },
  {
    id: 'registries',
    title: '📋 Official registries & radio',
    items: [
      { name: 'NSOPW (Sex Offender Registry)', url: 'https://www.nsopw.gov', desc: 'Official US national sex offender public website — search by location. Use only for lawful purposes.' },
      { name: 'FCC ASR Search', url: 'https://wireless2.fcc.gov/UlsApp/AsrSearch/asrRegistrationSearch.jsp', desc: 'FCC Antenna Structure Registration search' },
      { name: 'FCC Open Data', url: 'https://opendata.fcc.gov', desc: 'FCC open data catalog (towers, licenses, etc.)' },
      { name: 'RadioReference', url: 'https://www.radioreference.com', desc: 'Radio frequency database and trunked systems' },
      { name: 'FLOCK Surveillance Map', url: 'https://ringmast4r.github.io/FLOCK/', desc: 'Flock Safety ALPR camera network map (336k+ cameras)' },
    ],
  },
]

const ALL_CATEGORIES = [{ id: '', label: 'All categories' }, ...RESOURCE_SECTIONS.map((s) => ({ id: s.id, label: s.title }))]

export default function ResourcesView({ resourcesScrollRef }) {
  const [embedUrl, setEmbedUrl] = useState(null)
  const [embedTitle, setEmbedTitle] = useState('')
  const [filterText, setFilterText] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const openEmbed = (url, name) => {
    setEmbedUrl(url)
    setEmbedTitle(name)
  }

  const closeEmbed = () => {
    setEmbedUrl(null)
    setEmbedTitle('')
  }

  useEffect(() => {
    if (!resourcesScrollRef) return
    resourcesScrollRef.current = {
      scrollToSection: (id) => {
        const el = document.getElementById('section-' + id)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      },
    }
    return () => { if (resourcesScrollRef?.current) resourcesScrollRef.current.scrollToSection = null }
  }, [resourcesScrollRef, filterText, categoryId])

  const q = (filterText || '').trim().toLowerCase()
  const filteredSections = useMemo(() => {
    return RESOURCE_SECTIONS.filter((section) => {
      if (categoryId && section.id !== categoryId) return false
      if (!q) return true
      const sectionMatch = section.title.toLowerCase().includes(q)
      const itemMatch = section.items.some(
        (item) =>
          (item.name && item.name.toLowerCase().includes(q)) || (item.desc && item.desc.toLowerCase().includes(q))
      )
      return sectionMatch || itemMatch
    }).map((section) => ({
      ...section,
      items: q
        ? section.items.filter(
            (item) =>
              (item.name && item.name.toLowerCase().includes(q)) || (item.desc && item.desc.toLowerCase().includes(q))
          )
        : section.items,
    })).filter((section) => section.items.length > 0)
  }, [categoryId, q])

  return (
    <div className="resources-view">
      <header className="resources-header">
        <h1 className="resources-title">Resources</h1>
        <p className="resources-subtitle">Web-only OSINT, maps, news, and situational awareness links. Filter and open in app where supported.</p>
        <div className="resources-filters">
          <input
            type="search"
            placeholder="Filter by name or description…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="resources-filter-input"
            aria-label="Filter resources"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="resources-category-select"
            aria-label="Category"
          >
            {ALL_CATEGORIES.map((c) => (
              <option key={c.id || 'all'} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </header>

      {embedUrl && (
        <div className="resources-embed-overlay">
          <div className="resources-embed-header">
            <span className="resources-embed-title">{embedTitle}</span>
            <button type="button" className="resources-embed-close" onClick={closeEmbed} aria-label="Close">×</button>
          </div>
          <iframe
            title={embedTitle}
            src={embedUrl}
            className="resources-embed-frame"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>
      )}

      <div className="resources-scroll">
        <div className="resources-sections">
          {filteredSections.length === 0 ? (
            <p className="resources-no-results">No resources match the filter.</p>
          ) : (
            filteredSections.map((section) => (
              <section key={section.id} id={'section-' + section.id} className="resources-section">
                <h2 className="resources-section-title">{section.title}</h2>
                <ul className="resources-list">
                  {section.items.map((item) => (
                    <li key={item.url} className="resources-item">
                      <div className="resources-item-main">
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="resources-link">
                          {item.name}
                        </a>
                        {item.desc && <span className="resources-desc">{item.desc}</span>}
                      </div>
                      <div className="resources-item-actions">
                        {item.embed && (
                          <button
                            type="button"
                            className="resources-open-in-app"
                            onClick={() => openEmbed(item.url, item.name)}
                          >
                            Open in app
                          </button>
                        )}
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="resources-external">
                          Open in new tab →
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
