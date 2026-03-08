const nlp = require('compromise')
const NodeGeocoder = require('node-geocoder')

const geocoder = NodeGeocoder({
  provider: 'openstreetmap',
  httpAdapter: 'https',
  timeout: 5000,
})

/**
 * Extract place names from text using compromise NLP.
 * @param {string} text
 * @returns {string[]} Unique place names (cities, regions, countries, etc.)
 */
function extractPlaces(text) {
  if (!text || typeof text !== 'string') return []
  try {
    const doc = nlp(text)
    const out = doc.places().out('array')
    const places = Array.isArray(out) ? out : (typeof out === 'string' ? [out] : [])
    const unique = [...new Set(places.filter((p) => p && String(p).trim().length > 1))]
    return unique.slice(0, 5)
  } catch (err) {
    return []
  }
}

/**
 * Geocode a place name. Returns null if not found.
 * @param {string} placeName
 * @returns {Promise<{ coords: [number, number], countryCode?: string, country?: string } | null>}
 */
async function geocodePlace(placeName) {
  if (!placeName || !placeName.trim()) return null
  try {
    const results = await geocoder.geocode(placeName.trim(), { limit: 1 })
    const first = results && results[0]
    if (first && typeof first.latitude === 'number' && typeof first.longitude === 'number') {
      const coords = [first.longitude, first.latitude]
      const countryCode = first.countryCode || first.countryCodeISO3166
      const country = first.country || countryCode
      return { coords, countryCode, country }
    }
  } catch (err) {
    // ignore
  }
  return null
}

/**
 * Append coordinates to an article object by extracting places from title + content and geocoding the first hit.
 * Mutates the article: adds coordinates: [lon, lat] when successful.
 * @param {object} article - Must have at least title or contentSnippet/content
 * @returns {Promise<object>} The same article, possibly with coordinates added
 */
async function geotagArticle(article) {
  const text = [article.title, article.contentSnippet, article.content, article.summary]
    .filter(Boolean)
    .join(' ')
  const places = extractPlaces(text)
  for (const place of places) {
    const result = await geocodePlace(place)
    if (result && result.coords) {
      article.coordinates = result.coords
      article.country = result.countryCode || result.country || null
      article.confidence = 'high'
      return article
    }
  }
  return article
}

/**
 * Run geotagger over an array of articles (in parallel with limited concurrency to avoid rate limits).
 * @param {object[]} articles
 * @param {number} concurrency
 * @returns {Promise<object[]>}
 */
async function geotagArticles(articles, concurrency = 3) {
  const out = []
  for (let i = 0; i < articles.length; i += concurrency) {
    const chunk = articles.slice(i, i + concurrency)
    const tagged = await Promise.all(chunk.map((a) => geotagArticle({ ...a })))
    out.push(...tagged)
  }
  return out
}

module.exports = { extractPlaces, geocodePlace, geotagArticle, geotagArticles }
