const BROADCASTS = [
  { id: 'aljazeera', name: 'Al Jazeera English', officialLink: 'https://www.aljazeera.com/live', ytLink: 'https://www.youtube.com/@aljazeeraenglish/live' },
  { id: 'france24', name: 'France 24 English', officialLink: 'https://www.france24.com/en/live', ytLink: 'https://www.youtube.com/@FRANCE24/live' },
  { id: 'dw', name: 'DW News', officialLink: 'https://www.dw.com/en/live-tv/s-100825', ytLink: 'https://www.youtube.com/@dwnews/live' },
  { id: 'bbc', name: 'BBC News', officialLink: 'https://www.bbc.com/news/live', ytLink: 'https://www.youtube.com/@BBCNews/live' },
  { id: 'cgtn', name: 'CGTN Live', officialLink: 'https://www.cgtn.com/live', ytLink: 'https://www.youtube.com/@CGTNLive/live' },
  { id: 'wion', name: 'WION', officialLink: 'https://www.wionews.com/live-tv', ytLink: 'https://www.youtube.com/@WION/live' },
  { id: 'ndtv', name: 'NDTV 24x7', officialLink: 'https://www.ndtv.com/video/live/channel/ndtv-24x7', ytLink: 'https://www.youtube.com/@ndtv/live' },
  { id: 'sky', name: 'Sky News', officialLink: 'https://news.sky.com/watch-live', ytLink: 'https://www.youtube.com/@SkyNews/live' },
  { id: 'nasa', name: 'NASA Live', officialLink: 'https://www.nasa.gov/nasatv/', ytLink: 'https://www.youtube.com/@NASA/live' },
  { id: 'reuters', name: 'Reuters', officialLink: 'https://www.reuters.com/video/', ytLink: null },
  { id: 'ap', name: 'Associated Press', officialLink: 'https://www.apnews.com/live', ytLink: null },
  { id: 'cspan', name: 'C-SPAN', officialLink: 'https://www.c-span.org/live/', ytLink: 'https://www.youtube.com/@cspan/live' },
]

export default function BroadcastsView() {
  return (
    <div className="xp-page">
      <div className="xp-page-body">
        <p className="xp-note">
          Each stream opens in a new tab. There is no in-app player.
        </p>
        {BROADCASTS.map((b) => (
          <fieldset key={b.id}>
            <legend>{b.name}</legend>
            <div className="field-row">
              {b.officialLink && (
                <a href={b.officialLink} target="_blank" rel="noopener noreferrer">Official stream</a>
              )}
              {b.ytLink && (
                <a href={b.ytLink} target="_blank" rel="noopener noreferrer">YouTube Live</a>
              )}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  )
}
