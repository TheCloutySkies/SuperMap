function parseSearxResults(rawJson, instanceBaseUrl) {
  if (!rawJson || !Array.isArray(rawJson.results)) {
    return []
  }

  return rawJson.results.map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
    engine: r.engine || '',
    instance: instanceBaseUrl,
    lat: typeof r.lat === 'number' ? r.lat : null,
    lon: typeof r.lon === 'number' ? r.lon : null,
  }))
}

module.exports = {
  parseSearxResults,
}

