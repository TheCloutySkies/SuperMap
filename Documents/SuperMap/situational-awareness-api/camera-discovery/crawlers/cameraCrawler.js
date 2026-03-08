const axios = require('axios')
const cheerio = require('cheerio')

const SEED_PAGES = [
  'https://www.511ny.org/cctv',
  'https://cwwp2.dot.ca.gov/vm/streamlist.htm',
  'https://www.fl511.com/cctv',
  'https://www.txdot.gov/data-maps/traffic-cameras.html',
  'https://www.windy.com/webcams',
  'https://www.opentopia.com',
]

const STREAM_PATTERNS = [
  /\.m3u8(\?|$)/i,
  /\.mjpg(\?|$)/i,
  /\/video\.mjpg/i,
  /\/axis-cgi\/mjpg/i,
  /^rtsp:\/\//i,
  /\.(jpg|jpeg)(\?|$)/i,
]

function looksLikeStream(url = '') {
  return STREAM_PATTERNS.some((re) => re.test(String(url)))
}

function absolute(base, href) {
  try { return new URL(href, base).href } catch { return '' }
}

async function crawlSeed(url) {
  try {
    const res = await axios.get(url, {
      timeout: 12000,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { 'User-Agent': 'SuperMap CameraDiscovery/1.0' },
    })
    const html = String(res.data || '')
    const $ = cheerio.load(html)
    const out = []
    $('a[href], source[src], img[src], video[src]').each((_, el) => {
      const href = $(el).attr('href') || $(el).attr('src')
      const abs = absolute(url, href)
      if (!abs) return
      if (!looksLikeStream(abs)) return
      out.push({
        url: abs,
        sourcePage: url,
        name: ($(el).text() || $(el).attr('title') || $(el).attr('alt') || '').trim().slice(0, 120),
        context: html.slice(0, 4000),
      })
    })
    // Raw text scraping for rtsp/mjpg/m3u8 strings not in tags.
    const rawMatches = html.match(/(rtsp:\/\/[^\s"'<>]+|https?:\/\/[^\s"'<>]+(?:\.m3u8|\.mjpg|\/video\.mjpg|\/axis-cgi\/mjpg|\.jpg))/gi) || []
    rawMatches.forEach((m) => {
      if (looksLikeStream(m)) {
        out.push({ url: m, sourcePage: url, name: 'Discovered stream', context: html.slice(0, 4000) })
      }
    })
    return out
  } catch {
    return []
  }
}

async function cameraCrawler() {
  const all = []
  for (const seed of SEED_PAGES) {
    const found = await crawlSeed(seed)
    all.push(...found)
  }
  // Deduplicate by URL.
  const dedup = new Map()
  all.forEach((c) => {
    if (!c?.url) return
    dedup.set(c.url, c)
  })
  return Array.from(dedup.values())
}

module.exports = {
  cameraCrawler,
}

