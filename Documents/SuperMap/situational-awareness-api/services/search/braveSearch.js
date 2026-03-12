/**
 * Brave Search API – https://api.search.brave.com/res/v1/web/search
 * Free tier: $5 credits/month. Set BRAVE_SEARCH_API_KEY in .env.
 * Returns same shape as SearXNG for /api/search/searxng: { results: [{ title, url, content }], query }.
 */
const axios = require('axios')

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search'
const REQUEST_TIMEOUT_MS = 10000

function performBraveSearch(query, apiKey) {
  if (!apiKey || !String(query).trim()) return null

  return axios
    .get(BRAVE_API_URL, {
      params: { q: String(query).trim(), count: 20 },
      headers: { 'X-Subscription-Token': apiKey },
      timeout: REQUEST_TIMEOUT_MS,
    })
    .then((res) => {
      const data = res.data || {}
      const web = data.web || {}
      const rawResults = web.results || []
      const results = rawResults.map((r) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.description || '',
      }))
      return { results, query: (data.query && data.query.original) || query }
    })
}

module.exports = {
  performBraveSearch,
}
