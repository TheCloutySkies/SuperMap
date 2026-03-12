const NodeCache = require('node-cache')

const SEARCH_TTL_SECONDS = 300 // 5 minutes

const cache = new NodeCache({
  stdTTL: SEARCH_TTL_SECONDS,
  checkperiod: 60,
  useClones: false,
})

function getCachedSearch(query) {
  return cache.get(`search:${query}`)
}

function setCachedSearch(query, value) {
  cache.set(`search:${query}`, value)
}

module.exports = {
  getCachedSearch,
  setCachedSearch,
  SEARCH_TTL_SECONDS,
}

