/**
 * Index of homepage widgets/sections for search bar. Queries matching keywords
 * show these as "Homepage & widgets" results so users can jump to gas prices, stocks, etc.
 */
export const WIDGET_SEARCH_INDEX = [
  {
    id: 'gas-prices',
    title: 'Gas Prices (US)',
    description: 'National and state-level gasoline prices. Look up by state.',
    keywords: ['gas', 'gasoline', 'fuel', 'price', 'prices', 'states', 'state', 'us', 'america', 'eia'],
  },
  {
    id: 'stocks',
    title: 'Stocks & Markets',
    description: 'S&P 500, oil, gold, Bitcoin and custom tickers.',
    keywords: ['stock', 'stocks', 'market', 'markets', 'ticker', 'sp500', 's&p', 'bitcoin', 'btc', 'oil', 'gold', 'tickers'],
  },
  {
    id: 'headlines',
    title: 'Headlines',
    description: 'Latest news headlines.',
    keywords: ['headline', 'headlines', 'news', 'breaking'],
  },
  {
    id: 'earthquakes',
    title: 'Earthquakes',
    description: 'Recent earthquake activity.',
    keywords: ['earthquake', 'earthquakes', 'seismic', 'quake'],
  },
  {
    id: 'world-clock',
    title: 'World Clock',
    description: 'Current time in major time zones.',
    keywords: ['clock', 'time', 'timezone', 'world clock', 'utc', 'time zone'],
  },
  {
    id: 'space',
    title: 'Space & NASA',
    description: 'NASA EONET events, news, and astronomy picture of the day.',
    keywords: ['space', 'nasa', 'eonet', 'asteroid', 'apod', 'astronomy'],
  },
]

/**
 * Returns widget/section entries whose title, description, or keywords match the query.
 */
export function getWidgetMatches(query) {
  const q = (query || '').trim().toLowerCase()
  if (!q || q.length < 2) return []
  const terms = q.split(/\s+/).filter(Boolean)
  return WIDGET_SEARCH_INDEX.filter((w) => {
    const title = (w.title || '').toLowerCase()
    const desc = (w.description || '').toLowerCase()
    const keywords = (w.keywords || []).join(' ').toLowerCase()
    const text = `${title} ${desc} ${keywords}`
    return terms.some((t) => text.includes(t))
  })
}
