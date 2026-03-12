import { useState, useMemo, useEffect, useRef } from 'react'
import './ResourcesView.css'

export const RESOURCE_SECTIONS = [
  {
    id: 'search',
    title: '🌍 Search & Recon',
    items: [
      { name: 'SearXNG', url: 'https://searx.be', desc: 'Privacy search engine, Google-style dorks' },
      { name: 'IntelX', url: 'https://intelx.io', desc: 'Searches leaks, domains, files, darknet indexes' },
      { name: 'Shodan', url: 'https://www.shodan.io', desc: 'Search engine for exposed servers, cameras, routers' },
      { name: 'Censys', url: 'https://search.censys.io', desc: 'Internet infrastructure search' },
      { name: 'Hunter', url: 'https://hunter.io', desc: 'Find emails tied to domains' },
      { name: 'Wayback Machine', url: 'https://web.archive.org', desc: 'Historical versions of websites' },
    ],
  },
  {
    id: 'maps',
    title: '🛰 OSINT Maps (Live Global Monitoring)',
    items: [
      { name: 'Liveuamap', url: 'https://liveuamap.com', desc: 'Live global conflict events', embed: true },
      { name: 'ISW Maps', url: 'https://www.understandingwar.org/maps', desc: 'Institute for the Study of War maps', embed: true },
      { name: 'Open Infrastructure Map', url: 'https://openinframap.org/', desc: 'Power, telecom, oil & gas', embed: true },
      { name: 'Flightradar24', url: 'https://www.flightradar24.com/', desc: 'Live flight tracking', embed: true },
      { name: 'ADS-B Exchange', url: 'https://globe.adsbexchange.com', desc: 'Military aircraft tracking', embed: true },
      { name: 'MarineTraffic', url: 'https://www.marinetraffic.com', desc: 'Ship positions', embed: true },
      { name: 'VesselFinder', url: 'https://www.vesselfinder.com', desc: 'Ship tracking', embed: true },
      { name: 'NASA FIRMS', url: 'https://firms.modaps.eosdis.nasa.gov/map', desc: 'Fire map', embed: true },
      { name: 'USGS Earthquakes', url: 'https://earthquake.usgs.gov/earthquakes/map', desc: 'Earthquake map', embed: true },
      { name: 'Zoom.Earth', url: 'https://zoom.earth', desc: 'Satellite weather and storm monitoring', embed: true },
    ],
  },
  {
    id: 'infra',
    title: '🌐 Infrastructure & Network Intelligence',
    items: [
      { name: 'BGP.he.net', url: 'https://bgp.he.net', desc: 'Internet routing and network data' },
      { name: 'Cloudflare Radar', url: 'https://radar.cloudflare.com', desc: 'Global internet outages and traffic' },
      { name: 'DownDetector', url: 'https://downdetector.com', desc: 'Service outages worldwide' },
    ],
  },
  {
    id: 'toolkits',
    title: '🧠 OSINT Toolkits',
    items: [
      { name: 'OSINT Framework', url: 'https://osintframework.com', desc: 'Massive directory of investigation tools' },
      { name: 'Nixintel OSINT Resource List', url: 'https://start.me/p/rx6Qj8/nixintel-s-osint-resource-list', desc: 'Curated OSINT list' },
      { name: 'Bellingcat Toolkit', url: 'https://bellingcat.gitbook.io/toolkit', desc: 'From Bellingcat' },
      { name: 'Sherlock', url: 'https://github.com/sherlock-project/sherlock', desc: 'Username search across social networks' },
      { name: 'SpiderFoot', url: 'https://www.spiderfoot.net/', desc: 'Automated OSINT collection' },
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
